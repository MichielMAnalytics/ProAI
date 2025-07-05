const {
  FileSources,
  loadOCRConfig,
  processMCPEnv,
  EModelEndpoint,
  loadMemoryConfig,
  getConfigDefaults,
  loadWebSearchConfig,
  CacheKeys,
} = require('librechat-data-provider');
const {
  checkHealth,
  checkConfig,
  checkVariables,
  checkAzureVariables,
  checkWebSearchConfig,
} = require('./start/checks');
const { azureAssistantsDefaults, assistantsConfigSetup } = require('./start/assistants');
const { initializeAzureBlobService } = require('./Files/Azure/initialize');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const loadCustomConfig = require('./Config/loadCustomConfig');
const handleRateLimits = require('./Config/handleRateLimits');
const { loadDefaultInterface } = require('./start/interface');
const { loadTurnstileConfig } = require('./start/turnstile');
const { azureConfigSetup } = require('./start/azureOpenAI');
const { processModelSpecs } = require('./start/modelSpecs');
const { initializeS3 } = require('./Files/S3/initialize');
const { loadAndFormatTools } = require('./ToolService');
const { agentsConfigSetup } = require('./start/agents');
const { isEnabled } = require('~/server/utils');
const { initializeRoles } = require('~/models');
const { setCachedTools } = require('./Config');
const logger = require('~/utils/logger');
const paths = require('~/config/paths');

/**
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 * @param {Express.Application} app - The Express application object.
 */
