const { logger } = require('~/config');
const { EModelEndpoint } = require('librechat-data-provider');

class SchedulerClientFactory {
  constructor() {
    this.endpointInitializers = {};
    this.initializeEndpointClients();
  }

  /**
   * Initialize endpoint client initializers
   */
  initializeEndpointClients() {
    try {
      const { initializeClient: initOpenAIClient } = require('~/server/services/Endpoints/openAI');
      const { initializeClient: initCustomClient } = require('~/server/services/Endpoints/custom');
      const { initializeClient: initAnthropicClient } = require('~/server/services/Endpoints/anthropic');
      const { initializeClient: initGoogleClient } = require('~/server/services/Endpoints/google');
      const { initializeClient: initAgentsClient } = require('~/server/services/Endpoints/agents');
      
      this.endpointInitializers = {
        [EModelEndpoint.openAI]: initOpenAIClient,
        [EModelEndpoint.azureOpenAI]: initOpenAIClient,
        [EModelEndpoint.custom]: initCustomClient,
        [EModelEndpoint.anthropic]: initAnthropicClient,
        [EModelEndpoint.google]: initGoogleClient,
        [EModelEndpoint.agents]: initAgentsClient,
      };
      
      logger.info('[SchedulerClientFactory] Endpoint initializers loaded:', Object.keys(this.endpointInitializers));
    } catch (error) {
      logger.error('[SchedulerClientFactory] Error loading endpoint initializers:', error);
      this.endpointInitializers = {};
    }
  }

  /**
   * Initialize client for a specific endpoint
   * @param {Object} params - Initialization parameters
   * @param {Object} params.req - Mock request object
   * @param {Object} params.res - Mock response object
   * @param {Object} params.endpointOption - Endpoint configuration
   * @returns {Promise<Object>} Initialized client
   */
  async initializeClient({ req, res, endpointOption }) {
    const endpoint = endpointOption.endpoint;
    const initializeClientFn = this.endpointInitializers[endpoint];
    
    if (!initializeClientFn) {
      throw new Error(`No initializer found for endpoint: ${endpoint}`);
    }
    
    logger.debug(`[SchedulerClientFactory] Initializing client for endpoint: ${endpoint}`);
    
    try {
      const result = await initializeClientFn({ req, res, endpointOption });
      logger.debug(`[SchedulerClientFactory] Successfully initialized ${endpoint} client`);
      return result;
    } catch (error) {
      logger.error(`[SchedulerClientFactory] Failed to initialize ${endpoint} client:`, error);
      throw error;
    }
  }

  /**
   * Create endpoint option for agents endpoint
   * @param {Object} agent - The agent object
   * @param {string} underlyingModel - The underlying model
   * @returns {Object} Endpoint option for agents
   */
  createAgentsEndpointOption(agent, underlyingModel) {
    return {
      endpoint: EModelEndpoint.agents,
      model: underlyingModel,
      model_parameters: { model: underlyingModel },
      agent: Promise.resolve(agent), // Agents endpoint expects a promise
    };
  }

  /**
   * Create endpoint option for regular endpoints
   * @param {string} endpoint - The endpoint name
   * @param {string} model - The model name
   * @param {Object} modelParameters - Additional model parameters
   * @returns {Object} Endpoint option
   */
  createEndpointOption(endpoint, model, modelParameters = {}) {
    return {
      endpoint: endpoint,
      model: model,
      model_parameters: { model, ...modelParameters },
    };
  }

  /**
   * Get available endpoints
   * @returns {string[]} List of available endpoint names
   */
  getAvailableEndpoints() {
    return Object.keys(this.endpointInitializers);
  }

  /**
   * Check if an endpoint is supported
   * @param {string} endpoint - The endpoint to check
   * @returns {boolean} True if endpoint is supported
   */
  isEndpointSupported(endpoint) {
    return this.endpointInitializers.hasOwnProperty(endpoint);
  }
}

module.exports = SchedulerClientFactory; 