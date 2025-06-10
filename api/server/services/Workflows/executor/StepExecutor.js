const { logger } = require('~/config');
const { updateSchedulerExecution } = require('~/models/SchedulerExecution');
const { createTaskPromptForStep } = require('./PromptBuilder');
const { executeStepWithAgent, executeStepWithAgentNoTool } = require('./AgentExecutor');
const { getFullStepResult } = require('./utils');

/**
 * Execute an MCP agent action step
 * @param {Object} step - The action step
 * @param {Object} context - Execution context
 * @param {string} userId - User ID for the execution
 * @returns {Promise<Object>} Step result
 */
async function executeMCPAgentActionStep(step, context, userId) {
  logger.info(`[WorkflowStepExecutor] Executing MCP agent action step: "${step.name}"`);

  // Check if MCP tools are available
  if (!context.mcp?.available || context.mcp.toolCount === 0) {
    throw new Error(`No MCP tools available for step "${step.name}". Please configure MCP servers.`);
  }

  logger.info(
    `[WorkflowStepExecutor] Using fresh agent with ${context.mcp.toolCount} MCP tools for step "${step.name}"`,
  );

  // Create a task prompt based on the step
  const taskPrompt = createTaskPromptForStep(step, context);

  // Execute using fresh agent with MCP tools
  const result = await executeStepWithAgent(step, taskPrompt, context, userId);

  return {
    type: 'mcp_agent_action',
    stepName: step.name,
    prompt: taskPrompt,
    ...result,
  };
}

/**
 * Execute an agent action step without tools (for reasoning tasks)
 * @param {Object} step - The action step
 * @param {Object} context - Execution context
 * @param {string} userId - User ID for the execution
 * @returns {Promise<Object>} Step result
 */
async function executeAgentActionNoToolStep(step, context, userId) {
  logger.info(`[WorkflowStepExecutor] Executing agent action (no tool) step: "${step.name}"`);

  // Create a task prompt based on the step
  const taskPrompt = createTaskPromptForStep(step, context);

  // Execute using fresh agent without any tools
  const result = await executeStepWithAgentNoTool(step, taskPrompt, context, userId);

  return {
    type: 'agent_action_no_tool',
    stepName: step.name,
    prompt: taskPrompt,
    ...result,
  };
}

/**
 * Execute a single workflow step
 * @param {Object} workflow - The workflow
 * @param {Object} execution - The execution record
 * @param {Object} step - The step to execute
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Step execution result
 */
async function executeStep(workflow, execution, step, context) {
  // Dynamically import SchedulerService to avoid circular dependencies
  const SchedulerService = require('~/server/services/Scheduler/SchedulerService');

  // Validate step type - support both mcp_agent_action and agent_action_no_tool
  const validStepTypes = ['mcp_agent_action', 'agent_action_no_tool'];
  if (!validStepTypes.includes(step.type)) {
    throw new Error(`Unsupported step type: ${step.type}. Supported types: ${validStepTypes.join(', ')}`);
  }

  // Send notification that step is starting
  try {
    await SchedulerService.sendWorkflowStatusUpdate({
      userId: execution.user,
      workflowName: workflow.name,
      workflowId: workflow.id,
      notificationType: 'step_started',
      details: `Executing step: ${step.name}`,
      stepData: {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        status: 'running',
      },
    });
  } catch (notificationError) {
    logger.warn(
      `[WorkflowStepExecutor] Failed to send step start notification: ${notificationError.message}`,
    );
  }

  const stepExecutionData = {
    stepId: step.id,
    stepName: step.name,
    stepType: step.type,
    status: 'running',
    startTime: new Date(),
    input: step.config,
    retryCount: 0,
  };

  await updateSchedulerExecution(execution.id, execution.user, stepExecutionData);

  try {
    let result;

    // Execute step based on type
    if (step.type === 'mcp_agent_action') {
      // Execute MCP agent action step with tools
      result = await executeMCPAgentActionStep(step, context, execution.user);
    } else if (step.type === 'agent_action_no_tool') {
      // Execute agent action step without tools (reasoning only)
      result = await executeAgentActionNoToolStep(step, context, execution.user);
    }

    // Update step execution with success
    await updateSchedulerExecution(execution.id, execution.user, {
      currentStepId: step.id,
    });

    // Send notification that step completed successfully
    try {
      await SchedulerService.sendWorkflowStatusUpdate({
        userId: execution.user,
        workflowName: workflow.name,
        workflowId: workflow.id,
        notificationType: 'step_completed',
        details: `Step completed: ${step.name}`,
        stepData: {
          stepId: step.id,
          stepName: step.name,
          stepType: step.type,
          status: 'completed',
          result: getFullStepResult(result),
        },
      });
    } catch (notificationError) {
      logger.warn(
        `[WorkflowStepExecutor] Failed to send step completion notification: ${notificationError.message}`,
      );
    }

    logger.info(`[WorkflowStepExecutor] Step completed: ${step.name}`);
    return {
      success: true,
      result: result,
      stepId: step.id,
      responseMessageId: result.responseMessageId,
    };
  } catch (error) {
    logger.error(`[WorkflowStepExecutor] Step failed: ${step.name}`, error);

    // Update step execution with failure
    await updateSchedulerExecution(execution.id, execution.user, {
      currentStepId: step.id,
      error: error.message,
    });

    // Send notification that step failed
    try {
      await SchedulerService.sendWorkflowStatusUpdate({
        userId: execution.user,
        workflowName: workflow.name,
        workflowId: workflow.id,
        notificationType: 'step_failed',
        details: `Step failed: ${step.name} - ${error.message}`,
        stepData: {
          stepId: step.id,
          stepName: step.name,
          stepType: step.type,
          status: 'failed',
          error: error.message,
        },
      });
    } catch (notificationError) {
      logger.warn(
        `[WorkflowStepExecutor] Failed to send step failure notification: ${notificationError.message}`,
      );
    }

    return {
      success: false,
      error: error.message,
      result: null,
      stepId: step.id,
    };
  }
}

module.exports = {
  executeStep,
}; 