const AppService = async (app) => {
  await initializeRoles();
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig()) ?? {};
  const configDefaults = getConfigDefaults();

  const ocr = loadOCRConfig(config.ocr);
  const webSearch = loadWebSearchConfig(config.webSearch);
  checkWebSearchConfig(webSearch);
  const memory = loadMemoryConfig(config.memory);
  const filteredTools = config.filteredTools;
  const includedTools = config.includedTools;
  const fileStrategy = config.fileStrategy ?? configDefaults.fileStrategy;
  const startBalance = process.env.START_BALANCE;
  const balance = config.balance ?? {
    enabled: isEnabled(process.env.CHECK_BALANCE),
    startBalance: startBalance ? parseInt(startBalance, 10) : undefined,
  };
  const imageOutputType = config?.imageOutputType ?? configDefaults.imageOutputType;

  process.env.CDN_PROVIDER = fileStrategy;

  checkVariables();
  await checkHealth();

  if (fileStrategy === FileSources.firebase) {
    initializeFirebase();
  } else if (fileStrategy === FileSources.azure_blob) {
    initializeAzureBlobService();
  } else if (fileStrategy === FileSources.s3) {
    initializeS3();
  }

  /** @type {Record<string, FunctionTool>} */
  const availableTools = loadAndFormatTools({
    adminFilter: filteredTools,
    adminIncluded: includedTools,
    directory: paths.structuredTools,
  });

  // Convert back to array for setCachedTools
  const toolsArray = Object.values(availableTools);
  await setCachedTools(toolsArray, { isGlobal: true });

  // Store MCP config for later initialization
  const mcpConfig = config.mcpServers || null;
  const pipedreamServerInstructions = config.pipedreamServerInstructions || null;

  const socialLogins =
    config?.registration?.socialLogins ?? configDefaults?.registration?.socialLogins;
  const interfaceConfig = await loadDefaultInterface(config, configDefaults);
  const turnstileConfig = loadTurnstileConfig(config, configDefaults);
  const schedulerConfig = config?.scheduler ?? {};
  const workflowsConfig = config?.workflows ?? {};
  const addUserSpecificMcpFromDb =
    config?.addUserSpecificMcpFromDb ?? configDefaults?.addUserSpecificMcpFromDb;

  const defaultLocals = {
    ocr,
    paths,
    memory,
    webSearch,
    fileStrategy,
    socialLogins,
    filteredTools,
    includedTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
    balance,
    scheduler: schedulerConfig,
    workflows: workflowsConfig,
    addUserSpecificMcpFromDb,
    mcpConfig,
    pipedreamServerInstructions,
  };

  if (!Object.keys(config).length) {
    app.locals = defaultLocals;
    return;
  }

  checkConfig(config);
  handleRateLimits(config?.rateLimits);

  const endpointLocals = {};
  const endpoints = config?.endpoints;

  if (endpoints?.[EModelEndpoint.azureOpenAI]) {
    endpointLocals[EModelEndpoint.azureOpenAI] = azureConfigSetup(config);
    checkAzureVariables();
  }

  if (endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
    endpointLocals[EModelEndpoint.azureAssistants] = azureAssistantsDefaults();
  }

  if (endpoints?.[EModelEndpoint.azureAssistants]) {
    endpointLocals[EModelEndpoint.azureAssistants] = assistantsConfigSetup(
      config,
      EModelEndpoint.azureAssistants,
      endpointLocals[EModelEndpoint.azureAssistants],
    );
  }

  if (endpoints?.[EModelEndpoint.assistants]) {
    endpointLocals[EModelEndpoint.assistants] = assistantsConfigSetup(
      config,
      EModelEndpoint.assistants,
      endpointLocals[EModelEndpoint.assistants],
    );
  }

  if (endpoints?.[EModelEndpoint.agents]) {
    endpointLocals[EModelEndpoint.agents] = agentsConfigSetup(config);
  }

  const endpointKeys = [
    EModelEndpoint.openAI,
    EModelEndpoint.google,
    EModelEndpoint.bedrock,
    EModelEndpoint.anthropic,
    EModelEndpoint.gptPlugins,
  ];

  endpointKeys.forEach((key) => {
    if (endpoints?.[key]) {
      endpointLocals[key] = endpoints[key];
    }
  });

  app.locals = {
    ...defaultLocals,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    modelSpecs: processModelSpecs(endpoints, config.modelSpecs, interfaceConfig),
    availableTools,
    mcpToolRegistry: new Map(),
    ...endpointLocals,
  };

  // Initialize global MCP servers after app.locals is set
  if (mcpConfig && Object.keys(mcpConfig).length > 0) {
    try {
      const { getMCPManager, getFlowStateManager } = require('~/config');
      const { getLogStores } = require('~/cache');
      const { CacheKeys } = require('librechat-data-provider');
      const { findToken, updateToken, createToken } = require('~/models');
      
      const mcpManager = getMCPManager();
      const flowsCache = getLogStores(CacheKeys.FLOWS);
      const flowManager = getFlowStateManager(flowsCache);
      
      logger.info(`[AppService] Initializing ${Object.keys(mcpConfig).length} global MCP servers: ${Object.keys(mcpConfig).join(', ')}`);
      
      await mcpManager.initializeMCP({
        mcpServers: mcpConfig,
        flowManager,
        tokenMethods: { findToken, updateToken, createToken },
        processMCPEnv,
      });
      
      // Register global MCP tools in the tool registry and availableTools
      const globalConnections = mcpManager.getAllConnections();
      let globalToolCount = 0;
      
      for (const [serverName, connection] of globalConnections.entries()) {
        try {
          if (await connection.isConnected()) {
            const tools = await connection.fetchTools();
            logger.info(`[AppService] Global MCP server '${serverName}' has ${tools.length} tools`);
            
            for (const tool of tools) {
              const toolName = tool.name;
              const toolDef = {
                type: 'function',
                function: {
                  name: toolName,
                  description: tool.description,
                  parameters: tool.inputSchema,
                },
              };
              
              // Add to availableTools
              app.locals.availableTools[toolName] = toolDef;
              
              // Register in MCP tool registry with global flag
              app.locals.mcpToolRegistry.set(toolName, {
                serverName,
                appSlug: serverName,
                toolName,
                isGlobal: true,
              });
              
              globalToolCount++;
            }
          }
        } catch (error) {
          logger.error(`[AppService] Failed to register tools from global MCP server '${serverName}':`, error);
        }
      }
      
      logger.info(`[AppService] Global MCP servers initialized successfully with ${globalToolCount} tools registered`);
    } catch (error) {
      logger.error(`[AppService] Failed to initialize global MCP servers:`, error);
    }
  }
};

module.exports = AppService;
