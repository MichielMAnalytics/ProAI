import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { MCPOAuthTokens } from './oauth/types';
import type * as t from './types';

function isStdioOptions(options: t.MCPOptions): options is t.StdioOptions {
  return 'command' in options;
}

function isWebSocketOptions(options: t.MCPOptions): options is t.WebSocketOptions {
  if ('url' in options) {
    const protocol = new URL(options.url).protocol;
    return protocol === 'ws:' || protocol === 'wss:';
  }
  return false;
}

function isSSEOptions(options: t.MCPOptions): options is t.SSEOptions {
  if ('url' in options) {
    const protocol = new URL(options.url).protocol;
    return protocol !== 'ws:' && protocol !== 'wss:';
  }
  return false;
}

/**
 * Checks if the provided options are for a Streamable HTTP transport.
 *
 * Streamable HTTP is an MCP transport that uses HTTP POST for sending messages
 * and supports streaming responses. It provides better performance than
 * SSE transport while maintaining compatibility with most network environments.
 *
 * @param options MCP connection options to check
 * @returns True if options are for a streamable HTTP transport
 */
function isStreamableHTTPOptions(options: t.MCPOptions): options is t.StreamableHTTPOptions {
  if ('url' in options && options.type === 'streamable-http') {
    const protocol = new URL(options.url).protocol;
    return protocol !== 'ws:' && protocol !== 'wss:';
  }
  return false;
}

const FIVE_MINUTES = 5 * 60 * 1000;
export class MCPConnection extends EventEmitter {
  private static instance: MCPConnection | null = null;
  public client: Client;
  private transport: Transport | null = null; // Make this nullable
  private connectionState: t.ConnectionState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private lastError: Error | null = null;
  private lastConfigUpdate = 0;
  private readonly CONFIG_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  public readonly serverName: string;
  private shouldStopReconnecting = false;
  private isReconnecting = false;
  private isInitializing = false;
  private reconnectAttempts = 0;
  private readonly userId?: string;
  private lastPingTime: number;
  private oauthTokens?: MCPOAuthTokens | null;
  private oauthRequired = false;
  private lastTokenRefresh = 0;
  private readonly TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes buffer before expiry
  iconPath?: string;
  timeout?: number;
  url?: string;

  constructor(
    serverName: string,
    private readonly options: t.MCPOptions,
    userId?: string,
    oauthTokens?: MCPOAuthTokens | null,
  ) {
    super();
    this.serverName = serverName;
    this.userId = userId;
    this.iconPath = options.iconPath;
    this.timeout = options.timeout;
    this.lastPingTime = Date.now();
    if (oauthTokens) {
      this.oauthTokens = oauthTokens;
    }
    this.client = new Client(
      {
        name: '@librechat/api-client',
        version: '1.2.3',
      },
      {
        capabilities: {},
      },
    );

    this.setupEventListeners();
  }

  /** Helper to generate consistent log prefixes */
  private getLogPrefix(): string {
    const userPart = this.userId ? `[User: ${this.userId}]` : '';
    return `[MCP]${userPart}[${this.serverName}]`;
  }

  public static getInstance(
    serverName: string,
    options: t.MCPOptions,
    userId?: string,
  ): MCPConnection {
    if (!MCPConnection.instance) {
      MCPConnection.instance = new MCPConnection(serverName, options, userId);
    }
    return MCPConnection.instance;
  }

  public static getExistingInstance(): MCPConnection | null {
    return MCPConnection.instance;
  }

  public static async destroyInstance(): Promise<void> {
    if (MCPConnection.instance) {
      await MCPConnection.instance.disconnect();
      MCPConnection.instance = null;
    }
  }

