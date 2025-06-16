const { SerpAPI } = require('@langchain/community/tools/serpapi');
const { Calculator } = require('@langchain/community/tools/calculator');
const { EnvVar, createCodeExecutionTool, createSearchTool } = require('@librechat/agents');
const {
  Tools,
  Constants,
  EToolResources,
  loadWebSearchAuth,
  replaceSpecialVars,
} = require('librechat-data-provider');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const {
  availableTools,
  manifestToolMap,
  // Basic Tools
  GoogleSearchAPI,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  TraversaalSearch,
  StructuredWolfram,
  createYouTubeTools,
  TavilySearchResults,
  createOpenAIImageTools,
  SchedulerTool,
  WorkflowTool,
} = require('../');
const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
const { createFileSearchTool, primeFiles: primeSearchFiles } = require('./fileSearch');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { createMCPTool } = require('~/server/services/MCP');
const { logger } = require('~/config');

const mcpToolPattern = new RegExp(`^.+${Constants.mcp_delimiter}.+$`);

/**
 * Validates the availability and authentication of tools for a user based on environment variables or user-specific plugin authentication values.
 * Tools without required authentication or with valid authentication are considered valid.
 *
 * @param {Object} user The user object for whom to validate tool access.
 * @param {Array<string>} tools An array of tool identifiers to validate. Defaults to an empty array.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of valid tool identifiers.
 */
const validateTools = async (user, tools = []) => {
  try {
    const validToolsSet = new Set(tools);
    const availableToolsToValidate = availableTools.filter((tool) =>
      validToolsSet.has(tool.pluginKey),
    );

    /**
     * Validates the credentials for a given auth field or set of alternate auth fields for a tool.
     * If valid admin or user authentication is found, the function returns early. Otherwise, it removes the tool from the set of valid tools.
     *
     * @param {string} authField The authentication field or fields (separated by "||" for alternates) to validate.
     * @param {string} toolName The identifier of the tool being validated.
     */
    const validateCredentials = async (authField, toolName) => {
      const fields = authField.split('||');
      for (const field of fields) {
        const adminAuth = process.env[field];
        if (adminAuth && adminAuth.length > 0) {
          return;
        }

        let userAuth = null;
        try {
          userAuth = await getUserPluginAuthValue(user, field);
        } catch (err) {
          if (field === fields[fields.length - 1] && !userAuth) {
            throw err;
          }
        }
        if (userAuth && userAuth.length > 0) {
          return;
        }
      }

      validToolsSet.delete(toolName);
    };

    for (const tool of availableToolsToValidate) {
      if (!tool.authConfig || tool.authConfig.length === 0) {
        continue;
      }

      for (const auth of tool.authConfig) {
        await validateCredentials(auth.authField, tool.pluginKey);
      }
    }

    return Array.from(validToolsSet.values());
  } catch (err) {
    logger.error('[validateTools] There was a problem validating tools', err);
    throw new Error('There was a problem validating tools');
  }
};

/** @typedef {typeof import('@langchain/core/tools').Tool} ToolConstructor */
/** @typedef {import('@langchain/core/tools').Tool} Tool */

/**
 * Initializes a tool with authentication values for the given user, supporting alternate authentication fields.
 * Authentication fields can have alternates separated by "||", and the first defined variable will be used.
 *
 * @param {string} userId The user ID for which the tool is being loaded.
 * @param {Array<string>} authFields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
 * @param {ToolConstructor} ToolConstructor The constructor function for the tool to be initialized.
 * @param {Object} options Optional parameters to be passed to the tool constructor alongside authentication values.
 * @returns {() => Promise<Tool>} An Async function that, when called, asynchronously initializes and returns an instance of the tool with authentication.
 */
const loadToolWithAuth = (userId, authFields, ToolConstructor, options = {}) => {
  return async function () {
    const authValues = await loadAuthValues({ userId, authFields });
    return new ToolConstructor({ ...options, ...authValues, userId });
  };
};

/**
 * @param {string} toolKey
 * @returns {Array<string>}
 */
const getAuthFields = (toolKey) => {
  return manifestToolMap[toolKey]?.authConfig.map((auth) => auth.authField) ?? [];
};

