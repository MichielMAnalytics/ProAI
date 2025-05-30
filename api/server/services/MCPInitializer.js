const { getMCPManager } = require('~/config');
const { logger } = require('~/config');
const { Constants } = require('librechat-data-provider');

/**
 * MCPInitializer - Standardized MCP initialization utility
 * 
 * Provides a consistent pattern for initializing user-specific MCP servers
 * across different contexts (web UI, scheduler, APIs, etc.) with smart caching
 * to prevent redundant initialization attempts while maintaining user-specific isolation.
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
   * @param {string} userId - The user ID
   */
  static clearUserCache(userId) {
    const instance = MCPInitializer.getInstance();
    instance.userInitializationCache.delete(userId);
    instance.pendingInitializations.delete(userId);
    logger.info(`[MCPInitializer] Cleared cache for user ${userId}`);
  }

  /**
   * Clear all caches (useful for system restart scenarios)
   */
  static clearAllCaches() {
    const instance = MCPInitializer.getInstance();
    instance.userInitializationCache.clear();
    instance.pendingInitializations.clear();
    logger.info(`[MCPInitializer] Cleared all caches`);
  }

  /**
   * Ensure user MCP servers are ready for use with smart caching
   * 
   * @param {string} userId - The user ID
   * @param {string} context - Context identifier for logging (e.g., 'SchedulerService', 'PluginController')
   * @param {Object} availableTools - Tools registry to enhance with MCP tools
   * @param {Object} options - Additional options
   * @param {boolean} options.forceRefresh - Force refresh even if cached (default: false)
   * @returns {Promise<Object>} Initialization result with mcpManager, serverCount, toolCount, and cache info
   */
  async ensureUserMCPReady(userId, context, availableTools = {}, options = {}) {
    const startTime = Date.now();
    const { forceRefresh = false } = options;

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
      logger.debug(`[MCPInitializer][${context}] Waiting for pending initialization for user ${userId}`);
      try {
        const result = await this.pendingInitializations.get(userId);
        logger.info(`[MCPInitializer][${context}] Used pending initialization result for user ${userId} in ${Date.now() - startTime}ms`);
        return {
          ...result,
          duration: Date.now() - startTime,
          cached: true,
          pendingWait: true,
        };
      } catch (error) {
        logger.warn(`[MCPInitializer][${context}] Pending initialization failed for user ${userId}:`, error.message);
        this.pendingInitializations.delete(userId);
      }
    }

    // Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = this.getUserInitializationCache(userId);
      if (cached) {
        logger.info(`[MCPInitializer][${context}] Using cached MCP initialization for user ${userId} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000)}s)`);
        
        // Apply cached tools to current availableTools registry
        if (cached.mcpTools && Object.keys(cached.mcpTools).length > 0) {
          Object.assign(availableTools, cached.mcpTools);
          logger.debug(`[MCPInitializer][${context}] Applied ${Object.keys(cached.mcpTools).length} cached MCP tools to availableTools`);
        }

        return {
          ...cached,
          duration: Date.now() - startTime,
          cached: true,
        };
      }
    }

    // Create promise for concurrent requests
    const initializationPromise = this.performUserMCPInitialization(userId, context, availableTools, startTime);
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
   * @returns {Promise<Object>} Initialization result
   */
  async performUserMCPInitialization(userId, context, availableTools, startTime) {
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
      const userMCPServers = await UserMCPService.getUserMCPServers(userId);
      const serverCount = Object.keys(userMCPServers).length;

      logger.info(`[MCPInitializer][${context}] Found ${serverCount} user MCP servers for user ${userId}: ${Object.keys(userMCPServers).join(', ')}`);

      let toolCount = 0;
      const mcpTools = {}; // Store tools for caching

      if (serverCount > 0) {
        // Initialize user-specific MCP servers
        logger.info(`[MCPInitializer][${context}] Initializing user MCP servers for user ${userId}`);
        await mcpManager.initializeUserMCP(userMCPServers, userId);
        logger.info(`[MCPInitializer][${context}] Successfully initialized ${serverCount} MCP servers for user ${userId}`);

        // Verify connections are ready
        let readyConnections = 0;
        for (const serverName of Object.keys(userMCPServers)) {
          try {
            const connection = await mcpManager.getUserConnection(userId, serverName);
            if (await connection.isConnected()) {
              readyConnections++;
              logger.debug(`[MCPInitializer][${context}] Server ${serverName} is ready for user ${userId}`);
            } else {
              logger.warn(`[MCPInitializer][${context}] Server ${serverName} is not connected for user ${userId}`);
            }
          } catch (error) {
            logger.warn(`[MCPInitializer][${context}] Failed to verify connection for server ${serverName}:`, error.message);
          }
        }

        logger.info(`[MCPInitializer][${context}] Verified ${readyConnections}/${serverCount} MCP connections are ready for user ${userId}`);

        // Map tools to availableTools registry and count them
        const toolCountBefore = Object.keys(availableTools).length;
        await mcpManager.mapUserAvailableTools(availableTools, userId);
        const toolCountAfter = Object.keys(availableTools).length;
        toolCount = toolCountAfter - toolCountBefore;

        // Store the MCP tools for caching (extract only the MCP tools added)
        const allToolKeys = Object.keys(availableTools);
        for (const toolKey of allToolKeys) {
          if (toolKey.includes(Constants.mcp_delimiter)) { // MCP delimiter
            mcpTools[toolKey] = availableTools[toolKey];
          }
        }

        logger.info(`[MCPInitializer][${context}] Successfully mapped ${toolCount} user MCP tools to availableTools for user ${userId} (total tools: ${toolCountAfter})`);
      }

      const result = {
        success: true,
        mcpManager,
        serverCount,
        toolCount,
        mcpTools, // Store for caching
        duration: Date.now() - startTime,
        cached: false,
      };

      // Cache the result for future use
      this.setUserInitializationCache(userId, result);
      
      logger.info(`[MCPInitializer][${context}] MCP initialization complete for user ${userId} in ${result.duration}ms (${serverCount} servers, ${toolCount} tools)`);
      
      return result;

    } catch (error) {
      logger.error(`[MCPInitializer][${context}] MCP initialization failed for user ${userId}:`, error);
      
      const result = {
        success: false,
        error: error.message,
        mcpManager: null,
        serverCount: 0,
        toolCount: 0,
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
}

// Export both the class and singleton instance
module.exports = MCPInitializer; 