  /** Helper to check if Pipedream token needs refresh */
  private needsPipedreamTokenRefresh(): boolean {
    if (this.options.type !== 'streamable-http') {
      return false;
    }

    const url = 'url' in this.options ? this.options.url : '';
    if (!url.includes('pipedream.net')) {
      return false;
    }

    // Check if we have OAuth tokens and if they're close to expiring
    if (this.oauthTokens?.obtained_at && this.oauthTokens?.expires_in) {
      const tokenAge = Date.now() - this.oauthTokens.obtained_at;
      const tokenExpiry = this.oauthTokens.expires_in * 1000; // Convert to milliseconds
      const timeUntilExpiry = tokenExpiry - tokenAge;
      
      // Refresh if token expires within the buffer time
      if (timeUntilExpiry <= this.TOKEN_REFRESH_BUFFER) {
        logger.info(`${this.getLogPrefix()} Token expires in ${Math.round(timeUntilExpiry / 1000)}s, triggering refresh`);
        return true;
      }
    }

    // Also refresh if it's been more than 50 minutes since last refresh (safety margin)
    // Only check this if we've actually done a refresh before (lastTokenRefresh > 0)
    if (this.lastTokenRefresh > 0) {
      const timeSinceLastRefresh = Date.now() - this.lastTokenRefresh;
      if (timeSinceLastRefresh > 50 * 60 * 1000) {
        logger.info(`${this.getLogPrefix()} Token refresh overdue (${Math.round(timeSinceLastRefresh / 1000 / 60)}min), triggering refresh`);
        return true;
      }
    } else {
      // If we've never refreshed, check if we need to based on OAuth tokens
      logger.info(`${this.getLogPrefix()} No previous refresh recorded, checking token age`);
      return true; // Always refresh on first connection if no refresh history
    }

    return false;
  }

