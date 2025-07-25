const { createBackendClient } = require('@pipedream/sdk/server');
const { UserIntegration, AvailableIntegration } = require('~/models');
const { logger } = require('~/config');

/**
 * PipedreamConnect - Handles Pipedream Connect authentication and token management
 *
 * This service manages the core Connect functionality:
 * - Creating connect tokens for users
 * - Managing user account connections
 * - Handling OAuth flow callbacks
 * - User integration lifecycle management
 *
 * Based on Pipedream Connect documentation:
 * https://pipedream.com/docs/connect/managed-auth/quickstart/
 */
class PipedreamConnect {
  constructor() {
    this.client = null;
    // Remove manual token caching - SDK handles this automatically
    this.initializeClient();
  }

  /**
   * Initialize the Pipedream backend client
   */
  initializeClient() {
    if (!this.isClientConfigured()) {
      logger.info('PipedreamConnect: Client configuration incomplete');
      return;
    }

    try {
      this.client = createBackendClient({
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        credentials: {
          clientId: process.env.PIPEDREAM_CLIENT_ID,
          clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
        },
        projectId: process.env.PIPEDREAM_PROJECT_ID,
      });

      logger.info('PipedreamConnect: Client initialized successfully');
      logger.info(
        'Environment:',
        process.env.NODE_ENV === 'production' ? 'production' : 'development',
      );
    } catch (error) {
      logger.error('PipedreamConnect: Failed to initialize client:', error.message);
      this.client = null;
    }
  }

  /**
   * Check if the client is properly configured
   */
  isClientConfigured() {
    const hasRequiredEnvVars = !!(
      process.env.PIPEDREAM_CLIENT_ID &&
      process.env.PIPEDREAM_CLIENT_SECRET &&
      process.env.PIPEDREAM_PROJECT_ID
    );

    if (!hasRequiredEnvVars) {
      logger.warn('PipedreamConnect: Missing required environment variables', {
        hasClientId: !!process.env.PIPEDREAM_CLIENT_ID,
        hasClientSecret: !!process.env.PIPEDREAM_CLIENT_SECRET,
        hasProjectId: !!process.env.PIPEDREAM_PROJECT_ID,
      });
    }

    return hasRequiredEnvVars;
  }

  /**
   * Check if the service is enabled and ready
   */
  isEnabled() {
    // Check if explicitly disabled
    if (process.env.ENABLE_PIPEDREAM_INTEGRATION === 'false') {
      return false;
    }

    // Check if we have credentials and client
    return this.isClientConfigured() && this.client !== null;
  }

  /**
   * Create a Connect Token for a user to initiate account connection
   *
   * @param {string} userId - The external user ID
   * @param {Object} options - Additional options for token creation
   * @param {string} options.app - Specific app to connect (optional)
   * @param {string} options.redirect_url - URL to redirect after connection
   * @returns {Promise<Object>} Token data with token, expires_at, and connect_link_url
   */
  async createConnectToken(userId, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('Pipedream Connect is not enabled or configured');
    }

    if (!userId) {
      throw new Error('User ID is required to create connect token');
    }

