const PipedreamService = require('~/server/services/PipedreamService');
const { logger } = require('~/config');

/**
 * Get all available integrations
 */
const getAvailableIntegrations = async (req, res) => {
  const startTime = Date.now();
  logger.info('=== getAvailableIntegrations: Starting request ===');
  
  try {
    logger.info('Calling PipedreamService.getAvailableIntegrations()');
    const integrations = await PipedreamService.getAvailableIntegrations();
    
    logger.info(`Retrieved ${integrations?.length || 0} available integrations`);
    logger.info('Sample integration data:', integrations?.[0] ? {
      id: integrations[0]._id,
      appSlug: integrations[0].appSlug,
      appName: integrations[0].appName,
      hasCategories: !!integrations[0].appCategories,
      categoriesCount: integrations[0].appCategories?.length || 0
    } : 'No integrations found');
    
    logger.info(`getAvailableIntegrations completed in ${Date.now() - startTime}ms`);
    
    // Return the integrations array directly (not wrapped in response object)
    res.json(integrations);
  } catch (error) {
    logger.error('=== getAvailableIntegrations: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve available integrations',
      error: error.message,
    });
  }
};

/**
 * Get user's connected integrations
 */
const getUserIntegrations = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  
  logger.info('=== getUserIntegrations: Starting request ===');
  logger.info(`User ID: ${userId}`);
  
  try {
    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }
    
    logger.info(`Calling PipedreamService.getUserIntegrations(${userId})`);
    const integrations = await PipedreamService.getUserIntegrations(userId);
    
    logger.info(`Retrieved ${integrations?.length || 0} user integrations`);
    if (integrations?.length > 0) {
      logger.info('User integrations summary:', integrations.map(int => ({
        id: int._id,
        appSlug: int.appSlug,
        appName: int.appName,
        isActive: int.isActive,
        lastUsedAt: int.lastUsedAt
      })));
    }
    
    logger.info(`getUserIntegrations completed in ${Date.now() - startTime}ms`);
    
    // Return the integrations array directly (not wrapped in response object)
    res.json(integrations);
  } catch (error) {
    logger.error('=== getUserIntegrations: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user integrations',
      error: error.message,
    });
  }
};

/**
 * Create a connect token for user to initiate account connection
 */
const createConnectToken = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  
  logger.info('=== createConnectToken: Starting request ===');
  logger.info(`User ID: ${userId}`);
  logger.info('Request body:', req.body);
  
  try {
    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }
    
    const { app, redirect_url } = req.body;

    const options = {};
    if (app) options.app = app;
    if (redirect_url) options.redirect_url = redirect_url;

    logger.info('Connect token options:', options);
    
    const tokenData = await PipedreamService.createConnectToken(userId, options);
    
    logger.info('Connect token created successfully:', {
      hasToken: !!tokenData.token,
      hasConnectUrl: !!tokenData.connect_link_url,
      expiresAt: tokenData.expires_at
    });
    
    const response = {
      success: true,
      data: tokenData,
    };
    
    logger.info(`createConnectToken completed in ${Date.now() - startTime}ms`);
    res.json(response);
  } catch (error) {
    logger.error('=== createConnectToken: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to create connection token',
      error: error.message,
    });
  }
};

/**
 * Handle successful account connection callback
 */
