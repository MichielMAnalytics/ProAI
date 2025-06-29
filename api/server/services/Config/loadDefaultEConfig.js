const { EModelEndpoint, getEnabledEndpoints } = require('librechat-data-provider');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const { config } = require('./EndpointService');

/**
 * Load async endpoints and return a configuration object
 * @param {Express.Request} req - The request object
 * @returns {Promise<Object.<string, EndpointWithOrder>>} An object whose keys are endpoint names and values are objects that contain the endpoint configuration and an order.
 */
async function loadDefaultEndpointsConfig(req) {
  const { google, gptPlugins } = await loadAsyncEndpoints(req);
  const { assistants, azureAssistants, azureOpenAI, chatGPTBrowser } = config;

  const enabledEndpoints = getEnabledEndpoints();

  // Filter out endpoints based on interface config
  const interfaceConfig = req.app.locals.interfaceConfig;
  const pluginsEnabled = interfaceConfig?.plugins !== false;
  const assistantsEnabled = interfaceConfig?.assistants !== false;

  const filteredEndpoints = enabledEndpoints.filter((endpoint) => {
    if (endpoint === EModelEndpoint.gptPlugins && !pluginsEnabled) {
      return false;
    }
    if (endpoint === EModelEndpoint.assistants && !assistantsEnabled) {
      return false;
    }
    return true;
  });

  const endpointConfig = {
    [EModelEndpoint.openAI]: config[EModelEndpoint.openAI],
    [EModelEndpoint.agents]: config[EModelEndpoint.agents],
    [EModelEndpoint.assistants]: assistantsEnabled ? assistants : null,
    [EModelEndpoint.azureAssistants]: azureAssistants,
    [EModelEndpoint.azureOpenAI]: azureOpenAI,
    [EModelEndpoint.google]: google,
    [EModelEndpoint.chatGPTBrowser]: chatGPTBrowser,
    [EModelEndpoint.gptPlugins]: pluginsEnabled ? gptPlugins : null,
    [EModelEndpoint.anthropic]: config[EModelEndpoint.anthropic],
    [EModelEndpoint.bedrock]: config[EModelEndpoint.bedrock],
  };

  const orderedAndFilteredEndpoints = filteredEndpoints.reduce((config, key, index) => {
    if (endpointConfig[key]) {
      config[key] = { ...(endpointConfig[key] ?? {}), order: index };
    }
    return config;
  }, {});

  return orderedAndFilteredEndpoints;
}

module.exports = loadDefaultEndpointsConfig;
