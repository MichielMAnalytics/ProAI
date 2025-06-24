const express = require('express');
const { callTool, verifyToolAuth, getToolCalls } = require('~/server/controllers/tools');
const { getAvailableTools } = require('~/server/controllers/PluginController');
const { 
  getUserMCPTools, 
  initializeUserMCP, 
  refreshUserMCP, 
  getUserMCPStatus,
  connectMCPServer,
  disconnectMCPServer,
} = require('~/server/controllers/UserMCPController');
const { toolCallLimiter } = require('~/server/middleware/limiters');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

/**
 * Middleware to set the endpoint parameter for agents tools
 */
const setAgentsEndpoint = (req, res, next) => {
  req.query.endpoint = 'agents';
  next();
};

/**
 * Get a list of available tools for agents.
 * @route GET /agents/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.get('/', setAgentsEndpoint, getAvailableTools);

/**
 * Get a list of tool calls.
 * @route GET /agents/tools/calls
 * @returns {ToolCallData[]} 200 - application/json
 */
router.get('/calls', getToolCalls);

/**
 * Get user-specific MCP tools
 * @route GET /agents/tools/user-mcp
 * @returns {TPlugin[]} 200 - application/json
 */
router.get('/user-mcp', requireJwtAuth, getUserMCPTools);

/**
 * Get user MCP status
 * @route GET /agents/tools/user-mcp-status
 * @returns {Object} 200 - application/json
 */
router.get('/user-mcp-status', requireJwtAuth, getUserMCPStatus);

/**
 * Initialize user-specific MCP servers
 * @route POST /agents/tools/initialize-user-mcp
 * @returns {Object} 200 - application/json
 */
router.post('/initialize-user-mcp', requireJwtAuth, initializeUserMCP);

/**
 * Refresh user-specific MCP servers
 * @route POST /agents/tools/refresh-user-mcp
 * @returns {Object} 200 - application/json
 */
router.post('/refresh-user-mcp', requireJwtAuth, refreshUserMCP);



/**
 * Connect a specific MCP server
 * @route POST /agents/tools/connect-mcp-server
 * @returns {Object} 200 - application/json
 */
router.post('/connect-mcp-server', requireJwtAuth, connectMCPServer);

/**
 * Disconnect a specific MCP server
 * @route POST /agents/tools/disconnect-mcp-server
 * @returns {Object} 200 - application/json
 */
router.post('/disconnect-mcp-server', requireJwtAuth, disconnectMCPServer);

/**
 * Verify authentication for a specific tool
 * @route GET /agents/tools/:toolId/auth
 * @param {string} toolId - The ID of the tool to verify
 * @returns {{ authenticated?: boolean; message?: string }}
 */
router.get('/:toolId/auth', verifyToolAuth);

/**
 * Execute code for a specific tool
 * @route POST /agents/tools/:toolId/call
 * @param {string} toolId - The ID of the tool to execute
 * @param {object} req.body - Request body
 * @returns {object} Result of code execution
 */
router.post('/:toolId/call', toolCallLimiter, callTool);

module.exports = router;
