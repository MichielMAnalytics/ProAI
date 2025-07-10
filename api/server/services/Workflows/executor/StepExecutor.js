const { logger } = require('~/config');
const { updateSchedulerExecution } = require('~/models/SchedulerExecution');
const { executeStepWithAgent } = require('./AgentExecutor');
const { getFullStepResult } = require('./utils');

/**
 * Execute an MCP agent action step
 * @param {Object} step - The action step
 * @param {Object} context - Execution context
 * @param {string} userId - User ID for the execution
 * @param {Array} stepMessages - Previous step messages for context
 * @param {AbortSignal} abortSignal - Abort signal
 * @returns {Promise<Object>} Step result
 */
async function executeMCPAgentActionStep(step, context, userId, stepMessages, abortSignal) {
  logger.info(`[WorkflowStepExecutor] Executing MCP agent action step: "${step.name}" (agent_id: ${step.agent_id || 'ephemeral'})`);

  // Check if execution has been cancelled
  if (abortSignal?.aborted) {
    throw new Error('Execution was cancelled by user');
  }

  // Check if MCP tools are available
  if (!context.mcp?.available || context.mcp.toolCount === 0) {
    throw new Error(
      `No MCP tools available for step "${step.name}". Please configure MCP servers.`,
    );
  }

  logger.info(
    `[WorkflowStepExecutor] Using fresh agent with ${context.mcp.toolCount} MCP tools for step "${step.name}"`,
  );

  // Execute using fresh agent with enhanced context (stepMessages array)
  const result = await executeStepWithAgent(step, stepMessages, context, userId, abortSignal);

  return {
    type: 'mcp_agent_action',
    stepName: step.name,
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
async function executeStep(workflow, execution, step, context, abortSignal) {
  // Dynamically import SchedulerService to avoid circular dependencies
  const SchedulerService = require('~/server/services/Scheduler/SchedulerService');

  // Check if execution has been cancelled
  if (abortSignal?.aborted) {
    throw new Error('Execution was cancelled by user');
  }

  // Validate step type - only mcp_agent_action is supported
  if (step.type !== 'mcp_agent_action') {
    throw new Error(`Unsupported step type: ${step.type}. Only 'mcp_agent_action' is supported.`);
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
    // Check if execution has been cancelled before executing step
    if (abortSignal?.aborted) {
      throw new Error('Execution was cancelled by user');
    }

    // Execute the MCP agent action step with stepMessages context
    const stepMessages = context.stepMessages || [];
    const result = await executeMCPAgentActionStep(step, context, execution.user, stepMessages, abortSignal);

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

    logger.info(`[WorkflowStepExecutor] Step completed: ${step.name} (agent_id: ${step.agent_id || 'ephemeral'})`);
    return {
      success: true,
      result: result,
      stepId: step.id,
      responseMessageId: result.responseMessageId,
    };
  } catch (error) {
    logger.error(`[WorkflowStepExecutor] Step failed: ${step.name} (agent_id: ${step.agent_id || 'ephemeral'})`, error);

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
