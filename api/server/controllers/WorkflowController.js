const { WorkflowService, getWorkflowScheduler } = require('~/server/services/Workflows');
const { logger } = require('~/config');

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
    
    res.json({
      success: true,
      workflows: workflows.map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        trigger: workflow.trigger,
        steps: workflow.steps,
        isActive: workflow.isActive,
        isDraft: workflow.isDraft,
        last_run: workflow.last_run,
        next_run: workflow.next_run,
        run_count: workflow.run_count,
        success_count: workflow.success_count,
        failure_count: workflow.failure_count,
        version: workflow.version,
        created_from_agent: workflow.created_from_agent,
        artifact_identifier: workflow.artifact_identifier,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      }))
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting user workflows:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
        error: 'Workflow not found'
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
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      }
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
        isActive: workflow.isActive,
        isDraft: workflow.isDraft,
        version: workflow.version,
        created_from_agent: workflow.created_from_agent,
      }
    });
  } catch (error) {
    logger.error('[WorkflowController] Error creating workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
        error: 'Workflow not found'
      });
    }
    
    // If workflow was activated and has a schedule trigger, update scheduler
    if (updateData.isActive && updatedWorkflow.trigger.type === 'schedule') {
      const scheduler = getWorkflowScheduler();
      await scheduler.scheduleWorkflow(updatedWorkflow);
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
        isActive: updatedWorkflow.isActive,
        isDraft: updatedWorkflow.isDraft,
        version: updatedWorkflow.version,
        next_run: updatedWorkflow.next_run,
      }
    });
  } catch (error) {
    logger.error('[WorkflowController] Error updating workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    
    // Unschedule the workflow first if it's scheduled
    const scheduler = getWorkflowScheduler();
    await scheduler.unscheduleWorkflow(workflowId);
    
    const workflowService = new WorkflowService();
    const success = await workflowService.deleteWorkflow(workflowId, userId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    logger.error('[WorkflowController] Error deleting workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
        error: 'Workflow not found'
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
      }
    });
  } catch (error) {
    logger.error('[WorkflowController] Error activating workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    
    // Unschedule the workflow first
    const scheduler = getWorkflowScheduler();
    await scheduler.unscheduleWorkflow(workflowId);
    
    const workflowService = new WorkflowService();
    const workflow = await workflowService.toggleWorkflow(workflowId, userId, false);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
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
      }
    });
  } catch (error) {
    logger.error('[WorkflowController] Error deactivating workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
      result
    });
  } catch (error) {
    logger.error('[WorkflowController] Error testing workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
      result
    });
  } catch (error) {
    logger.error('[WorkflowController] Error executing workflow:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    const userId = req.user.id;
    const { workflowId } = req.params;
    const { limit = 50, page = 1 } = req.query;
    
    const { getWorkflowExecutions } = require('~/models/WorkflowExecution');
    const executions = await getWorkflowExecutions(workflowId, userId, {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
      sort: { createdAt: -1 },
    });
    
    res.json({
      success: true,
      executions: executions.map(exec => ({
        id: exec.id,
        workflowId: exec.workflowId,
        status: exec.status,
        startTime: exec.startTime,
        endTime: exec.endTime,
        trigger: exec.trigger,
        error: exec.error,
        stepExecutions: exec.stepExecutions,
        createdAt: exec.createdAt,
      }))
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting workflow executions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    const scheduler = getWorkflowScheduler();
    const stats = scheduler.getStats();
    const scheduledWorkflows = scheduler.getScheduledWorkflows();
    
    res.json({
      success: true,
      status: {
        ...stats,
        scheduledWorkflows,
      }
    });
  } catch (error) {
    logger.error('[WorkflowController] Error getting scheduler status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
  executeWorkflow,
  getWorkflowExecutions,
  getSchedulerStatus,
}; 