    try {
      logger.info(`PipedreamConnect: Creating connect token for user ${userId}`, {
        app: options.app,
        hasRedirectUrl: !!options.redirect_url,
      });

      const tokenData = await this.client.createConnectToken({
        external_user_id: userId,
        ...options,
      });

      logger.info(`PipedreamConnect: Connect token created successfully for user ${userId}`, {
        hasToken: !!tokenData.token,
        hasConnectUrl: !!tokenData.connect_link_url,
        expiresAt: tokenData.expires_at,
      });

      return tokenData;
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to create connect token for user ${userId}:`, {
        message: error.message,
        status: error.status,
        response: error.response?.data,
      });
      throw new Error(`Failed to create connection token: ${error.message}`);
    }
  }

  /**
   * Get user's connected accounts from Pipedream
   *
   * @param {string} userId - The external user ID
   * @param {Object} options - Additional options
   * @param {boolean} options.include_credentials - Whether to include credentials (default: false)
   * @returns {Promise<Array>} Array of connected accounts
   */
  async getUserAccounts(userId, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('Pipedream Connect is not enabled or configured');
    }

    if (!userId) {
      throw new Error('User ID is required to get accounts');
    }

    try {
      logger.info(`PipedreamConnect: Getting accounts for user ${userId}`);

      const accounts = await this.client.getAccounts({
        external_user_id: userId,
        include_credentials: options.include_credentials ? 1 : 0,
      });

      logger.info(
        `PipedreamConnect: Retrieved ${accounts?.length || 0} accounts for user ${userId}`,
      );
      return accounts || [];
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to get accounts for user ${userId}:`, {
        message: error.message,
        status: error.status,
        response: error.response?.data,
      });
      throw new Error(`Failed to retrieve user accounts: ${error.message}`);
    }
  }

  /**
   * Delete a user's account connection from Pipedream
   *
   * @param {string} accountId - The Pipedream account ID to delete
   * @returns {Promise<void>}
   */
  async deleteAccount(accountId) {
    if (!this.isEnabled()) {
      throw new Error('Pipedream Connect is not enabled or configured');
    }

    if (!accountId) {
      throw new Error('Account ID is required to delete account');
    }

    try {
      logger.info(`PipedreamConnect: Deleting account ${accountId}`);

      await this.client.deleteAccount(accountId);

      logger.info(`PipedreamConnect: Account ${accountId} deleted successfully`);
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to delete account ${accountId}:`, {
        message: error.message,
        status: error.status,
        response: error.response?.data,
      });
      throw new Error(`Failed to delete account: ${error.message}`);
    }
  }

  /**
   * Create or update user integration after successful connection
   *
   * @param {string} userId - The user ID
   * @param {Object} accountData - Account data from Pipedream
   * @returns {Promise<Object>} Created or updated integration
   */
  async createUserIntegration(userId, accountData) {
    if (!userId || !accountData) {
      throw new Error('User ID and account data are required');
    }

    try {
      logger.info(`PipedreamConnect: Creating/updating integration for user ${userId}`, {
        accountId: accountData.id,
        app: accountData.app,
        appName: accountData.app_name,
      });

      const integration = await UserIntegration.findOneAndUpdate(
        {
          userId,
          pipedreamAccountId: accountData.id,
        },
        {
          userId,
          pipedreamAccountId: accountData.id,
          pipedreamProjectId: process.env.PIPEDREAM_PROJECT_ID,
          appSlug: accountData.app,
          appName: accountData.app_name || accountData.app,
          appDescription: accountData.app_description,
          appIcon: accountData.app_icon,
          isActive: true,
          credentials: {
            authProvisionId: accountData.auth_provision_id,
          },
          lastConnectedAt: new Date(),
          lastUsedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      logger.info(`PipedreamConnect: Integration created/updated successfully`, {
        integrationId: integration._id,
        userId,
        appSlug: integration.appSlug,
        appName: integration.appName,
      });

      return integration;
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to create user integration:`, {
        message: error.message,
        userId,
        accountId: accountData?.id,
      });
      throw new Error(`Failed to save integration: ${error.message}`);
    }
  }

  /**
   * Delete user integration (completely remove from database and optionally revoke from Pipedream)
   *
   * @param {string} userId - The user ID
   * @param {string} integrationId - The integration ID to delete
   * @param {Object} options - Additional options
   * @param {boolean} options.revokeFromPipedream - Whether to also revoke from Pipedream (default: true)
   * @returns {Promise<Object>} Deleted integration
   */
  async deleteUserIntegration(userId, integrationId, options = {}) {
    if (!userId || !integrationId) {
      throw new Error('User ID and integration ID are required');
    }

    const { revokeFromPipedream = true } = options;

    try {
      logger.info(`PipedreamConnect: Deleting integration ${integrationId} for user ${userId}`, {
        revokeFromPipedream,
      });

      // First find the integration to get the pipedreamAccountId before deletion
      const integration = await UserIntegration.findOne({
        _id: integrationId,
        userId,
      });

      if (!integration) {
        throw new Error('Integration not found or does not belong to user');
      }

      // Optionally revoke from Pipedream before deleting
      if (revokeFromPipedream && integration.pipedreamAccountId) {
        try {
          await this.deleteAccount(integration.pipedreamAccountId);
          logger.info(
            `PipedreamConnect: Revoked account ${integration.pipedreamAccountId} from Pipedream`,
          );
        } catch (error) {
          logger.warn(
            `PipedreamConnect: Failed to revoke account from Pipedream (continuing anyway):`,
            error.message,
          );
        }
      }

      // Now actually delete the document from the database
      const deletedIntegration = await UserIntegration.findOneAndDelete({
        _id: integrationId,
        userId,
      });

      if (!deletedIntegration) {
        throw new Error('Failed to delete integration from database');
      }

      // Note: MCP cache clearing is now handled automatically by UserIntegration schema middleware
      // MCPInitializer coordinates all cache clearing as the single source of truth

      logger.info(`PipedreamConnect: Integration deleted successfully`, {
        integrationId,
        userId,
        appSlug: deletedIntegration.appSlug,
      });

      return deletedIntegration;
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to delete integration:`, {
        message: error.message,
        userId,
        integrationId,
      });
      throw error;
    }
  }

  /**
   * Handle successful connection callback from Pipedream
   * This method processes the callback data and creates the user integration
   *
   * @param {Object} callbackData - Data from Pipedream callback
   * @param {string} callbackData.account_id - The connected account ID
   * @param {string} callbackData.external_user_id - The user ID
   * @param {string} callbackData.app - The app that was connected
   * @returns {Promise<Object>} Created integration
   */
  async handleConnectionCallback(callbackData) {
    const { account_id, external_user_id, app } = callbackData;

    if (!account_id || !external_user_id || !app) {
      throw new Error(
        'Missing required callback data: account_id, external_user_id, and app are required',
      );
    }

    try {
      logger.info(`PipedreamConnect: Processing connection callback`, {
        accountId: account_id,
        userId: external_user_id,
        app,
      });

      // Get app details from our available integrations
      const appDetails = await AvailableIntegration.findOne({
        appSlug: app,
        isActive: true,
      }).lean();

      // For MCP integration, we create the integration directly without fetching account details
      // since the frontend SDK provides us with the necessary information
      const mcpServerUrl =
        process.env.PIPEDREAM_ENVIRONMENT === 'production'
          ? `https://remote.mcp.pipedream.net/${external_user_id}/${app}`
          : `https://remote.mcp.pipedream.net/${external_user_id}/${app}`;

      const integration = await UserIntegration.findOneAndUpdate(
        {
          userId: external_user_id,
          appSlug: app,
        },
        {
          userId: external_user_id,
          pipedreamAccountId: account_id,
          pipedreamProjectId: process.env.PIPEDREAM_PROJECT_ID,
          appSlug: app,
          appName:
            appDetails?.appName || app.charAt(0).toUpperCase() + app.slice(1).replace(/_/g, ' '),
          appDescription: appDetails?.appDescription,
          appIcon: appDetails?.appIcon,
          appCategories: appDetails?.appCategories,
          isActive: true,
          credentials: {
            authProvisionId: account_id, // Use account_id as auth provision for MCP
          },
          mcpServerConfig: {
            serverName: `pipedream-${app}`,
            type: 'sse',
            url: mcpServerUrl,
            timeout: 60000,
            iconPath: appDetails?.appIcon,
          },
          lastConnectedAt: new Date(),
          lastUsedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      logger.info(`PipedreamConnect: Connection callback processed successfully`, {
        integrationId: integration._id,
        userId: external_user_id,
        appSlug: integration.appSlug,
        appName: integration.appName,
        mcpServerUrl,
      });

      return integration;
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to process connection callback:`, {
        message: error.message,
        callbackData,
      });
      throw error;
    }
  }

  /**
   * Get client instance (for advanced usage)
   *
   * @returns {Object|null} Pipedream client instance
   */
  getClient() {
    return this.client;
  }

  /**
   * Get a fresh OAuth access token using hybrid approach
   * - For user-specific operations: uses SDK's getAccounts() with credentials
   * - For global/system operations: uses client credentials flow
   *
   * @param {string} externalUserId - The external user ID (defaults to 'system' for global tokens)
   * @returns {Promise<string>} OAuth access token
   */
  async getOAuthAccessToken(externalUserId = 'system') {
    if (!this.isEnabled()) {
      throw new Error('Pipedream Connect is not enabled or configured');
    }

    // Determine strategy based on user ID
    if (externalUserId && externalUserId !== 'system') {
      // User-specific: use SDK accounts
      return this.getUserOAuthToken(externalUserId);
    } else {
      // Global/system: use client credentials
      return this.getSystemOAuthToken();
    }
  }

  /**
   * Get OAuth token for specific user using SDK's account management
   *
   * @param {string} externalUserId - The external user ID
   * @returns {Promise<string>} OAuth access token
   */
  async getUserOAuthToken(externalUserId) {
    try {
      logger.debug(
        `PipedreamConnect: Getting user OAuth credentials via SDK for user ${externalUserId}`,
      );

      // Use SDK's automatic credential management
      const response = await this.client.getAccounts({
        external_user_id: externalUserId,
        include_credentials: true,
      });

      // Correctly access the accounts array from SDK response
      if (!response || !response.data || !response.data.accounts) {
        throw new Error(`Invalid response structure from getAccounts`);
      }

      const accounts = response.data.accounts;
      if (!accounts || accounts.length === 0) {
        throw new Error(`No connected accounts found for user ${externalUserId}`);
      }

      // Find the first account with valid OAuth credentials
      const accountWithCredentials = accounts.find(
        (account) => account.credentials && account.credentials.oauth_access_token,
      );

      if (!accountWithCredentials) {
        throw new Error(`No account with valid OAuth credentials found for user ${externalUserId}`);
      }

      const credentials = accountWithCredentials.credentials;
      logger.info('PipedreamConnect: Retrieved user OAuth access token via SDK', {
        expires_at: credentials.expires_at,
        last_refreshed_at: credentials.last_refreshed_at,
        next_refresh_at: credentials.next_refresh_at,
        account_id: accountWithCredentials.id,
        externalUserId,
      });

      return credentials.oauth_access_token;
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to get user OAuth access token via SDK:`, {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        externalUserId,
      });
      throw new Error(`Failed to get user OAuth access token: ${error.message}`);
    }
  }

  /**
   * Get OAuth token for system/global operations using client credentials flow
   *
   * @returns {Promise<string>} OAuth access token
   */
  async getSystemOAuthToken() {
    try {
      logger.debug(
        'PipedreamConnect: Getting system OAuth credentials via client credentials flow',
      );

      const axios = require('axios');
      const baseURL = process.env.PIPEDREAM_API_BASE_URL || 'https://api.pipedream.com/v1';

      const tokenResponse = await axios.post(
        `${baseURL}/oauth/token`,
        {
          grant_type: 'client_credentials',
          client_id: process.env.PIPEDREAM_CLIENT_ID,
          client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000, // 10 second timeout
        },
      );

      const accessToken = tokenResponse.data.access_token;
      const expiresIn = tokenResponse.data.expires_in || 3600; // Default to 1 hour

      if (accessToken) {
        logger.info(
          'PipedreamConnect: Retrieved system OAuth access token via client credentials',
          {
            expires_in_minutes: Math.floor(expiresIn / 60),
          },
        );
        return accessToken;
      }

      throw new Error('No access token in client credentials response');
    } catch (error) {
      logger.error('PipedreamConnect: Failed to get system OAuth access token:', {
        message: error.message,
        status: error.response?.status,
        response: error.response?.data,
      });
      throw new Error(`Failed to get system OAuth access token: ${error.message}`);
    }
  }

  /**
   * Get OAuth credentials for a specific app and user
   * This is useful for MCP connections that need app-specific tokens
   *
   * @param {string} appName - The app name (e.g., 'gmail', 'slack')
   * @param {string} externalUserId - The external user ID
   * @returns {Promise<Object>} Full credential object with oauth_access_token, expires_at, etc.
   */
  async getOAuthCredentials(appName, externalUserId) {
    if (!this.isEnabled()) {
      throw new Error('Pipedream Connect is not enabled or configured');
    }

    try {
      logger.debug(
        `PipedreamConnect: Getting OAuth credentials for app ${appName}, user ${externalUserId}`,
      );

      const response = await this.client.getAccounts({
        app: appName,
        external_user_id: externalUserId,
        include_credentials: true,
      });

      // Correctly access the accounts array from SDK response
      if (!response || !response.data || !response.data.accounts) {
        throw new Error(`Invalid response structure from getAccounts for app ${appName}`);
      }

      const accounts = response.data.accounts;
      if (!accounts || accounts.length === 0) {
        throw new Error(`No ${appName} account found for user ${externalUserId}`);
      }

      const account = accounts[0];
      if (!account.credentials || !account.credentials.oauth_access_token) {
        throw new Error(`No valid OAuth credentials found for ${appName} account`);
      }

      logger.info(`PipedreamConnect: Retrieved OAuth credentials for ${appName}`, {
        expires_at: account.credentials.expires_at,
        last_refreshed_at: account.credentials.last_refreshed_at,
        account_id: account.id,
      });

      return account.credentials;
    } catch (error) {
      logger.error(`PipedreamConnect: Failed to get OAuth credentials for ${appName}:`, {
        message: error.message,
        status: error.status,
        appName,
        externalUserId,
      });
      throw new Error(`Failed to get ${appName} OAuth credentials: ${error.message}`);
    }
  }

  /**
   * Clear cached OAuth token (useful when token becomes invalid)
   * Note: With SDK-based management, this is less critical as SDK handles caching
   */
  clearTokenCache() {
    // SDK handles token caching automatically, but we can still log this for backwards compatibility
    logger.debug(
      'PipedreamConnect: Token cache clear requested (SDK handles caching automatically)',
    );
  }

  /**
   * Reinitialize the client (useful for configuration changes)
   */
  reinitialize() {
    this.clearTokenCache();
    this.initializeClient();
  }
}

module.exports = new PipedreamConnect();