const handleConnectionCallback = async (req, res) => {
  const startTime = Date.now();
  
  logger.info('=== handleConnectionCallback: Starting request ===');
  logger.info('Request body:', req.body);
  
  try {
    const { account_id, external_user_id, app } = req.body;
    
    if (!account_id || !external_user_id) {
      logger.error('Missing required parameters:', { account_id, external_user_id, app });
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters',
      });
    }

    logger.info(`Getting user accounts for external_user_id: ${external_user_id}`);
    
    // Get account details from Pipedream
    const accounts = await PipedreamService.getUserAccounts(external_user_id);
    logger.info(`Retrieved ${accounts?.length || 0} accounts from Pipedream`);
    
    const accountData = accounts.find(acc => acc.id === account_id);
    
    if (!accountData) {
      logger.error(`Account not found with ID: ${account_id}`);
      logger.info('Available account IDs:', accounts?.map(acc => acc.id));
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    logger.info('Found account data:', {
      id: accountData.id,
      app: accountData.app,
      app_name: accountData.app_name
    });

    // Save integration to our database
    const integration = await PipedreamService.createUserIntegration(external_user_id, accountData);
    
    logger.info('Integration created/updated successfully:', {
      id: integration._id,
      appSlug: integration.appSlug,
      appName: integration.appName
    });
    
    const response = {
      success: true,
      message: 'Integration connected successfully',
      data: integration,
    };
    
    logger.info(`handleConnectionCallback completed in ${Date.now() - startTime}ms`);
    res.json(response);
  } catch (error) {
    logger.error('=== handleConnectionCallback: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to process connection',
      error: error.message,
    });
  }
};

/**
 * Delete user integration
 */
const deleteIntegration = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  const { integrationId } = req.params;
  
  logger.info('=== deleteIntegration: Starting request ===');
  logger.info(`User ID: ${userId}, Integration ID: ${integrationId}`);

  try {
    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const integration = await PipedreamService.deleteUserIntegration(userId, integrationId);
    
    logger.info('Integration deleted successfully:', {
      id: integration._id,
      appSlug: integration.appSlug,
      appName: integration.appName,
      isActive: integration.isActive
    });
    
    const response = {
      success: true,
      message: 'Integration deleted successfully',
      data: integration,
    };
    
    logger.info(`deleteIntegration completed in ${Date.now() - startTime}ms`);
    res.json(response);
  } catch (error) {
    logger.error('=== deleteIntegration: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      integrationId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete integration',
      error: error.message,
    });
  }
};

/**
 * Get user's MCP server configuration
 */
const getMCPConfig = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  
  logger.info('=== getMCPConfig: Starting request ===');
  logger.info(`User ID: ${userId}`);

  try {
    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }
    
    const mcpConfig = await PipedreamService.generateMCPConfig(userId);
    
    logger.info('MCP config generated:', {
      serverCount: Object.keys(mcpConfig || {}).length,
      servers: Object.keys(mcpConfig || {})
    });
    
    const response = {
      success: true,
      data: mcpConfig,
    };
    
    logger.info(`getMCPConfig completed in ${Date.now() - startTime}ms`);
    res.json(response);
  } catch (error) {
    logger.error('=== getMCPConfig: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve MCP configuration',
      error: error.message,
    });
  }
};

/**
 * Get integration status/health check
 */
const getIntegrationStatus = async (req, res) => {
  const startTime = Date.now();
  
  logger.info('=== getIntegrationStatus: Starting request ===');

  try {
    const isEnabled = PipedreamService.isEnabled();
    
    logger.info('Integration status check:', {
      enabled: isEnabled,
      nodeEnv: process.env.NODE_ENV,
      pipedreamEnabled: process.env.ENABLE_PIPEDREAM_INTEGRATION,
      hasClientId: !!process.env.PIPEDREAM_CLIENT_ID,
      hasClientSecret: !!process.env.PIPEDREAM_CLIENT_SECRET,
      hasProjectId: !!process.env.PIPEDREAM_PROJECT_ID
    });
    
    const response = {
      success: true,
      data: {
        enabled: isEnabled,
        service: 'Pipedream Connect',
        version: '1.0.0',
      },
    };
    
    logger.info(`getIntegrationStatus completed in ${Date.now() - startTime}ms`);
    res.json(response);
  } catch (error) {
    logger.error('=== getIntegrationStatus: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get integration status',
      error: error.message,
    });
  }
};

module.exports = {
  getAvailableIntegrations,
  getUserIntegrations,
  createConnectToken,
  handleConnectionCallback,
  deleteIntegration,
  getMCPConfig,
  getIntegrationStatus,
}; 