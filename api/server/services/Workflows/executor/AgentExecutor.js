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
async function executeStepWithAgent(step, prompt, context, userId) {
  logger.info(`[AgentExecutor] Executing step with fresh agent (MCP tools enabled): "${step.name}"`);

  try {
    // Create a fresh agent for this step execution
    const { client, model, endpoint } = await createFreshAgent(context.workflow, step, context);

    // Use the full user object from context (has authentication) for agent creation
    const user = context.user || { id: userId };

    // Execute with the fresh agent - pass prompt as first parameter, options as second
    // Note: sendMessage expects user ID as string, not the full user object
    const response = await client.sendMessage(prompt, {
      user: user.id || userId, // Pass just the user ID string
      conversationId: context.workflow?.conversationId,
      parentMessageId: context.workflow?.parentMessageId,
      isEdited: false,
      isContinued: false,
      isRegenerate: false,
    });

    // Extract clean response text
    const responseText = extractResponseText(response);

    logger.info(`[AgentExecutor] Step "${step.name}" completed successfully with fresh agent`);

    return {
      status: 'success',
      message: `Successfully executed step "${step.name}" with fresh agent using ${endpoint}/${model}`,
      agentResponse: response,
      toolsUsed: Object.keys(context.mcp?.availableTools || {}),
      mcpToolsCount: context.mcp?.toolCount || 0,
      modelUsed: model,
      endpointUsed: endpoint,
      timestamp: new Date().toISOString(),
      responseMessageId: response.messageId,
      conversationId: response.conversationId,
    };
  } catch (error) {
    logger.error(`[AgentExecutor] Error executing step "${step.name}" with agent:`, error);
    throw new Error(`Agent execution failed for step "${step.name}": ${error.message}`);
  }
}

/**
 * Execute a step using a fresh agent without any tools (for reasoning tasks)
 * @param {Object} step - Workflow step
 * @param {string} prompt - Task prompt
 * @param {Object} context - Execution context
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Execution result
 */
async function executeStepWithAgentNoTool(step, prompt, context, userId) {
  logger.info(`[AgentExecutor] Executing step with fresh agent (no tools): "${step.name}"`);

  try {
    // Create a fresh agent for this step execution (without tools)
    const { client, model, endpoint } = await createFreshAgent(context.workflow, step, context, false);

    // Use the full user object from context (has authentication) for agent creation
    const user = context.user || { id: userId };

    // Execute with the fresh agent (no tools available) - pass prompt as first parameter, options as second
    // Note: sendMessage expects user ID as string, not the full user object
    const response = await client.sendMessage(prompt, {
      user: user.id || userId, // Pass just the user ID string
      conversationId: context.workflow?.conversationId,
      parentMessageId: context.workflow?.parentMessageId,
      isEdited: false,
      isContinued: false,
      isRegenerate: false,
    });

    // Extract clean response text
    const responseText = extractResponseText(response);

    logger.info(`[AgentExecutor] Step "${step.name}" completed successfully with fresh agent (no tools)`);

    return {
      status: 'success',
      message: `Successfully executed step "${step.name}" with fresh agent (no tools) using ${endpoint}/${model}`,
      agentResponse: response,
      toolsUsed: [], // No tools available for this execution
      mcpToolsCount: 0,
      modelUsed: model,
      endpointUsed: endpoint,
      timestamp: new Date().toISOString(),
      responseMessageId: response.messageId,
      conversationId: response.conversationId,
    };
  } catch (error) {
    logger.error(`[AgentExecutor] Error executing step "${step.name}" with agent (no tools):`, error);
    throw new Error(`Agent execution failed for step "${step.name}": ${error.message}`);
  }
}

/**
 * Create a fresh agent for step execution
 * @param {Object} workflow - Workflow data
 * @param {Object} step - Current step
 * @param {Object} context - Execution context
 * @param {boolean} includeMCP - Whether to include MCP tools (default: true)
 * @returns {Promise<Object>} Fresh agent client and configuration
 */
async function createFreshAgent(workflow, step, context, includeMCP = true) {
  logger.debug(`[AgentExecutor] Creating fresh agent for step "${step.name}" (MCP: ${includeMCP})`);

  try {
    // Get the workflow's configured model and endpoint
    const { model, endpoint } = await getConfiguredModelAndEndpoint(workflow);

    // Create fresh client factory instance
    const clientFactory = new SchedulerClientFactory();

    // Use the full user object from context for proper authentication
    const user = context.user || { id: context.execution?.user || 'unknown' };

    // Prepare mock request for client creation
    const mockReq = createMockRequestForWorkflow(context, user, '', model, endpoint);

    // Only include MCP tools if requested and available
    const availableTools = includeMCP && context.mcp?.availableTools ? context.mcp.availableTools : {};

    // Configure the request with tools if available
    if (includeMCP && Object.keys(availableTools).length > 0) {
      mockReq.body.tools = availableTools;
      mockReq.app.locals.availableTools = availableTools;
      logger.debug(`[AgentExecutor] Created fresh agent with ${Object.keys(availableTools).length} MCP tools`);
    } else {
      mockReq.body.tools = {};
      mockReq.app.locals.availableTools = {};
      logger.debug(`[AgentExecutor] Created fresh agent with no tools`);
    }

    // Create endpoint option
    const endpointOption = {
      endpoint,
      model,
      // Include agent configuration if workflow was created from an agent
      ...(workflow.agent_id && { agent_id: workflow.agent_id }),
    };

    // Create fresh client instance using the correct method
    const clientResult = await clientFactory.initializeClient({
      req: mockReq,
      res: createMinimalMockResponse(),
      endpointOption,
    });

    const client = clientResult.client;

    if (!client) {
      throw new Error('Failed to initialize client for fresh agent');
    }

    logger.info(`[AgentExecutor] Fresh agent created for step "${step.name}": ${endpoint}/${model} (MCP: ${includeMCP})`);

    return { client, model, endpoint };
  } catch (error) {
    logger.error(`[AgentExecutor] Failed to create fresh agent for step "${step.name}":`, error);
    throw new Error(`Failed to create fresh agent: ${error.message}`);
  }
}

module.exports = {
  executeStepWithAgent,
  executeStepWithAgentNoTool,
}; 