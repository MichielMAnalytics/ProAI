const express = require('express');
const {
  getAvailableIntegrations,
  getUserIntegrations,
  createConnectToken,
  handleConnectionCallback,
  deleteIntegration,
  getMCPConfig,
  getIntegrationStatus,
} = require('~/server/controllers/IntegrationsController');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

/**
 * @route GET /api/integrations/status
 * @desc Get integration service status
 * @access Public
 */
router.get('/status', getIntegrationStatus);

/**
 * @route GET /api/integrations/available
 * @desc Get all available integrations from Pipedream
 * @access Private
 */
router.get('/available', requireJwtAuth, getAvailableIntegrations);

/**
 * @route GET /api/integrations/user
 * @desc Get user's connected integrations
 * @access Private
 */
router.get('/user', requireJwtAuth, getUserIntegrations);

/**
 * @route POST /api/integrations/connect-token
 * @desc Create a connect token for user to initiate account connection
 * @access Private
 */
router.post('/connect-token', requireJwtAuth, createConnectToken);

/**
 * @route POST /api/integrations/callback
 * @desc Handle successful account connection callback from Pipedream
 * @access Private
 */
router.post('/callback', requireJwtAuth, handleConnectionCallback);

/**
 * @route DELETE /api/integrations/:integrationId
 * @desc Delete user integration
 * @access Private
 */
router.delete('/:integrationId', requireJwtAuth, deleteIntegration);

/**
 * @route GET /api/integrations/mcp-config
 * @desc Get user's MCP server configuration
 * @access Private
 */
router.get('/mcp-config', requireJwtAuth, getMCPConfig);

module.exports = router; 