  /** Helper to refresh Pipedream authentication token */
  private async refreshPipedreamToken(): Promise<boolean> {
    try {
      // Only refresh if this is a Pipedream streamable-http connection
      if (this.options.type !== 'streamable-http') {
        return false;
      }

      // Check if this looks like a Pipedream MCP server
      const url = 'url' in this.options ? this.options.url : '';
      if (!url.includes('pipedream.net')) {
        return false;
      }

      logger.info(`${this.getLogPrefix()} Attempting to refresh Pipedream auth token`);

      // Dynamically import PipedreamConnect to avoid circular dependencies
      const PipedreamConnect = require('../../../api/server/services/Pipedream/PipedreamConnect');

      if (PipedreamConnect.isEnabled()) {
        // Clear cached token since it's likely expired/invalid
        PipedreamConnect.clearTokenCache();

        const newToken = await PipedreamConnect.getOAuthAccessToken();
        if (newToken) {
          // Update both the options headers and OAuth tokens
          if (this.options.headers) {
            this.options.headers['Authorization'] = `Bearer ${newToken}`;
          }
          this.oauthTokens = {
            access_token: newToken,
            token_type: 'Bearer',
            obtained_at: Date.now(),
            expires_in: 3600, // 1 hour
          };
          this.lastTokenRefresh = Date.now();
          
          // If we have an existing transport, we need to reconnect with fresh token
          // The next connection attempt will use the updated headers and tokens
          if (this.transport && this.connectionState === 'connected') {
            logger.info(`${this.getLogPrefix()} Token refreshed, will reconnect on next operation`);
            this.connectionState = 'disconnected';
            this.emit('connectionChange', 'disconnected');
          }
          
          logger.info(
            `${this.getLogPrefix()} Successfully refreshed Pipedream auth token at ${new Date().toISOString()}`,
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`${this.getLogPrefix()} Failed to refresh auth token:`, error);
      return false;
    }
  }

  private emitError(error: unknown, errorContext: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${this.getLogPrefix()} ${errorContext}: ${errorMessage}`);
    this.emit('error', new Error(`${errorContext}: ${errorMessage}`));
  }

  private async constructTransport(options: t.MCPOptions): Promise<Transport> {
    try {
      let type: t.MCPOptions['type'];
      if (isStdioOptions(options)) {
        type = 'stdio';
      } else if (isWebSocketOptions(options)) {
        type = 'websocket';
      } else if (isStreamableHTTPOptions(options)) {
        type = 'streamable-http';
      } else if (isSSEOptions(options)) {
        type = 'sse';
      } else {
        throw new Error(
          'Cannot infer transport type: options.type is not provided and cannot be inferred from other properties.',
        );
      }

      switch (type) {
        case 'stdio':
          if (!isStdioOptions(options)) {
            throw new Error('Invalid options for stdio transport.');
          }
          return new StdioClientTransport({
            command: options.command,
            args: options.args,
            // workaround bug of mcp sdk that can't pass env:
            // https://github.com/modelcontextprotocol/typescript-sdk/issues/216
            env: { ...getDefaultEnvironment(), ...(options.env ?? {}) },
          });

        case 'websocket':
          if (!isWebSocketOptions(options)) {
            throw new Error('Invalid options for websocket transport.');
          }
          this.url = options.url;
          return new WebSocketClientTransport(new URL(options.url));

        case 'sse': {
          if (!isSSEOptions(options)) {
            throw new Error('Invalid options for sse transport.');
          }
          this.url = options.url;
          const url = new URL(options.url);
          logger.info(`${this.getLogPrefix()} Creating SSE transport: ${url.toString()}`);
          const abortController = new AbortController();

          // Check if we need to refresh Pipedream token before creating transport
          if (this.needsPipedreamTokenRefresh()) {
            logger.info(`${this.getLogPrefix()} Refreshing Pipedream token before SSE transport creation`);
            await this.refreshPipedreamToken();
          }

          /** Add OAuth token to headers if available */
          const headers = { ...options.headers };
          if (this.oauthTokens?.access_token) {
            headers['Authorization'] = `Bearer ${this.oauthTokens.access_token}`;
            logger.debug(`${this.getLogPrefix()} Using OAuth token from this.oauthTokens for SSE`);
          } else if (url.toString().includes('pipedream.net')) {
            // For Pipedream servers, always try to get a fresh token if we don't have OAuth tokens
            logger.info(`${this.getLogPrefix()} Fetching fresh Pipedream token for SSE transport creation`);
            try {
              const PipedreamConnect = require('../../../api/server/services/Pipedream/PipedreamConnect');
              if (PipedreamConnect.isEnabled()) {
                PipedreamConnect.clearTokenCache();
                const freshToken = await PipedreamConnect.getOAuthAccessToken();
                if (freshToken) {
                  headers['Authorization'] = `Bearer ${freshToken}`;
                  // Also update our OAuth tokens for future use
                  this.oauthTokens = {
                    access_token: freshToken,
                    token_type: 'Bearer',
                    obtained_at: Date.now(),
                    expires_in: 3600,
                  };
                  this.lastTokenRefresh = Date.now();
                  logger.info(`${this.getLogPrefix()} Using fresh Pipedream token for SSE transport`);
                }
              }
            } catch (tokenError) {
              logger.warn(`${this.getLogPrefix()} Failed to get fresh Pipedream token for SSE:`, tokenError);
            }
          }

          const transport = new SSEClientTransport(url, {
            requestInit: {
              headers,
              signal: abortController.signal,
            },
            eventSourceInit: {
              fetch: (url, init) => {
                const fetchHeaders = new Headers(Object.assign({}, init?.headers, headers));
                return fetch(url, {
                  ...init,
                  headers: fetchHeaders,
                });
              },
            },
          });

          transport.onclose = () => {
            logger.info(`${this.getLogPrefix()} SSE transport closed`);
            this.emit('connectionChange', 'disconnected');
          };

          transport.onerror = (error) => {
            logger.error(`${this.getLogPrefix()} SSE transport error:`, error);
            this.emitError(error, 'SSE transport error:');
          };

          transport.onmessage = (message) => {
            logger.info(`${this.getLogPrefix()} Message received: ${JSON.stringify(message)}`);
          };

          this.setupTransportErrorHandlers(transport);
          return transport;
        }

        case 'streamable-http': {
          if (!isStreamableHTTPOptions(options)) {
            throw new Error('Invalid options for streamable-http transport.');
          }
          this.url = options.url;
          const url = new URL(options.url);
          logger.info(
            `${this.getLogPrefix()} Creating streamable-http transport: ${url.toString()}`,
          );
          const abortController = new AbortController();

          // Check if we need to refresh Pipedream token before creating transport
          if (this.needsPipedreamTokenRefresh()) {
            logger.info(`${this.getLogPrefix()} Refreshing Pipedream token before transport creation`);
            await this.refreshPipedreamToken();
          }

          // Add OAuth token to headers if available
          const headers = { ...options.headers };
          if (this.oauthTokens?.access_token) {
            headers['Authorization'] = `Bearer ${this.oauthTokens.access_token}`;
            logger.debug(`${this.getLogPrefix()} Using OAuth token from this.oauthTokens`);
          } else if (url.toString().includes('pipedream.net')) {
            // For Pipedream servers, always try to get a fresh token if we don't have OAuth tokens
            logger.info(`${this.getLogPrefix()} Fetching fresh Pipedream token for transport creation`);
            try {
              const PipedreamConnect = require('../../../api/server/services/Pipedream/PipedreamConnect');
              if (PipedreamConnect.isEnabled()) {
                PipedreamConnect.clearTokenCache();
                const freshToken = await PipedreamConnect.getOAuthAccessToken();
                if (freshToken) {
                  headers['Authorization'] = `Bearer ${freshToken}`;
                  // Also update our OAuth tokens for future use
                  this.oauthTokens = {
                    access_token: freshToken,
                    token_type: 'Bearer',
                    obtained_at: Date.now(),
                    expires_in: 3600,
                  };
                  this.lastTokenRefresh = Date.now();
                  logger.info(`${this.getLogPrefix()} Using fresh Pipedream token for transport`);
                }
              }
            } catch (tokenError) {
              logger.warn(`${this.getLogPrefix()} Failed to get fresh Pipedream token:`, tokenError);
            }
          }

          const transport = new StreamableHTTPClientTransport(url, {
            requestInit: {
              headers,
              signal: abortController.signal,
            },
          });

          transport.onclose = () => {
            logger.info(`${this.getLogPrefix()} Streamable-http transport closed`);
            this.emit('connectionChange', 'disconnected');
          };

          transport.onerror = (error: Error | unknown) => {
            logger.error(`${this.getLogPrefix()} Streamable-http transport error:`, error);
            this.emitError(error, 'Streamable-http transport error:');
          };

          transport.onmessage = (message: JSONRPCMessage) => {
            logger.info(`${this.getLogPrefix()} Message received: ${JSON.stringify(message)}`);
          };

          this.setupTransportErrorHandlers(transport);
          return transport;
        }

        default: {
          throw new Error(`Unsupported transport type: ${type}`);
        }
      }
    } catch (error) {
      this.emitError(error, 'Failed to construct transport:');
      throw error;
    }
  }

  private setupEventListeners(): void {
    this.isInitializing = true;
    this.on('connectionChange', (state: t.ConnectionState) => {
      this.connectionState = state;
      if (state === 'connected') {
        this.isReconnecting = false;
        this.isInitializing = false;
        this.shouldStopReconnecting = false;
        this.reconnectAttempts = 0;
        /**
         * // FOR DEBUGGING
         * // this.client.setRequestHandler(PingRequestSchema, async (request, extra) => {
         * //    logger.info(`[MCP][${this.serverName}] PingRequest: ${JSON.stringify(request)}`);
         * //    if (getEventListeners && extra.signal) {
         * //      const listenerCount = getEventListeners(extra.signal, 'abort').length;
         * //      logger.debug(`Signal has ${listenerCount} abort listeners`);
         * //    }
         * //    return {};
         * //  });
         */
      } else if (state === 'error' && !this.isReconnecting && !this.isInitializing) {
        this.handleReconnection().catch((error) => {
          logger.error(`${this.getLogPrefix()} Reconnection handler failed:`, error);
        });
      }
    });

    this.subscribeToResources();
  }

  private async handleReconnection(): Promise<void> {
    if (
      this.isReconnecting ||
      this.shouldStopReconnecting ||
      this.isInitializing ||
      this.oauthRequired
    ) {
      if (this.oauthRequired) {
        logger.info(`${this.getLogPrefix()} OAuth required, skipping reconnection attempts`);
      }
      return;
    }

    this.isReconnecting = true;
    const backoffDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30000);

    try {
      while (
        this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS &&
        !(this.shouldStopReconnecting as boolean)
      ) {
        this.reconnectAttempts++;
        const delay = backoffDelay(this.reconnectAttempts);

        logger.info(
          `${this.getLogPrefix()} Reconnecting ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
          await this.connect();
          this.reconnectAttempts = 0;
          return;
        } catch (error) {
          logger.error(`${this.getLogPrefix()} Reconnection attempt failed:`, error);

          if (
            this.reconnectAttempts === this.MAX_RECONNECT_ATTEMPTS ||
            (this.shouldStopReconnecting as boolean)
          ) {
            logger.error(`${this.getLogPrefix()} Stopping reconnection attempts`);
            return;
          }
        }
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  private subscribeToResources(): void {
    this.client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
      this.invalidateCache();
      this.emit('resourcesChanged');
    });
  }

