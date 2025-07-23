const { logger } = require('~/config');
const WorkflowService = require('~/server/services/Workflows/WorkflowService');
const { getSchedulerTasksByUser } = require('~/models/SchedulerTask');
const { getSchedulerExecutionsByTask } = require('~/models/SchedulerExecution');

/**
 * Get all workflows for the authenticated user
 * @route GET /workflows
 * @returns {object} Array of user workflows
 */
const getUserWorkflows = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isActive, isDraft } = req.query;

    const filters = {};
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    if (isDraft !== undefined) {
      filters.isDraft = isDraft === 'true';
    }

    const workflowService = new WorkflowService();
    const workflows = await workflowService.getUserWorkflows(userId, filters);

    const mappedWorkflows = workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      trigger: workflow.trigger,
      steps: workflow.steps,
      type: workflow.type,
      isActive: workflow.isActive,
      isDraft: workflow.isDraft,
      conversation_id: workflow.conversation_id,
      parent_message_id: workflow.parent_message_id,
      endpoint: workflow.endpoint,
      ai_model: workflow.ai_model,
      agent_id: workflow.agent_id,
      last_run: workflow.last_run,
      next_run: workflow.next_run,
      run_count: workflow.run_count,
      success_count: workflow.success_count,
      failure_count: workflow.failure_count,
      version: workflow.version,
      created_from_agent: workflow.created_from_agent,
      artifact_identifier: workflow.artifact_identifier,
      dedicatedConversationId: workflow.metadata?.dedicatedConversationId, // Expose dedicated conversation ID
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    }));

    res.json({
      success: true,
      workflows: mappedWorkflows,
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting user workflows:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get a specific workflow by ID
 * @route GET /workflows/:workflowId
 * @param {string} workflowId - The workflow ID
 * @returns {object} Workflow details
 */
const getWorkflowById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;

    const workflowService = new WorkflowService();
    const workflow = await workflowService.getWorkflowById(workflowId, userId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    res.json({
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        trigger: workflow.trigger,
        steps: workflow.steps,
        type: workflow.type,
        isActive: workflow.isActive,
        isDraft: workflow.isDraft,
        conversation_id: workflow.conversation_id,
        parent_message_id: workflow.parent_message_id,
        endpoint: workflow.endpoint,
        ai_model: workflow.ai_model,
        agent_id: workflow.agent_id,
        last_run: workflow.last_run,
        next_run: workflow.next_run,
        run_count: workflow.run_count,
        success_count: workflow.success_count,
        failure_count: workflow.failure_count,
        version: workflow.version,
        created_from_agent: workflow.created_from_agent,
        artifact_identifier: workflow.artifact_identifier,
        dedicatedConversationId: workflow.metadata?.dedicatedConversationId, // Expose dedicated conversation ID
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Create a new workflow
 * @route POST /workflows
 * @returns {object} Created workflow
 */
const createWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const workflowData = req.body;

    const workflowService = new WorkflowService();
    const workflow = await workflowService.createWorkflow(workflowData, userId);

    res.status(201).json({
      success: true,
      message: `Workflow "${workflow.name}" created successfully`,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        trigger: workflow.trigger,
        steps: workflow.steps,
        type: workflow.type,
        isActive: workflow.isActive,
        isDraft: workflow.isDraft,
        version: workflow.version,
        created_from_agent: workflow.created_from_agent,
        dedicatedConversationId: workflow.metadata?.dedicatedConversationId, // Expose dedicated conversation ID
      },
    });
  } catch (error) {
    logger.error('[WorkflowController] Error creating workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Update a workflow
 * @route PUT /workflows/:workflowId
 * @param {string} workflowId - The workflow ID
 * @returns {object} Updated workflow
 */
const updateWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;
    const updateData = req.body;

    const workflowService = new WorkflowService();
    const updatedWorkflow = await workflowService.updateWorkflow(workflowId, userId, updateData);

    if (!updatedWorkflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    res.json({
      success: true,
      message: `Workflow "${updatedWorkflow.name}" updated successfully`,
      workflow: {
        id: updatedWorkflow.id,
        name: updatedWorkflow.name,
        trigger: updatedWorkflow.trigger,
        steps: updatedWorkflow.steps,
        type: updatedWorkflow.type,
        isActive: updatedWorkflow.isActive,
        isDraft: updatedWorkflow.isDraft,
        version: updatedWorkflow.version,
        next_run: updatedWorkflow.next_run,
        dedicatedConversationId: updatedWorkflow.metadata?.dedicatedConversationId, // Expose dedicated conversation ID
      },
    });
  } catch (error) {
    logger.error('[WorkflowController] Error updating workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Delete a workflow
 * @route DELETE /workflows/:workflowId
 * @param {string} workflowId - The workflow ID
 * @returns {object} Success response
 */
const deleteWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;

    const workflowService = new WorkflowService();
    const success = await workflowService.deleteWorkflow(workflowId, userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    res.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error) {
    logger.error('[WorkflowController] Error deleting workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Activate a workflow
 * @route POST /workflows/:workflowId/activate
 * @param {string} workflowId - The workflow ID
 * @returns {object} Updated workflow
 */
const activateWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;

    const workflowService = new WorkflowService();
    const workflow = await workflowService.toggleWorkflow(workflowId, userId, true);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    // Check if trigger is 'manual' - if so, execute immediately using same path as cron
    if (workflow.trigger?.type === 'manual') {
      logger.info(
        `[WorkflowController] Manual workflow "${workflow.name}" activated - executing immediately via scheduler`,
      );

      try {
        // Use SchedulerTaskExecutor to execute the workflow (same as cron execution)
        const SchedulerTaskExecutor = require('~/server/services/Scheduler/SchedulerTaskExecutor');
        const taskExecutor = new SchedulerTaskExecutor();

        // Get the scheduler task for this workflow
        const { getSchedulerTaskById } = require('~/models/SchedulerTask');
        const schedulerTask = await getSchedulerTaskById(workflowId, userId);

        if (!schedulerTask) {
          throw new Error('Scheduler task not found for workflow');
        }

        // Execute using the same method as cron jobs
        const executionResult = await taskExecutor.executeTask(schedulerTask);

        res.json({
          success: true,
          message: `Workflow "${workflow.name}" executed successfully`,
          workflow: {
            id: workflow.id,
            name: workflow.name,
            isActive: workflow.isActive,
            isDraft: workflow.isDraft,
            dedicatedConversationId: workflow.metadata?.dedicatedConversationId,
          },
          execution: {
            executed: true,
            result: executionResult,
          },
        });
      } catch (executionError) {
        logger.error(
          `[WorkflowController] Error executing manual workflow "${workflow.name}":`,
          executionError,
        );

        // Return failure since execution failed
        res.status(500).json({
          success: false,
          message: `Workflow "${workflow.name}" execution failed`,
          workflow: {
            id: workflow.id,
            name: workflow.name,
            isActive: workflow.isActive,
            isDraft: workflow.isDraft,
            dedicatedConversationId: workflow.metadata?.dedicatedConversationId,
          },
          execution: {
            executed: false,
            error: executionError.message,
          },
        });
      }
    } else {
      // For non-manual triggers (scheduled, etc.), just activate normally
      res.json({
        success: true,
        message: `Workflow "${workflow.name}" activated successfully`,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          isActive: workflow.isActive,
          isDraft: workflow.isDraft,
          dedicatedConversationId: workflow.metadata?.dedicatedConversationId,
        },
      });
    }
  } catch (error) {
    logger.error('[WorkflowController] Error activating workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Deactivate a workflow
 * @route POST /workflows/:workflowId/deactivate
 * @param {string} workflowId - The workflow ID
 * @returns {object} Updated workflow
 */
const deactivateWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;

    const workflowService = new WorkflowService();
    const workflow = await workflowService.toggleWorkflow(workflowId, userId, false);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    res.json({
      success: true,
      message: `Workflow "${workflow.name}" deactivated successfully`,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        isActive: workflow.isActive,
        isDraft: workflow.isDraft,
        dedicatedConversationId: workflow.metadata?.dedicatedConversationId, // Expose dedicated conversation ID
      },
    });
  } catch (error) {
    logger.error('[WorkflowController] Error deactivating workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Test execute a workflow using the same execution path as real manual workflows
 * @route POST /workflows/:workflowId/test
 * @param {string} workflowId - The workflow ID
 * @returns {object} Execution result
 */
const testWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;
    const { context = {} } = req.body;

    logger.info(
      `[WorkflowController] Testing workflow "${workflowId}" using SchedulerTaskExecutor (same as manual execution)`,
    );

    try {
      // Use SchedulerTaskExecutor to execute the workflow (same as manual workflow execution)
      const SchedulerTaskExecutor = require('~/server/services/Scheduler/SchedulerTaskExecutor');
      const taskExecutor = new SchedulerTaskExecutor();

      // Get the scheduler task for this workflow
      const { getSchedulerTaskById } = require('~/models/SchedulerTask');
      const schedulerTask = await getSchedulerTaskById(workflowId, userId);

      if (!schedulerTask) {
        throw new Error(
          'Scheduler task not found for workflow - workflow may not be properly configured',
        );
      }

      // Execute using the same method as real manual workflows but with test flag
      const executionResult = await taskExecutor.executeTask(schedulerTask, { isTest: true });

      res.json({
        success: true,
        message: 'Workflow test execution completed',
        result: executionResult,
        execution: {
          executed: true,
          isTest: true,
          result: executionResult,
        },
      });
    } catch (executionError) {
      logger.error(`[WorkflowController] Error testing workflow "${workflowId}":`, executionError);

      res.status(500).json({
        success: false,
        message: 'Workflow test execution failed',
        error: executionError.message,
        execution: {
          executed: false,
          isTest: true,
          error: executionError.message,
        },
      });
    }
  } catch (error) {
    logger.error('[WorkflowController] Error in testWorkflow controller:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Stop a running workflow test/execution
 * @route POST /workflows/:workflowId/stop
 * @param {string} workflowId - The workflow ID
 * @returns {object} Success response
 */
const stopWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;

    const workflowService = new WorkflowService();
    const result = await workflowService.stopWorkflow(workflowId, userId);

    res.json({
      success: true,
      message: 'Workflow execution stopped',
      result,
    });
  } catch (error) {
    logger.error('[WorkflowController] Error stopping workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Execute a workflow immediately
 * @route POST /workflows/:workflowId/execute
 * @param {string} workflowId - The workflow ID
 * @returns {object} Execution result
 */
const executeWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;
    const { context = {} } = req.body;

    // Include memory configuration and other app.locals in context
    const enhancedContext = {
      ...context,
      memoryConfig: req.app?.locals?.memory || {},
      agentsConfig: req.app?.locals?.agents || {},
    };

    const workflowService = new WorkflowService();
    const result = await workflowService.executeWorkflow(
      workflowId,
      userId,
      enhancedContext,
      false,
    );

    res.json({
      success: true,
      message: 'Workflow execution completed',
      result,
    });
  } catch (error) {
    logger.error('[WorkflowController] Error executing workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get workflow execution history
 * @route GET /workflows/:workflowId/executions
 * @param {string} workflowId - The workflow ID
 * @returns {object} Array of workflow executions
 */
const getWorkflowExecutions = async (req, res) => {
  try {
    const { workflowId } = req.params;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    logger.info(`[WorkflowController] Getting executions for workflow ${workflowId}`);

    // Get scheduler executions for this workflow
    const executions = await getSchedulerExecutionsByTask(workflowId, userId, limit);

    // Convert scheduler executions to workflow execution format
    const formattedExecutions = executions.map((exec) => ({
      id: exec.id,
      workflowId: exec.task_id || workflowId,
      workflowName: exec.context?.workflow?.name || 'Unknown Workflow',
      status: exec.status,
      trigger: exec.context?.trigger || { type: 'unknown' },
      result: exec.result,
      error: exec.error,
      duration:
        exec.duration ||
        (exec.end_time && exec.start_time
          ? new Date(exec.end_time) - new Date(exec.start_time)
          : null),
      startTime: exec.start_time,
      endTime: exec.end_time,
      isTest: exec.context?.isTest || false,
      steps: exec.steps || [],
      progress: exec.progress || { completedSteps: 0, totalSteps: 0, percentage: 0 },
      createdAt: exec.createdAt,
    }));

    res.status(200).json({
      success: true,
      message: `Found ${formattedExecutions.length} executions`,
      executions: formattedExecutions,
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting workflow executions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get latest execution result for a workflow
 * @route GET /workflows/:workflowId/latest-execution
 * @param {string} workflowId - The workflow ID
 * @returns {object} Latest execution result with step details
 */
const getLatestWorkflowExecution = async (req, res) => {
  try {
    const { workflowId } = req.params;
    const userId = req.user.id;

    logger.info(`[WorkflowController] Getting latest execution for workflow ${workflowId}`);

    // Get the most recent execution for this workflow
    const executions = await getSchedulerExecutionsByTask(workflowId, userId, 1);

    if (!executions || executions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No executions found for this workflow',
      });
    }

    const latestExecution = executions[0];

    // Format the execution result with full step details
    const formattedExecution = {
      id: latestExecution.id,
      workflowId: latestExecution.task_id || workflowId,
      workflowName: latestExecution.context?.workflow?.name || 'Unknown Workflow',
      status: latestExecution.status,
      trigger: latestExecution.context?.trigger || { type: 'unknown' },
      output: latestExecution.output,
      error: latestExecution.error,
      duration:
        latestExecution.duration ||
        (latestExecution.end_time && latestExecution.start_time
          ? new Date(latestExecution.end_time) - new Date(latestExecution.start_time)
          : null),
      startTime: latestExecution.start_time,
      endTime: latestExecution.end_time,
      isTest: latestExecution.context?.isTest || false,
      currentStepId: latestExecution.currentStepId,
      currentStepIndex: latestExecution.currentStepIndex,
      progress: latestExecution.progress || { completedSteps: 0, totalSteps: 0, percentage: 0 },
      steps: latestExecution.steps || [],
      context: latestExecution.context || {},
      logs: latestExecution.logs || [],
      notifications: latestExecution.notifications || [],
      createdAt: latestExecution.createdAt,
      updatedAt: latestExecution.updatedAt,
    };

    res.status(200).json({
      success: true,
      execution: formattedExecution,
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting latest workflow execution:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get workflow scheduler status
 * @route GET /workflows/scheduler/status
 * @returns {object} Scheduler status information
 */
const getSchedulerStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get workflow-related scheduler tasks
    const allTasks = await getSchedulerTasksByUser(userId);

    // Filter for workflow tasks
    const workflowTasks = allTasks.filter(
      (task) => task.prompt && task.prompt.startsWith('WORKFLOW_EXECUTION:'),
    );

    // Calculate statistics
    const stats = {
      totalWorkflowTasks: workflowTasks.length,
      activeWorkflowTasks: workflowTasks.filter((task) => task.enabled).length,
      pendingWorkflowTasks: workflowTasks.filter((task) => task.status === 'pending').length,
      failedWorkflowTasks: workflowTasks.filter((task) => task.status === 'failed').length,
    };

    // Format scheduled workflows info
    const scheduledWorkflows = workflowTasks.map((task) => {
      const workflowInfo = task.prompt.split(':');
      return {
        taskId: task.id,
        workflowId: workflowInfo[1] || 'unknown',
        workflowName: workflowInfo.slice(2).join(':') || 'unknown',
        schedule: task.schedule,
        enabled: task.enabled,
        status: task.status,
        lastRun: task.last_run,
        nextRun: task.next_run,
      };
    });

    res.json({
      success: true,
      status: {
        ...stats,
        scheduledWorkflows,
      },
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getUserWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  testWorkflow,
  stopWorkflow,
  executeWorkflow,
  getWorkflowExecutions,
  getLatestWorkflowExecution,
  getSchedulerStatus,
};
