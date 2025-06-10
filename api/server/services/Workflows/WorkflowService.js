const { logger } = require('~/config');
// Remove userworkflow imports - using scheduler collections only
const { 
  createSchedulerTask,
  deleteSchedulerTask,
  getSchedulerTasksByUser,
  getSchedulerTaskById,
  updateSchedulerTask
} = require('~/models/SchedulerTask');
const { 
  createSchedulerExecution,
  updateSchedulerExecution,
  getSchedulerExecutionById,
  getSchedulerExecutionsByTask,
  getSchedulerExecutionsByUser
} = require('~/models/SchedulerExecution');
const { calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils');
const SchedulerService = require('~/server/services/Scheduler/SchedulerService');
const { v4: uuidv4 } = require('uuid');

class WorkflowService {
  constructor() {
    // Don't import SchedulerTaskExecutor here to avoid circular dependency
    // We'll use it dynamically when needed
  }

  /**
   * Create a new workflow
   * @param {Object} workflowData - Workflow data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created workflow
   */
  async createWorkflow(workflowData, userId) {
    try {
      logger.info(`[WorkflowService] Creating workflow for user ${userId}:`, workflowData.name);
      
      // Validate workflow data
      this.validateWorkflowData(workflowData);
      
      // Generate scheduler task ID for the workflow
      const schedulerTaskId = `workflow_${workflowData.id.replace('workflow_', '')}`;
      
      // Calculate next run time if it's a schedule trigger
      let nextRun = null;
      if (workflowData.trigger.type === 'schedule') {
        nextRun = calculateNextRun(workflowData.trigger.config.schedule);
        if (!nextRun) {
          throw new Error(`Invalid cron expression: ${workflowData.trigger.config.schedule}`);
        }
      }
      
      // Create scheduler task with workflow metadata
      const schedulerTaskData = {
        id: schedulerTaskId,
        name: `Workflow: ${workflowData.name}`,
        schedule: workflowData.trigger.type === 'schedule' ? workflowData.trigger.config.schedule : '0 0 1 1 *', // Dummy schedule for non-schedule triggers
        prompt: `WORKFLOW_EXECUTION:${workflowData.id}:${workflowData.name}`,
        enabled: workflowData.isActive || false,
        do_only_once: false, // Workflows are typically recurring
        type: 'workflow',
        next_run: nextRun,
        status: workflowData.isActive ? 'pending' : 'disabled',
        user: userId,
        conversation_id: workflowData.conversation_id,
        parent_message_id: workflowData.parent_message_id,
        endpoint: workflowData.endpoint,
        ai_model: workflowData.ai_model,
        agent_id: workflowData.agent_id,
        metadata: {
          type: 'workflow',
          workflowId: workflowData.id,
          workflowVersion: workflowData.version || 1,
          trigger: workflowData.trigger,
          steps: workflowData.steps,
          description: workflowData.description,
          isDraft: workflowData.isDraft,
          created_from_agent: workflowData.created_from_agent
        }
      };
      
      const schedulerTask = await createSchedulerTask(schedulerTaskData);
      
      // Convert scheduler task back to workflow format for response
      const workflow = this.schedulerTaskToWorkflow(schedulerTask);
      
      // Send real-time notification for workflow creation
      try {
        await SchedulerService.sendWorkflowStatusUpdate({
          userId: userId,
          workflowName: workflow.name,
          workflowId: workflow.id,
          notificationType: 'created',
          details: `Workflow "${workflow.name}" created successfully`,
          workflowData: workflow
        });
      } catch (notificationError) {
        logger.warn(`[WorkflowService] Failed to send workflow creation notification: ${notificationError.message}`);
        // Don't fail workflow creation if notification fails
      }
      
      logger.info(`[WorkflowService] Created workflow ${workflow.id} for user ${userId}`);
      return workflow;
    } catch (error) {
      logger.error(`[WorkflowService] Error creating workflow:`, error);
      throw error;
    }
  }

  /**
   * Get workflows for a user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} User workflows
   */
  async getUserWorkflows(userId, filters = {}) {
    try {
      logger.debug(`[WorkflowService] Getting workflows for user ${userId}`);
      
      // Get all scheduler tasks for the user
      const allTasks = await getSchedulerTasksByUser(userId);
      
      // Filter to get only workflow tasks
      const workflowTasks = this.filterWorkflowTasks(allTasks);
      
      // Convert to workflow format
      const workflows = workflowTasks.map(task => this.schedulerTaskToWorkflow(task));
      
      logger.debug(`[WorkflowService] Found ${workflows.length} workflows for user ${userId}`);
      return workflows;
    } catch (error) {
      logger.error(`[WorkflowService] Error getting workflows for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get workflow by ID
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Workflow or null
   */
  async getWorkflowById(workflowId, userId) {
    try {
      logger.debug(`[WorkflowService] Getting workflow ${workflowId} for user ${userId}`);
      
      // Convert workflow ID to scheduler task ID
      const schedulerTaskId = `workflow_${workflowId.replace('workflow_', '')}`;
      
      const schedulerTask = await getSchedulerTaskById(schedulerTaskId, userId);
      
      if (!schedulerTask || !schedulerTask.metadata || schedulerTask.metadata.type !== 'workflow') {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for user ${userId}`);
        return null;
      }
      
      // Convert to workflow format
      const workflow = this.schedulerTaskToWorkflow(schedulerTask);
      
      return workflow;
    } catch (error) {
      logger.error(`[WorkflowService] Error getting workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Update workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object|null>} Updated workflow or null
   */
  async updateWorkflow(workflowId, userId, updateData) {
    try {
      logger.info(`[WorkflowService] Updating workflow ${workflowId} for user ${userId}`);
      
      // Validate update data if changing workflow structure
      if (updateData.trigger || updateData.steps) {
        this.validateWorkflowUpdateData(updateData);
      }
      
      // Convert workflow ID to scheduler task ID
      const schedulerTaskId = `workflow_${workflowId.replace('workflow_', '')}`;
      
      // Get current scheduler task
      const currentTask = await getSchedulerTaskById(schedulerTaskId, userId);
      if (!currentTask || !currentTask.metadata || currentTask.metadata.type !== 'workflow') {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for update`);
        return null;
      }
      
      // Prepare update data for scheduler task
      const schedulerUpdateData = {};
      
      // Update name if provided
      if (updateData.name) {
        schedulerUpdateData.name = `Workflow: ${updateData.name}`;
        schedulerUpdateData.prompt = `WORKFLOW_EXECUTION:${workflowId}:${updateData.name}`;
      }
      
      // Update schedule if trigger changed
      if (updateData.trigger?.type === 'schedule') {
        schedulerUpdateData.schedule = updateData.trigger.config.schedule;
        const nextRun = calculateNextRun(updateData.trigger.config.schedule);
        if (nextRun) {
          schedulerUpdateData.next_run = nextRun;
        }
      }
      
      // Update metadata
      const updatedMetadata = {
        ...currentTask.metadata,
        ...updateData.trigger && { trigger: updateData.trigger },
        ...updateData.steps && { steps: updateData.steps },
        ...updateData.description && { description: updateData.description },
        ...updateData.isDraft !== undefined && { isDraft: updateData.isDraft },
        ...updateData.metadata && updateData.metadata, // Allow direct metadata updates (e.g., dedicatedConversationId)
        workflowVersion: (currentTask.metadata.workflowVersion || 1) + 1
      };
      
      schedulerUpdateData.metadata = updatedMetadata;
      
      // Update other fields
      if (updateData.isActive !== undefined) {
        schedulerUpdateData.enabled = updateData.isActive;
        schedulerUpdateData.status = updateData.isActive ? 'pending' : 'disabled';
      }
      
      const updatedTask = await updateSchedulerTask(schedulerTaskId, userId, schedulerUpdateData);
      
      if (!updatedTask) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for update`);
        return null;
      }
      
      // Convert back to workflow format
      const updatedWorkflow = this.schedulerTaskToWorkflow(updatedTask);
      
      // Send real-time notification for workflow update
      try {
        await SchedulerService.sendWorkflowStatusUpdate({
          userId: userId,
          workflowName: updatedWorkflow.name,
          workflowId: updatedWorkflow.id,
          notificationType: 'updated',
          details: `Workflow "${updatedWorkflow.name}" updated successfully`,
          workflowData: updatedWorkflow
        });
      } catch (notificationError) {
        logger.warn(`[WorkflowService] Failed to send workflow update notification: ${notificationError.message}`);
        // Don't fail workflow update if notification fails
      }
      
      logger.info(`[WorkflowService] Updated workflow ${workflowId}`);
      return updatedWorkflow;
    } catch (error) {
      logger.error(`[WorkflowService] Error updating workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Delete workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteWorkflow(workflowId, userId) {
    try {
      logger.info(`[WorkflowService] Deleting workflow ${workflowId} for user ${userId}`);
      
      // Convert workflow ID to scheduler task ID
      const schedulerTaskId = `workflow_${workflowId.replace('workflow_', '')}`;
      
      // Get workflow data before deletion for notification
      const currentTask = await getSchedulerTaskById(schedulerTaskId, userId);
      let workflowName = 'Unknown Workflow';
      if (currentTask && currentTask.metadata) {
        const workflow = this.schedulerTaskToWorkflow(currentTask);
        workflowName = workflow.name;
      }
      
      const result = await deleteSchedulerTask(schedulerTaskId, userId);
      
      if (result.deletedCount === 0) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for deletion`);
        return false;
      }
      
      // Send real-time notification for workflow deletion
      try {
        await SchedulerService.sendWorkflowStatusUpdate({
          userId: userId,
          workflowName: workflowName,
          workflowId: workflowId,
          notificationType: 'deleted',
          details: `Workflow "${workflowName}" deleted successfully`
        });
      } catch (notificationError) {
        logger.warn(`[WorkflowService] Failed to send workflow deletion notification: ${notificationError.message}`);
        // Don't fail workflow deletion if notification fails
      }
      
      logger.info(`[WorkflowService] Deleted workflow ${workflowId} successfully`);
      return true;
    } catch (error) {
      logger.error(`[WorkflowService] Error deleting workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Activate/deactivate workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @param {boolean} isActive - Active state
   * @returns {Promise<Object|null>} Updated workflow or null
   */
  async toggleWorkflow(workflowId, userId, isActive) {
    try {
      logger.info(`[WorkflowService] ${isActive ? 'Activating' : 'Deactivating'} workflow ${workflowId}`);
      
      // Convert workflow ID to scheduler task ID
      const schedulerTaskId = `workflow_${workflowId.replace('workflow_', '')}`;
      
      // Get current task to access metadata
      const currentTask = await getSchedulerTaskById(schedulerTaskId, userId);
      if (!currentTask) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for toggle`);
        return null;
      }
      
      // Update scheduler task enabled status
      const updateData = {
        enabled: isActive,
        status: isActive ? 'pending' : 'disabled'
      };
      
      // Update metadata - when activating, remove draft status
      if (currentTask.metadata) {
        updateData.metadata = {
          ...currentTask.metadata,
          isDraft: isActive ? false : currentTask.metadata.isDraft // When activating, set isDraft to false
        };
      }
      
      // If activating a schedule workflow, calculate next run
      if (isActive) {
        if (currentTask && currentTask.metadata?.trigger?.type === 'schedule') {
          const nextRun = calculateNextRun(currentTask.metadata.trigger.config.schedule);
          if (nextRun) {
            updateData.next_run = nextRun;
          }
        }
      }
      
      const updatedTask = await updateSchedulerTask(schedulerTaskId, userId, updateData);
      
      if (!updatedTask) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for toggle`);
        return null;
      }
      
      // Convert back to workflow format
      const workflow = this.schedulerTaskToWorkflow(updatedTask);
      
      // Send real-time notification for workflow status change
      try {
        await SchedulerService.sendWorkflowStatusUpdate({
          userId: userId,
          workflowName: workflow.name,
          workflowId: workflow.id,
          notificationType: isActive ? 'activated' : 'deactivated',
          details: `Workflow "${workflow.name}" ${isActive ? 'activated' : 'deactivated'} successfully`,
          workflowData: workflow
        });
      } catch (notificationError) {
        logger.warn(`[WorkflowService] Failed to send workflow toggle notification: ${notificationError.message}`);
        // Don't fail workflow toggle if notification fails
      }
      
      logger.info(`[WorkflowService] ${isActive ? 'Activated' : 'Deactivated'} workflow ${workflowId}`);
      return workflow;
    } catch (error) {
      logger.error(`[WorkflowService] Error toggling workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Execute workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @param {Object} context - Execution context
   * @param {boolean} isTest - Whether this is a test execution
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflow(workflowId, userId, context = {}, isTest = false) {
    try {
      logger.info(`[WorkflowService] ${isTest ? 'Testing' : 'Executing'} workflow ${workflowId}`);
      
      // Get workflow
      const workflow = await this.getWorkflowById(workflowId, userId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }
      
      // Determine if this is a scheduled execution
      const isScheduledExecution = context.trigger?.source === 'scheduler';

      // For scheduled executions, this should not be called directly
      // The SchedulerTaskExecutor should handle workflow execution directly
      if (isScheduledExecution) {
        throw new Error('Scheduled workflow executions should be handled by SchedulerTaskExecutor directly');
      }

      // For manual/test executions, create execution record and use WorkflowExecutor
      let execution = null;
      let executionId = null;

      executionId = `exec_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
      execution = await createSchedulerExecution({
        id: executionId,
        task_id: `workflow_${workflowId.replace('workflow_', '')}`,
        task_name: `Workflow: ${workflow.name}`,
        user: userId,
        trigger: {
          type: context.trigger?.type || 'manual',
          source: context.trigger?.source || (isTest ? 'test' : 'api'),
          data: context.trigger?.data || {}
        },
        status: 'running',
        start_time: new Date(),
        metadata: {
          workflowId: workflowId,
          workflowName: workflow.name,
          isTest: isTest,
          context: context
        }
      });

      // Send real-time notification for workflow execution start
      try {
        await SchedulerService.sendWorkflowStatusUpdate({
          userId: userId,
          workflowName: workflow.name,
          workflowId: workflow.id,
          notificationType: isTest ? 'test_started' : 'execution_started',
          details: `Workflow "${workflow.name}" ${isTest ? 'test' : 'execution'} started`
        });
      } catch (notificationError) {
        logger.warn(`[WorkflowService] Failed to send workflow execution start notification: ${notificationError.message}`);
        // Don't fail workflow execution if notification fails
      }

      try {
        // Use WorkflowExecutor directly for manual/test executions
        const WorkflowExecutor = require('~/server/services/Workflows/WorkflowExecutor');
        const executor = new WorkflowExecutor();
        
        // Execute workflow using WorkflowExecutor
        const result = await executor.executeWorkflow(workflow, { id: executionId, user: userId }, context);
        
        // Update execution status
        await updateSchedulerExecution(execution.id, userId, {
          status: result.success ? 'completed' : 'failed',
          end_time: new Date(),
          result: result.result,
          error: result.error,
        });
        
        // Send real-time notification for workflow execution completion
        try {
          await SchedulerService.sendWorkflowStatusUpdate({
            userId: userId,
            workflowName: workflow.name,
            workflowId: workflow.id,
            notificationType: result.success ? 'execution_completed' : 'execution_failed',
            details: `Workflow "${workflow.name}" ${isTest ? 'test' : 'execution'} ${result.success ? 'completed successfully' : 'failed'}`,
            executionResult: {
              success: result.success,
              result: result.result,
              error: result.error,
              isTest: isTest
            }
          });
        } catch (notificationError) {
          logger.warn(`[WorkflowService] Failed to send workflow execution completion notification: ${notificationError.message}`);
          // Don't fail workflow execution if notification fails
        }
        
        logger.info(`[WorkflowService] ${isTest ? 'Test' : 'Execution'} completed for workflow ${workflowId}: ${result.success ? 'success' : 'failed'}`);
        return result;
      } catch (error) {
        // Update execution status on error
        await updateSchedulerExecution(execution.id, userId, {
          status: 'failed',
          end_time: new Date(),
          error: error.message,
        });
        
        // Send real-time notification for workflow execution failure
        try {
          await SchedulerService.sendWorkflowStatusUpdate({
            userId: userId,
            workflowName: workflow.name,
            workflowId: workflow.id,
            notificationType: 'execution_failed',
            details: `Workflow "${workflow.name}" ${isTest ? 'test' : 'execution'} failed: ${error.message}`,
            executionResult: {
              success: false,
              result: null,
              error: error.message,
              isTest: isTest
            }
          });
        } catch (notificationError) {
          logger.warn(`[WorkflowService] Failed to send workflow execution failure notification: ${notificationError.message}`);
          // Don't fail workflow execution if notification fails
        }
        
        throw error;
      }
    } catch (error) {
      logger.error(`[WorkflowService] Error executing workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Get active workflows for scheduling
   * @returns {Promise<Array>} Active workflows
   */
  async getActiveWorkflows() {
    try {
      logger.debug('[WorkflowService] Getting active workflows');
      
      // Get all scheduler tasks across all users (for admin purposes)
      // Note: This requires a new model method to get all tasks, not just for a user
      // For now, we'll return empty array since this method was primarily used by the old scheduler
      const workflows = [];
      
      logger.debug(`[WorkflowService] Found ${workflows.length} active workflows`);
      return workflows;
    } catch (error) {
      logger.error('[WorkflowService] Error getting active workflows:', error);
      throw error;
    }
  }

  /**
   * Convert scheduler task to workflow format
   * @param {Object} schedulerTask - Scheduler task object
   * @returns {Object} Workflow object
   */
  schedulerTaskToWorkflow(schedulerTask) {
    if (!schedulerTask.metadata || schedulerTask.type !== 'workflow') {
      throw new Error('Scheduler task is not a workflow');
    }

    // Helper function to convert MongoDB date objects to JavaScript Date objects
    const convertDate = (dateValue) => {
      if (!dateValue) return undefined;
      
      // If it's already a Date object, return it
      if (dateValue instanceof Date) {
        return dateValue;
      }
      
      // If it's a MongoDB date object with $date property
      if (typeof dateValue === 'object' && dateValue.$date) {
        return new Date(dateValue.$date);
      }
      
      // If it's a string, convert to Date
      if (typeof dateValue === 'string') {
        return new Date(dateValue);
      }
      
      // Otherwise return as-is
      return dateValue;
    };

    return {
      id: schedulerTask.metadata.workflowId,
      name: schedulerTask.name.replace('Workflow: ', ''),
      description: schedulerTask.metadata.description,
      trigger: schedulerTask.metadata.trigger,
      steps: schedulerTask.metadata.steps,
      type: schedulerTask.type, // Add the type field from scheduler task
      isDraft: schedulerTask.metadata.isDraft,
      isActive: schedulerTask.enabled,
      version: schedulerTask.metadata.workflowVersion,
      user: schedulerTask.user,
      conversation_id: schedulerTask.conversation_id,
      parent_message_id: schedulerTask.parent_message_id,
      endpoint: schedulerTask.endpoint,
      ai_model: schedulerTask.ai_model,
      agent_id: schedulerTask.agent_id,
      last_run: convertDate(schedulerTask.last_run),
      next_run: convertDate(schedulerTask.next_run),
      status: schedulerTask.status,
      created_from_agent: schedulerTask.metadata.created_from_agent,
      metadata: schedulerTask.metadata, // Expose full metadata for access to dedicatedConversationId
      createdAt: convertDate(schedulerTask.createdAt),
      updatedAt: convertDate(schedulerTask.updatedAt),
    };
  }

  /**
   * Filter scheduler tasks to get only workflow tasks
   * @param {Array} tasks - Array of scheduler tasks
   * @returns {Array} Array of workflow tasks
   */
  filterWorkflowTasks(tasks) {
    return tasks.filter(task => 
      task.metadata && 
      task.type === 'workflow' &&  // Check type field at root level, not in metadata
      task.prompt && 
      task.prompt.startsWith('WORKFLOW_EXECUTION:')
    );
  }

  /**
   * Validate workflow data
   * @param {Object} workflowData - Workflow data to validate
   * @throws {Error} If validation fails
   */
  validateWorkflowData(workflowData) {
    // Validate required fields
    if (!workflowData.name) {
      throw new Error('Workflow name is required');
    }

    if (!workflowData.trigger) {
      throw new Error('Workflow trigger is required');
    }

    if (!workflowData.steps || !Array.isArray(workflowData.steps) || workflowData.steps.length === 0) {
      throw new Error('Workflow must have at least one step');
    }

    // Validate trigger
    const validTriggerTypes = ['manual', 'schedule', 'webhook', 'email', 'event'];
    if (!validTriggerTypes.includes(workflowData.trigger.type)) {
      throw new Error(`Invalid trigger type: ${workflowData.trigger.type}`);
    }

    // Validate schedule trigger
    if (workflowData.trigger.type === 'schedule' && !workflowData.trigger.config?.schedule) {
      throw new Error('Schedule trigger requires a schedule configuration');
    }

    // Validate steps
    workflowData.steps.forEach((step, index) => {
      this.validateWorkflowStep(step, index);
    });

    // Validate step connections
    this.validateStepConnections(workflowData.steps);
  }

  /**
   * Validate individual workflow step
   * @param {Object} step - Step to validate
   * @param {number} index - Step index
   * @throws {Error} If validation fails
   */
  validateWorkflowStep(step, index) {
    if (!step.id) {
      throw new Error(`Step ${index} missing id`);
    }

    if (!step.name) {
      throw new Error(`Step ${index} missing name`);
    }

    const validStepTypes = ['mcp_agent_action'];
    if (!validStepTypes.includes(step.type)) {
      throw new Error(`Step ${index} has invalid type: ${step.type}. Only 'mcp_agent_action' is supported.`);
    }

    if (!step.config) {
      throw new Error(`Step ${index} missing config`);
    }

    // All steps are mcp_agent_action type - they use MCP tools dynamically via agent
    logger.debug(`[WorkflowService] MCP agent action step ${index} configured for agent-driven execution with MCP tools`);

    // Validate position
    if (!step.position || typeof step.position.x !== 'number' || typeof step.position.y !== 'number') {
      throw new Error(`Step ${index} missing valid position`);
    }
  }

  /**
   * Validate step connections
   * @param {Array} steps - Array of steps
   * @throws {Error} If validation fails
   */
  validateStepConnections(steps) {
    const stepIds = new Set(steps.map(step => step.id));
    const allStepIds = Array.from(stepIds);

    steps.forEach((step, index) => {
      if (step.onSuccess && !stepIds.has(step.onSuccess)) {
        throw new Error(`Step ${index} (${step.id}) onSuccess references non-existent step: ${step.onSuccess}. Available steps: [${allStepIds.join(', ')}]`);
      }

      if (step.onFailure && !stepIds.has(step.onFailure)) {
        throw new Error(`Step ${index} (${step.id}) onFailure references non-existent step: ${step.onFailure}. Available steps: [${allStepIds.join(', ')}]`);
      }
    });
  }

  /**
   * Validate workflow update data
   * @param {Object} updateData - Update data to validate
   * @throws {Error} If validation fails
   */
  validateWorkflowUpdateData(updateData) {
    // Validate required fields
    if (!updateData.name && !updateData.trigger && !updateData.steps && !updateData.description && !updateData.isDraft) {
      throw new Error('No valid fields to update');
    }

    // Validate trigger
    if (updateData.trigger) {
      const validTriggerTypes = ['manual', 'schedule', 'webhook', 'email', 'event'];
      if (!validTriggerTypes.includes(updateData.trigger.type)) {
        throw new Error(`Invalid trigger type: ${updateData.trigger.type}`);
      }

      // Validate schedule trigger
      if (updateData.trigger.type === 'schedule' && !updateData.trigger.config?.schedule) {
        throw new Error('Schedule trigger requires a schedule configuration');
      }
    }

    // Validate steps
    if (updateData.steps) {
      if (!Array.isArray(updateData.steps) || updateData.steps.length === 0) {
        throw new Error('Workflow must have at least one step');
      }

      updateData.steps.forEach((step, index) => {
        this.validateWorkflowStep(step, index);
      });
    }

    // Validate step connections
    if (updateData.steps) {
      this.validateStepConnections(updateData.steps);
    }
  }
}

module.exports = WorkflowService; 