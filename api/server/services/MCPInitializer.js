const { getMCPManager } = require('~/config');
const { logger } = require('~/config');
const { Constants, ToolMetadataUtils } = require('librechat-data-provider');

/**
 * MCPInitializer - Centralized MCP initialization and cache management
 *
 * This service is the SINGLE SOURCE OF TRUTH for all MCP-related caching and initialization.
 * It coordinates multiple underlying services to maintain consistency and avoid the
 * anti-pattern of multiple overlapping caches.
 *
 * Architecture:
 *
 * 1. **MCPInitializer** (this service) - High-level orchestration & result caching
 *    - Caches initialization results and tool mappings
 *    - Prevents redundant initialization attempts
 *    - Coordinates cache clearing across all layers
 *
 * 2. **UserMCPService** - Database-to-config conversion & server list caching
 *    - Converts user integrations to MCP server configurations
 *    - Caches server configuration lists
 *    - Managed by MCPInitializer
 *
 * 3. **MCPManager** - Low-level connection management & connection pooling
 *    - Manages WebSocket/SSE connections to MCP servers
 *    - Pools connections for performance
 *    - Managed by MCPInitializer
 *
 * Cache Invalidation:
 * - Use MCPInitializer.clearUserCache(userId) for user-specific clearing
 * - Use MCPInitializer.clearAllCaches() for system-wide clearing
 * - All other cache clearing methods are internal implementation details
 *
 * Usage:
 * - UserIntegration schema middleware automatically calls clearUserCache() on changes
 * - Controllers use ensureUserMCPReady() for initialization
 * - No direct interaction with UserMCPService or MCPManager caches needed
 */
class MCPInitializer {
  constructor() {
    // Cache for user-specific initialization states
    this.userInitializationCache = new Map();
    // Cache TTL in milliseconds (10 minutes default - long enough for conversation, short enough for config changes)
    this.USER_INIT_CACHE_TTL = parseInt(process.env.MCP_USER_CACHE_TTL) || 600000;
    // Track initialization promises to prevent concurrent initializations for same user
    this.pendingInitializations = new Map();
  }

  /**
   * Get singleton instance for cache sharing across the application
   *
   * @static
   * @returns {MCPInitializer} Singleton instance
   */
  static getInstance() {
    if (!MCPInitializer.instance) {
      MCPInitializer.instance = new MCPInitializer();
    }
    return MCPInitializer.instance;
  }

  /**
   * Check if user MCP initialization is cached and still valid
   *
   * @private
   * @param {string} userId - The user ID
   * @returns {Object|null} Cached result or null if expired/not found
   */
  getUserInitializationCache(userId) {
    const cached = this.userInitializationCache.get(userId);
    if (!cached) {
      return null;
    }

    const isExpired = Date.now() - cached.timestamp > this.USER_INIT_CACHE_TTL;
    if (isExpired) {
      this.userInitializationCache.delete(userId);
      return null;
    }

    return cached;
  }

