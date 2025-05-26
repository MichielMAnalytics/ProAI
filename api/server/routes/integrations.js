const express = require('express');
const {
  getAvailableIntegrations,
  getUserIntegrations,
  createConnectToken,
  handleConnectionCallback,
  deleteIntegration,
  getMCPConfig,
  getIntegrationStatus,
  getAppDetails,
  getAppComponents,
  configureComponent,
  runAction,
  deployTrigger,
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
 * @route GET /api/integrations/app/:appSlug
 * @desc Get individual app details and metadata
 * @access Private
 */
router.get('/app/:appSlug', requireJwtAuth, getAppDetails);

/**
 * @route GET /api/integrations/app/:appSlug/components
 * @desc Get components (actions/triggers) for a specific app
 * @access Private
 */
router.get('/app/:appSlug/components', requireJwtAuth, getAppComponents);

/**
 * @route POST /api/integrations/component/configure
 * @desc Configure a component's props
 * @access Private
 */
router.post('/component/configure', requireJwtAuth, configureComponent);

/**
 * @route POST /api/integrations/action/run
 * @desc Run an action component
 * @access Private
 */
router.post('/action/run', requireJwtAuth, runAction);

/**
 * @route POST /api/integrations/trigger/deploy
 * @desc Deploy a trigger component
 * @access Private
 */
router.post('/trigger/deploy', requireJwtAuth, deployTrigger);

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