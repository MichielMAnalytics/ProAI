const axios = require('axios');
const { PipedreamUserIntegrations } = require('./Pipedream');
const { logger } = require('~/config');

/**
 * UserMCPService - Manages user-specific MCP servers from database
 * 
 * This service handles:
 * - Converting user integrations to MCP server configurations
 * - Merging user-specific MCP servers with global ones
 * - Managing dynamic MCP server loading per user
 */
class UserMCPService {
  constructor() {
    this.userMCPServers = new Map(); // Cache for user MCP servers
  }

  /**
   * Get user-specific MCP servers configuration from user integrations
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Object of user MCP server configurations
   */
  async getUserMCPServers(userId) {
    logger.info(`=== UserMCPService.getUserMCPServers: Starting for user ${userId} ===`);
    
    if (!userId) {
      logger.warn('UserMCPService.getUserMCPServers: No userId provided');
      return {};
    }

    try {
      // Check cache first
      const cacheKey = `user_mcp_servers_${userId}`;
      if (this.userMCPServers.has(userId)) {
        const cached = this.userMCPServers.get(userId);
        logger.info(`UserMCPService: Returning cached MCP servers for user ${userId}, count: ${Object.keys(cached).length}`);
        return cached;
      }

      logger.info(`UserMCPService: Fetching user integrations from database for user ${userId}`);
      
      // Get user integrations with MCP server configurations
      const UserIntegration = require('~/models/UserIntegration');
      
      // First, let's see ALL integrations for this user
      const allIntegrations = await UserIntegration.find({ userId }).lean();
      logger.info(`UserMCPService: Found ${allIntegrations.length} total integrations for user ${userId}`);
      
      if (allIntegrations.length > 0) {
        logger.info(`UserMCPService: Integration details:`, allIntegrations.map(i => ({
          id: i._id,
          appSlug: i.appSlug,
          appName: i.appName,
          isActive: i.isActive,
          hasMcpConfig: !!i.mcpServerConfig,
          mcpServerName: i.mcpServerConfig?.serverName
        })));
      }
      
      const integrations = await UserIntegration.find({
        userId,
        isActive: true,
        mcpServerConfig: { $exists: true, $ne: null }
      }).lean();

      logger.info(`UserMCPService: Found ${integrations.length} active integrations with MCP configs for user ${userId}`);
      
      if (integrations.length === 0) {
        logger.info(`UserMCPService: No integrations with MCP configs found for user ${userId}`);
        this.userMCPServers.set(userId, {});
        return {};
      }

      // Transform integrations to MCP server configuration format
      const mcpServers = {};
      
      for (const integration of integrations) {
        const { mcpServerConfig } = integration;
        if (!mcpServerConfig || !mcpServerConfig.serverName) {
          logger.warn(`UserMCPService: Invalid MCP config for integration ${integration._id}:`, mcpServerConfig);
          continue;
        }

        const serverName = mcpServerConfig.serverName;
        logger.info(`UserMCPService: Processing integration ${integration.appSlug} with server name ${serverName}`);
        
        // Generate the MCP server URL if not provided
        let serverUrl = mcpServerConfig.url;
        if (!serverUrl) {
          // SECURITY FIX: Always construct user-specific URLs with current user's integration ID
          // This prevents users from accessing admin's MCP integrations when using shared agents
          const baseUrl = process.env.PIPEDREAM_MCP_BASE_URL || 'https://remote.mcp.pipedream.net';
          serverUrl = `${baseUrl}/${integration._id.toString()}/${integration.appSlug}`;
          logger.info(`UserMCPService: Generated user-specific MCP URL for user ${userId}: ${serverUrl}`);
        }
        
        mcpServers[serverName] = {
          type: 'streamable-http',
          url: serverUrl,
          timeout: mcpServerConfig.timeout || 60000,
          iconPath: mcpServerConfig.iconPath || integration.appIcon,
          chatMenu: true, // Enable in chat menu by default
          // Re-instating headers as streamable-http transport relies on them.
          headers: {
            'X-User-ID': userId,
            'X-Integration-ID': integration._id.toString(),
            'x-pd-project-id': process.env.PIPEDREAM_PROJECT_ID,
            'x-pd-environment':
              process.env.PIPEDREAM_ENVIRONMENT ||
              (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
            'x-pd-external-user-id': userId,
            'x-pd-app-slug': integration.appSlug,
            'x-pd-tool-mode': 'tools-only',
            ...(mcpServerConfig.headers || {}),
          },
          // Mark as user-specific for identification
          _userSpecific: true,
          _integrationId: integration._id,
          _appName: integration.appName,
        };

        // Add Authorization header if we can get an access token
        try {
          const PipedreamConnect = require('./Pipedream/PipedreamConnect');
          if (PipedreamConnect.isEnabled()) {
            // Get access token using OAuth client credentials
            const baseURL = process.env.PIPEDREAM_API_BASE_URL || 'https://api.pipedream.com/v1';
            
            const tokenResponse = await axios.post(`${baseURL}/oauth/token`, {
              grant_type: 'client_credentials',
              client_id: process.env.PIPEDREAM_CLIENT_ID,
              client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
            }, {
              headers: { 'Content-Type': 'application/json' },
            });
            
            const accessToken = tokenResponse.data.access_token;
            if (accessToken) {
              mcpServers[serverName].headers['Authorization'] = `Bearer ${accessToken}`;
              logger.info(`UserMCPService: Added Pipedream auth token for server ${serverName}`);
            }
          }
        } catch (authError) {
          logger.warn(`UserMCPService: Failed to get Pipedream auth token for server ${serverName}:`, authError.message);
          // Continue without auth token - the MCP server will handle the auth flow
        }

        logger.info(`UserMCPService: Added MCP server ${serverName}:`, {
          type: mcpServers[serverName].type,
          url: mcpServers[serverName].url,
          hasIcon: !!mcpServers[serverName].iconPath
        });
      }

      logger.info(`UserMCPService: Built ${Object.keys(mcpServers).length} MCP servers for user ${userId}:`, Object.keys(mcpServers));
      
      // Cache the result
      this.userMCPServers.set(userId, mcpServers);
      
      return mcpServers;
    } catch (error) {
      logger.error(`UserMCPService: Error getting MCP servers for user ${userId}:`, {
        message: error.message,
        stack: error.stack
      });
      return {};
    }
  }

  /**
   * Merge global MCP servers with user-specific ones
   * 
   * @param {Object} globalMCPServers - Global MCP servers from librechat.yaml
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Merged MCP servers configuration
   */
  async getMergedMCPServers(globalMCPServers = {}, userId) {
    if (!userId) {
      return globalMCPServers;
    }

    try {
      const userMCPServers = await this.getUserMCPServers(userId);
      
      // Merge global and user-specific servers
      // User-specific servers take precedence over global ones with same name
      const mergedServers = {
        ...globalMCPServers,
        ...userMCPServers,
      };

      logger.info(`UserMCPService: Merged ${Object.keys(globalMCPServers).length} global + ${Object.keys(userMCPServers).length} user servers for user ${userId}`);
      
      return mergedServers;
    } catch (error) {
      logger.error(`UserMCPService: Failed to merge MCP servers for user ${userId}:`, error.message);
      return globalMCPServers;
    }
  }

  /**
   * Get user-specific MCP tools (formatted for LibreChat)
   * 
   * Note: This method now returns an empty array since actual MCP tools are loaded
   * by the MCP manager via mapUserAvailableTools(). This service only handles
   * server configuration, not individual tool registration.
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Empty array - tools are loaded by MCP manager
   */
  async getUserMCPTools(userId) {
    logger.info(`=== UserMCPService.getUserMCPTools: Starting for user ${userId} ===`);
    
    if (!userId) {
      logger.warn('UserMCPService.getUserMCPTools: No userId provided');
      return [];
    }

    // The actual MCP tools are loaded by the MCP manager via:
    // - mcpManager.mapUserAvailableTools() - maps tools to availableTools registry
    // - mcpManager.loadUserManifestTools() - adds tools to the manifest
    // 
    // This method no longer creates placeholder tools to avoid conflicts
    logger.info(`UserMCPService: MCP tools are loaded by MCP manager, returning empty array for user ${userId}`);
    return [];
  }

  /**
   * Clear cached user MCP servers
   * 
   * Note: As of the new architecture, cache clearing is handled automatically by 
   * UserIntegration schema middleware when integrations are created, updated, or deleted.
   * This method is kept for manual troubleshooting and the explicit refresh endpoint.
   * 
   * @param {string} userId - The user ID (optional, clears all if not provided)
   */
  clearCache(userId = null) {
    if (userId) {
      this.userMCPServers.delete(userId);
      logger.info(`UserMCPService: Cleared cache for user ${userId}`);
    } else {
      this.userMCPServers.clear();
      logger.info('UserMCPService: Cleared all user MCP server cache');
    }
  }

  /**
   * Refresh user MCP servers (useful when integrations change)
   * 
   * Note: This method is primarily kept for the manual refresh API endpoint.
   * In normal operation, cache clearing is handled automatically by UserIntegration 
   * schema middleware when database operations occur.
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Updated MCP servers configuration
   */
  async refreshUserMCPServers(userId) {
    if (!userId) {
      return {};
    }

    // Clear cache first
    this.clearCache(userId);
    
    // Fetch fresh data
    return await this.getUserMCPServers(userId);
  }

  /**
   * Clean up orphaned MCP tools from user's agents when integrations are disconnected
   * 
   * This function removes MCP tools from agents that belong to integrations that are
   * no longer connected. It should be called when an integration is deleted to ensure
   * agents don't have dangling references to unavailable tools.
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Cleanup result with statistics
   */
  async cleanupOrphanedMCPTools(userId) {
    if (!userId) {
      throw new Error('User ID is required for MCP tool cleanup');
    }

    logger.info(`UserMCPService: Starting cleanup of orphaned MCP tools for user ${userId}`);

    try {
      // Get the Agent model
      const { Agent } = require('~/models/Agent');
      const { Constants } = require('librechat-data-provider');

      // Get current user integrations to determine which MCP tools should remain
      const currentUserMCPServers = await this.getUserMCPServers(userId);
      const validMCPServerNames = Object.keys(currentUserMCPServers);
      
      logger.info(`UserMCPService: Found ${validMCPServerNames.length} valid MCP servers for user ${userId}: ${validMCPServerNames.join(', ')}`);

      // Find all agents owned by this user that have MCP tools
      const userAgents = await Agent.find({
        author: userId,
        tools: { $regex: Constants.mcp_delimiter }
      }).select('id tools').lean();

      if (userAgents.length === 0) {
        logger.info(`UserMCPService: No agents with MCP tools found for user ${userId}`);
        return {
          success: true,
          agentsProcessed: 0,
          agentsUpdated: 0,
          toolsRemoved: 0,
          validMCPServers: validMCPServerNames
        };
      }

      logger.info(`UserMCPService: Found ${userAgents.length} agents with MCP tools for user ${userId}`);

      let agentsUpdated = 0;
      let totalToolsRemoved = 0;
      const removedToolsDetails = [];

      // Process each agent to remove orphaned MCP tools
      for (const agent of userAgents) {
        const currentTools = agent.tools || [];
        const mcpTools = currentTools.filter(tool => tool.includes(Constants.mcp_delimiter));
        
        if (mcpTools.length === 0) {
          continue;
        }

        logger.info(`UserMCPService: Agent ${agent.id} has ${mcpTools.length} MCP tools: ${mcpTools.join(', ')}`);
        logger.info(`UserMCPService: Valid server names: ${validMCPServerNames.join(', ')}`);

        // Filter out orphaned MCP tools
        const validTools = currentTools.filter(tool => {
          if (!tool.includes(Constants.mcp_delimiter)) {
            // Keep non-MCP tools
            return true;
          }

          // Check if this MCP tool belongs to a valid integration
          const mcpServerName = tool.split(Constants.mcp_delimiter)[1];
          const isValid = validMCPServerNames.includes(mcpServerName);
          
          logger.debug(`UserMCPService: Tool "${tool}" -> Server "${mcpServerName}" -> Valid: ${isValid}`);
          
          if (!isValid) {
            logger.info(`UserMCPService: Removing orphaned MCP tool "${tool}" from agent ${agent.id} (server: ${mcpServerName})`);
            totalToolsRemoved++;
            removedToolsDetails.push({ agentId: agent.id, tool, server: mcpServerName });
          }

          return isValid;
        });

        // Update the agent if tools were removed
        if (validTools.length !== currentTools.length) {
          await Agent.updateOne(
            { id: agent.id },
            { 
              $set: { 
                tools: validTools,
                mcp_servers: this.extractMCPServerSlugs(validTools)
              }
            }
          );
          agentsUpdated++;
          
          const removedCount = currentTools.length - validTools.length;
          logger.info(`UserMCPService: Updated agent ${agent.id}: removed ${removedCount} orphaned MCP tools`);
        }
      }

      const result = {
        success: true,
        agentsProcessed: userAgents.length,
        agentsUpdated,
        toolsRemoved: totalToolsRemoved,
        validMCPServers: validMCPServerNames,
        removedToolsDetails // Add details for debugging
      };

      logger.info(`UserMCPService: Cleanup completed for user ${userId}:`, result);
      return result;

    } catch (error) {
      logger.error(`UserMCPService: Error during MCP tool cleanup for user ${userId}:`, error);
      throw new Error(`Failed to cleanup orphaned MCP tools: ${error.message}`);
    }
  }

  /**
   * Extract MCP server app slugs from an array of tools
   * @param {string[]} tools - Array of tool names  
   * @returns {string[]} Array of unique MCP server app slugs
   */
  extractMCPServerSlugs(tools) {
    if (!Array.isArray(tools)) {
      return [];
    }

    const { Constants } = require('librechat-data-provider');
    const mcpSlugs = new Set();
    
    for (const tool of tools) {
      if (typeof tool === 'string' && tool.includes(Constants.mcp_delimiter)) {
        // Extract app slug from tool name pattern: TOOL_NAME_mcp_pipedream-APP_SLUG
        const parts = tool.split(Constants.mcp_delimiter);
        if (parts.length >= 2) {
          const afterMcp = parts[1];
          // Handle patterns like 'pipedream-microsoft_outlook' -> 'microsoft_outlook'
          if (afterMcp.includes('-')) {
            const appSlug = afterMcp.split('-').slice(1).join('-'); // Take everything after the first dash
            if (appSlug) {
              mcpSlugs.add(appSlug);
            }
          }
        }
      }
    }
    
    return Array.from(mcpSlugs);
  }

  /**
   * Check if user has any MCP servers configured
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} True if user has MCP servers
   */
  async hasUserMCPServers(userId) {
    if (!userId) {
      return false;
    }

    try {
      const userMCPServers = await this.getUserMCPServers(userId);
      return Object.keys(userMCPServers).length > 0;
    } catch (error) {
      logger.error(`UserMCPService: Failed to check MCP servers for user ${userId}:`, error.message);
      return false;
    }
  }
}

module.exports = new UserMCPService(); 