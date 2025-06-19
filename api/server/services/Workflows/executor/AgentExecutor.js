const { logger } = require('~/config');
const { Constants } = require('librechat-data-provider');
const { loadAgent } = require('~/models/Agent');
const {
  createMinimalMockResponse,
  updateRequestForEphemeralAgent,
} = require('~/server/services/Scheduler/utils/mockUtils');
const SchedulerClientFactory = require('~/server/services/Scheduler/SchedulerClientFactory');
const {
  getConfiguredModelAndEndpoint,
  createMockRequestForWorkflow,
  extractMCPServerNames,
  extractResponseText,
} = require('./utils');

/**
 * Execute a step using a fresh agent with MCP tools
 * @param {Object} step - Workflow step
 * @param {string} prompt - Task prompt
 * @param {Object} context - Execution context
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Execution result
 */
async function executeStepWithAgent(step, prompt, context, userId, abortSignal) {
  logger.info(`[WorkflowAgentExecutor] Executing step "${step.name}" with fresh agent`);

  // Check if execution has been cancelled
  if (abortSignal?.aborted) {
    throw new Error('Execution was cancelled by user');
  }

  try {
    // Always create a fresh agent for each step to prevent context bleeding
    const { agent, client, configuredModel, configuredEndpoint, endpointName } = await createFreshAgent(
      context.workflow,
      step,
      context,
    );

    if (!agent || !client) {
      throw new Error('Failed to create fresh agent and client for workflow step');
    }

    logger.info(
      `[WorkflowAgentExecutor] Created fresh agent for step "${step.name}" with ${
        agent.tools?.length || 0
      } tools using ${endpointName}/${configuredModel}`,
    );

    // Check if execution has been cancelled before sending message
    if (abortSignal?.aborted) {
      throw new Error('Execution was cancelled by user');
    }

    // Execute the step using the fresh agent
    const response = await client.sendMessage(prompt, {
      user: userId,
      conversationId: context.workflow?.conversationId,
      parentMessageId: context.workflow?.parentMessageId,
      abortSignal, // Pass abort signal to the client
      onProgress: (data) => {
        // Check for cancellation during progress
        if (abortSignal?.aborted) {
          throw new Error('Execution was cancelled by user');
        }
        logger.debug(
          `[WorkflowAgentExecutor] Agent progress for step "${step.name}":`,
          data?.text?.substring(0, 100),
        );
      },
    });

    if (!response) {
      throw new Error('No response received from agent');
    }

    logger.info(`[WorkflowAgentExecutor] Agent execution completed for step "${step.name}"`);

    // Extract response text from agent response
    const responseText = extractResponseText(response);

    return {
      status: 'success',
      message: `Successfully executed step "${step.name}" with fresh agent using ${endpointName}/${configuredModel}`,
      agentResponse: responseText,
      toolsUsed: agent.tools || [],
      mcpToolsCount:
        agent.tools?.filter((tool) => tool.includes(Constants.mcp_delimiter)).length || 0,
      modelUsed: configuredModel,
      endpointUsed: endpointName,
      timestamp: new Date().toISOString(),
      // Capture the response message ID for conversation threading
      responseMessageId: response.messageId || response.id,
      conversationId: context.workflow?.conversationId,
    };
  } catch (error) {
    logger.error(`[WorkflowAgentExecutor] Agent execution failed for step "${step.name}":`, error);
    throw error;
  }
}

/**
 * Create a fresh agent for a workflow step
 * @param {Object} workflow - Workflow object
 * @param {Object} step - Workflow step
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Agent, client, and configuration
 */
async function createFreshAgent(workflow, step, context) {
  const { user, mcp, workflow: workflowContext } = context;
  const userId = user.id;
  const { conversationId, parentMessageId } = workflowContext;

  logger.info(`[WorkflowAgentExecutor] Creating fresh agent for step "${step.name}"`);

  // Get the configured model and endpoint
  const config = await getConfiguredModelAndEndpoint(workflow);
  const { model: configuredModel, endpoint: configuredEndpoint, endpointName } = config;

  // Determine which agent to load
  const agentIdToLoad =
    workflow.endpoint === 'agents' && workflow.agent_id
      ? workflow.agent_id
      : Constants.EPHEMERAL_AGENT_ID;

  logger.info(`[WorkflowAgentExecutor] Determined agent for fresh agent creation: ${agentIdToLoad}`);

  // Create mock request for agent initialization
  const mockReq = createMockRequestForWorkflow(
    context,
    user,
    step.config.instruction || `Executing step: ${step.name}`,
    configuredModel,
    configuredEndpoint,
  );

  // If we are using an ephemeral agent, we need to set up its config
  if (agentIdToLoad === Constants.EPHEMERAL_AGENT_ID) {
    // Extract MCP server names from available tools
    const mcpServerNames = extractMCPServerNames(mcp.availableTools);

    // Create ephemeral agent configuration
    const ephemeralAgent = {
      workflow: true,
      execute_code: false,
      web_search: false,
      mcp: mcpServerNames,
    };

    updateRequestForEphemeralAgent(
      mockReq,
      {
        prompt: step.config.instruction || `Executing step: ${step.name}`,
        user: userId,
        conversation_id: conversationId,
        parent_message_id: parentMessageId,
      },
      ephemeralAgent,
      configuredEndpoint,
      configuredModel,
    );
  }

  // Load the agent
  const agent = await loadAgent({
    req: mockReq,
    agent_id: agentIdToLoad,
    endpoint: configuredEndpoint,
    model_parameters: { model: configuredModel },
  });

  if (!agent) {
    throw new Error('Failed to load agent for fresh agent creation');
  }

  // Filter out the workflows tool to prevent recursive workflow creation during execution
  if (agent.tools && Array.isArray(agent.tools)) {
    const originalToolCount = agent.tools.length;
    agent.tools = agent.tools.filter(tool => tool !== 'workflows');
    const filteredToolCount = agent.tools.length;
    
    if (originalToolCount > filteredToolCount) {
      logger.info(
        `[WorkflowAgentExecutor] Filtered out 'workflows' tool to prevent recursive workflow creation (${originalToolCount} -> ${filteredToolCount} tools)`
      );
    }
  }

  logger.info(
    `[WorkflowAgentExecutor] Loaded fresh agent with ${
      agent.tools?.length || 0
    } tools using ${endpointName}/${configuredModel}`,
  );

  // Initialize client factory and create agents endpoint option
  const clientFactory = new SchedulerClientFactory();
  const endpointOption = clientFactory.createAgentsEndpointOption(agent, configuredModel);

  // Disable automatic title generation to preserve our custom workflow execution title
  endpointOption.titleConvo = false;

  // Create minimal mock response for client initialization
  const mockRes = createMinimalMockResponse();

  // Initialize the agents client
  const clientResult = await clientFactory.initializeClient({
    req: mockReq,
    res: mockRes,
    endpointOption,
  });

  const client = clientResult.client;

  if (!client) {
    throw new Error('Failed to initialize agents client for fresh agent');
  }

  // Prevent conversation creation for workflow execution steps
  // Results are tracked in ExecutionDashboard instead
  client.skipSaveConvo = true;

  logger.info(`[WorkflowAgentExecutor] AgentClient initialized successfully for step "${step.name}" (conversation saving disabled)`);

  return { 
    agent, 
    client, 
    configuredModel, 
    configuredEndpoint, 
    endpointName 
  };
}

module.exports = {
  executeStepWithAgent,
}; 