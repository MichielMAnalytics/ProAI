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
   * Static cache for user MCP servers (shared across instances)
   */
  static userMCPServersCache = new Map();

  /**
   * Get user-specific MCP servers configuration from user integrations
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Object of user MCP server configurations
   */
  async getUserMCPServers(userId) {
    return UserMCPService.getUserMCPServers(userId);
  }

  /**
   * Static method: Get user-specific MCP servers configuration from user integrations
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Object of user MCP server configurations
   */
  static async getUserMCPServers(userId) {
    logger.info(`=== UserMCPService.getUserMCPServers: Starting for user ${userId} ===`);
    
    if (!userId) {
      logger.warn('UserMCPService.getUserMCPServers: No userId provided');
      return {};
    }

    try {
      // Check cache first
      if (UserMCPService.userMCPServersCache.has(userId)) {
        const cached = UserMCPService.userMCPServersCache.get(userId);
        logger.info(`UserMCPService: Returning cached MCP servers for user ${userId}, count: ${Object.keys(cached).length}`);
        return cached;
      }

      // logger.info(`UserMCPService: Fetching user integrations from database for user ${userId}`);
      
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

      // logger.info(`UserMCPService: Found ${integrations.length} active integrations with MCP configs for user ${userId}`);

      if (integrations.length === 0) {
        // Cache empty result
        UserMCPService.userMCPServersCache.set(userId, {});
        return {};
      }

      const mcpServers = {};

      for (const integration of integrations) {
        const { mcpServerConfig, appSlug } = integration;
        const serverName = mcpServerConfig.serverName;
        
        // logger.info(`UserMCPService: Processing integration ${appSlug} with server name ${serverName}`);

        // Build the server URL
        const baseURL = process.env.PIPEDREAM_MCP_BASE_URL || 'https://remote.mcp.pipedream.net';
        const serverUrl = `${baseURL}/${userId}/${appSlug}`;
        
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
              // logger.info(`UserMCPService: Added Pipedream auth token for server ${serverName}`);
            }
          }
        } catch (authError) {
          logger.warn(`UserMCPService: Failed to get Pipedream auth token for server ${serverName}:`, authError.message);
          // Continue without auth token - the MCP server will handle the auth flow
        }

        // logger.info(`UserMCPService: Added MCP server ${serverName}:`, {
        //   type: mcpServers[serverName].type,
        //   url: mcpServers[serverName].url,
        //   hasIcon: !!mcpServers[serverName].iconPath
        // });
      }

      logger.info(`UserMCPService: Built ${Object.keys(mcpServers).length} MCP servers for user ${userId}:`, Object.keys(mcpServers));
      
      // Cache the result
      UserMCPService.userMCPServersCache.set(userId, mcpServers);
      
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
   * Get user-specific MCP tools for display in UI
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Array of user MCP tools
   */
  async getUserMCPTools(userId) {
    if (!userId) {
      return [];
    }

    try {
      const userMCPServers = await this.getUserMCPServers(userId);
      const tools = [];

      for (const [serverName, serverConfig] of Object.entries(userMCPServers)) {
        if (serverConfig._userSpecific) {
          tools.push({
            name: serverConfig._appName || serverName,
            description: `User-specific ${serverConfig._appName || serverName} integration`,
            serverName,
            appSlug: serverName.replace('pipedream-', ''),
            icon: serverConfig.iconPath,
          });
        }
      }

      return tools;
    } catch (error) {
      logger.error(`UserMCPService: Failed to get user MCP tools for user ${userId}:`, error.message);
      return [];
    }
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
    UserMCPService.clearCache(userId);
  }

  /**
   * Static method: Clear cached user MCP servers
   * 
   * @param {string} userId - The user ID (optional, clears all if not provided)
   */
  static clearCache(userId = null) {
    if (userId) {
      UserMCPService.userMCPServersCache.delete(userId);
      logger.info(`UserMCPService: Cleared cache for user ${userId}`);
    } else {
      UserMCPService.userMCPServersCache.clear();
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
    return UserMCPService.refreshUserMCPServers(userId);
  }

  /**
   * Static method: Refresh user MCP servers (useful when integrations change)
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Updated MCP servers configuration
   */
  static async refreshUserMCPServers(userId) {
    if (!userId) {
      return {};
    }

    // Clear cache first
    UserMCPService.clearCache(userId);
    
    // Fetch fresh data
    return await UserMCPService.getUserMCPServers(userId);
  }

  /**
   * Static method: Get a single server configuration for a specific user and server
   * 
   * @param {string} userId - The user ID
   * @param {string} serverName - The server name to get
   * @returns {Promise<Object|null>} Server configuration or null if not found
   */
  static async getSingleUserMCPServer(userId, serverName) {
    if (!userId || !serverName) {
      return null;
    }

    try {
      const allServers = await UserMCPService.getUserMCPServers(userId);
      return allServers[serverName] || null;
    } catch (error) {
      logger.error(`UserMCPService: Failed to get single server '${serverName}' for user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Clean up tools from agents for a specific disconnected server
   * 
   * @param {string} userId - The user ID
   * @param {string} disconnectedServerName - The server that was disconnected
   * @param {string[]} toolsToRemove - Array of tool names to remove from agents (if empty, will be discovered from registry)
   * @param {Map} mcpToolRegistry - Optional MCP tool registry for discovering tools
   * @returns {Promise<Object>} Cleanup result with statistics
   */
  async cleanupToolsForDisconnectedServer(userId, disconnectedServerName, toolsToRemove = [], mcpToolRegistry = null) {
    return UserMCPService.cleanupToolsForDisconnectedServer(userId, disconnectedServerName, toolsToRemove, mcpToolRegistry);
  }

  /**
   * Clean up orphaned MCP tools from agents
   * 
   * This method finds all agents that belong to the user and removes tools that reference
   * MCP servers that no longer exist in the user's integrations.
   * 
   * @param {string} userId - The user ID
   * @param {Map} mcpToolRegistry - Optional MCP tool registry for identifying tools
   * @returns {Promise<Object>} Cleanup result with statistics
   */
  async cleanupOrphanedMCPTools(userId, mcpToolRegistry = null) {
    return UserMCPService.cleanupOrphanedMCPTools(userId, mcpToolRegistry);
  }

  /**
   * Static method: Clean up tools from agents for a specific disconnected server
   * 
   * @param {string} userId - The user ID
   * @param {string} disconnectedServerName - The server that was disconnected
   * @param {string[]} toolsToRemove - Array of tool names to remove from agents (if empty, will be discovered from registry)
   * @param {Map} mcpToolRegistry - Optional MCP tool registry for discovering tools
   * @returns {Promise<Object>} Cleanup result with statistics
   */
  static async cleanupToolsForDisconnectedServer(userId, disconnectedServerName, toolsToRemove = [], mcpToolRegistry = null) {
    if (!userId || !disconnectedServerName) {
      return {
        agentsProcessed: 0,
        agentsUpdated: 0,
        toolsRemoved: 0,
        disconnectedServer: disconnectedServerName,
      };
    }

    try {
      // If no tools are specified, discover them from the MCP tool registry
      if (!Array.isArray(toolsToRemove) || toolsToRemove.length === 0) {
        logger.info(`UserMCPService: Discovering tools to remove for server '${disconnectedServerName}' from MCP tool registry`);
        
        try {
          // Use the provided MCP tool registry to discover tools
          if (mcpToolRegistry && mcpToolRegistry.size > 0) {
            const discoveredTools = [];
            for (const [toolName, toolInfo] of mcpToolRegistry.entries()) {
              if (toolInfo && toolInfo.serverName === disconnectedServerName) {
                discoveredTools.push(toolName);
              }
            }
            toolsToRemove = discoveredTools;
            logger.info(`UserMCPService: Discovered ${toolsToRemove.length} tools for server '${disconnectedServerName}': [${toolsToRemove.join(', ')}]`);
          } else {
            logger.warn(`UserMCPService: No MCP tool registry provided to discover tools for server '${disconnectedServerName}'`);
          }
        } catch (discoveryError) {
          logger.warn(`UserMCPService: Failed to discover tools for server '${disconnectedServerName}':`, discoveryError.message);
        }
        
        if (toolsToRemove.length === 0) {
          logger.info(`UserMCPService: No tools found for cleanup for server '${disconnectedServerName}'`);
          return {
            agentsProcessed: 0,
            agentsUpdated: 0,
            toolsRemoved: 0,
            disconnectedServer: disconnectedServerName,
            removedToolsDetails: [],
          };
        }
      }

      logger.info(`UserMCPService: Starting tool cleanup for disconnected server '${disconnectedServerName}' for user ${userId}`);
      logger.info(`UserMCPService: Tools to remove: [${toolsToRemove.join(', ')}]`);

      // Get all agents for this user
      const { Agent } = require('~/models/Agent');
      const userAgents = await Agent.find({ author: userId }).lean();

      logger.info(`UserMCPService: Found ${userAgents.length} agents for user ${userId}`);

      let agentsProcessed = 0;
      let agentsUpdated = 0;
      let totalToolsRemoved = 0;
      const removedToolsDetails = [];

      for (const agent of userAgents) {
        agentsProcessed++;
        let agentToolsRemoved = 0;

        if (agent.tools && Array.isArray(agent.tools)) {
          const originalToolCount = agent.tools.length;
          
          // Filter out the specific tools that belonged to the disconnected server
          const filteredTools = agent.tools.filter(tool => {
            if (typeof tool === 'string' && toolsToRemove.includes(tool)) {
              logger.info(`UserMCPService: Removing tool '${tool}' from agent '${agent.name}' (server '${disconnectedServerName}' disconnected)`);
              agentToolsRemoved++;
              totalToolsRemoved++;
              removedToolsDetails.push({
                agentId: agent._id,
                agentName: agent.name,
                toolName: tool,
                serverName: disconnectedServerName,
              });
              return false; // Remove this tool
            }
            return true; // Keep this tool
          });

          // Also remove the disconnected server from the agent's mcp_servers array
          let filteredMcpServers = agent.mcp_servers || [];
          let mcpServerRemoved = false;
          
          if (Array.isArray(filteredMcpServers)) {
            const originalMcpServersCount = filteredMcpServers.length;
            // Remove server name with and without 'pipedream-' prefix to handle both formats
            const serverNameClean = disconnectedServerName.startsWith('pipedream-') 
              ? disconnectedServerName.replace('pipedream-', '') 
              : disconnectedServerName;
            const serverNameWithPrefix = disconnectedServerName.startsWith('pipedream-') 
              ? disconnectedServerName 
              : `pipedream-${disconnectedServerName}`;
              
            filteredMcpServers = filteredMcpServers.filter(server => 
              server !== disconnectedServerName && 
              server !== serverNameClean && 
              server !== serverNameWithPrefix
            );
            
            mcpServerRemoved = filteredMcpServers.length !== originalMcpServersCount;
            if (mcpServerRemoved) {
              logger.info(`UserMCPService: Removed server '${disconnectedServerName}' from agent '${agent.name}' mcp_servers array`);
            }
          }

          if (filteredTools.length !== originalToolCount || mcpServerRemoved) {
            logger.info(`UserMCPService: Agent '${agent.name}' (${agent._id}): Removed ${agentToolsRemoved} tools and ${mcpServerRemoved ? 1 : 0} server references from disconnected server '${disconnectedServerName}'`);
            
            // Update the agent in the database with both tools and mcp_servers
            const updateData = {
              tools: filteredTools,
              mcp_servers: filteredMcpServers
            };
            
            await Agent.updateOne(
              { _id: agent._id },
              { $set: updateData }
            );
            
            agentsUpdated++;
          }
        }
      }

      const result = {
        agentsProcessed,
        agentsUpdated,
        toolsRemoved: totalToolsRemoved,
        disconnectedServer: disconnectedServerName,
        removedToolsDetails: removedToolsDetails.length > 0 ? removedToolsDetails : undefined,
      };

      logger.info(`UserMCPService: Server-specific cleanup completed for user ${userId}:`, {
        agentsProcessed: result.agentsProcessed,
        agentsUpdated: result.agentsUpdated,
        toolsRemoved: result.toolsRemoved,
        disconnectedServer: disconnectedServerName,
      });

      return result;
    } catch (error) {
      logger.error(`UserMCPService: Failed to cleanup tools for disconnected server '${disconnectedServerName}' for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Static method: Clean up orphaned MCP tools from agents
   * 
   * @param {string} userId - The user ID
   * @param {Map} mcpToolRegistry - Optional MCP tool registry for identifying tools (production-grade injection)
   * @returns {Promise<Object>} Cleanup result with statistics
   */
  static async cleanupOrphanedMCPTools(userId, mcpToolRegistry = null) {
    if (!userId) {
      return {
        agentsProcessed: 0,
        agentsUpdated: 0,
        toolsRemoved: 0,
        validMCPServers: [],
      };
    }

    try {
      logger.info(`UserMCPService: Starting orphaned MCP tools cleanup for user ${userId}`);

      // Get current valid MCP servers for this user
      const userMCPServers = await UserMCPService.getUserMCPServers(userId);
      const validMCPServers = Object.keys(userMCPServers);

      logger.info(`UserMCPService: Valid MCP servers for user ${userId}:`, validMCPServers);

      // Get all agents for this user
      const { Agent } = require('~/models/Agent');
      const userAgents = await Agent.find({ author: userId }).lean();

      logger.info(`UserMCPService: Found ${userAgents.length} agents for user ${userId}`);

      let agentsProcessed = 0;
      let agentsUpdated = 0;
      let totalToolsRemoved = 0;
      const removedToolsDetails = [];

      for (const agent of userAgents) {
        agentsProcessed++;
        let agentModified = false;
        let agentToolsRemoved = 0;

        if (agent.tools && Array.isArray(agent.tools)) {
          const originalToolCount = agent.tools.length;
          
          // Filter out tools that reference non-existent MCP servers
          // Since tools now use clean names, we need to check if they're MCP tools
          // and if their associated servers still exist
          
          logger.debug(`UserMCPService: mcpToolRegistry provided: ${!!mcpToolRegistry}`);
          logger.debug(`UserMCPService: mcpToolRegistry size: ${mcpToolRegistry?.size || 0}`);
          
          const filteredTools = agent.tools.filter(tool => {
            // Check if this is a string tool (only strings can be MCP tools)
            if (typeof tool === 'string') {
              // Try to identify MCP tools by registry lookup first
              if (mcpToolRegistry && mcpToolRegistry.has(tool)) {
                // This is an MCP tool, check if its server still exists
                const mcpInfo = mcpToolRegistry.get(tool);
                const serverName = mcpInfo?.serverName;
                
                if (serverName) {
                  const isValid = validMCPServers.includes(serverName);
                  
                  if (!isValid) {
                    logger.info(`UserMCPService: Removing orphaned tool '${tool}' (server '${serverName}' no longer exists)`);
                    agentToolsRemoved++;
                    totalToolsRemoved++;
                    removedToolsDetails.push({
                      agentId: agent._id,
                      agentName: agent.name,
                      toolName: tool,
                      serverName: serverName,
                    });
                    return false; // Remove this tool
                  }
                }
              }
              // FALLBACK: If registry is not available, use pattern-based detection for legacy tools
              else if (!mcpToolRegistry && tool.includes('_mcp_')) {
                // Legacy delimiter format detection (fallback only)
                const parts = tool.split('_mcp_');
                if (parts.length === 2) {
                  const serverName = parts[1];
                  const isValid = validMCPServers.includes(serverName);
                  
                  if (!isValid) {
                    logger.info(`UserMCPService: Removing orphaned legacy tool '${tool}' (server '${serverName}' no longer exists)`);
                    agentToolsRemoved++;
                    totalToolsRemoved++;
                    removedToolsDetails.push({
                      agentId: agent._id,
                      agentName: agent.name,
                      toolName: tool,
                      serverName: serverName,
                    });
                    return false; // Remove this tool
                  }
                }
              }
            }
            return true; // Keep this tool
          });

          if (filteredTools.length !== originalToolCount) {
            agentModified = true;
            logger.info(`UserMCPService: Agent '${agent.name}' (${agent._id}): Removed ${agentToolsRemoved} orphaned MCP tools`);
            
            // Update the agent
            await Agent.updateOne(
              { _id: agent._id },
              { $set: { tools: filteredTools } }
            );
            
            agentsUpdated++;
          }
        }
      }

      const result = {
        agentsProcessed,
        agentsUpdated,
        toolsRemoved: totalToolsRemoved,
        validMCPServers,
        removedToolsDetails: removedToolsDetails.length > 0 ? removedToolsDetails : undefined,
      };

      logger.info(`UserMCPService: Cleanup completed for user ${userId}:`, {
        agentsProcessed: result.agentsProcessed,
        agentsUpdated: result.agentsUpdated,
        toolsRemoved: result.toolsRemoved,
        validServers: result.validMCPServers.length,
      });

      return result;
    } catch (error) {
      logger.error(`UserMCPService: Failed to cleanup orphaned MCP tools for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has any MCP servers configured
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} True if user has MCP servers
   */
  async hasUserMCPServers(userId) {
    return UserMCPService.hasUserMCPServers(userId);
  }

  /**
   * Static method: Check if user has any MCP servers configured
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} True if user has MCP servers
   */
  static async hasUserMCPServers(userId) {
    if (!userId) {
      return false;
    }

    try {
      const userMCPServers = await UserMCPService.getUserMCPServers(userId);
      return Object.keys(userMCPServers).length > 0;
    } catch (error) {
      logger.error(`UserMCPService: Failed to check MCP servers for user ${userId}:`, error.message);
      return false;
    }
  }
}

module.exports = UserMCPService; 