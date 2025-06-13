const UserMCPService = require('~/server/services/UserMCPService');
const { getMCPManager } = require('~/config');
const { logger } = require('~/config');

/**
 * Get user-specific MCP tools for the agents endpoint
 * @route GET /api/agents/user-mcp-tools
 * @access Private
 */
const getUserMCPTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
        message: 'No user ID found in request',
      });
    }

    logger.info(`UserMCPController: Getting MCP tools for user ${userId}`);

    // Check if user-specific MCP is enabled in config
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    if (!addUserSpecificMcp) {
      logger.info('UserMCPController: User-specific MCP is disabled in config');
      return res.json([]);
    }

    // Get user-specific MCP tools
    const userMCPService = new UserMCPService();
    const userMCPTools = await userMCPService.getUserMCPTools(userId);

    // Transform to LibreChat tool format
    const formattedTools = userMCPTools.map(tool => ({
      pluginKey: tool.serverName,
      name: tool.name,
      description: tool.description,
      icon: tool.icon,
      isUserSpecific: true,
      chatMenu: true,
      // Add MCP delimiter to distinguish from regular tools
      pluginKey: `${tool.appSlug}_mcp_${tool.serverName}`,
    }));

    logger.info(`UserMCPController: Returning ${formattedTools.length} user MCP tools`);
    res.json(formattedTools);
  } catch (error) {
    logger.error('UserMCPController: Error getting user MCP tools:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve user MCP tools',
      message: error.message,
    });
  }
};

/**
 * Initialize user-specific MCP servers for a user session
 * @route POST /api/agents/initialize-user-mcp
 * @access Private
 */
const initializeUserMCP = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
      });
    }

    logger.info(`UserMCPController: Initializing MCP for user ${userId}`);

    // Check if user-specific MCP is enabled
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    if (!addUserSpecificMcp) {
      return res.json({
        success: true,
        message: 'User-specific MCP is disabled',
        mcpServers: {},
      });
    }

    // Get the MCP manager instance for this user
    const mcpManager = getMCPManager(userId);
    
    // Get user-specific MCP servers
    const userMCPServers = await UserMCPService.getUserMCPServers(userId);
    
    // Initialize user-specific MCP servers if any exist
    if (Object.keys(userMCPServers).length > 0) {
      try {
        // Initialize the user-specific MCP servers
        await mcpManager.initializeUserMCP(userMCPServers, userId);
        
        // Map the available tools
        const availableTools = req.app.locals.availableTools || {};
        await mcpManager.mapAvailableTools(availableTools);
        
        logger.info(`UserMCPController: Initialized ${Object.keys(userMCPServers).length} MCP servers for user ${userId}`);
      } catch (mcpError) {
        logger.warn(`UserMCPController: Failed to initialize some MCP servers for user ${userId}:`, mcpError.message);
        // Continue even if some servers fail to initialize
      }
    }

    res.json({
      success: true,
      message: `Initialized ${Object.keys(userMCPServers).length} user-specific MCP servers`,
      mcpServers: Object.keys(userMCPServers),
    });
  } catch (error) {
    logger.error(`UserMCPController: Error initializing user MCP for user ${req.user?.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to initialize user MCP servers',
      message: error.message,
    });
  }
};

/**
 * Refresh user MCP servers (useful when integrations change)
 * @route POST /api/agents/refresh-user-mcp
 * @access Private
 */
const refreshUserMCP = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
      });
    }

    logger.info(`UserMCPController: Refreshing MCP for user ${userId}`);

    // Check if user-specific MCP is enabled
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    if (!addUserSpecificMcp) {
      return res.json({
        success: true,
        message: 'User-specific MCP is disabled',
      });
    }

    // Refresh user MCP servers cache
    const refreshedServers = await UserMCPService.refreshUserMCPServers(userId);
    
    // Reinitialize if there are servers
    if (Object.keys(refreshedServers).length > 0) {
      const mcpManager = getMCPManager(userId);
      await mcpManager.initializeUserMCP(refreshedServers, userId);
      
      const availableTools = req.app.locals.availableTools || {};
      await mcpManager.mapAvailableTools(availableTools);
    }

    res.json({
      success: true,
      message: `Refreshed ${Object.keys(refreshedServers).length} user-specific MCP servers`,
      mcpServers: Object.keys(refreshedServers),
    });
  } catch (error) {
    logger.error(`UserMCPController: Error refreshing user MCP for user ${req.user?.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to refresh user MCP servers',
      message: error.message,
    });
  }
};

/**
 * Clean up orphaned MCP tools from user's agents
 * @route POST /api/agents/cleanup-orphaned-mcp-tools
 * @access Private
 */
