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
      description: workflow.description,
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
        description: workflow.description,
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
        description: workflow.description,
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
        description: updatedWorkflow.description,
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

    res.json({
      success: true,
      message: `Workflow "${workflow.name}" activated successfully`,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        isActive: workflow.isActive,
        isDraft: workflow.isDraft,
        dedicatedConversationId: workflow.metadata?.dedicatedConversationId, // Expose dedicated conversation ID
      },
    });
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
 * Test execute a workflow
 * @route POST /workflows/:workflowId/test
 * @param {string} workflowId - The workflow ID
 * @returns {object} Execution result
 */
const testWorkflow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowId } = req.params;
    const { context = {} } = req.body;

    const workflowService = new WorkflowService();
    const result = await workflowService.executeWorkflow(workflowId, userId, context, true);

    res.json({
      success: true,
      message: 'Workflow test execution completed',
      result,
    });
  } catch (error) {
    logger.error('[WorkflowController] Error testing workflow:', error);
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

    const workflowService = new WorkflowService();
    const result = await workflowService.executeWorkflow(workflowId, userId, context, false);

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

    // Convert workflow ID to scheduler task ID
    const schedulerTaskId = `workflow_${workflowId.replace('workflow_', '')}`;

    // Get scheduler executions for this workflow
    const executions = await getSchedulerExecutionsByTask(schedulerTaskId, userId, limit);

    // Convert scheduler executions to workflow execution format
    const formattedExecutions = executions.map((exec) => ({
      id: exec.id,
      workflowId: exec.metadata?.workflowId || workflowId,
      workflowName: exec.metadata?.workflowName || exec.task_name.replace('Workflow: ', ''),
      status: exec.status,
      trigger: exec.trigger || { type: 'unknown' },
      result: exec.result,
      error: exec.error,
      duration:
        exec.end_time && exec.start_time
          ? new Date(exec.end_time) - new Date(exec.start_time)
          : null,
      startTime: exec.start_time,
      endTime: exec.end_time,
      isTest: exec.metadata?.isTest || false,
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
  getSchedulerStatus,
};