  /**
   * Cache user MCP initialization result
   *
   * @private
   * @param {string} userId - The user ID
   * @param {Object} result - Initialization result
   */
  setUserInitializationCache(userId, result) {
    this.userInitializationCache.set(userId, {
      ...result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear user initialization cache (useful for configuration changes)
   *
   * This is the SINGLE SOURCE OF TRUTH for MCP cache clearing.
   * It internally coordinates clearing all related caches to maintain consistency.
   *
   * @param {string} userId - The user ID
   */
  static clearUserCache(userId) {
    const instance = MCPInitializer.getInstance();

    // 1. Clear MCPInitializer's own cache
    instance.userInitializationCache.delete(userId);
    instance.pendingInitializations.delete(userId);

    // 2. Clear UserMCPService cache (if available)
    try {
      const UserMCPService = require('~/server/services/UserMCPService');
      UserMCPService.clearCache(userId);
    } catch (error) {
      // UserMCPService might not be available in all contexts
    }

    // 3. Disconnect MCPManager user connections (if available)
    try {
      const { getMCPManager } = require('~/config');
      const mcpManager = getMCPManager(userId);
      if (mcpManager && typeof mcpManager.disconnectUserConnections === 'function') {
        // Use async/await pattern but don't block the main flow
        mcpManager.disconnectUserConnections(userId).catch((error) => {
          logger.warn(
            `[MCPInitializer] Failed to disconnect user connections for user ${userId}:`,
            error.message,
          );
        });
      }
    } catch (error) {
      // MCPManager might not be available in all contexts
    }

    logger.info(
      `[MCPInitializer] ✅ Cleared ALL MCP caches (MCPInitializer + UserMCPService + MCPManager) for user ${userId}`,
    );
  }

  /**
   * Clear user caches without disconnecting active connections
   *
   * Use this for individual server operations where connections should remain active.
   * This clears caches to force fresh data loading but preserves existing connections.
   *
   * @param {string} userId - The user ID
   */
  static clearUserCacheOnly(userId) {
    const instance = MCPInitializer.getInstance();

    // 1. Clear MCPInitializer's own cache
    instance.userInitializationCache.delete(userId);
    instance.pendingInitializations.delete(userId);

    // 2. Clear UserMCPService cache (if available)
    try {
      const UserMCPService = require('~/server/services/UserMCPService');
      UserMCPService.clearCache(userId);
    } catch (error) {
      // UserMCPService might not be available in all contexts
    }

    // Note: We deliberately DO NOT disconnect connections here
    // This method is for cache clearing only, preserving active connections

    logger.info(
      `[MCPInitializer] ✅ Cleared MCP caches (MCPInitializer + UserMCPService) for user ${userId} without disconnecting connections`,
    );
  }

  /**
   * Clear only UserMCPService cache to refresh integration data
   *
   * Use this for individual operations where the user's integration list has changed
   * but you want to preserve MCPInitializer cache and connections.
   *
   * @param {string} userId - The user ID
   */
  static clearUserMCPServiceCacheOnly(userId) {
    try {
      const UserMCPService = require('~/server/services/UserMCPService');
      UserMCPService.clearCache(userId);
      logger.info(
        `[MCPInitializer] ✅ Cleared UserMCPService cache for user ${userId} to refresh integration data`,
      );
    } catch (error) {
      logger.warn(
        `[MCPInitializer] Failed to clear UserMCPService cache for user ${userId}:`,
        error.message,
      );
    }
  }

  /**
   * Clear all caches (useful for system restart scenarios)
   *
   * This coordinates clearing all MCP-related caches system-wide.
   */
  static clearAllCaches() {
    const instance = MCPInitializer.getInstance();

    // 1. Clear MCPInitializer's own caches
    instance.userInitializationCache.clear();
    instance.pendingInitializations.clear();

    // 2. Clear UserMCPService cache (if available)
    try {
      const UserMCPService = require('~/server/services/UserMCPService');
      UserMCPService.clearCache(); // No userId = clear all
    } catch (error) {
      // UserMCPService might not be available in all contexts
    }

    // 3. Disconnect all MCPManager connections (if available)
    try {
      const { getMCPManager } = require('~/config');
      const mcpManager = getMCPManager();
      if (mcpManager && typeof mcpManager.disconnectAll === 'function') {
        mcpManager.disconnectAll().catch((error) => {
          logger.warn(`[MCPInitializer] Failed to disconnect all connections:`, error.message);
        });
      }
    } catch (error) {
      // MCPManager might not be available in all contexts
    }

    logger.info(`[MCPInitializer] ✅ Cleared ALL MCP caches system-wide`);
  }

  /**
   * Ensure user MCP servers are ready for use with smart caching
   *
   * @param {string} userId - The user ID
   * @param {string} context - Context identifier for logging (e.g., 'SchedulerService', 'PluginController')
   * @param {Object} availableTools - Tools registry to enhance with MCP tools
   * @param {Object} options - Additional options
   * @param {boolean} options.forceRefresh - Force refresh even if cached (default: false)
   * @param {Object} options.pipedreamServerInstructions - Pipedream server instructions from config
   * @returns {Promise<Object>} Initialization result with mcpManager, serverCount, toolCount, and cache info
   */
  async ensureUserMCPReady(userId, context, availableTools = {}, options = {}) {
    const startTime = Date.now();
    const { forceRefresh = false, pipedreamServerInstructions = null } = options;

    if (!userId) {
      return {
        success: false,
        error: 'User ID is required',
        serverCount: 0,
        toolCount: 0,
        duration: Date.now() - startTime,
        cached: false,
      };
    }

    logger.debug(`[MCPInitializer][${context}] Starting MCP initialization for user ${userId}`, {
      forceRefresh,
      cacheSize: this.userInitializationCache.size,
    });

    // Check for pending initialization to prevent concurrent attempts
    if (this.pendingInitializations.has(userId)) {
      logger.debug(
        `[MCPInitializer][${context}] Waiting for pending initialization for user ${userId}`,
      );
      try {
        const result = await this.pendingInitializations.get(userId);
        logger.info(
          `[MCPInitializer][${context}] Used pending initialization result for user ${userId} in ${Date.now() - startTime}ms`,
        );
        return {
          ...result,
          duration: Date.now() - startTime,
          cached: true,
          pendingWait: true,
        };
      } catch (error) {
        logger.warn(
          `[MCPInitializer][${context}] Pending initialization failed for user ${userId}:`,
          error.message,
        );
        this.pendingInitializations.delete(userId);
      }
    }

    // Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = this.getUserInitializationCache(userId);
      if (cached) {
        logger.info(
          `[MCPInitializer][${context}] Using cached MCP initialization for user ${userId} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000)}s)`,
        );

        // Debug: Log cached MCP tools count
        const cachedMCPToolsCount = cached.mcpTools ? Object.keys(cached.mcpTools).length : 0;
        logger.info(
          `[MCPInitializer][${context}] Cached result has ${cachedMCPToolsCount} MCP tools`,
        );

        // Apply cached tools to current availableTools registry
        let reportedToolCount = 0;
        if (cached.mcpTools && Object.keys(cached.mcpTools).length > 0) {
          const toolsBefore = Object.keys(availableTools).length;
          Object.assign(availableTools, cached.mcpTools);
          const toolsAfter = Object.keys(availableTools).length;
          const newlyAppliedCount = toolsAfter - toolsBefore;

          // Report the total number of MCP tools available for this user, not just newly applied
          reportedToolCount = Object.keys(cached.mcpTools).length;

          logger.debug(
            `[MCPInitializer][${context}] Applied ${Object.keys(cached.mcpTools).length} cached MCP tools to availableTools (${newlyAppliedCount} newly added, ${reportedToolCount} total for user)`,
          );
        }

        // Cached tools already have embedded metadata, no additional processing needed
        logger.debug(
          `[MCPInitializer][${context}] Using cached MCP tools with embedded metadata`,
        );

        return {
          ...cached,
          toolCount: reportedToolCount, // Report total MCP tools for user, not just newly applied
          duration: Date.now() - startTime,
          cached: true,
        };
      }
    }

    // Create promise for concurrent requests
    const initializationPromise = this.performUserMCPInitialization(
      userId,
      context,
      availableTools,
      startTime,
      pipedreamServerInstructions,
    );
    this.pendingInitializations.set(userId, initializationPromise);

    try {
      const result = await initializationPromise;
      return result;
    } finally {
      // Clean up pending promise
      this.pendingInitializations.delete(userId);
    }
  }

  /**
   * Perform the actual MCP initialization for a user
   *
   * @private
   * @param {string} userId - The user ID
   * @param {string} context - Context identifier for logging
   * @param {Object} availableTools - Tools registry to enhance with MCP tools
   * @param {number} startTime - Start time for duration calculation
   * @param {Object} pipedreamServerInstructions - Pipedream server instructions from config
   * @returns {Promise<Object>} Initialization result
   */
  async performUserMCPInitialization(
    userId,
    context,
    availableTools,
    startTime,
    pipedreamServerInstructions = null,
  ) {
    try {
      const mcpManager = getMCPManager(userId);
      if (!mcpManager) {
        const result = {
          success: false,
          error: 'MCP Manager not available for user',
          mcpManager: null,
          serverCount: 0,
          toolCount: 0,
          duration: Date.now() - startTime,
          cached: false,
        };
        this.setUserInitializationCache(userId, result);
        return result;
      }

      // Get user MCP servers
      const UserMCPService = require('~/server/services/UserMCPService');
      logger.info(`[MCPInitializer][${context}] Getting user MCP servers for user ${userId}`);
      const userMCPServers = await UserMCPService.getUserMCPServers(userId, {
        pipedreamServerInstructions,
      });
      const serverCount = Object.keys(userMCPServers).length;

      logger.info(
        `[MCPInitializer][${context}] Found ${serverCount} user MCP servers for user ${userId}: ${Object.keys(userMCPServers).join(', ')}`,
      );

      // Enhanced logging for global MCP servers
      const globalMCPServers = mcpManager.getAllConnections();
      const globalServerCount = globalMCPServers.size;
      logger.info(
        `[MCPInitializer][${context}] Global MCP servers available: ${globalServerCount} (${Array.from(globalMCPServers.keys()).join(', ')})`,
      );

      let toolCount = 0;
      const mcpTools = {}; // Store tools for caching
      let manifestTools = []; // Store manifest tools for caching

      // Always check for global MCP tools, regardless of user-specific servers
      // globalMCPServers already declared above

      if (serverCount > 0) {
        // Initialize user-specific MCP servers
        logger.info(
          `[MCPInitializer][${context}] Initializing user MCP servers for user ${userId}`,
        );
        logger.debug(
          `[MCPInitializer][${context}] Processing user server configurations:`,
          JSON.stringify(userMCPServers, null, 2),
        );
        
        // Count tools before adding user MCP tools
        const toolCountBefore = Object.keys(availableTools).length;
        
        // Initialize all servers in parallel using Promise.allSettled for better performance
        const serverEntries = Object.entries(userMCPServers);
        const serverInitPromises = serverEntries.map(async ([serverName, serverConfig]) => {
          try {
            // First, register the server config for this user
            mcpManager.addUserServerConfig(userId, serverName, serverConfig);
            
            // Then get/create the connection (which will now find the config)
            const connection = await mcpManager.getUserConnection({
              user: { id: userId },
              serverName,
              flowManager: null, // We don't have flowManager in this context yet
              tokenMethods: null, // Token methods handled by our existing Pipedream integration
            });
            
            if (connection && await connection.isConnected()) {
              logger.debug(`[MCPInitializer][${context}] Successfully initialized user connection for server ${serverName}`);
              
              // Fetch and map tools directly while we have the connection
              try {
                const tools = await connection.fetchTools();
                const serverTools = [];
                for (const tool of tools) {
                  const toolName = tool.name;
                  
                  // Create MCP metadata for this user-specific tool
                  const mcpMetadata = ToolMetadataUtils.createMCPMetadata({
                    serverName,
                    isGlobal: false,
                    userId,
                    originalToolName: tool.name,
                  });
                  
                  // Create enhanced tool with embedded metadata
                  const enhancedTool = ToolMetadataUtils.createEnhancedTool(
                    toolName,
                    {
                      description: tool.description,
                      parameters: tool.inputSchema,
                    },
                    mcpMetadata
                  );
                  
                  serverTools.push({ toolName, toolDef: enhancedTool, serverName, tool });
                }
                logger.debug(`[MCPInitializer][${context}] Mapped ${tools.length} tools from server ${serverName}`);
                return { serverName, tools: serverTools, success: true };
              } catch (toolError) {
                logger.warn(`[MCPInitializer][${context}] Failed to fetch tools from server ${serverName}:`, toolError.message);
                return { serverName, tools: [], success: false, error: toolError.message };
              }
            }
            return { serverName, tools: [], success: false, error: 'Connection failed' };
          } catch (initError) {
            logger.warn(`[MCPInitializer][${context}] Failed to initialize user connection for server ${serverName}:`, initError.message);
            return { serverName, tools: [], success: false, error: initError.message };
          }
        });

        // Wait for all server initializations to complete
        const serverResults = await Promise.allSettled(serverInitPromises);
        
        // Process results and add tools to availableTools (enhanced structure)
        for (const result of serverResults) {
          if (result.status === 'fulfilled' && result.value.success) {
            const { serverName, tools } = result.value;
            for (const { toolName, toolDef } of tools) {
              // toolDef is already an enhanced tool with embedded metadata
              availableTools[toolName] = toolDef;
              logger.debug(`[MCPInitializer][${context}] Added enhanced tool '${toolName}' from server '${serverName}' to availableTools`);
            }
          } else if (result.status === 'rejected') {
            logger.warn(`[MCPInitializer][${context}] Server initialization promise rejected:`, result.reason);
          }
        }

        const toolCountAfter = Object.keys(availableTools).length;
        toolCount = toolCountAfter - toolCountBefore;

        // Debug: Log MCP tools in availableTools after mapping
        const mcpToolsInAvailable = Object.entries(availableTools).filter(([toolName, toolDef]) => 
          ToolMetadataUtils.isMCPTool(toolDef)
        );
        logger.info(
          `[MCPInitializer][${context}] MCP tools in availableTools after mapping: ${mcpToolsInAvailable.length}`,
        );

        // Store the MCP tools for caching
        // Since we know exactly which tools were added (the difference in count),
        // and we know they're all MCP tools, we can store them all
        const allToolKeys = Object.keys(availableTools);
        const newToolKeys = allToolKeys.slice(-toolCount); // Get the last N tools that were added

        for (const toolKey of newToolKeys) {
          mcpTools[toolKey] = availableTools[toolKey];
        }

        // Create manifest tools using the new loadUserManifestTools method
        logger.info(`[MCPInitializer][${context}] Creating manifest tools for user ${userId}`);
        try {
          manifestTools = await mcpManager.loadUserManifestTools(userId);
          logger.info(
            `[MCPInitializer][${context}] Created ${manifestTools.length} manifest tools for user ${userId}`,
          );
        } catch (manifestError) {
          logger.warn(
            `[MCPInitializer][${context}] Failed to create manifest tools for user ${userId}:`,
            manifestError.message,
          );
          manifestTools = [];
        }

        // logger.info(`[MCPInitializer][${context}] Successfully mapped ${toolCount} user MCP tools to availableTools for user ${userId} (total tools: ${toolCountAfter})`);
      }

      // CRITICAL FIX: Always register global MCP tools for all users, regardless of user-specific servers
      if (globalServerCount > 0) {
        logger.info(`[MCPInitializer][${context}] Registering global MCP tools for user ${userId}`);

        // Count how many global MCP tools are currently in availableTools
        let globalToolsInRegistry = 0;
        let globalToolsRegistered = 0;

        for (const [serverName, connection] of globalMCPServers.entries()) {
          try {
            if (await connection.isConnected()) {
              const tools = await connection.fetchTools();
              logger.info(
                `[MCPInitializer][${context}] Global server '${serverName}' has ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`,
              );

              for (const tool of tools) {
                if (availableTools[tool.name]) {
                  globalToolsInRegistry++;

                  // Verify that global tools are MCP tools with metadata
                  const toolDef = availableTools[tool.name];
                  if (ToolMetadataUtils.isMCPTool(toolDef) && ToolMetadataUtils.isGlobalMCPTool(toolDef)) {
                    globalToolsRegistered++;
                    logger.info(
                      `[MCPInitializer][${context}] Verified global MCP tool '${tool.name}' from server '${serverName}' in availableTools`,
                    );

                    // Add to cached tools for future use
                    mcpTools[tool.name] = toolDef;
                  } else {
                    logger.warn(
                      `[MCPInitializer][${context}] Global tool '${tool.name}' from server '${serverName}' is missing MCP metadata`,
                    );
                  }
                } else {
                  logger.warn(
                    `[MCPInitializer][${context}] Global MCP tool '${tool.name}' from server '${serverName}' NOT found in availableTools`,
                  );
                }
              }
            } else {
              logger.warn(
                `[MCPInitializer][${context}] Global server '${serverName}' is not connected`,
              );
            }
          } catch (error) {
            logger.warn(
              `[MCPInitializer][${context}] Error checking global server '${serverName}':`,
              error.message,
            );
          }
        }

        logger.info(
          `[MCPInitializer][${context}] Global MCP tools found in availableTools: ${globalToolsInRegistry}, registered: ${globalToolsRegistered}`,
        );

        // Update tool count to include global tools
        toolCount += globalToolsRegistered;
      }

      const result = {
        success: true,
        mcpManager,
        serverCount,
        toolCount,
        mcpTools, // Store for caching
        manifestTools, // Store cached manifest tools
        duration: Date.now() - startTime,
        cached: false,
      };

      // Cache the result for future use
      this.setUserInitializationCache(userId, result);

      logger.info(
        `[MCPInitializer][${context}] MCP initialization complete for user ${userId} in ${result.duration}ms (${serverCount} servers, ${toolCount} tools, ${manifestTools.length} manifest tools)`,
      );

      return result;
    } catch (error) {
      logger.error(
        `[MCPInitializer][${context}] MCP initialization failed for user ${userId}:`,
        error,
      );

      const result = {
        success: false,
        error: error.message,
        mcpManager: null,
        serverCount: 0,
        toolCount: 0,
        manifestTools: [],
        duration: Date.now() - startTime,
        cached: false,
      };

      // Cache failed result briefly to prevent rapid retries
      this.setUserInitializationCache(userId, result);

      return result;
    }
  }

  /**
   * Get cache statistics for monitoring
   *
   * @returns {Object} Cache statistics
   */
  static getCacheStats() {
    const instance = MCPInitializer.getInstance();
    return {
      userCacheSize: instance.userInitializationCache.size,
      pendingInitializations: instance.pendingInitializations.size,
      cacheTTL: instance.USER_INIT_CACHE_TTL,
    };
  }

  /**
   * Connect a single MCP server for a user
   *
   * @param {string} userId - The user ID
   * @param {string} serverName - The MCP server name to connect
   * @param {string} context - Context identifier for logging
   * @param {Object} availableTools - Tools registry to enhance with MCP tools
   * @returns {Promise<Object>} Connection result
   */
  async connectSingleMCPServer(userId, serverName, context, availableTools = {}) {
    const startTime = Date.now();

    if (!userId) {
      return {
        success: false,
        error: 'User ID is required',
        serverName,
        toolCount: 0,
        duration: Date.now() - startTime,
      };
    }

    if (!serverName) {
      return {
        success: false,
        error: 'Server name is required',
        serverName,
        toolCount: 0,
        duration: Date.now() - startTime,
      };
    }

    logger.info(
      `[MCPInitializer][${context}] Connecting single MCP server '${serverName}' for user ${userId}`,
    );

    try {
      const mcpManager = getMCPManager(userId);
      if (!mcpManager) {
        return {
          success: false,
          error: 'MCP Manager not available for user',
          serverName,
          toolCount: 0,
          duration: Date.now() - startTime,
        };
      }

      // OPTIMIZATION: Try to get just the specific server configuration efficiently
      const UserMCPService = require('~/server/services/UserMCPService');
      let singleServerConfig = null;

      // First, try to get from cache if available
      try {
        const allUserMCPServers = await UserMCPService.getUserMCPServers(userId);
        if (allUserMCPServers[serverName]) {
          singleServerConfig = { [serverName]: allUserMCPServers[serverName] };
          logger.debug(
            `[MCPInitializer][${context}] Found server '${serverName}' in cached configurations`,
          );
        }
      } catch (cacheError) {
        logger.debug(
          `[MCPInitializer][${context}] Cache miss for server configurations, will fetch fresh`,
        );
      }

      // If not found in cache, fetch fresh and look for the specific server
      if (!singleServerConfig) {
        // Force refresh to get latest integrations
        const freshUserMCPServers = await UserMCPService.refreshUserMCPServers(userId);

        if (!freshUserMCPServers[serverName]) {
          return {
            success: false,
            error: `Server '${serverName}' not found in user configuration. Available servers: ${Object.keys(freshUserMCPServers).join(', ')}`,
            serverName,
            toolCount: 0,
            duration: Date.now() - startTime,
          };
        }

        singleServerConfig = { [serverName]: freshUserMCPServers[serverName] };
        logger.debug(
          `[MCPInitializer][${context}] Found server '${serverName}' in fresh configurations`,
        );
      }

      // Store the server config in mcpManager for getUserConnection() to find
      logger.debug(
        `[MCPInitializer][${context}] Adding server config and establishing connection for '${serverName}' for user ${userId}`,
      );
      mcpManager.addUserServerConfig(userId, serverName, singleServerConfig[serverName]);

      // Get or create the connection (this will initialize it if needed)
      const connection = await mcpManager.getUserConnection({
        user: { id: userId },
        serverName,
        flowManager: null,
        tokenMethods: null,
      });
      if (!(await connection.isConnected())) {
        return {
          success: false,
          error: `Failed to establish connection to server '${serverName}'`,
          serverName,
          toolCount: 0,
          duration: Date.now() - startTime,
        };
      }

      // Map tools from this specific server
      const toolCountBefore = Object.keys(availableTools).length;

      // Get tools from this specific server
      try {
        const tools = await connection.fetchTools();
        let mappedToolsCount = 0;
        const connectedTools = {}; // Store the tools to return in result

        for (const tool of tools) {
          const toolName = tool.name; // Use actual tool name without delimiter
          
          // Create MCP metadata for this user-specific tool
          const mcpMetadata = ToolMetadataUtils.createMCPMetadata({
            serverName,
            isGlobal: false,
            userId,
            originalToolName: tool.name,
          });
          
          // Create enhanced tool with embedded metadata
          const enhancedTool = ToolMetadataUtils.createEnhancedTool(
            toolName,
            {
              description: tool.description,
              parameters: tool.inputSchema,
            },
            mcpMetadata
          );

          availableTools[toolName] = enhancedTool;
          connectedTools[toolName] = enhancedTool; // Store for result
          mappedToolsCount++;
        }

        logger.info(
          `[MCPInitializer][${context}] Successfully connected server '${serverName}' for user ${userId} and mapped ${mappedToolsCount} tools`,
        );

        // Update the cache incrementally
        this.updateCacheForSingleServer(userId, serverName, mappedToolsCount, availableTools);

        // Update manifest tools cache incrementally
        logger.info(
          `[MCPInitializer][${context}] Updating manifest tools cache after connecting server '${serverName}'`,
        );
        try {
          const cached = this.getUserInitializationCache(userId);
          if (cached) {
            // Refresh the cached manifest tools to include the new server
            const updatedManifestTools = await mcpManager.loadUserManifestTools(userId, []);
            cached.manifestTools = updatedManifestTools;
            cached.timestamp = Date.now();
            this.setUserInitializationCache(userId, cached);
            logger.info(
              `[MCPInitializer][${context}] Updated manifest tools cache: ${updatedManifestTools.length} total manifest tools`,
            );
          }
        } catch (manifestError) {
          logger.warn(
            `[MCPInitializer][${context}] Failed to update manifest tools cache:`,
            manifestError.message,
          );
        }

        return {
          success: true,
          serverName,
          toolCount: mappedToolsCount,
          connectedTools, // Return the tools that were connected
          duration: Date.now() - startTime,
        };
      } catch (toolError) {
        logger.warn(
          `[MCPInitializer][${context}] Connected to server '${serverName}' but failed to fetch tools:`,
          toolError.message,
        );
        return {
          success: true,
          serverName,
          toolCount: 0,
          duration: Date.now() - startTime,
          warning: `Connected but no tools available: ${toolError.message}`,
        };
      }
    } catch (error) {
      logger.error(
        `[MCPInitializer][${context}] Failed to connect single MCP server '${serverName}' for user ${userId}:`,
        error,
      );

      return {
        success: false,
        error: error.message,
        serverName,
        toolCount: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Disconnect a single MCP server for a user
   *
   * @param {string} userId - The user ID
   * @param {string} serverName - The MCP server name to disconnect
   * @param {string} context - Context identifier for logging
   * @param {Object} availableTools - Tools registry to remove MCP tools from
   * @returns {Promise<Object>} Disconnection result
   */
  async disconnectSingleMCPServer(userId, serverName, context, availableTools = {}) {
    const startTime = Date.now();

    if (!userId) {
      return {
        success: false,
        error: 'User ID is required',
        serverName,
        toolsRemoved: 0,
        duration: Date.now() - startTime,
      };
    }

    if (!serverName) {
      return {
        success: false,
        error: 'Server name is required',
        serverName,
        toolsRemoved: 0,
        duration: Date.now() - startTime,
      };
    }

    logger.info(
      `[MCPInitializer][${context}] Disconnecting single MCP server '${serverName}' for user ${userId}`,
    );

    // Check if this is a global server that should not be disconnected by users
    try {
      const { ToolMetadataUtils } = require('librechat-data-provider');
      
      // Look for any global MCP tools with this server name in availableTools
      const globalToolsFromServer = Object.entries(availableTools).filter(([toolName, toolDef]) => {
        return ToolMetadataUtils.isMCPTool(toolDef) && 
               ToolMetadataUtils.isGlobalMCPTool(toolDef) &&
               ToolMetadataUtils.getServerName(toolDef) === serverName;
      });

      if (globalToolsFromServer.length > 0) {
        logger.warn(
          `[MCPInitializer][${context}] Attempted to disconnect global MCP server '${serverName}' by user ${userId}. This operation is not allowed.`,
        );
        return {
          success: false,
          error: `Cannot disconnect global MCP server '${serverName}'. Global servers can only be managed by administrators.`,
          serverName,
          toolsRemoved: 0,
          duration: Date.now() - startTime,
        };
      }
    } catch (globalCheckError) {
      logger.warn(
        `[MCPInitializer][${context}] Failed to check for global servers, proceeding with disconnection:`,
        globalCheckError.message,
      );
    }

    try {
      const mcpManager = getMCPManager(userId);
      if (!mcpManager) {
        return {
          success: false,
          error: 'MCP Manager not available for user',
          serverName,
          toolsRemoved: 0,
          duration: Date.now() - startTime,
        };
      }

      // Update manifest tools cache BEFORE disconnecting the server
      // This ensures we capture the current state and can properly exclude the server being removed
      logger.info(
        `[MCPInitializer][${context}] Updating manifest tools cache before disconnecting server '${serverName}'`,
      );
      try {
        const cached = this.getUserInitializationCache(userId);
        if (cached) {
          // Get current manifest tools and filter out the tools from the server being disconnected
          const currentManifestTools = cached.manifestTools || [];
          const filteredManifestTools = currentManifestTools.filter(tool => {
            // Remove tools that belong to the server being disconnected
            return tool.serverName !== serverName;
          });
          
          cached.manifestTools = filteredManifestTools;
          cached.timestamp = Date.now();
          this.setUserInitializationCache(userId, cached);
          logger.info(
            `[MCPInitializer][${context}] Updated manifest tools cache: ${filteredManifestTools.length} total manifest tools (removed tools from server '${serverName}')`,
          );
        }
      } catch (manifestError) {
        logger.warn(
          `[MCPInitializer][${context}] Failed to update manifest tools cache:`,
          manifestError.message,
        );
      }

      // Disconnect the specific server
      // The disconnection will automatically remove tools from memory/connections
      await mcpManager.disconnectUserConnection(userId, serverName);

      logger.info(
        `[MCPInitializer][${context}] Successfully disconnected server '${serverName}' for user ${userId}`,
      );

      return {
        success: true,
        serverName,
        toolsRemoved: 0, // Tool cleanup is no longer performed automatically
        removedToolKeys: [], // Tool removal is no longer performed automatically
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(
        `[MCPInitializer][${context}] Failed to disconnect single MCP server '${serverName}' for user ${userId}:`,
        error,
      );

      return {
        success: false,
        error: error.message,
        serverName,
        toolsRemoved: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Update Express app-level availableTools cache for individual server operations
   *
   * @private
   * @param {Express.Application} app - Express app instance
   * @param {string} userId - The user ID
   * @param {string} serverName - The server name
   * @param {Object} toolsToAdd - Enhanced tools to add (for connect operations)
   * @param {Array} toolKeysToRemove - Tool keys to remove (for disconnect operations)
   */
  static updateAppLevelCaches(app, userId, serverName, toolsToAdd = {}, toolKeysToRemove = []) {
    if (!app || !app.locals) {
      logger.warn(`[MCPInitializer] No app.locals available to update caches`);
      return;
    }

    const { availableTools } = app.locals;

    if (!availableTools) {
      logger.warn(`[MCPInitializer] app.locals.availableTools not found`);
      return;
    }

    // Add new enhanced tools to availableTools
    if (Object.keys(toolsToAdd).length > 0) {
      let addedCount = 0;
      for (const [toolName, enhancedTool] of Object.entries(toolsToAdd)) {
        availableTools[toolName] = enhancedTool;
        addedCount++;
      }
      logger.info(
        `[MCPInitializer] Added ${addedCount} enhanced tools to app.locals for server '${serverName}'`,
      );
    }

    // Remove tools from availableTools
    if (toolKeysToRemove.length > 0) {
      let removedCount = 0;
      for (const toolName of toolKeysToRemove) {
        // Only remove from availableTools if it's actually an MCP tool with metadata
        if (availableTools[toolName] && ToolMetadataUtils.isMCPTool(availableTools[toolName])) {
          delete availableTools[toolName];
          removedCount++;
        }
      }
      logger.info(
        `[MCPInitializer] Removed ${removedCount} MCP tools from app.locals for server '${serverName}'`,
      );
    }

    logger.info(
      `[MCPInitializer] Updated app.locals for user ${userId}, server '${serverName}' (total tools: ${Object.keys(availableTools).length})`,
    );
  }

  /**
   * Update cache incrementally when a server is added
   *
   * @private
   * @param {string} userId - The user ID
   * @param {string} serverName - The server name that was added
   * @param {number} toolCount - Number of tools added
   * @param {Object} availableTools - Current available tools registry
   */
  updateCacheForSingleServer(userId, serverName, toolCount, availableTools) {
    const cached = this.getUserInitializationCache(userId);
    if (cached) {
      // Update the cached data
      cached.serverCount = cached.serverCount + 1;
      cached.toolCount = cached.toolCount + toolCount;

      // Ensure cached tools object exists
      if (!cached.mcpTools) {
        cached.mcpTools = {};
      }

      // Since this method is called after tools are already added to availableTools,
      // we need to add the newly connected tools to the cache
      // This is a simplified approach - in a more complex system, we'd track server ownership
      logger.debug(
        `[MCPInitializer] Note: Incremental cache update for connect - actual cache update happens elsewhere`,
      );

      // Update timestamp and save
      cached.timestamp = Date.now();
      this.setUserInitializationCache(userId, cached);

      logger.info(
        `[MCPInitializer] Updated cache for user ${userId}: added server '${serverName}' with ${toolCount} tools (total cached tools: ${Object.keys(cached.mcpTools).length})`,
      );
    } else {
      logger.warn(
        `[MCPInitializer] No cached data found for user ${userId} to update incrementally`,
      );
    }
  }

  /**
   * Update cache incrementally when a server is removed
   *
   * @private
   * @param {string} userId - The user ID
   * @param {string} serverName - The server name that was removed
   * @param {Array} removedToolKeys - Array of tool keys that were removed
   * @param {Object} availableTools - Current available tools registry
   */
  updateCacheForServerRemoval(userId, serverName, removedToolKeys) {
    const cached = this.getUserInitializationCache(userId);
    if (cached) {
      // Update the cached data
      cached.serverCount = Math.max(0, cached.serverCount - 1);
      cached.toolCount = Math.max(0, cached.toolCount - removedToolKeys.length);

      // Remove tools from the cache
      if (cached.mcpTools) {
        for (const toolKey of removedToolKeys) {
          delete cached.mcpTools[toolKey];
        }
      }

      // Update timestamp and save
      cached.timestamp = Date.now();
      this.setUserInitializationCache(userId, cached);

      logger.info(
        `[MCPInitializer] Updated cache for user ${userId}: removed server '${serverName}' and ${removedToolKeys.length} tools (total cached tools: ${cached.mcpTools ? Object.keys(cached.mcpTools).length : 0})`,
      );
    } else {
      logger.warn(
        `[MCPInitializer] No cached data found for user ${userId} to update incrementally`,
      );
    }
  }
}

// Export both the class and singleton instance
module.exports = MCPInitializer;
