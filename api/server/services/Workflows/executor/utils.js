const { EModelEndpoint } = require('librechat-data-provider');
const { getCustomConfig } = require('~/server/services/Config/getCustomConfig');
const { logger } = require('~/config');

/**
 * Summarize step result for logging and context
 * @param {*} result - Step result to summarize
 * @returns {string} Summary of the result
 */
function summarizeStepResult(result) {
  if (typeof result === 'string') {
    return result.length > 200 ? result.substring(0, 200) + '...' : result;
  }

  if (typeof result === 'object' && result !== null) {
    // For objects, provide a brief summary
    if (Array.isArray(result)) {
      return `Array with ${result.length} items: ${JSON.stringify(result.slice(0, 2))}${
        result.length > 2 ? '...' : ''
      }`;
    } else {
      const keys = Object.keys(result);
      if (keys.length > 5) {
        return `Object with keys: ${keys.slice(0, 5).join(', ')}... (${keys.length} total)`;
      } else {
        return JSON.stringify(result);
      }
    }
  }

  return JSON.stringify(result);
}

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
 * Resolve parameters by replacing context variables
 * @param {Object} parameters - Parameters with potential context references
 * @param {Object} context - Execution context
 * @returns {Object} Resolved parameters
 */
function resolveParameters(parameters, context) {
  const resolved = {};

  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      // Extract variable path (e.g., "{{steps.step1.result.data}}")
      const varPath = value.slice(2, -2).trim();
      resolved[key] = getValueFromPath(context, varPath);
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveParameters(value, context);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Get value from object path (e.g., "steps.step1.result.data")
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot-separated path
 * @returns {*} Value at path or undefined
 */
function getValueFromPath(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
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
 * Generate execution hints for a workflow step
 * @param {Object} step - Workflow step
 * @returns {Object} Execution hints
 */
function generateExecutionHints(step) {
  const hints = {
    expectedExecutionTime: 'fast', // fast, medium, slow
    retryable: true,
    criticalPath: false,
  };

  const stepName = step.name.toLowerCase();

  // Adjust hints based on step type and name
  if (step.type === 'action') {
    if (stepName.includes('create') || stepName.includes('post') || stepName.includes('publish')) {
      hints.expectedExecutionTime = 'medium';
      hints.criticalPath = true; // Creating content is usually critical
    } else if (stepName.includes('get') || stepName.includes('fetch')) {
      hints.expectedExecutionTime = 'fast';
    } else if (
      stepName.includes('analyze') ||
      stepName.includes('process') ||
      stepName.includes('compose')
    ) {
      hints.expectedExecutionTime = 'medium';
    }
  } else if (step.type === 'delay') {
    hints.expectedExecutionTime = 'slow';
    hints.retryable = false;
  }

  return hints;
}

/**
 * Create mock request object for workflow execution
 * @param {Object} context - Execution context
 * @param {Object} user - User object
 * @param {string} prompt - The prompt for the request
 * @param {string} model - The model for the request
 * @param {string} endpoint - The endpoint for the request
 * @returns {Object} Mock request object
 */
function createMockRequestForWorkflow(context, user, prompt, model, endpoint) {
  // Generate message IDs for proper conversation threading
  const { v4: uuidv4 } = require('uuid');
  const userMessageId = uuidv4();

  const { logger } = require('~/config');

  // Debug: Log MCP context being passed
  const mcpToolRegistry = context.mcp.mcpToolRegistry || new Map();
  logger.info(
    `[createMockRequestForWorkflow] MCP context: availableTools=${Object.keys(context.mcp.availableTools || {}).length}, mcpToolRegistry=${mcpToolRegistry.size}`,
  );
  if (mcpToolRegistry.size > 0) {
    const registryKeys = Array.from(mcpToolRegistry.keys()).slice(0, 5);
    logger.info(`[createMockRequestForWorkflow] Sample registry keys: ${registryKeys.join(', ')}`);
  }

  return {
    user: user,
    body: {
      endpoint: endpoint,
      model: model,
      userMessageId: userMessageId,
      parentMessageId: context.workflow?.parentMessageId,
      conversationId: context.workflow?.conversationId,
      promptPrefix: prompt,
      ephemeralAgent: null, // Will be set later
    },
    app: {
      locals: {
        availableTools: context.mcp.availableTools || {},
        mcpToolRegistry: mcpToolRegistry, // Include MCP tool registry
        fileStrategy: 'local', // Add default file strategy
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

module.exports = {
  summarizeStepResult,
  getFullStepResult,
  getConfiguredModelAndEndpoint,
  findFirstStep,
  resolveParameters,
  getValueFromPath,
  createSerializableContext,
  generateExecutionHints,
  createMockRequestForWorkflow,
  extractMCPServerNames,
  extractResponseText,
};
