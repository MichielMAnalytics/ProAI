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
 * Execute a step using agent with MCP tools (reuses workflow-level agent when available)
 * @param {Object} step - Workflow step
 * @param {string} prompt - Task prompt
 * @param {Object} context - Execution context
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Execution result
 */
async function executeStepWithAgent(step, prompt, context, userId) {
  logger.info(`[WorkflowAgentExecutor] Executing step "${step.name}" with agent`);

  try {
    let agent, client, configuredModel, configuredEndpoint, endpointName;

    // Force fresh agent for steps with specific tool requirements to prevent confusion
    const requiresFreshAgent = step.config.toolName && step.config.toolName.length > 0;

    // Check if we have a workflow-level agent and client to reuse (only if not forcing fresh agent)
    if (!requiresFreshAgent && context.workflow?.agent && context.workflow?.client) {
      // Reuse workflow-level agent and client
      agent = context.workflow.agent;
      client = context.workflow.client;

      // Get the configured model and endpoint info for logging
      const config = await getConfiguredModelAndEndpoint(context.workflow);
      configuredModel = config.model;
      configuredEndpoint = config.endpoint;
      endpointName = config.endpointName;

      logger.info(
        `[WorkflowAgentExecutor] Reusing workflow-level agent with ${
          agent.tools?.length || 0
        } tools for step "${step.name}"`,
      );
    } else {
      // Create fresh agent (either no workflow-level agent or step requires fresh context)
      if (requiresFreshAgent) {
        logger.info(
          `[WorkflowAgentExecutor] Creating fresh agent for step "${step.name}" (requires specific tool: ${step.config.toolName})`,
        );
      } else {
        logger.warn(
          `[WorkflowAgentExecutor] No workflow-level agent available, initializing new agent for step "${step.name}"`,
        );
      }

      // Get the configured model and endpoint
      const config = await getConfiguredModelAndEndpoint(context.workflow);
      configuredModel = config.model;
      configuredEndpoint = config.endpoint;
      endpointName = config.endpointName;

      // Create mock request and setup ephemeral agent (similar to scheduler)
      const mockReq = createMockRequestForWorkflow(
        context,
        userId,
        prompt,
        configuredModel,
        configuredEndpoint,
      );

      // Extract MCP server names from available tools
      const mcpServerNames = extractMCPServerNames(context.mcp.availableTools);

      // Create ephemeral agent configuration
      const ephemeralAgent = {
        workflow: true,
        execute_code: false,
        web_search: false,
        mcp: mcpServerNames,
      };

      // Update request for ephemeral agent
      const underlyingEndpoint = configuredEndpoint;
      const underlyingModel = configuredModel;

      updateRequestForEphemeralAgent(
        mockReq,
        {
          prompt,
          user: userId,
          conversation_id: context.workflow?.conversationId,
          parent_message_id: context.workflow?.parentMessageId,
        },
        ephemeralAgent,
        underlyingEndpoint,
        underlyingModel,
      );

      // Load ephemeral agent
      agent = await loadAgent({
        req: mockReq,
        agent_id: Constants.EPHEMERAL_AGENT_ID,
        endpoint: underlyingEndpoint,
        model_parameters: { model: underlyingModel },
      });

      if (!agent) {
        throw new Error('Failed to load ephemeral agent for workflow step');
      }

      logger.info(
        `[WorkflowAgentExecutor] Loaded ${
          requiresFreshAgent ? 'fresh' : 'ephemeral'
        } agent with ${
          agent.tools?.length || 0
        } tools using ${endpointName}/${underlyingModel}`,
      );

      // Initialize client factory and create agents endpoint option
      const clientFactory = new SchedulerClientFactory();
      const endpointOption = clientFactory.createAgentsEndpointOption(agent, underlyingModel);

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

      client = clientResult.client;

      if (!client) {
        throw new Error('Failed to initialize agents client for workflow step');
      }

      logger.info(`[WorkflowAgentExecutor] AgentClient initialized successfully for step "${step.name}"`);

      // For steps requiring fresh context, don't store the agent in workflow context
      if (!requiresFreshAgent) {
        // Store the agent and client in workflow context for reuse in subsequent steps
        context.workflow.agent = agent;
        context.workflow.client = client;
      }
    }

    // Execute the step using the agent (either reused or newly created)
    const response = await client.sendMessage(prompt, {
      user: userId,
      conversationId: context.workflow?.conversationId,
      parentMessageId: context.workflow?.parentMessageId,
      onProgress: (data) => {
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
      message: `Successfully executed step "${step.name}" with ${
        requiresFreshAgent ? 'fresh' : context.workflow?.agent ? 'reused workflow-level' : 'new'
      } agent using ${endpointName}/${configuredModel}`,
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

module.exports = {
  executeStepWithAgent,
}; 