/**
 *
 * @param {object} object
 * @param {string} object.user
 * @param {Pick<Agent, 'id' | 'provider' | 'model'>} [object.agent]
 * @param {string} [object.model]
 * @param {EModelEndpoint} [object.endpoint]
 * @param {LoadToolOptions} [object.options]
 * @param {boolean} [object.useSpecs]
 * @param {Array<string>} object.tools
 * @param {boolean} [object.functions]
 * @param {boolean} [object.returnMap]
 * @returns {Promise<{ loadedTools: Tool[], toolContextMap: Object<string, any> } | Record<string,Tool>>}
 */
const loadTools = async ({
  user,
  agent,
  model,
  endpoint,
  tools = [],
  options = {},
  functions = true,
  returnMap = false,
}) => {
  const toolConstructors = {
    flux: FluxAPI,
    calculator: Calculator,
    google: GoogleSearchAPI,
    open_weather: OpenWeather,
    wolfram: StructuredWolfram,
    'stable-diffusion': StructuredSD,
    'azure-ai-search': StructuredACS,
    traversaal_search: TraversaalSearch,
    tavily_search_results_json: TavilySearchResults,
  };

  const customConstructors = {
    scheduler: async (_toolContextMap) => {
      const authFields = getAuthFields('scheduler');
      const authValues = await loadAuthValues({ userId: user, authFields });
      
      const reqEndpoint = options.req?.body?.endpoint;
      const reqModel = options.req?.body?.model;
      
      // Debug logging for request body
      logger.debug(`[SchedulerTool] Request body keys:`, options.req?.body ? Object.keys(options.req.body) : 'no body');
      logger.debug(`[SchedulerTool] Request body userMessageId:`, options.req?.body?.userMessageId);
      logger.debug(`[SchedulerTool] Request body overrideUserMessageId:`, options.req?.body?.overrideUserMessageId);
      logger.debug(`[SchedulerTool] Request body parentMessageId:`, options.req?.body?.parentMessageId);
      logger.debug(`[SchedulerTool] Request body ephemeralAgent:`, options.req?.body?.ephemeralAgent);
      logger.debug(`[SchedulerTool] Request body endpointOption:`, options.req?.body?.endpointOption ? {
        endpoint: options.req?.body?.endpointOption?.endpoint,
        model: options.req?.body?.endpointOption?.model,
        model_parameters: options.req?.body?.endpointOption?.model_parameters
      } : 'none');
      
      // Use userMessageId as the parentMessageId for scheduled messages
      const parentMessageId = options.req?.body?.userMessageId || 
                            options.req?.body?.overrideUserMessageId || 
                            options.req?.body?.parentMessageId;
      
      // Determine the endpoint and model/agent_id
      let toolEndpoint, toolModel;
      
      logger.info(`[SchedulerTool] Detection logic - reqEndpoint: ${reqEndpoint}, reqModel: ${reqModel}, hasAgent: ${!!(agent && agent.id)}, agentId: ${agent?.id}`);
      
      if (agent && agent.id && agent.id !== 'ephemeral') {
        // Running within a real user-created agent context
        // Note: reqModel is expected to be undefined here since we use the agent ID instead
        toolEndpoint = 'agents';
        toolModel = agent.id;
        logger.info(`[SchedulerTool] Using real agent context - endpoint: ${toolEndpoint}, model: ${toolModel} (reqModel undefined is expected for agents)`);
      } else if (reqEndpoint && reqModel) {
        // Running within an endpoint context (including when ephemeral agent is present)
        toolEndpoint = reqEndpoint;
        toolModel = reqModel;
        logger.info(`[SchedulerTool] Using request context - endpoint: ${toolEndpoint}, model: ${toolModel}${agent?.id === 'ephemeral' ? ' (ephemeral agent present but using underlying context)' : ''}`);
      } else if (options.req?.body?.endpointOption) {
        // Fallback to endpointOption
        const endpointOption = options.req.body.endpointOption;
        toolEndpoint = endpointOption.endpoint;
        toolModel = endpointOption.model;
        logger.info(`[SchedulerTool] Using endpointOption - endpoint: ${toolEndpoint}, model: ${toolModel}`);
      } else {
        // Final fallback - use configuration-based defaults
        logger.debug(`[SchedulerTool] Using configuration-based fallback`);
        try {
          const { getCustomConfig } = require('~/server/services/Config');
          const config = await getCustomConfig();
          toolEndpoint = config?.scheduler?.defaultEndpoint || 'openAI';
          toolModel = config?.scheduler?.defaultModel || 'gpt-4o-mini';
          logger.info(`[SchedulerTool] Using config fallback - endpoint: ${toolEndpoint}, model: ${toolModel}`);
        } catch (configError) {
          logger.warn(`[SchedulerTool] Failed to load config, using hard fallback:`, configError);
          toolEndpoint = 'openAI';
          toolModel = 'gpt-4o-mini';
          logger.warn(`[SchedulerTool] Using hard fallback - endpoint: ${toolEndpoint}, model: ${toolModel}`);
        }
      }
      
      return new SchedulerTool({
        ...authValues,
        userId: user,
        conversationId: options.req?.body?.conversationId,
        parentMessageId: parentMessageId,
        endpoint: toolEndpoint,
        model: toolModel,
        req: options.req,
      });
    },
    workflows: async (_toolContextMap) => {
      const authFields = getAuthFields('workflows');
      const authValues = await loadAuthValues({ userId: user, authFields });
      
      const reqEndpoint = options.req?.body?.endpoint;
      const reqModel = options.req?.body?.model;
      
      // Debug logging for request body
      logger.debug(`[WorkflowTool] Request body keys:`, options.req?.body ? Object.keys(options.req.body) : 'no body');
      logger.debug(`[WorkflowTool] Request body userMessageId:`, options.req?.body?.userMessageId);
      logger.debug(`[WorkflowTool] Request body overrideUserMessageId:`, options.req?.body?.overrideUserMessageId);
      logger.debug(`[WorkflowTool] Request body parentMessageId:`, options.req?.body?.parentMessageId);
      logger.debug(`[WorkflowTool] Request body ephemeralAgent:`, options.req?.body?.ephemeralAgent);
      logger.debug(`[WorkflowTool] Request body endpointOption:`, options.req?.body?.endpointOption ? {
        endpoint: options.req?.body?.endpointOption?.endpoint,
        model: options.req?.body?.endpointOption?.model,
        model_parameters: options.req?.body?.endpointOption?.model_parameters
      } : 'none');
      
      // Use userMessageId as the parentMessageId for workflow messages
      const parentMessageId = options.req?.body?.userMessageId || 
                            options.req?.body?.overrideUserMessageId || 
                            options.req?.body?.parentMessageId;
      
      // Determine the endpoint and model/agent_id
      let toolEndpoint, toolModel;
      
      // Enhanced debug logging for agent detection issues
      logger.debug(`[WorkflowTool] Agent object inspection:`, {
        hasAgent: !!agent,
        agentId: agent?.id,
        agentKeys: agent ? Object.keys(agent) : 'no agent',
        agentType: typeof agent,
        agentStringified: agent ? JSON.stringify(agent, null, 2).substring(0, 200) : 'no agent'
      });
      
      logger.info(`[WorkflowTool] Detection logic - reqEndpoint: ${reqEndpoint}, reqModel: ${reqModel}, hasAgent: ${!!(agent && agent.id)}, agentId: ${agent?.id}`);
      
      if (agent && agent.id && agent.id !== 'ephemeral') {
        // Running within a real user-created agent context
        // Note: reqModel is expected to be undefined here since we use the agent ID instead
        toolEndpoint = 'agents';
        toolModel = agent.id;
        logger.info(`[WorkflowTool] Using real agent context - endpoint: ${toolEndpoint}, model: ${toolModel} (reqModel undefined is expected for agents)`);
      } else if (reqEndpoint && reqModel) {
        // Running within an endpoint context (including when ephemeral agent is present)
        toolEndpoint = reqEndpoint;
        toolModel = reqModel;
        logger.info(`[WorkflowTool] Using request context - endpoint: ${toolEndpoint}, model: ${toolModel}${agent?.id === 'ephemeral' ? ' (ephemeral agent present but using underlying context)' : ''}`);
      } else if (options.req?.body?.endpointOption) {
        // Fallback to endpointOption
        const endpointOption = options.req.body.endpointOption;
        toolEndpoint = endpointOption.endpoint;
        toolModel = endpointOption.model;
        logger.info(`[WorkflowTool] Using endpointOption - endpoint: ${toolEndpoint}, model: ${toolModel}`);
      } else {
        // Final fallback - use configuration-based defaults
        logger.debug(`[WorkflowTool] Using configuration-based fallback`);
        try {
          const { getCustomConfig } = require('~/server/services/Config');
          const config = await getCustomConfig();
          toolEndpoint = config?.workflows?.defaultEndpoint || 'openAI';
          toolModel = config?.workflows?.defaultModel || 'gpt-4o-mini';
          logger.info(`[WorkflowTool] Using config fallback - endpoint: ${toolEndpoint}, model: ${toolModel}`);
        } catch (configError) {
          logger.warn(`[WorkflowTool] Failed to load config, using hard fallback:`, configError);
          toolEndpoint = 'openAI';
          toolModel = 'gpt-4o-mini';
          logger.warn(`[WorkflowTool] Using hard fallback - endpoint: ${toolEndpoint}, model: ${toolModel}`);
        }
      }
      
      return new WorkflowTool({
        ...authValues,
        userId: user,
        conversationId: options.req?.body?.conversationId,
        parentMessageId: parentMessageId,
        endpoint: toolEndpoint,
        model: toolModel,
        req: options.req,
      });
    },
    serpapi: async (_toolContextMap) => {
      const authFields = getAuthFields('serpapi');
      let envVar = authFields[0] ?? '';
      let apiKey = process.env[envVar];
      if (!apiKey) {
        apiKey = await getUserPluginAuthValue(user, envVar);
      }
      return new SerpAPI(apiKey, {
        location: 'Austin,Texas,United States',
        hl: 'en',
        gl: 'us',
      });
    },
    youtube: async (_toolContextMap) => {
      const authFields = getAuthFields('youtube');
      const authValues = await loadAuthValues({ userId: user, authFields });
      return createYouTubeTools(authValues);
    },
    image_gen_oai: async (toolContextMap) => {
      const authFields = getAuthFields('image_gen_oai');
      const authValues = await loadAuthValues({ userId: user, authFields });
      const imageFiles = options.tool_resources?.[EToolResources.image_edit]?.files ?? [];
      let toolContext = '';
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (!file) {
          continue;
        }
        if (i === 0) {
          toolContext =
            'Image files provided in this request (their image IDs listed in order of appearance) available for image editing:';
        }
        toolContext += `\n\t- ${file.file_id}`;
        if (i === imageFiles.length - 1) {
          toolContext += `\n\nInclude any you need in the \`image_ids\` array when calling \`${EToolResources.image_edit}_oai\`. You may also include previously referenced or generated image IDs.`;
        }
      }
      if (toolContext) {
        toolContextMap.image_edit_oai = toolContext;
      }
      return createOpenAIImageTools({
        ...authValues,
        isAgent: !!agent,
        req: options.req,
        imageFiles,
      });
    },
  };

  const requestedTools = {};

  if (functions === true) {
    toolConstructors.dalle = DALLE3;
  }

  /** @type {ImageGenOptions} */
  const imageGenOptions = {
    isAgent: !!agent,
    req: options.req,
    fileStrategy: options.fileStrategy,
    processFileURL: options.processFileURL,
    returnMetadata: options.returnMetadata,
    uploadImageBuffer: options.uploadImageBuffer,
  };

  const toolOptions = {
    flux: imageGenOptions,
    dalle: imageGenOptions,
    'stable-diffusion': imageGenOptions,
    serpapi: { location: 'Austin,Texas,United States', hl: 'en', gl: 'us' },
  };

  /** @type {Record<string, string>} */
  const toolContextMap = {};
  const appTools = options.req?.app?.locals?.availableTools ?? {};
  const mcpToolRegistry = options.req?.app?.locals?.mcpToolRegistry;

  // logger.info(`[loadTools] Loading ${tools.length} tools for user ${user}`);
  // logger.info(`[loadTools] Available tools count: ${Object.keys(appTools).length}`);
  // logger.info(`[loadTools] MCP tool registry size: ${mcpToolRegistry?.size || 0}`);
  // logger.info(`[loadTools] Tools to load: ${tools.join(', ')}`);

  for (const tool of tools) {
    if (tool === Tools.execute_code) {
      requestedTools[tool] = async () => {
        const authValues = await loadAuthValues({
          userId: user,
          authFields: [EnvVar.CODE_API_KEY],
        });
        const codeApiKey = authValues[EnvVar.CODE_API_KEY];
        const { files, toolContext } = await primeCodeFiles(options, codeApiKey);
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }
        const CodeExecutionTool = createCodeExecutionTool({
          user_id: user,
          files,
          ...authValues,
        });
        CodeExecutionTool.apiKey = codeApiKey;
        return CodeExecutionTool;
      };
      continue;
    } else if (tool === Tools.file_search) {
      requestedTools[tool] = async () => {
        const { files, toolContext } = await primeSearchFiles(options);
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }
        return createFileSearchTool({ req: options.req, files, entity_id: agent?.id });
      };
      continue;
    } else if (tool === Tools.web_search) {
      const webSearchConfig = options?.req?.app?.locals?.webSearch;
      const result = await loadWebSearchAuth({
        userId: user,
        loadAuthValues,
        webSearchConfig,
      });
      const { onSearchResults, onGetHighlights } = options?.[Tools.web_search] ?? {};
      requestedTools[tool] = async () => {
        toolContextMap[tool] = `# \`${tool}\`:
Current Date & Time: ${replaceSpecialVars({ text: '{{iso_datetime}}' })}
1. **Execute immediately without preface** when using \`${tool}\`.
2. **After the search, begin with a brief summary** that directly addresses the query without headers or explaining your process.
3. **Structure your response clearly** using Markdown formatting (Level 2 headers for sections, lists for multiple points, tables for comparisons).
4. **Cite sources properly** according to the citation anchor format, utilizing group anchors when appropriate.
5. **Tailor your approach to the query type** (academic, news, coding, etc.) while maintaining an expert, journalistic, unbiased tone.
6. **Provide comprehensive information** with specific details, examples, and as much relevant context as possible from search results.
7. **Avoid moralizing language.**
`.trim();
        return createSearchTool({
          ...result.authResult,
          onSearchResults,
          onGetHighlights,
          logger,
        });
      };
      continue;
    } else if (tool && appTools[tool] && 
               (mcpToolPattern.test(tool) || 
                (options.req?.app?.locals?.mcpToolRegistry && 
                 options.req.app.locals.mcpToolRegistry.has(tool)))) {
      // const isMCPByPattern = mcpToolPattern.test(tool);
      // const isMCPByRegistry = options.req?.app?.locals?.mcpToolRegistry?.has(tool);
      // logger.info(`[loadTools] MCP tool detected: ${tool} (pattern: ${isMCPByPattern}, registry: ${isMCPByRegistry})`);
      
      requestedTools[tool] = async () =>
        createMCPTool({
          req: options.req,
          toolKey: tool,
          model: agent?.model ?? model,
          provider: agent?.provider ?? endpoint,
        });
      continue;
    }

    if (customConstructors[tool]) {
      requestedTools[tool] = async () => customConstructors[tool](toolContextMap);
      continue;
    }

    if (toolConstructors[tool]) {
      const options = toolOptions[tool] || {};
      const toolInstance = loadToolWithAuth(
        user,
        getAuthFields(tool),
        toolConstructors[tool],
        options,
      );
      requestedTools[tool] = toolInstance;
      continue;
    }
  }

  if (returnMap) {
    return requestedTools;
  }

  const toolPromises = [];
  for (const tool of tools) {
    const validTool = requestedTools[tool];
    if (validTool) {
      toolPromises.push(
        validTool().catch((error) => {
          logger.error(`Error loading tool ${tool}:`, error);
          return null;
        }),
      );
    }
  }

  const loadedTools = (await Promise.all(toolPromises)).flatMap((plugin) => plugin || []);
  return { loadedTools, toolContextMap };
};

module.exports = {
  loadToolWithAuth,
  validateTools,
  loadTools,
};
