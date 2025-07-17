const axios = require('axios');
const PipedreamConnect = require('./PipedreamConnect');
const { AppComponents } = require('~/models');
const { logger } = require('~/config');

/**
 * PipedreamComponents - Manages Pipedream components (actions and triggers)
 *
 * This service handles:
 * - Fetching app components (actions/triggers)
 * - Configuring component properties
 * - Running actions
 * - Deploying triggers
 * - Component metadata and documentation
 *
 * CACHING STRATEGY:
 * - Actions: Fresh Cache (6h), Stale Cache (24h), Expired (7d)
 * - Triggers: Fresh Cache (12h), Stale Cache (48h), Expired (7d)
 */
class PipedreamComponents {
  constructor() {
    this.baseURL = process.env.PIPEDREAM_API_BASE_URL || 'https://api.pipedream.com/v1';
    this.projectId = process.env.PIPEDREAM_PROJECT_ID;
  }

  /**
   * Check if the service is enabled
   */
  isEnabled() {
    return !!(this.projectId && process.env.PIPEDREAM_API_BASE_URL);
  }

  /**
   * Get authentication token
   */
  async getAuthToken() {
    const pipedreamConnect = new PipedreamConnect();
    return await pipedreamConnect.getAuthToken();
  }

  /**
   * Format cached components by type
   */
  formatCachedComponents(cached, type) {
    const result = { actions: [], triggers: [] };

    cached.forEach((component) => {
      const formattedComponent = {
        id: component.componentId,
        key: component.key,
        name: component.name,
        version: component.version,
        description: component.description,
        configurable_props: component.configurable_props || [],
        ...component.metadata,
      };

      if (component.componentType === 'action') {
        result.actions.push(formattedComponent);
      } else if (component.componentType === 'trigger') {
        result.triggers.push(formattedComponent);
      }
    });

    // Filter by requested type
    if (type === 'actions') {
      result.triggers = [];
    } else if (type === 'triggers') {
      result.actions = [];
    }

    return result;
  }

  /**
   * Get cache duration settings based on component type
   */
  getCacheDurations(componentType) {
    if (componentType === 'trigger') {
      return {
        fresh: parseInt(process.env.PIPEDREAM_TRIGGERS_CACHE_FRESH_DURATION) || 43200, // 12h
        stale: parseInt(process.env.PIPEDREAM_TRIGGERS_CACHE_STALE_DURATION) || 172800, // 48h  
        maxAge: parseInt(process.env.PIPEDREAM_TRIGGERS_CACHE_MAX_AGE) || 604800, // 7d
      };
    } else {
      return {
        fresh: parseInt(process.env.PIPEDREAM_COMPONENTS_CACHE_FRESH_DURATION) || 21600, // 6h
        stale: parseInt(process.env.PIPEDREAM_COMPONENTS_CACHE_STALE_DURATION) || 86400, // 24h
        maxAge: parseInt(process.env.PIPEDREAM_COMPONENTS_CACHE_MAX_AGE) || 604800, // 7d
      };
    }
  }

