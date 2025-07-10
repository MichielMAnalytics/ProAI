const { EModelEndpoint } = require('librechat-data-provider');
const { getCustomConfig } = require('~/server/services/Config/getCustomConfig');
const { logger } = require('~/config');


/**
 * Get full step result for passing data between workflow steps
 * @param {*} result - Step result
 * @returns {string} Full result as string for step context
 */
function getFullStepResult(result) {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result === 'object' && result !== null) {
    try {
      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.warn('[WorkflowExecutorUtils] Failed to stringify step result:', error);
      return String(result);
    }
  }

  return String(result);
}

/**
 * Get configured model and endpoint, preferring workflow stored context over librechat.yaml defaults
 * @param {Object} workflow - The workflow object with stored context
 * @returns {Promise<Object>} Configuration with model, endpoint, and endpointName
 */
async function getConfiguredModelAndEndpoint(workflow = null) {
  try {
    // If workflow has stored context, use it first
    if (workflow && workflow.endpoint && workflow.ai_model) {
      // Use stored workflow context
      const workflowEndpoint = workflow.endpoint;
      const workflowModel = workflow.ai_model;
      const workflowAgentId = workflow.agent_id;

      logger.info(
        `[WorkflowExecutorUtils] Using stored workflow context: endpoint=${workflowEndpoint}, model=${workflowModel}, agent_id=${workflowAgentId}`,
      );

      return {
        model: workflowModel,
        endpoint: workflowEndpoint,
        endpointName: workflowEndpoint,
        agent_id: workflowAgentId,
      };
    } else if (workflow && workflow.agent_id && workflow.endpoint === EModelEndpoint.agents) {
      // Workflow was created with an agent - load the agent to get its model/endpoint
      logger.info(
        `[WorkflowExecutorUtils] Workflow ${workflow.id} uses agent ${workflow.agent_id}, loading agent context`,
      );

      try {
        const { getAgent } = require('~/models/Agent');
        const agent = await getAgent({ id: workflow.agent_id });

        if (agent) {
          const agentEndpoint = agent.provider || EModelEndpoint.openAI;
          const agentModel = agent.model || 'gpt-4o-mini';

          logger.info(
            `[WorkflowExecutorUtils] Using agent context: endpoint=${agentEndpoint}, model=${agentModel}, agent_id=${workflow.agent_id}`,
          );

          return {
            model: agentModel,
            endpoint: agentEndpoint,
            endpointName: agentEndpoint,
            agent_id: workflow.agent_id,
          };
        } else {
          logger.warn(
            `[WorkflowExecutorUtils] Agent ${workflow.agent_id} not found, falling back to librechat.yaml defaults`,
          );
        }
      } catch (error) {
        logger.warn(
          `[WorkflowExecutorUtils] Error loading agent ${workflow.agent_id}, falling back to librechat.yaml defaults:`,
          error,
        );
      }
    }

    // Fallback to librechat.yaml configuration
    const config = await getCustomConfig();
    const configuredModel = config?.workflows?.defaultModel || 'gpt-4o-mini';
    const configuredEndpoint = config?.workflows?.defaultEndpoint || 'openAI';

    // Map config endpoint names to EModelEndpoint values
    const endpointMapping = {
      openAI: EModelEndpoint.openAI,
      anthropic: EModelEndpoint.anthropic,
      google: EModelEndpoint.google,
      azureOpenAI: EModelEndpoint.azureOpenAI,
      custom: EModelEndpoint.custom,
      bedrock: EModelEndpoint.bedrock,
    };

    const mappedEndpoint = endpointMapping[configuredEndpoint] || EModelEndpoint.openAI;

    logger.info(
      `[WorkflowExecutorUtils] Using librechat.yaml defaults: ${configuredModel} on endpoint: ${configuredEndpoint} (${mappedEndpoint})`,
    );

    return {
      model: configuredModel,
      endpoint: mappedEndpoint,
      endpointName: configuredEndpoint,
      agent_id: null,
    };
  } catch (error) {
    logger.warn('[WorkflowExecutorUtils] Failed to load config, using hard defaults:', error);
    return {
      model: 'gpt-4o-mini',
      endpoint: EModelEndpoint.openAI,
      endpointName: 'openAI',
      agent_id: null,
    };
  }
}

/**
 * Find the first step in a workflow (step with no incoming connections)
 * @param {Array} steps - Array of workflow steps
 * @returns {Object|null} First step or null
 */
