const axios = require('axios');
const PipedreamConnect = require('./PipedreamConnect');
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
    return PipedreamConnect.isEnabled();
  }

  /**
   * Get authentication token for API requests
   */
  async getAuthToken() {
    let authToken = process.env.PIPEDREAM_API_KEY;
    
    if (!authToken && process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET) {
      try {
        const tokenResponse = await axios.post(`${this.baseURL}/oauth/token`, {
          grant_type: 'client_credentials',
          client_id: process.env.PIPEDREAM_CLIENT_ID,
          client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
        }, {
          headers: { 'Content-Type': 'application/json' },
        });
        
        authToken = tokenResponse.data.access_token;
      } catch (error) {
        logger.error('PipedreamComponents: Failed to obtain OAuth token:', error.message);
        throw new Error('Failed to authenticate with Pipedream API');
      }
    }
    
    if (!authToken) {
      throw new Error('No authentication credentials available for Pipedream API');
    }
    
    return authToken;
  }

  /**
   * Get components (actions/triggers) for a specific app
   * 
   * @param {string} appIdentifier - App slug or ID
   * @param {string} type - Component type ('actions', 'triggers', or null for both)
   * @returns {Promise<Object>} Object with actions and triggers arrays
   */
  async getAppComponents(appIdentifier, type = null) {
    logger.info(`PipedreamComponents: Getting components for app ${appIdentifier}, type: ${type || 'all'}`);
    
    if (!this.isEnabled()) {
      logger.warn('PipedreamComponents: Service is disabled, returning mock data');
      return this.getMockAppComponents(appIdentifier, type);
    }

    try {
      const result = { actions: [], triggers: [] };

      // We focus on actions only as per the requirements
      if (!type || type === 'actions') {
        result.actions = await this.getActions(appIdentifier);
      }

      // Triggers are intentionally not implemented as they're not needed
      if (type === 'triggers') {
        logger.info('PipedreamComponents: Triggers are not implemented, returning empty array');
      }

      logger.info(`PipedreamComponents: Retrieved ${result.actions.length} actions for ${appIdentifier}`);
      return result;
    } catch (error) {
      logger.error(`PipedreamComponents: Error getting components for ${appIdentifier}:`, error.message);
      return this.getMockAppComponents(appIdentifier, type);
    }
  }

  /**
   * Get actions for a specific app
   * 
   * @param {string} appIdentifier - App slug or ID
   * @returns {Promise<Array>} Array of actions
   */
  async getActions(appIdentifier) {
    logger.info(`PipedreamComponents: Getting actions for app ${appIdentifier}`);

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
            const actions = componentsResponse.data.filter(component => {
              const key = component.key || '';
              const name = component.name || '';
              // Filter out triggers - keep only actions
              return !(key.includes('trigger') || name.toLowerCase().includes('trigger') || 
                      name.includes('New ') || name.includes('Updated '));
            });

            logger.info(`PipedreamComponents: SDK returned ${actions.length} actions for ${appIdentifier}`);
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
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            params: {
              app: appIdentifier,
              limit: 100,
            },
          });

          if (response.data?.data) {
            logger.info(`PipedreamComponents: Connect API returned ${response.data.data.length} actions for ${appIdentifier}`);
            return response.data.data;
          }
        } catch (apiError) {
          logger.warn(`PipedreamComponents: Connect API error for ${appIdentifier}:`, apiError.message);
        }
      }

      // Return empty array if no actions found
      logger.info(`PipedreamComponents: No actions found for ${appIdentifier}`);
      return [];
    } catch (error) {
      logger.error(`PipedreamComponents: Error getting actions for ${appIdentifier}:`, error.message);
      return [];
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
    logger.info(`PipedreamComponents: Configuring component for user ${userId}`);

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

      logger.info(`PipedreamComponents: Configuring component ${componentId}, prop: ${propName}`);

      const result = await client.configureComponent({
        id: componentId,
        external_user_id: userId,
        prop_name: propName,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      });

      logger.info(`PipedreamComponents: Component configured successfully for user ${userId}`);
      return result;
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to configure component for user ${userId}:`, error.message);
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
    logger.info(`PipedreamComponents: Running action for user ${userId}`);

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

      logger.info(`PipedreamComponents: Running action ${componentId} for user ${userId}`);

      const result = await client.runAction({
        id: componentId,
        external_user_id: userId,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      });

      logger.info(`PipedreamComponents: Action executed successfully for user ${userId}`);
      return result;
    } catch (error) {
      logger.error(`PipedreamComponents: Failed to run action for user ${userId}:`, error.message);
      throw new Error(`Failed to run action: ${error.message}`);
    }
  }

  /**
   * Deploy a trigger component (placeholder - not implemented)
   * 
   * @param {string} userId - The user ID
   * @param {Object} options - Trigger options
   * @returns {Promise<Object>} Deployment result
   */
  async deployTrigger(userId, options) {
    logger.info(`PipedreamComponents: Deploy trigger requested for user ${userId} (not implemented)`);
    
    // Triggers are not implemented as they're not needed for our use case
    throw new Error('Trigger deployment is not implemented. This application focuses on actions only.');
  }

  /**
   * Get component documentation/metadata
   * 
   * @param {string} componentId - Component ID
   * @returns {Promise<Object>} Component documentation
   */
  async getComponentDocumentation(componentId) {
    logger.info(`PipedreamComponents: Getting documentation for component ${componentId}`);

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
      logger.error(`PipedreamComponents: Error getting documentation for ${componentId}:`, error.message);
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
    logger.info(`PipedreamComponents: Searching components with term: ${searchTerm}`);

    if (!this.isEnabled()) {
      return this.getMockSearchResults(searchTerm);
    }

    try {
      // This would implement component search across the Pipedream registry
      // For now, return empty results
      logger.info('PipedreamComponents: Component search not yet implemented');
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
    logger.info(`PipedreamComponents: Returning mock components for ${appSlug}, type: ${type || 'all'}`);
    
    const result = { actions: [], triggers: [] };

    // Only return actions as triggers are not needed
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
}

module.exports = new PipedreamComponents(); 