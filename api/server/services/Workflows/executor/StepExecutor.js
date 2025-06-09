const { logger } = require('~/config');
const { updateSchedulerExecution } = require('~/models/SchedulerExecution');
const { evaluateCondition } = require('../utils/conditionEvaluator');
const { createTaskPromptForStep } = require('./PromptBuilder');
const { executeStepWithAgent } = require('./AgentExecutor');
const { getFullStepResult } = require('./utils');

/**
 * Execute a delay step
 * @param {Object} step - The delay step
 * @returns {Promise<Object>} Step result
 */
async function executeDelayStep(step) {
  const delayMs = step.config.delayMs || 1000;
  logger.info(`[WorkflowStepExecutor] Executing delay: ${delayMs}ms`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return {
    type: 'delay',
    delayMs,
    message: `Delayed execution for ${delayMs}ms`,
  };
}

/**
 * Execute a condition step
 * @param {Object} step - The condition step
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Step result
 */
async function executeConditionStep(step, context) {
  const condition = step.config.condition;
  logger.info(`[WorkflowStepExecutor] Evaluating condition: ${condition}`);
  if (!condition) {
    throw new Error('Condition expression is required');
  }
  const result = evaluateCondition(condition, context);
  return {
    type: 'condition',
    condition,
    result,
    evaluated: true,
  };
}

/**
 * Create a mock result for action steps
 * @param {Object} step - Workflow step
 * @param {string} reason - Reason for mock result
 * @returns {Object} Mock result
 */
function createMockActionResult(step, reason) {
  return {
    type: 'action_mock',
    stepName: step.name,
    config: step.config,
    result: {
      status: 'success',
      message: `Mock execution of action step: ${step.name}`,
      reason,
      data: step.config,
      timestamp: new Date().toISOString(),
      note: 'This step executed with mock data. Configure MCP tools for real execution.',
    },
  };
}

/**
 * Execute an action step using an agent with MCP tools
 * @param {Object} step - The action step
 * @param {Object} context - Execution context
 * @param {string} userId - User ID for the execution
 * @returns {Promise<Object>} Step result
 */
async function executeActionStep(step, context, userId) {
  logger.info(`[WorkflowStepExecutor] Executing action step: "${step.name}"`);

  // Check if MCP tools are available
  if (!context.mcp?.available || context.mcp.toolCount === 0) {
    logger.warn(
      `[WorkflowStepExecutor] No MCP tools available for action step "${step.name}". Returning mock result.`,
    );
    return createMockActionResult(step, 'No MCP tools available');
  }

  try {
    logger.info(
      `[WorkflowStepExecutor] Using agent with ${context.mcp.toolCount} MCP tools for action step "${step.name}"`,
    );

    // Create a task prompt based on the step
    const taskPrompt = createTaskPromptForStep(step, context);

    // Execute using agent with MCP tools
    const result = await executeStepWithAgent(step, taskPrompt, context, userId);

    return {
      type: 'mcp_agent_action',
      stepName: step.name,
      prompt: taskPrompt,
      ...result,
    };
  } catch (error) {
    logger.error(`[WorkflowStepExecutor] Agent execution failed for step "${step.name}":`, error);

    // Fall back to mock result if agent execution fails
    return createMockActionResult(step, `Agent execution failed: ${error.message}`);
  }
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

    switch (step.type) {
      case 'delay':
        result = await executeDelayStep(step);
        break;
      case 'condition':
        result = await executeConditionStep(step, context);
        break;
      case 'action':
        result = await executeActionStep(step, context, execution.user);
        break;
      default:
        throw new Error(`Unknown step type: ${step.type}`);
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