function findFirstStep(steps) {
  const stepIds = new Set(steps.map((s) => s.id));
  const referencedSteps = new Set();

  // Collect all steps that are referenced as onSuccess or onFailure
  steps.forEach((step) => {
    if (step.onSuccess && stepIds.has(step.onSuccess)) {
      referencedSteps.add(step.onSuccess);
    }
    if (step.onFailure && stepIds.has(step.onFailure)) {
      referencedSteps.add(step.onFailure);
    }
  });

  // Find steps that are not referenced (potential starting points)
  const unreferencedSteps = steps.filter((step) => !referencedSteps.has(step.id));

  // Return the first unreferenced step, or the first step if all are referenced
  return unreferencedSteps.length > 0 ? unreferencedSteps[0] : steps[0];
}



/**
 * Create a serializable version of the execution context for database storage
 * Removes non-serializable objects like agents and clients
 * @param {Object} context - Execution context
 * @returns {Object} Clean, serializable context
 */
function createSerializableContext(context) {
  if (!context) {
    return null;
  }

  const serializable = {
    ...context,
    workflow: {
      ...context.workflow,
      // Remove non-serializable agent and client objects
      agent: undefined,
      client: undefined,
      // Keep only essential workflow info
      id: context.workflow?.id,
      name: context.workflow?.name,
      conversationId: context.workflow?.conversationId,
      parentMessageId: context.workflow?.parentMessageId,
    },
    // Keep other context properties, ensuring they are serializable
    execution: context.execution,
    mcp: {
      // Keep MCP info but remove the actual availableTools object which might have circular refs
      available: context.mcp?.available,
      toolCount: context.mcp?.toolCount,
      serverCount: context.mcp?.serverCount,
      // Don't store the actual availableTools object as it may contain circular references
    },
    steps: context.steps,
    variables: context.variables,
  };

  return serializable;
}


/**
 * Create mock request object for workflow execution
 * @param {Object} context - Execution context
 * @param {Object} user - User object
 * @param {string} prompt - The prompt for the request
 * @param {string} model - The model for the request
 * @param {string} endpoint - The endpoint for the request
 * @param {string} [memoryContent] - Optional memory content to include
 * @returns {Object} Mock request object
 */
function createMockRequestForWorkflow(context, user, prompt, model, endpoint, memoryContent) {
  // Generate message IDs for proper conversation threading
  const { v4: uuidv4 } = require('uuid');
  const userMessageId = uuidv4();

  const { logger } = require('~/config');

  // Debug: Log MCP context being passed
  const availableTools = context.mcp.availableTools || {};
  const { ToolMetadataUtils } = require('librechat-data-provider');
  const mcpToolsCount = Object.entries(availableTools).filter(([toolName, toolDef]) =>
    ToolMetadataUtils.isMCPTool(toolDef),
  ).length;

  logger.info(
    `[createMockRequestForWorkflow] MCP context: availableTools=${Object.keys(availableTools).length}, mcpTools=${mcpToolsCount}`,
  );

  // Add workflow automation instruction to every prompt
  let enhancedPrompt = prompt + '\n\nIMPORTANT: You are running in an automated workflow environment. NEVER ask the user for input, confirmation, or clarification. Work autonomously with the provided information.';
  
  // Add memory content if provided
  if (memoryContent) {
    const { memoryInstructions } = require('@librechat/api');
    enhancedPrompt = enhancedPrompt + `${memoryInstructions}\n\n# Existing memory about the user:\n${memoryContent}`;
    logger.info(`[createMockRequestForWorkflow] Added memory content to workflow prompt`);
  }

  return {
    user: user,
    body: {
      endpoint: endpoint,
      model: model,
      userMessageId: userMessageId,
      parentMessageId: context.workflow?.parentMessageId,
      conversationId: context.workflow?.conversationId,
      promptPrefix: enhancedPrompt,
      ephemeralAgent: null, // Will be set later
    },
    app: {
      locals: {
        availableTools: availableTools, // Enhanced tools with embedded metadata
        fileStrategy: 'local', // Add default file strategy
        // Add memory config for workflow execution
        memory: context.memoryConfig || {},
      },
    },
  };
}

/**
 * Extract MCP server names from available tools
 * @param {Object} availableTools - Available tools registry
 * @returns {string[]} Array of MCP server names
 */
function extractMCPServerNames(availableTools) {
  const { Constants } = require('librechat-data-provider');
  const mcpServerNames = [];
  const availableToolKeys = Object.keys(availableTools || {});

  for (const toolKey of availableToolKeys) {
    if (toolKey.includes(Constants.mcp_delimiter)) {
      const serverName = toolKey.split(Constants.mcp_delimiter)[1];
      if (serverName && !mcpServerNames.includes(serverName)) {
        mcpServerNames.push(serverName);
      }
    }
  }

  logger.debug(`[WorkflowExecutorUtils] Found MCP server names: ${mcpServerNames.join(', ')}`);
  return mcpServerNames;
}