  /**
   * Get components (actions/triggers) for a specific app with caching
   *
   * @param {string} appIdentifier - App slug or ID
   * @param {string} type - Component type ('actions', 'triggers', or null for both)
   * @returns {Promise<Object>} Object with actions and triggers arrays
   */
  async getAppComponents(appIdentifier, type = null) {
    const startTime = Date.now();
    logger.debug(
      `PipedreamComponents: Getting components for app ${appIdentifier}, type: ${type || 'all'}`,
    );

    if (!this.isEnabled()) {
      logger.warn('PipedreamComponents: Service is disabled, returning mock data');
      return this.getMockAppComponents(appIdentifier, type);
    }

    try {
      // Check cache first
      const query = { appSlug: appIdentifier, isActive: true };
      if (type === 'actions') {
        query.componentType = 'action';
      } else if (type === 'triggers') {
        query.componentType = 'trigger';
      }

      const cached = await AppComponents.find(query).lean();

      if (cached && cached.length > 0) {
        // Group cached components by type for cache age analysis
        const actionsCached = cached.filter(c => c.componentType === 'action');
        const triggersCached = cached.filter(c => c.componentType === 'trigger');
        
        let shouldRefreshActions = false;
        let shouldRefreshTriggers = false;
        let returnCachedActions = actionsCached;
        let returnCachedTriggers = triggersCached;

        // Analyze cache age for actions
        if (actionsCached.length > 0 && (!type || type === 'actions')) {
          const actionsAge = Date.now() - new Date(actionsCached[0].updatedAt || actionsCached[0].createdAt).getTime();
          const actionsAgeSeconds = Math.floor(actionsAge / 1000);
          const actionsDurations = this.getCacheDurations('action');
          
          const actionsIsFresh = actionsAgeSeconds < actionsDurations.fresh;
          const actionsIsStale = actionsAgeSeconds > actionsDurations.stale;
          const actionsIsExpired = actionsAgeSeconds > actionsDurations.maxAge;

          if (actionsIsExpired) {
            shouldRefreshActions = true;
            returnCachedActions = [];
          } else if (actionsIsStale) {
            shouldRefreshActions = true; // Background refresh
          } else if (actionsIsFresh) {
            // Keep cached actions
          }
        }

        // Analyze cache age for triggers  
        if (triggersCached.length > 0 && (!type || type === 'triggers')) {
          const triggersAge = Date.now() - new Date(triggersCached[0].updatedAt || triggersCached[0].createdAt).getTime();
          const triggersAgeSeconds = Math.floor(triggersAge / 1000);
          const triggersDurations = this.getCacheDurations('trigger');
          
          const triggersIsFresh = triggersAgeSeconds < triggersDurations.fresh;
          const triggersIsStale = triggersAgeSeconds > triggersDurations.stale;
          const triggersIsExpired = triggersAgeSeconds > triggersDurations.maxAge;

          if (triggersIsExpired) {
            shouldRefreshTriggers = true;
            returnCachedTriggers = [];
          } else if (triggersIsStale) {
            shouldRefreshTriggers = true; // Background refresh
          } else if (triggersIsFresh) {
            // Keep cached triggers
          }
        }

        // If we have fresh data for requested types, return it
        const hasValidActions = (!type || type === 'actions') ? returnCachedActions.length > 0 : true;
        const hasValidTriggers = (!type || type === 'triggers') ? returnCachedTriggers.length > 0 : true;
        
        if (hasValidActions && hasValidTriggers && !shouldRefreshActions && !shouldRefreshTriggers) {
          const result = this.formatCachedComponents([...returnCachedActions, ...returnCachedTriggers], type);
          logger.debug(
            `PipedreamComponents: Returning ${result.actions.length} cached actions, ${result.triggers.length} cached triggers for ${appIdentifier} in ${Date.now() - startTime}ms`,
          );
          return result;
        }

        // If cache is stale but valid, return it and refresh in background
        if (hasValidActions && hasValidTriggers && (shouldRefreshActions || shouldRefreshTriggers)) {
          const result = this.formatCachedComponents([...returnCachedActions, ...returnCachedTriggers], type);
          
          // Refresh in background
          setImmediate(() => {
            if (shouldRefreshActions) this.refreshActionsInBackground(appIdentifier);
            if (shouldRefreshTriggers) this.refreshTriggersInBackground(appIdentifier);
          });
          
          logger.debug(
            `PipedreamComponents: Returning stale cache and refreshing in background for ${appIdentifier}`,
          );
          return result;
        }
      }

      // Fetch fresh data from API
      const result = { actions: [], triggers: [] };

      if (!type || type === 'actions') {
        result.actions = await this.fetchActionsFromAPI(appIdentifier);
        if (result.actions.length > 0) {
          await this.cacheComponents(appIdentifier, result.actions, 'action');
        }
      }

      if (!type || type === 'triggers') {
        result.triggers = await this.fetchTriggersFromAPI(appIdentifier);
        if (result.triggers.length > 0) {
          await this.cacheComponents(appIdentifier, result.triggers, 'trigger');
        }
      }

      logger.debug(
        `PipedreamComponents: Retrieved ${result.actions.length} actions, ${result.triggers.length} triggers for ${appIdentifier} in ${Date.now() - startTime}ms`,
      );
      return result;
    } catch (error) {
      logger.error(
        `PipedreamComponents: Error getting components for ${appIdentifier}:`,
        error.message,
      );

      // Try to return cached data as fallback
      try {
        const query = { appSlug: appIdentifier, isActive: true };
        if (type === 'actions') query.componentType = 'action';
        else if (type === 'triggers') query.componentType = 'trigger';

        const cached = await AppComponents.find(query).lean();
        if (cached && cached.length > 0) {
          logger.info('PipedreamComponents: Returning cached data as error fallback');
          return this.formatCachedComponents(cached, type);
        }
      } catch (cacheError) {
        logger.error('PipedreamComponents: Failed to retrieve cached data:', cacheError.message);
      }

      return this.getMockAppComponents(appIdentifier, type);
    }
  }