const cleanupOrphanedMCPTools = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
      });
    }

    logger.info(`UserMCPController: Cleaning up orphaned MCP tools for user ${userId}`);

    // Check if user-specific MCP is enabled
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    if (!addUserSpecificMcp) {
      return res.json({
        success: true,
        message: 'User-specific MCP is disabled',
        agentsProcessed: 0,
        agentsUpdated: 0,
        toolsRemoved: 0,
      });
    }

    // Clean up orphaned MCP tools
    const cleanupResult = await UserMCPService.cleanupOrphanedMCPTools(userId);

    res.json({
      success: true,
      message: `Cleaned up orphaned MCP tools from ${cleanupResult.agentsUpdated} agents`,
      ...cleanupResult,
    });
  } catch (error) {
    logger.error(`UserMCPController: Error cleaning up orphaned MCP tools for user ${req.user?.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to clean up orphaned MCP tools',
      message: error.message,
    });
  }
};

/**
 * Get status of user MCP servers
 * @route GET /api/agents/user-mcp-status
 * @access Private
 */
const getUserMCPStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
      });
    }

    // Check if user-specific MCP is enabled
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    const hasUserMCPServers = addUserSpecificMcp 
      ? await UserMCPService.hasUserMCPServers(userId)
      : false;

    res.json({
      enabled: addUserSpecificMcp,
      hasUserMCPServers,
      userId,
    });
  } catch (error) {
    logger.error(`UserMCPController: Error getting user MCP status for user ${req.user?.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to get user MCP status',
      message: error.message,
    });
  }
};

/**
 * Connect a specific MCP server for the user
 * @route POST /api/agents/connect-mcp-server
 * @access Private
 */
const connectMCPServer = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
      });
    }

    const { serverName } = req.body;
    if (!serverName) {
      return res.status(400).json({
        error: 'Server name is required',
        message: 'Please provide a server name to connect',
      });
    }

    logger.info(`UserMCPController: Connecting MCP server '${serverName}' for user ${userId}`);

    // Check if user-specific MCP is enabled
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    if (!addUserSpecificMcp) {
      return res.status(400).json({
        error: 'User-specific MCP is disabled',
        message: 'MCP integration is not enabled on this instance',
      });
    }

    // Use MCPInitializer for incremental connection
    const MCPInitializer = require('~/server/services/MCPInitializer');
    const mcpInitializer = MCPInitializer.getInstance();

    const result = await mcpInitializer.connectSingleMCPServer(
      userId,
      serverName,
      'UserMCPController.connectMCPServer',
      req.app.locals.availableTools || {}
    );

    if (result.success) {
      res.json({
        success: true,
        message: `Successfully connected to MCP server '${serverName}'`,
        serverName: result.serverName,
        toolCount: result.toolCount,
        duration: result.duration,
        warning: result.warning,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        serverName: result.serverName,
        message: `Failed to connect to MCP server '${serverName}': ${result.error}`,
      });
    }
  } catch (error) {
    logger.error(`UserMCPController: Error connecting MCP server for user ${req.user?.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to connect MCP server',
      message: error.message,
    });
  }
};

/**
 * Disconnect a specific MCP server for the user
 * @route POST /api/agents/disconnect-mcp-server
 * @access Private
 */
const disconnectMCPServer = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'User authentication required',
      });
    }

    const { serverName } = req.body;
    if (!serverName) {
      return res.status(400).json({
        error: 'Server name is required',
        message: 'Please provide a server name to disconnect',
      });
    }

    logger.info(`UserMCPController: Disconnecting MCP server '${serverName}' for user ${userId}`);

    // Check if user-specific MCP is enabled
    const config = req.app.locals;
    const addUserSpecificMcp = config.addUserSpecificMcpFromDb;
    
    if (!addUserSpecificMcp) {
      return res.status(400).json({
        error: 'User-specific MCP is disabled',
        message: 'MCP integration is not enabled on this instance',
      });
    }

    // Use MCPInitializer for incremental disconnection
    const MCPInitializer = require('~/server/services/MCPInitializer');
    const mcpInitializer = MCPInitializer.getInstance();

    const result = await mcpInitializer.disconnectSingleMCPServer(
      userId,
      serverName,
      'UserMCPController.disconnectMCPServer',
      req.app.locals.availableTools || {}
    );

    if (result.success) {
      // Also trigger cleanup of orphaned tools
      try {
        await UserMCPService.cleanupOrphanedMCPTools(userId);
      } catch (cleanupError) {
        logger.warn(`UserMCPController: Cleanup after disconnect failed:`, cleanupError.message);
        // Don't fail the response for cleanup errors
      }

      res.json({
        success: true,
        message: `Successfully disconnected from MCP server '${serverName}'`,
        serverName: result.serverName,
        toolsRemoved: result.toolsRemoved,
        duration: result.duration,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        serverName: result.serverName,
        message: `Failed to disconnect from MCP server '${serverName}': ${result.error}`,
      });
    }
  } catch (error) {
    logger.error(`UserMCPController: Error disconnecting MCP server for user ${req.user?.id}:`, error.message);
    res.status(500).json({
      error: 'Failed to disconnect MCP server',
      message: error.message,
    });
  }
};

module.exports = {
  getUserMCPTools,
  initializeUserMCP,
  refreshUserMCP,
  getUserMCPStatus,
  cleanupOrphanedMCPTools,
  connectMCPServer,
  disconnectMCPServer,
}; 