/**
 * Extract response text from agent response
 * @param {Object} response - Agent response
 * @returns {*} Full response with tool calls and text
 */
function extractResponseText(response) {
  if (typeof response === 'string') {
    return response;
  }

  // Return the full response object to preserve tool calls and results
  if (response && typeof response === 'object') {
    return response;
  }

  // Fallback for other response formats
  if (response.text) {
    return response.text;
  }

  if (response.message) {
    return response.message;
  }

  if (response.content) {
    return response.content;
  }

  // If response is an object, return it as-is
  return response;
}

/**
 * Load memory for workflow execution
 * @param {Object} user - User object
 * @param {Object} conversationId - Conversation ID
 * @param {Object} messageId - Message ID  
 * @param {Object} req - Request object with app locals
 * @returns {Promise<string|undefined>} Memory content or undefined
 */
async function loadWorkflowMemory(user, conversationId, messageId, req) {
  const { logger } = require('~/config');
  
  try {
    // Check if user has memory enabled
    if (user.personalization?.memories === false) {
      return;
    }

    // Check permissions
    const { PermissionTypes, Permissions } = require('librechat-data-provider');
    const { checkAccess } = require('~/server/middleware/roles/access');
    const hasAccess = await checkAccess(user, PermissionTypes.MEMORIES, [Permissions.USE]);

    if (!hasAccess) {
      logger.debug(
        `[loadWorkflowMemory] User ${user.id} does not have USE permission for memories`,
      );
      return;
    }

    // Get memory config from app locals
    const memoryConfig = req?.app?.locals?.memory;
    if (!memoryConfig || memoryConfig.disabled === true) {
      return;
    }

    // Load agent for memory processing  
    const { EModelEndpoint, Constants } = require('librechat-data-provider');
    const { loadAgent } = require('~/models/Agent');
    const { initializeAgent } = require('~/server/services/Endpoints/agents/agent');

    let prelimAgent;
    const allowedProviders = new Set(
      req?.app?.locals?.[EModelEndpoint.agents]?.allowedProviders,
    );

    try {
      if (memoryConfig.agent?.id != null) {
        prelimAgent = await loadAgent({
          req: req,
          agent_id: memoryConfig.agent.id,
          endpoint: EModelEndpoint.agents,
        });
      } else if (
        memoryConfig.agent?.id == null &&
        memoryConfig.agent?.model != null &&
        memoryConfig.agent?.provider != null
      ) {
        prelimAgent = { id: Constants.EPHEMERAL_AGENT_ID, ...memoryConfig.agent };
      }
    } catch (error) {
      logger.error('[loadWorkflowMemory] Error loading agent for memory', error);
    }

    const agent = await initializeAgent({
      req: req,
      res: null, // No response object for workflow execution
      agent: prelimAgent,
      allowedProviders,
    });

    if (!agent) {
      logger.warn('[loadWorkflowMemory] No agent found for memory', memoryConfig);
      return;
    }

    const llmConfig = Object.assign(
      {
        provider: agent.provider,
        model: agent.model,
      },
      agent.model_parameters,
    );

    // Create memory processor config
    const config = {
      validKeys: memoryConfig.validKeys,
      instructions: agent.instructions,
      llmConfig,
      tokenLimit: memoryConfig.tokenLimit,
    };

    const userId = user.id + '';
    const messageIdStr = messageId + '';
    const conversationIdStr = conversationId + '';

    // Load memory processor
    const { createMemoryProcessor } = require('@librechat/api');
    const { setMemory, deleteMemory, getFormattedMemories } = require('~/models');

    const [withoutKeys] = await createMemoryProcessor({
      userId,
      config,
      messageId: messageIdStr,
      conversationId: conversationIdStr,
      memoryMethods: {
        setMemory,
        deleteMemory,
        getFormattedMemories,
      },
      res: null, // No response object for workflow execution
    });

    logger.info(`[loadWorkflowMemory] Successfully loaded memory for user ${user.id}`);
    return withoutKeys;
  } catch (error) {
    logger.error('[loadWorkflowMemory] Error loading memory:', error);
    return;
  }
}

module.exports = {
  getFullStepResult,
  getConfiguredModelAndEndpoint,
  findFirstStep,
  createSerializableContext,
  createMockRequestForWorkflow,
  extractMCPServerNames,
  extractResponseText,
  loadWorkflowMemory,
};