  private invalidateCache(): void {
    // this.cachedConfig = null;
    this.lastConfigUpdate = 0;
  }

  async connectClient(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.shouldStopReconnecting) {
      return;
    }

    this.emit('connectionChange', 'connecting');

    this.connectPromise = (async () => {
      try {
        if (this.transport) {
          try {
            await this.client.close();
            this.transport = null;
          } catch (error) {
            logger.warn(`${this.getLogPrefix()} Error closing connection:`, error);
          }
        }

        // Proactively refresh Pipedream token before creating transport if needed
        if (this.needsPipedreamTokenRefresh()) {
          logger.info(`${this.getLogPrefix()} Proactively refreshing Pipedream token before connection`);
          await this.refreshPipedreamToken();
        }

        this.transport = await this.constructTransport(this.options);
        this.setupTransportDebugHandlers();

        const connectTimeout = this.options.initTimeout ?? 120000;
        await Promise.race([
          this.client.connect(this.transport),
          new Promise((_resolve, reject) =>
            setTimeout(
              () => reject(new Error(`Connection timeout after ${connectTimeout}ms`)),
              connectTimeout,
            ),
          ),
        ]);

        this.connectionState = 'connected';
        this.emit('connectionChange', 'connected');
        this.reconnectAttempts = 0;
      } catch (error) {
        // Check if it's an OAuth authentication error or potential token issue
        if (this.isOAuthError(error) || this.isPotentialTokenError(error)) {
          logger.warn(`${this.getLogPrefix()} OAuth authentication required`);
          this.oauthRequired = true;
          const serverUrl = this.url;
          logger.debug(`${this.getLogPrefix()} Server URL for OAuth: ${serverUrl}`);

          // For Pipedream servers, try to refresh token instead of full OAuth flow
          if (serverUrl?.includes('pipedream.net')) {
            logger.info(`${this.getLogPrefix()} Attempting Pipedream token refresh`);
            try {
              const refreshed = await this.refreshPipedreamToken();
              if (refreshed) {
                this.oauthRequired = false;
                logger.info(
                  `${this.getLogPrefix()} Pipedream token refreshed successfully, connection will be retried`,
                );
                return;
              }
            } catch (refreshError) {
              logger.error(`${this.getLogPrefix()} Pipedream token refresh failed:`, refreshError);
            }
          }

          const oauthTimeout = this.options.initTimeout ?? 60000;
          /** Promise that will resolve when OAuth is handled */
          const oauthHandledPromise = new Promise<void>((resolve, reject) => {
            let timeoutId: NodeJS.Timeout | null = null;
            let oauthHandledListener: (() => void) | null = null;
            let oauthFailedListener: ((error: Error) => void) | null = null;

            /** Cleanup function to remove listeners and clear timeout */
            const cleanup = () => {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              if (oauthHandledListener) {
                this.off('oauthHandled', oauthHandledListener);
              }
              if (oauthFailedListener) {
                this.off('oauthFailed', oauthFailedListener);
              }
            };

            // Success handler
            oauthHandledListener = () => {
              cleanup();
              resolve();
            };

            // Failure handler
            oauthFailedListener = (error: Error) => {
              cleanup();
              reject(error);
            };

            // Timeout handler
            timeoutId = setTimeout(() => {
              cleanup();
              reject(new Error(`OAuth handling timeout after ${oauthTimeout}ms`));
            }, oauthTimeout);

            // Listen for both success and failure events
            this.once('oauthHandled', oauthHandledListener);
            this.once('oauthFailed', oauthFailedListener);
          });

          // Emit the event
          this.emit('oauthRequired', {
            serverName: this.serverName,
            error,
            serverUrl,
            userId: this.userId,
          });

          try {
            // Wait for OAuth to be handled
            await oauthHandledPromise;
            // Reset the oauthRequired flag
            this.oauthRequired = false;
            // Don't throw the error - just return so connection can be retried
            logger.info(
              `${this.getLogPrefix()} OAuth handled successfully, connection will be retried`,
            );
            return;
          } catch (oauthError) {
            // OAuth failed or timed out
            this.oauthRequired = false;
            logger.error(`${this.getLogPrefix()} OAuth handling failed:`, oauthError);
            // Re-throw the original authentication error
            throw error;
          }
        }

        this.connectionState = 'error';
        this.emit('connectionChange', 'error');
        throw error;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private setupTransportDebugHandlers(): void {
    if (!this.transport) {
      return;
    }

    this.transport.onmessage = (msg) => {
      logger.debug(`${this.getLogPrefix()} Transport received: ${JSON.stringify(msg)}`);
    };

    const originalSend = this.transport.send.bind(this.transport);
    this.transport.send = async (msg) => {
      // Soften the ping error handling - log but don't throw for empty results
      if ('result' in msg && !('method' in msg) && Object.keys(msg.result ?? {}).length === 0) {
        if (Date.now() - this.lastPingTime < FIVE_MINUTES) {
          logger.debug(`${this.getLogPrefix()} Received empty result within ping interval - this is normal`);
        }
        this.lastPingTime = Date.now();
      }
      logger.debug(`${this.getLogPrefix()} Transport sending: ${JSON.stringify(msg)}`);
      return originalSend(msg);
    };
  }

  async connect(): Promise<void> {
    try {
      await this.disconnect();
      await this.connectClient();
      if (!this.isConnected()) {
        throw new Error('Connection not established');
      }
    } catch (error) {
      logger.error(`${this.getLogPrefix()} Connection failed:`, error);
      throw error;
    }
  }

  private setupTransportErrorHandlers(transport: Transport): void {
    transport.onerror = (error) => {
      // Check if it's a normal idle timeout (terminated connection)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isIdleTimeout = errorMessage.includes('terminated') || 
                           errorMessage.includes('SSE stream disconnected: TypeError: terminated');

      if (isIdleTimeout) {
        logger.info(`${this.getLogPrefix()} Connection idle timeout - will reconnect on demand`);
        this.connectionState = 'disconnected';
        this.emit('connectionChange', 'disconnected');
        return;
      }

      logger.error(`${this.getLogPrefix()} Transport error:`, error);

      // Check if it's an OAuth authentication error or potential token issue
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as unknown as { code?: number }).code;
        if (errorCode === 401 || errorCode === 403) {
          logger.warn(`${this.getLogPrefix()} OAuth authentication error detected`);
          this.emit('oauthError', error);
        } else if (errorCode === 500 && this.isPotentialTokenError(error)) {
          logger.warn(`${this.getLogPrefix()} Potential token error detected (HTTP 500)`);
          this.emit('oauthError', error);
        }
      }

      this.emit('connectionChange', 'error');
    };
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.client.close();
        this.transport = null;
      }
      if (this.connectionState === 'disconnected') {
        return;
      }
      this.connectionState = 'disconnected';
      this.emit('connectionChange', 'disconnected');
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.invalidateCache();
      this.connectPromise = null;
    }
  }

  async fetchResources(): Promise<t.MCPResource[]> {
    try {
      const { resources } = await this.client.listResources();
      return resources;
    } catch (error) {
      this.emitError(error, 'Failed to fetch resources:');
      return [];
    }
  }

  async fetchTools() {
    try {
      const { tools } = await this.client.listTools();
      return tools;
    } catch (error) {
      this.emitError(error, 'Failed to fetch tools:');
      return [];
    }
  }

  async fetchPrompts(): Promise<t.MCPPrompt[]> {
    try {
      const { prompts } = await this.client.listPrompts();
      return prompts;
    } catch (error) {
      this.emitError(error, 'Failed to fetch prompts:');
      return [];
    }
  }

  // public async modifyConfig(config: ContinueConfig): Promise<ContinueConfig> {
  //   try {
  //     // Check cache
  //     if (this.cachedConfig && Date.now() - this.lastConfigUpdate < this.CONFIG_TTL) {
  //       return this.cachedConfig;
  //     }

  //     await this.connectClient();

  //     // Fetch and process resources
  //     const resources = await this.fetchResources();
  //     const submenuItems = resources.map(resource => ({
  //       title: resource.name,
  //       description: resource.description,
  //       id: resource.uri,
  //     }));

  //     if (!config.contextProviders) {
  //       config.contextProviders = [];
  //     }

  //     config.contextProviders.push(
  //       new MCPContextProvider({
  //         submenuItems,
  //         client: this.client,
  //       }),
  //     );

  //     // Fetch and process tools
  //     const tools = await this.fetchTools();
  //     const continueTools: Tool[] = tools.map(tool => ({
  //       displayTitle: tool.name,
  //       function: {
  //         description: tool.description,
  //         name: tool.name,
  //         parameters: tool.inputSchema,
  //       },
  //       readonly: false,
  //       type: 'function',
  //       wouldLikeTo: `use the ${tool.name} tool`,
  //       uri: `mcp://${tool.name}`,
  //     }));

  //     config.tools = [...(config.tools || []), ...continueTools];

  //     // Fetch and process prompts
  //     const prompts = await this.fetchPrompts();
  //     if (!config.slashCommands) {
  //       config.slashCommands = [];
  //     }

  //     const slashCommands: SlashCommand[] = prompts.map(prompt =>
  //       constructMcpSlashCommand(
  //         this.client,
  //         prompt.name,
  //         prompt.description,
  //         prompt.arguments?.map(a => a.name),
  //       ),
  //     );
  //     config.slashCommands.push(...slashCommands);

  //     // Update cache
  //     this.cachedConfig = config;
  //     this.lastConfigUpdate = Date.now();

  //     return config;
  //   } catch (error) {
  //     this.emit('error', error);
  //     // Return original config if modification fails
  //     return config;
  //   }
  // }

  public async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return this.connectionState === 'connected';
    } catch (error) {
      logger.error(`${this.getLogPrefix()} Ping failed:`, error);
      return false;
    }
  }

  public setOAuthTokens(tokens: MCPOAuthTokens): void {
    this.oauthTokens = tokens;
  }

  private isOAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Check for SSE error with 401 status
    if ('message' in error && typeof error.message === 'string') {
      return error.message.includes('401') || error.message.includes('Non-200 status code (401)');
    }

    // Check for error code
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      return code === 401 || code === 403;
    }

    return false;
  }

  /** Check if error might be related to token issues (for Pipedream servers) */
  private isPotentialTokenError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Only apply this logic for Pipedream servers
    const url = 'url' in this.options ? this.options.url : '';
    if (!url.includes('pipedream.net')) {
      return false;
    }

    // Check for HTTP 500 errors that might indicate token issues
    if ('message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      return message.includes('500') || 
             message.includes('access token missing') ||
             message.includes('non-200 status code (500)');
    }

    // Check for error code 500
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      return code === 500;
    }

    return false;
  }
}