  /**
   * Get actions for a specific app from API
   *
   * @param {string} appIdentifier - App slug or ID
   * @returns {Promise<Array>} Array of actions
   */
  async fetchActionsFromAPI(appIdentifier) {
    logger.debug(`PipedreamComponents: Fetching actions for app ${appIdentifier} from API`);

    try {
      // First try using the SDK client
      const client = PipedreamConnect.getClient();
      if (client) {
        try {
          const componentsResponse = await client.getComponents({
            app: appIdentifier,
            limit: 100,
          });

          if (componentsResponse?.data) {
            const actions = componentsResponse.data.filter((component) => {
              const key = component.key || '';
              const name = component.name || '';
              // Filter out triggers - keep only actions
              return !(
                key.includes('trigger') ||
                name.toLowerCase().includes('trigger') ||
                name.includes('New ') ||
                name.includes('Updated ')
              );
            });

            logger.debug(
              `PipedreamComponents: SDK returned ${actions.length} actions for ${appIdentifier}`,
            );
            return actions;
          }
        } catch (sdkError) {
          logger.warn(`PipedreamComponents: SDK error for ${appIdentifier}:`, sdkError.message);
        }
      }

      // Fallback to Connect API for actions
      if (this.projectId) {
        try {
          const authToken = await this.getAuthToken();
          const response = await axios.get(`${this.baseURL}/connect/${this.projectId}/actions`, {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            params: {
              app: appIdentifier,
              limit: 100,
            },
          });

          if (response.data?.data) {
            logger.debug(
              `PipedreamComponents: Connect API returned ${response.data.data.length} actions for ${appIdentifier}`,
            );
            return response.data.data;
          }
        } catch (apiError) {
          logger.warn(
            `PipedreamComponents: Connect API error for ${appIdentifier}:`,
            apiError.message,
          );
        }
      }

      // Return empty array if no actions found
      logger.info(`PipedreamComponents: No actions found for ${appIdentifier}`);
      return [];
    } catch (error) {
      logger.error(
        `PipedreamComponents: Error fetching actions for ${appIdentifier}:`,
        error.message,
      );
      return [];
    }
  }

