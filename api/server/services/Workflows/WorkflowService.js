const { logger } = require('~/config');
const {
  createSchedulerTask,
  deleteSchedulerTask,
  getSchedulerTasksByUser,
  getSchedulerTaskById,
  updateSchedulerTask,
} = require('~/models/SchedulerTask');
const SchedulerService = require('~/server/services/Scheduler/SchedulerService');

class WorkflowService {
  constructor() {
    // Simple workflow service for basic CRUD operations
  }

  /**
   * Create a new workflow
   * @param {Object} workflowData - Workflow data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created workflow
   */
  async createWorkflow(workflowData, userId) {
    try {
      logger.info(`[WorkflowService] Creating workflow for user ${userId}`);

      // Basic validation
      if (!workflowData.name) {
        throw new Error('Workflow name is required');
      }

      // Generate unique workflow ID if not provided
      const workflowId = workflowData.id || `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create scheduler task data with new simplified structure
      const schedulerTaskData = {
        id: workflowId,
        name: workflowData.name,
        description: workflowData.description || '',
        enabled: workflowData.isActive || false,
        do_only_once: false,
        type: 'workflow',
        status: workflowData.isActive ? 'pending' : 'disabled',
        user: userId,
        conversation_id: workflowData.conversation_id,
        parent_message_id: workflowData.parent_message_id,
        endpoint: workflowData.endpoint,
        ai_model: workflowData.ai_model,
        agent_id: workflowData.agent_id,
        trigger: {
          type: workflowData.trigger?.type || 'manual',
          config: {
            ...workflowData.trigger?.config,
            schedule: workflowData.trigger?.config?.schedule || '0 9 * * *'
          }
        },
        metadata: {
          steps: (workflowData.steps || []).map(step => ({
            id: step.id,
            name: step.name,
            type: step.type,
            instruction: step.config?.parameters?.instruction || step.instruction,
            agent_id: step.config?.parameters?.agent_id || step.agent_id
          })),
          isDraft: workflowData.isDraft !== undefined ? workflowData.isDraft : true,
        },
        version: workflowData.version || 1,
      };

      // Create scheduler task
      const createdTask = await createSchedulerTask(schedulerTaskData);
      logger.info(`[WorkflowService] Workflow ${workflowId} created successfully`);

      // Convert back to workflow format
      const workflow = this.schedulerTaskToWorkflow(createdTask);

      // Send notification
      await this.notifyWorkflowEvent(userId, 'created', workflow);

      return workflow;
    } catch (error) {
      logger.error('[WorkflowService] Error creating workflow:', error);
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
      const allTasks = await getSchedulerTasksByUser(userId);
      const workflowTasks = allTasks.filter(task => 
        task.type === 'workflow'
      );
      
      return workflowTasks.map(task => this.schedulerTaskToWorkflow(task));
    } catch (error) {
      logger.error(`[WorkflowService] Error getting workflows:`, error);
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
      const schedulerTask = await getSchedulerTaskById(workflowId, userId);
      
      if (!schedulerTask || schedulerTask.type !== 'workflow') {
        return null;
      }

      return this.schedulerTaskToWorkflow(schedulerTask);
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
      logger.info(`[WorkflowService] Updating workflow ${workflowId}`);

      const currentTask = await getSchedulerTaskById(workflowId, userId);
      if (!currentTask || currentTask.type !== 'workflow') {
        return null;
      }

      // Prepare update data
      const schedulerUpdateData = {};
      
      if (updateData.name) {
        schedulerUpdateData.name = updateData.name;
      }

      if (updateData.trigger) {
        schedulerUpdateData.trigger = {
          type: updateData.trigger.type,
          config: {
            ...updateData.trigger.config,
            schedule: updateData.trigger.config?.schedule || '0 9 * * *'
          }
        };
      }

      // Update metadata with simplified structure
      const updatedMetadata = {
        ...currentTask.metadata,
        ...(updateData.steps && { 
          steps: updateData.steps.map(step => ({
            id: step.id,
            name: step.name,
            type: step.type,
            instruction: step.config?.parameters?.instruction || step.instruction,
            agent_id: step.config?.parameters?.agent_id || step.agent_id
          }))
        }),
        ...(updateData.isDraft !== undefined && { isDraft: updateData.isDraft }),
      };

      schedulerUpdateData.metadata = updatedMetadata;
      
      // Update description and increment version
      if (updateData.description !== undefined) {
        schedulerUpdateData.description = updateData.description;
      }
      schedulerUpdateData.version = (currentTask.version || 1) + 1;

      const updatedTask = await updateSchedulerTask(workflowId, userId, schedulerUpdateData);
      if (!updatedTask) {
        return null;
      }

      const workflow = this.schedulerTaskToWorkflow(updatedTask);
      await this.notifyWorkflowEvent(userId, 'updated', workflow);

      return workflow;
    } catch (error) {
      logger.error(`[WorkflowService] Error updating workflow:`, error);
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
      const result = await deleteSchedulerTask(workflowId, userId);
      
      if (result.deletedCount > 0) {
        await this.notifyWorkflowEvent(userId, 'deleted', { id: workflowId });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`[WorkflowService] Error deleting workflow:`, error);
      throw error;
    }
  }

  /**
   * Toggle workflow active status
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object|null>} Updated workflow or null
   */
  async toggleWorkflow(workflowId, userId, isActive) {
    try {
      const updateData = {
        enabled: isActive,
        status: isActive ? 'pending' : 'disabled',
      };

      const updatedTask = await updateSchedulerTask(workflowId, userId, updateData);
      if (!updatedTask) {
        return null;
      }

      const workflow = this.schedulerTaskToWorkflow(updatedTask);
      await this.notifyWorkflowEvent(userId, isActive ? 'activated' : 'deactivated', workflow);

      return workflow;
    } catch (error) {
      logger.error(`[WorkflowService] Error toggling workflow:`, error);
      throw error;
    }
  }

  /**
   * Convert scheduler task to workflow format
   * @param {Object} schedulerTask - Scheduler task
   * @returns {Object} Workflow object
   */
  schedulerTaskToWorkflow(schedulerTask) {
    const convertDate = (dateValue) => {
      if (!dateValue) return null;
      if (dateValue instanceof Date) return dateValue;
      if (typeof dateValue === 'string') return new Date(dateValue);
      return null;
    };

    return {
      id: schedulerTask.id,
      name: schedulerTask.name,
      description: schedulerTask.description || '',
      trigger: schedulerTask.trigger || { type: 'manual', config: {} },
      steps: schedulerTask.metadata?.steps || [],
      type: schedulerTask.type,
      isDraft: schedulerTask.metadata?.isDraft || false,
      isActive: schedulerTask.enabled,
      version: schedulerTask.version || 1,
      user: schedulerTask.user,
      conversation_id: schedulerTask.conversation_id,
      parent_message_id: schedulerTask.parent_message_id,
      endpoint: schedulerTask.endpoint,
      ai_model: schedulerTask.ai_model,
      agent_id: schedulerTask.agent_id,
      last_run: convertDate(schedulerTask.last_run),
      next_run: convertDate(schedulerTask.next_run),
      status: schedulerTask.status,
      metadata: schedulerTask.metadata,
      createdAt: convertDate(schedulerTask.createdAt),
      updatedAt: convertDate(schedulerTask.updatedAt),
    };
  }

  /**
   * Send workflow event notification
   * @param {string} userId - User ID
   * @param {string} eventType - Event type
   * @param {Object} workflow - Workflow data
   */
  async notifyWorkflowEvent(userId, eventType, workflow) {
    try {
      await SchedulerService.sendWorkflowStatusUpdate({
        userId: userId,
        workflowName: workflow.name || 'Unknown',
        workflowId: workflow.id,
        notificationType: eventType,
        details: `Workflow "${workflow.name}" ${eventType}`,
        source: 'workflow_builder',
        workflowData: workflow,
      });
    } catch (error) {
      logger.warn(`[WorkflowService] Failed to send ${eventType} notification:`, error.message);
    }
  }
}

module.exports = WorkflowService;
