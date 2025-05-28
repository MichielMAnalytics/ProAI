const {
  PipedreamConnect,
  PipedreamApps,
  PipedreamUserIntegrations,
  PipedreamComponents,
} = require('~/server/services/Pipedream');
const { logger } = require('~/config');

/**
 * Get all available integrations
 */
const getAvailableIntegrations = async (req, res) => {
  const startTime = Date.now();
  logger.info('=== getAvailableIntegrations: Starting request ===');
  
  try {
    logger.info('Calling PipedreamApps.getAvailableIntegrations()');
    const integrations = await PipedreamApps.getAvailableIntegrations();
    
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
    
    logger.info(`Calling PipedreamUserIntegrations.getUserIntegrations(${userId})`);
    const integrations = await PipedreamUserIntegrations.getUserIntegrations(userId);
    
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
    
    const tokenData = await PipedreamConnect.createConnectToken(userId, options);
    
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

    logger.info(`Processing connection callback for external_user_id: ${external_user_id}`);
    
    // Use the new PipedreamConnect service to handle the callback
    const integration = await PipedreamConnect.handleConnectionCallback({
      account_id,
      external_user_id,
      app,
    });
    
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

    const integration = await PipedreamConnect.deleteUserIntegration(userId, integrationId);
    
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
    
    const mcpConfig = await PipedreamUserIntegrations.generateMCPConfig(userId);
    
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
    const isEnabled = PipedreamConnect.isEnabled();
    
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

/**
 * Get individual app details and metadata
 */
const getAppDetails = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  const { appSlug } = req.params;
  
  logger.info('=== getAppDetails: Starting request ===');
  logger.info(`User ID: ${userId}, App Slug: ${appSlug}`);
  
  try {
    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    if (!appSlug) {
      logger.error('No app slug provided');
      return res.status(400).json({
        success: false,
        message: 'App slug is required',
      });
    }
    
    logger.info(`Calling PipedreamApps.getAppDetails(${appSlug})`);
    const appDetails = await PipedreamApps.getAppDetails(appSlug);
    
    // Enhanced logging to inspect the appDetails object structure
    logger.info(`AppDetails object received from service for ${appSlug}:`, JSON.stringify(appDetails, null, 2));
    if (appDetails) {
      logger.info(`Fields in appDetails for ${appSlug}: id: ${!!appDetails.id}, name_slug: ${!!appDetails.name_slug}, name: ${!!appDetails.name}, img_src: ${!!appDetails.img_src}`);
    } else {
      logger.warn(`appDetails object from service is null or undefined for ${appSlug}`);
    }
    
    logger.info(`Retrieved app details for ${appSlug}`);
    logger.info(`getAppDetails completed in ${Date.now() - startTime}ms`);
    
    res.json({
      success: true,
      data: appDetails,
    });
  } catch (error) {
    logger.error('=== getAppDetails: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      appSlug
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve app details',
      error: error.message,
    });
  }
};

/**
 * Get components (actions/triggers) for a specific app
 */
const getAppComponents = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  const { appSlug } = req.params;
  const { type } = req.query; // 'actions', 'triggers', or undefined for both
  
  logger.info('=== getAppComponents: Starting request ===');
  logger.info(`User ID: ${userId}, App Slug: ${appSlug}, Type: ${type}`);
  
  try {
    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    if (!appSlug) {
      logger.error('No app slug provided');
      return res.status(400).json({
        success: false,
        message: 'App slug is required',
      });
    }
    
    logger.info(`Calling PipedreamComponents.getAppComponents(${appSlug}, ${type})`);
    const components = await PipedreamComponents.getAppComponents(appSlug, type);
    
    logger.info(`Retrieved ${components?.actions?.length || 0} actions and ${components?.triggers?.length || 0} triggers for ${appSlug}`);
    logger.info(`getAppComponents completed in ${Date.now() - startTime}ms`);
    
    res.json({
      success: true,
      data: components,
    });
  } catch (error) {
    logger.error('=== getAppComponents: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      appSlug,
      type
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve app components',
      error: error.message,
    });
  }
};

/**
 * Configure a component's props
 */
const configureComponent = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  
  logger.info('=== configureComponent: Starting request ===');
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

    const { componentId, propName, configuredProps, dynamicPropsId } = req.body;

    if (!componentId || !propName) {
      logger.error('Missing required parameters:', { componentId, propName });
      return res.status(400).json({
        success: false,
        message: 'Component ID and prop name are required',
      });
    }
    
    logger.info(`Calling PipedreamComponents.configureComponent`);
    const configuration = await PipedreamComponents.configureComponent(userId, {
      componentId,
      propName,
      configuredProps,
      dynamicPropsId,
    });
    
    logger.info('Component configured successfully');
    logger.info(`configureComponent completed in ${Date.now() - startTime}ms`);
    
    res.json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    logger.error('=== configureComponent: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to configure component',
      error: error.message,
    });
  }
};

/**
 * Run an action component
 */
const runAction = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  
  logger.info('=== runAction: Starting request ===');
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

    const { componentId, configuredProps, dynamicPropsId } = req.body;

    if (!componentId) {
      logger.error('Missing required parameter: componentId');
      return res.status(400).json({
        success: false,
        message: 'Component ID is required',
      });
    }
    
    logger.info(`Calling PipedreamComponents.runAction`);
    const result = await PipedreamComponents.runAction(userId, {
      componentId,
      configuredProps,
      dynamicPropsId,
    });
    
    logger.info('Action executed successfully');
    logger.info(`runAction completed in ${Date.now() - startTime}ms`);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('=== runAction: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to run action',
      error: error.message,
    });
  }
};

/**
 * Deploy a trigger component
 */
const deployTrigger = async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?.id;
  
  logger.info('=== deployTrigger: Starting request ===');
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

    const { componentId, configuredProps, webhookUrl, workflowId, dynamicPropsId } = req.body;

    if (!componentId) {
      logger.error('Missing required parameter: componentId');
      return res.status(400).json({
        success: false,
        message: 'Component ID is required',
      });
    }

    if (!webhookUrl && !workflowId) {
      logger.error('Either webhook URL or workflow ID is required');
      return res.status(400).json({
        success: false,
        message: 'Either webhook URL or workflow ID is required',
      });
    }
    
    logger.info(`Calling PipedreamComponents.deployTrigger`);
    const deployment = await PipedreamComponents.deployTrigger(userId, {
      componentId,
      configuredProps,
      webhookUrl,
      workflowId,
      dynamicPropsId,
    });
    
    logger.info('Trigger deployed successfully');
    logger.info(`deployTrigger completed in ${Date.now() - startTime}ms`);
    
    res.json({
      success: true,
      data: deployment,
    });
  } catch (error) {
    logger.error('=== deployTrigger: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId,
      requestBody: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to deploy trigger',
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
  getAppDetails,
  getAppComponents,
  configureComponent,
  runAction,
  deployTrigger,
}; 