  /**
   * Fetch triggers from Pipedream API for a specific app
   *
   * @param {string} appIdentifier - App slug or ID  
   * @returns {Promise<Array>} Array of trigger objects
   */
  async fetchTriggersFromAPI(appIdentifier) {
    logger.debug(`PipedreamComponents: Fetching triggers for app ${appIdentifier} from API`);

    try {
      // First try using the SDK client (same as actions)
      const client = PipedreamConnect.getClient();
      if (client) {
        try {
          const componentsResponse = await client.getComponents({
            app: appIdentifier,
            limit: 100,
          });

          if (componentsResponse?.data) {
            const triggers = componentsResponse.data.filter((component) => {
              const key = component.key || '';
              const name = component.name || '';
              // Filter for triggers - look for trigger indicators
              return (
                key.includes('trigger') ||
                name.toLowerCase().includes('trigger') ||
                name.includes('New ') ||
                name.includes('Updated ') ||
                name.includes('Watch ') ||
                name.includes('On ') ||
                (component.type && component.type === 'source')
              );
            });

            logger.debug(`PipedreamComponents: SDK returned ${triggers.length} triggers for ${appIdentifier}`);
            
            // Transform triggers to our standard format
            return triggers.map((trigger) => ({
              id: trigger.id || trigger.key,
              key: trigger.key,
              name: trigger.name || trigger.summary,
              version: trigger.version || '1.0.0',
              description: trigger.description || trigger.summary,
              configurable_props: trigger.configurable_props || [],
              type: trigger.type || 'webhook',
              category: this.categorizeTrigger(trigger),
              metadata: trigger,
            }));
          }
        } catch (sdkError) {
          logger.warn(`PipedreamComponents: SDK error for triggers ${appIdentifier}:`, sdkError.message);
        }
      }

      // Fallback to Connect API for triggers (if available)
      if (this.projectId) {
        try {
          const authToken = await this.getAuthToken();
          const response = await axios.get(`${this.baseURL}/connect/${this.projectId}/components`, {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            params: {
              app: appIdentifier,
              type: 'source', // Pipedream uses 'source' for triggers
            },
            timeout: 30000,
          });

          if (response.data?.data) {
            const triggers = response.data.data;
            logger.debug(`PipedreamComponents: Connect API returned ${triggers.length} triggers for ${appIdentifier}`);
            
            // Transform triggers to our standard format
            return triggers.map((trigger) => ({
              id: trigger.id || trigger.key,
              key: trigger.key,
              name: trigger.name || trigger.summary,
              version: trigger.version || '1.0.0',
              description: trigger.description || trigger.summary,
              configurable_props: trigger.configurable_props || [],
              type: trigger.type || 'webhook',
              category: this.categorizeTrigger(trigger),
              metadata: trigger,
            }));
          }
        } catch (connectError) {
          logger.warn(`PipedreamComponents: Connect API error for triggers ${appIdentifier}:`, connectError.message);
        }
      }

      logger.debug(`PipedreamComponents: No triggers found for ${appIdentifier}`);
      return [];
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to fetch triggers for ${appIdentifier}:`, error.message);
      throw error;
    }
  }

  /**
   * Categorize trigger by type/name for better UI organization
   */
  categorizeTrigger(trigger) {
    const name = (trigger.name || trigger.summary || '').toLowerCase();
    const description = (trigger.description || '').toLowerCase();
    const combined = `${name} ${description}`;

    if (combined.includes('webhook') || combined.includes('http')) return 'webhook';
    if (combined.includes('schedule') || combined.includes('timer') || combined.includes('cron')) return 'schedule';
    if (combined.includes('email') || combined.includes('mail')) return 'email';
    if (combined.includes('new') && (combined.includes('message') || combined.includes('post') || combined.includes('item'))) return 'new_item';
    if (combined.includes('update') || combined.includes('change') || combined.includes('modify')) return 'item_updated';
    if (combined.includes('delete') || combined.includes('remove')) return 'item_deleted';
    if (combined.includes('file') || combined.includes('upload')) return 'file';
    
    return 'other';
  }

  /**
   * Refresh triggers in background
   */
  async refreshTriggersInBackground(appIdentifier) {
    try {
      logger.debug(`PipedreamComponents: Starting background triggers refresh for ${appIdentifier}`);
      const triggers = await this.fetchTriggersFromAPI(appIdentifier);
      
      if (triggers.length > 0) {
        await this.cacheComponents(appIdentifier, triggers, 'trigger');
        logger.debug(`PipedreamComponents: Background triggers refresh completed for ${appIdentifier}: ${triggers.length} triggers`);
      }
    } catch (error) {
      logger.error(`PipedreamComponents: Background triggers refresh failed for ${appIdentifier}:`, error.message);
    }
  }

  /**
   * Refresh actions in background  
   */
  async refreshActionsInBackground(appIdentifier) {
    try {
      logger.debug(`PipedreamComponents: Starting background actions refresh for ${appIdentifier}`);
      const actions = await this.fetchActionsFromAPI(appIdentifier);
      
      if (actions.length > 0) {
        await this.cacheComponents(appIdentifier, actions, 'action');
        logger.debug(`PipedreamComponents: Background actions refresh completed for ${appIdentifier}: ${actions.length} actions`);
      }
    } catch (error) {
      logger.error(`PipedreamComponents: Background actions refresh failed for ${appIdentifier}:`, error.message);
    }
  }

  /**
   * Cache components in database
   */
  async cacheComponents(appSlug, components, componentType) {
    try {
      logger.info(
        `PipedreamComponents: Caching ${components.length} ${componentType}s for ${appSlug}`,
      );

      // Clear existing cache for this app and component type
      await AppComponents.deleteMany({ appSlug, componentType });

      // Prepare components for insertion
      const componentsToCache = components.map((component) => ({
        appSlug,
        componentType,
        componentId: component.id || component.key || `${appSlug}-${component.name}`,
        name: component.name,
        version: component.version || '1.0.0',
        key: component.key || component.name,
        description: component.description,
        configurable_props: component.configurable_props || [],
        metadata: {
          id: component.id,
          ...component,
        },
        isActive: true,
        lastUpdated: new Date(),
      }));

      // Insert new components
      if (componentsToCache.length > 0) {
        await AppComponents.insertMany(componentsToCache, { ordered: false });
      }

      logger.debug(
        `PipedreamComponents: Successfully cached ${componentsToCache.length} ${componentType}s for ${appSlug}`,
      );
    } catch (error) {
      logger.error(
        `PipedreamComponents: Failed to cache ${componentType}s for ${appSlug}:`,
        error.message,
      );
    }
  }

  /**
   * Configure a component's properties
   *
   * @param {string} userId - The user ID
   * @param {Object} options - Configuration options
   * @param {string} options.componentId - Component ID
   * @param {string} options.propName - Property name to configure
   * @param {Object} options.configuredProps - Already configured properties
   * @param {string} options.dynamicPropsId - Dynamic props ID
   * @returns {Promise<Object>} Configuration result
   */
  async configureComponent(userId, options) {
    logger.debug(`PipedreamComponents: Configuring component for user ${userId}`);

    if (!this.isEnabled()) {
      throw new Error('Pipedream Components service is not enabled');
    }

    const client = PipedreamConnect.getClient();
    if (!client) {
      throw new Error('Pipedream client not available');
    }

    try {
      const { componentId, propName, configuredProps, dynamicPropsId } = options;

      if (!componentId || !propName) {
        throw new Error('Component ID and property name are required');
      }

      logger.debug(`PipedreamComponents: Configuring component ${componentId}, prop: ${propName}`);

      const result = await client.configureComponent({
        id: componentId,
        external_user_id: userId,
        prop_name: propName,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      });

      logger.debug(`PipedreamComponents: Component configured successfully for user ${userId}`);
      return result;
    } catch (error) {
      logger.error(
        `PipedreamComponents: Failed to configure component for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to configure component: ${error.message}`);
    }
  }

  /**
   * Run an action component
   *
   * @param {string} userId - The user ID
   * @param {Object} options - Action options
   * @param {string} options.componentId - Component ID
   * @param {Object} options.configuredProps - Configured properties
   * @param {string} options.dynamicPropsId - Dynamic props ID
   * @returns {Promise<Object>} Action execution result
   */
  async runAction(userId, options) {
    logger.debug(`PipedreamComponents: Running action for user ${userId}`);

    if (!this.isEnabled()) {
      throw new Error('Pipedream Components service is not enabled');
    }

    const client = PipedreamConnect.getClient();
    if (!client) {
      throw new Error('Pipedream client not available');
    }

    try {
      const { componentId, configuredProps, dynamicPropsId } = options;

      if (!componentId) {
        throw new Error('Component ID is required');
      }

      logger.debug(`PipedreamComponents: Running action ${componentId} for user ${userId}`);

      const result = await client.runAction({
        id: componentId,
        external_user_id: userId,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      });

      logger.debug(`PipedreamComponents: Action executed successfully for user ${userId}`);
      return result;
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to run action for user ${userId}:`, error.message);
      throw new Error(`Failed to run action: ${error.message}`);
    }
  }

  /**
   * Deploy a trigger component
   *
   * @param {string} userId - The user ID
   * @param {Object} options - Trigger options
   * @param {string} options.componentId - Component ID to deploy
   * @param {string} options.workflowId - Workflow ID this trigger belongs to
   * @param {Object} options.configuredProps - Configured properties for the trigger
   * @param {string} options.appSlug - App slug (e.g., 'gmail')
   * @param {string} options.triggerKey - Trigger key (e.g., 'new_email_received')
   * @returns {Promise<Object>} Deployment result
   */
  async deployTrigger(userId, options) {
    logger.debug(
      `PipedreamComponents: Deploy trigger requested for user ${userId}`,
    );

    if (!this.isEnabled()) {
      throw new Error('Pipedream Components service is not enabled');
    }

    const client = PipedreamConnect.getClient();
    if (!client) {
      throw new Error('Pipedream client not available');
    }

    try {
      const { componentId, workflowId, configuredProps = {}, appSlug, triggerKey } = options;

      if (!componentId || !workflowId) {
        throw new Error('Component ID and workflow ID are required');
      }

      // Get user integration for authProvisionId
      const { UserIntegration } = require('~/models');
      const userIntegration = await UserIntegration.findOne({ 
        userId, 
        appSlug,
        isActive: true 
      }).lean();

      if (!userIntegration) {
        throw new Error(`User integration not found for ${appSlug}. Please connect your ${appSlug} account first.`);
      }

      if (!userIntegration.credentials?.authProvisionId) {
        throw new Error(`Auth provision ID not found for ${appSlug} integration`);
      }

      // Generate unique webhook URL for this trigger
      const webhookUrl = this.generateWebhookUrl(workflowId, triggerKey);
      
      logger.debug(`PipedreamComponents: Deploying trigger ${componentId} with webhook URL: ${webhookUrl}`);

      // Prepare configured props according to Pipedream format
      const deploymentProps = {
        [appSlug]: {
          authProvisionId: userIntegration.credentials.authProvisionId
        },
        // Configure for real-time webhook mode for instant email processing
        triggerType: "webhook",
        // Enhanced payload processing for LLMs
        withTextPayload: true,
        // Default to INBOX monitoring
        labels: ["INBOX"],
        // Include user-configured parameters (can override defaults)
        ...configuredProps
      };

      const deploymentPayload = {
        externalUserId: userId,
        triggerId: componentId,
        configuredProps: deploymentProps,
        webhookUrl: webhookUrl,
      };

      console.log('=== DEPLOYMENT DEBUG ===');
      console.log('deploymentProps:', deploymentProps);
      console.log('deploymentPayload:', deploymentPayload);
      console.log('componentId:', componentId);
      console.log('userId:', userId);
      console.log('appSlug:', appSlug, 'triggerKey:', triggerKey);
      console.log('========================');
      
      logger.info(`PipedreamComponents: Component ID being used: ${componentId}`);
      logger.info(`PipedreamComponents: External user ID: ${userId}`);
      logger.info(`PipedreamComponents: App slug: ${appSlug}, Trigger key: ${triggerKey}`);

      // Deploy the trigger using Pipedream Connect API
      logger.info(`PipedreamComponents: Calling client.deployTrigger with payload...`);
      let deploymentResult;
      try {
        deploymentResult = await client.deployTrigger(deploymentPayload);
        console.log('=== DEPLOYMENT RESULT ===');
        console.log('deploymentResult:', deploymentResult);
        console.log('type:', typeof deploymentResult);
        console.log('keys:', deploymentResult ? Object.keys(deploymentResult) : 'N/A');
        console.log('========================');
        logger.info(`PipedreamComponents: Deployment result received`);
      } catch (deployError) {
        logger.error(`PipedreamComponents: Deployment API call failed:`, {
          error: deployError.message,
          stack: deployError.stack,
          response: deployError.response?.data,
          status: deployError.response?.status,
          statusText: deployError.response?.statusText,
        });
        throw new Error(`Pipedream deployment failed: ${deployError.message}`);
      }

      if (!deploymentResult) {
        logger.error(`PipedreamComponents: Deployment result is null/undefined:`, deploymentResult);
        throw new Error('Pipedream deployment returned null/undefined response');
      }
      
      // Extract deployment ID from the nested data structure
      const deploymentId = deploymentResult.data?.id || deploymentResult.id;
      
      if (!deploymentId) {
        logger.error(`PipedreamComponents: Deployment result missing ID:`, deploymentResult);
        logger.error(`PipedreamComponents: Available properties:`, Object.keys(deploymentResult));
        logger.error(`PipedreamComponents: Result type:`, typeof deploymentResult);
        throw new Error('Pipedream deployment returned invalid response - missing deployment ID');
      }
      
      console.log('=== DEPLOYMENT SUCCESS ===');
      console.log('Extracted deployment ID:', deploymentId);
      console.log('=========================');

      // Store trigger deployment info in database
      await this.storeTriggerDeployment({
        userId,
        workflowId,
        componentId,
        triggerKey,
        appSlug,
        webhookUrl,
        deploymentId: deploymentId,
        configuredProps: deploymentProps,
        status: 'deployed',
        deployedAt: new Date(),
      });

      logger.info(`PipedreamComponents: Successfully deployed trigger ${componentId} for user ${userId}`);
      
      return {
        success: true,
        deploymentId: deploymentId,
        webhookUrl,
        componentId,
        triggerKey,
        status: 'deployed',
      };

    } catch (error) {
      logger.error(`PipedreamComponents: Failed to deploy trigger for user ${userId}:`, error.message);
      throw new Error(`Failed to deploy trigger: ${error.message}`);
    }
  }

  /**
   * Pause/unpause a deployed trigger
   *
   * @param {string} userId - The user ID
   * @param {string} workflowId - Workflow ID
   * @param {boolean} isPaused - Whether to pause or unpause
   * @returns {Promise<Object>} Result
   */
  async pauseTrigger(userId, workflowId, isPaused = true) {
    logger.debug(`PipedreamComponents: ${isPaused ? 'Pausing' : 'Resuming'} trigger for workflow ${workflowId}`);

    try {
      const client = PipedreamConnect.getClient();
      if (!client) {
        throw new Error('Pipedream client not available');
      }

      // Get trigger deployment info
      const deployment = await this.getTriggerDeployment(workflowId);
      if (!deployment) {
        throw new Error(`No trigger deployment found for workflow ${workflowId}`);
      }

      // Update trigger active state (use updateTrigger instead of pauseTrigger)
      const result = await client.updateTrigger({
        id: deployment.deploymentId,
        externalUserId: userId,
        active: !isPaused,  // active is opposite of paused
      });

      // Update deployment status
      await this.updateTriggerDeploymentStatus(workflowId, isPaused ? 'paused' : 'active');

      logger.info(`PipedreamComponents: Successfully ${isPaused ? 'paused' : 'resumed'} trigger for workflow ${workflowId}`);
      
      return {
        success: true,
        workflowId,
        status: isPaused ? 'paused' : 'active',
      };

    } catch (error) {
      logger.error(`PipedreamComponents: Failed to ${isPaused ? 'pause' : 'resume'} trigger:`, error.message);
      throw new Error(`Failed to ${isPaused ? 'pause' : 'resume'} trigger: ${error.message}`);
    }
  }

  /**
   * Delete a deployed trigger
   *
   * @param {string} userId - The user ID
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object>} Result
   */
  async deleteTrigger(userId, workflowId) {
    logger.debug(`PipedreamComponents: Deleting trigger for workflow ${workflowId}`);

    try {
      const client = PipedreamConnect.getClient();
      if (!client) {
        throw new Error('Pipedream client not available');
      }

      // Get trigger deployment info
      const deployment = await this.getTriggerDeployment(workflowId);
      if (!deployment) {
        logger.warn(`No trigger deployment found for workflow ${workflowId}`);
        return { success: true, workflowId, status: 'deleted' };
      }

      // Delete the trigger
      await client.deleteTrigger({
        id: deployment.deploymentId,
        externalUserId: userId,
      });

      // Remove deployment record
      await this.removeTriggerDeployment(workflowId);

      logger.info(`PipedreamComponents: Successfully deleted trigger for workflow ${workflowId}`);
      
      return {
        success: true,
        workflowId,
        status: 'deleted',
      };

    } catch (error) {
      logger.error(`PipedreamComponents: Failed to delete trigger:`, error.message);
      throw new Error(`Failed to delete trigger: ${error.message}`);
    }
  }

  /**
   * Generate webhook URL for a trigger
   *
   * @param {string} workflowId - Workflow ID
   * @param {string} triggerKey - Trigger key
   * @returns {string} Webhook URL
   */
  generateWebhookUrl(workflowId, triggerKey) {
    const baseUrl = process.env.WEBHOOK_BASE_URL || process.env.DOMAIN_SERVER || 'http://localhost:3080';
    return `${baseUrl}/api/webhooks/trigger/${workflowId}/${triggerKey}`;
  }

  /**
   * Store trigger deployment information in database
   *
   * @param {Object} deploymentInfo - Deployment information
   * @returns {Promise<void>}
   */
  async storeTriggerDeployment(deploymentInfo) {
    try {
      const { TriggerDeployment } = require('~/models');
      
      // Remove existing deployment for this workflow
      await TriggerDeployment.deleteMany({ workflowId: deploymentInfo.workflowId });
      
      // Create new deployment record
      const deployment = new TriggerDeployment(deploymentInfo);
      await deployment.save();
      
      logger.debug(`PipedreamComponents: Stored trigger deployment for workflow ${deploymentInfo.workflowId}`);
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to store trigger deployment:`, error.message);
      throw error;
    }
  }

  /**
   * Get trigger deployment information
   *
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object|null>} Deployment info or null if not found
   */
  async getTriggerDeployment(workflowId) {
    try {
      const { TriggerDeployment } = require('~/models');
      const deployment = await TriggerDeployment.findOne({ workflowId }).lean();
      return deployment;
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to get trigger deployment:`, error.message);
      return null;
    }
  }

  /**
   * Update trigger deployment status
   *
   * @param {string} workflowId - Workflow ID
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  async updateTriggerDeploymentStatus(workflowId, status) {
    try {
      const { TriggerDeployment } = require('~/models');
      await TriggerDeployment.updateOne(
        { workflowId },
        { status, updatedAt: new Date() }
      );
      logger.debug(`PipedreamComponents: Updated trigger deployment status for workflow ${workflowId} to ${status}`);
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to update trigger deployment status:`, error.message);
      throw error;
    }
  }

  /**
   * Remove trigger deployment record
   *
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<void>}
   */
  async removeTriggerDeployment(workflowId) {
    try {
      const { TriggerDeployment } = require('~/models');
      await TriggerDeployment.deleteMany({ workflowId });
      logger.debug(`PipedreamComponents: Removed trigger deployment for workflow ${workflowId}`);
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to remove trigger deployment:`, error.message);
      throw error;
    }
  }

  /**
   * Get component documentation/metadata
   *
   * @param {string} componentId - Component ID
   * @returns {Promise<Object>} Component documentation
   */
  async getComponentDocumentation(componentId) {
    logger.debug(`PipedreamComponents: Getting documentation for component ${componentId}`);

    if (!this.isEnabled()) {
      return this.getMockComponentDocumentation(componentId);
    }

    try {
      // This would typically fetch from Pipedream's component registry
      // For now, return basic structure
      return {
        id: componentId,
        name: `Component ${componentId}`,
        description: 'Component description would be fetched from Pipedream API',
        version: '1.0.0',
        props: [],
        examples: [],
        documentation_url: `https://pipedream.com/components/${componentId}`,
      };
    } catch (error) {
      logger.error(
        `PipedreamComponents: Error getting documentation for ${componentId}:`,
        error.message,
      );
      return this.getMockComponentDocumentation(componentId);
    }
  }

  /**
   * Search components across apps
   *
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @param {string} options.type - Component type filter
   * @param {string} options.app - App filter
   * @returns {Promise<Array>} Array of matching components
   */
  async searchComponents(searchTerm, options = {}) {
    logger.debug(`PipedreamComponents: Searching components with term: ${searchTerm}`);

    if (!this.isEnabled()) {
      return this.getMockSearchResults(searchTerm);
    }

    try {
      // This would implement component search across the Pipedream registry
      // For now, return empty results
      logger.debug('PipedreamComponents: Component search not yet implemented');
      return [];
    } catch (error) {
      logger.error(`PipedreamComponents: Error searching components:`, error.message);
      return [];
    }
  }

  /**
   * Get mock app components for development/testing
   */
  getMockAppComponents(appSlug, type) {
    logger.info(
      `PipedreamComponents: Returning mock components for ${appSlug}, type: ${type || 'all'}`,
    );

    const result = { actions: [], triggers: [] };

    // Return actions
    if (!type || type === 'actions') {
      result.actions = [
        {
          name: `Send ${appSlug} Message`,
          version: '1.0.0',
          key: `${appSlug}-send-message`,
          description: `Send a message using ${appSlug}`,
          configurable_props: [
            {
              name: 'message',
              type: 'string',
              label: 'Message',
              description: 'The message to send',
              required: true,
            },
            {
              name: 'recipient',
              type: 'string',
              label: 'Recipient',
              description: 'Message recipient',
              required: false,
            },
          ],
        },
        {
          name: `Create ${appSlug} Record`,
          version: '1.0.0',
          key: `${appSlug}-create-record`,
          description: `Create a new record in ${appSlug}`,
          configurable_props: [
            {
              name: 'title',
              type: 'string',
              label: 'Title',
              description: 'The title of the record',
              required: true,
            },
            {
              name: 'content',
              type: 'string',
              label: 'Content',
              description: 'The content of the record',
              required: false,
            },
            {
              name: 'tags',
              type: 'string[]',
              label: 'Tags',
              description: 'Tags for the record',
              required: false,
            },
          ],
        },
      ];
    }

    // Return triggers
    if (!type || type === 'triggers') {
      result.triggers = [
        {
          id: `${appSlug}-new-message`,
          key: `${appSlug}-new-message`,
          name: `New ${appSlug} Message`,
          version: '1.0.0',
          description: `Triggers when a new message is received in ${appSlug}`,
          configurable_props: [
            {
              name: 'channel',
              type: 'string',
              label: 'Channel',
              description: 'Channel to monitor for new messages',
              required: false,
            },
          ],
          type: 'webhook',
          category: 'new_item',
        },
        {
          id: `${appSlug}-updated-record`,
          key: `${appSlug}-updated-record`,
          name: `Updated ${appSlug} Record`,
          version: '1.0.0',
          description: `Triggers when a record is updated in ${appSlug}`,
          configurable_props: [
            {
              name: 'record_type',
              type: 'string',
              label: 'Record Type',
              description: 'Type of record to monitor',
              required: false,
            },
          ],
          type: 'webhook',
          category: 'item_updated',
        },
        {
          id: `${appSlug}-schedule`,
          key: `${appSlug}-schedule`,
          name: `${appSlug} Schedule`,
          version: '1.0.0',
          description: `Runs on a schedule for ${appSlug} operations`,
          configurable_props: [
            {
              name: 'cron',
              type: 'string',
              label: 'Cron Expression',
              description: 'When to run this trigger',
              required: true,
            },
          ],
          type: 'schedule',
          category: 'schedule',
        },
      ];
    }

    return result;
  }

  /**
   * Get mock component documentation
   */
  getMockComponentDocumentation(componentId) {
    return {
      id: componentId,
      name: `Mock Component ${componentId}`,
      description: 'This is a mock component for development and testing purposes.',
      version: '1.0.0',
      props: [
        {
          name: 'input',
          type: 'string',
          label: 'Input',
          description: 'Input parameter',
          required: true,
        },
      ],
      examples: [
        {
          title: 'Basic Usage',
          description: 'Basic example of using this component',
          code: `// Example usage\nconst result = await component.run({ input: "test" });`,
        },
      ],
      documentation_url: `https://pipedream.com/components/${componentId}`,
    };
  }

  /**
   * Get mock search results
   */
  getMockSearchResults(searchTerm) {
    return [
      {
        id: `mock-${searchTerm}-1`,
        name: `Mock ${searchTerm} Component 1`,
        description: `A mock component related to ${searchTerm}`,
        app: 'mock-app',
        type: 'action',
      },
      {
        id: `mock-${searchTerm}-2`,
        name: `Mock ${searchTerm} Component 2`,
        description: `Another mock component related to ${searchTerm}`,
        app: 'mock-app',
        type: 'action',
      },
    ];
  }

  /**
   * Get component counts for an app without fetching full component data
   *
   * @param {string} appIdentifier - App slug or ID
   * @returns {Promise<Object>} Object with actionCount and triggerCount
   */
  async getComponentCounts(appIdentifier) {
    logger.debug(`PipedreamComponents: Getting component counts for app ${appIdentifier}`);

    if (!this.isEnabled()) {
      return { actionCount: 2, triggerCount: 0 }; // Mock counts
    }

    try {
      // Check cache first
      const cached = await AppComponents.find({
        appSlug: appIdentifier,
        isActive: true,
      }).lean();

      if (cached && cached.length > 0) {
        const actionCount = cached.filter((c) => c.componentType === 'action').length;
        const triggerCount = cached.filter((c) => c.componentType === 'trigger').length;

        logger.debug(
          `PipedreamComponents: Found cached counts for ${appIdentifier}: ${actionCount} actions, ${triggerCount} triggers`,
        );
        return { actionCount, triggerCount };
      }

      // If no cache, fetch from API
      const actions = await this.fetchActionsFromAPI(appIdentifier);
      const triggers = await this.fetchTriggersFromAPI(appIdentifier);

      // Cache the components if we got any
      if (actions.length > 0) {
        await this.cacheComponents(appIdentifier, actions, 'action');
      }
      if (triggers.length > 0) {
        await this.cacheComponents(appIdentifier, triggers, 'trigger');
      }

      logger.debug(
        `PipedreamComponents: API counts for ${appIdentifier}: ${actions.length} actions, ${triggers.length} triggers`,
      );
      return { actionCount: actions.length, triggerCount: triggers.length };
    } catch (error) {
      logger.error(
        `PipedreamComponents: Error getting counts for ${appIdentifier}:`,
        error.message,
      );
      return { actionCount: 0, triggerCount: 0 };
    }
  }
}

module.exports = new PipedreamComponents();
