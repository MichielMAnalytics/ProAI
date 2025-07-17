const { logger } = require('~/config');
const {
  createSchedulerTask,
  deleteSchedulerTask,
  softDeleteSchedulerTask,
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
      const triggerType = workflowData.trigger?.type || 'manual';
      const schedulerTaskData = {
        id: workflowId,
        name: workflowData.name,
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
          type: triggerType,
          config: triggerType === 'manual' 
            ? {} 
            : {
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

      // Calculate next_run for scheduled workflows if they're active
      if (workflowData.isActive && triggerType === 'schedule') {
        const { calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils');
        const cronExpression = workflowData.trigger?.config?.schedule || '0 9 * * *';
        
        const nextRun = calculateNextRun(cronExpression);
        if (nextRun) {
          schedulerTaskData.next_run = nextRun;
          logger.info(`[WorkflowService] Calculated next_run for new scheduled workflow ${workflowId}: ${nextRun.toISOString()}`);
        } else {
          logger.warn(`[WorkflowService] Failed to calculate next_run for new workflow ${workflowId} with cron: ${cronExpression}`);
          // Don't create workflow if we can't calculate next run for scheduled workflows
          throw new Error(`Invalid cron expression: ${cronExpression}`);
        }
      } else {
        // For manual workflows or inactive workflows, explicitly set next_run to null
        schedulerTaskData.next_run = null;
      }

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
          config: updateData.trigger.type === 'manual' 
            ? {} 
            : {
                ...updateData.trigger.config,
                schedule: updateData.trigger.config?.schedule || '0 9 * * *'
              }
        };

        // Recalculate next_run if trigger changed and workflow is enabled
        if (currentTask.enabled) {
          if (updateData.trigger.type === 'schedule') {
            const { calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils');
            const cronExpression = updateData.trigger.config?.schedule || '0 9 * * *';
            
            const nextRun = calculateNextRun(cronExpression);
            if (nextRun) {
              schedulerUpdateData.next_run = nextRun;
              logger.info(`[WorkflowService] Recalculated next_run for updated scheduled workflow ${workflowId}: ${nextRun.toISOString()}`);
            } else {
              logger.warn(`[WorkflowService] Failed to calculate next_run for updated workflow ${workflowId} with cron: ${cronExpression}`);
              throw new Error(`Invalid cron expression: ${cronExpression}`);
            }
          } else {
            // For manual workflows, clear next_run
            schedulerUpdateData.next_run = null;
            logger.info(`[WorkflowService] Cleared next_run for updated manual workflow ${workflowId}`);
          }
        }
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
      
      // Increment version
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
   * Delete workflow (soft delete - marks as deleted instead of removing)
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteWorkflow(workflowId, userId) {
    try {
      // Get the workflow before deleting to check for triggers
      const { getSchedulerTaskById } = require('~/models/SchedulerTask');
      const workflowTask = await getSchedulerTaskById(workflowId, userId);
      
      // Clean up trigger deployment if it's an app-based trigger
      if (workflowTask && workflowTask.trigger && workflowTask.trigger.type === 'app') {
        try {
          const PipedreamComponents = require('~/server/services/Pipedream/PipedreamComponents');
          await PipedreamComponents.deleteTrigger(userId, workflowId);
          logger.info(`[WorkflowService] Cleaned up trigger deployment for deleted workflow ${workflowId}`);
        } catch (error) {
          logger.warn(`[WorkflowService] Failed to clean up trigger deployment for workflow ${workflowId}:`, error.message);
          // Continue with workflow deletion even if trigger cleanup fails
        }
      }

      const result = await softDeleteSchedulerTask(workflowId, userId);
      
      if (result) {
        logger.info(`[WorkflowService] Workflow ${workflowId} soft deleted for user ${userId}`);
        await this.notifyWorkflowEvent(userId, 'deleted', { id: workflowId, name: result.name });
        return true;
      }
      
      logger.warn(`[WorkflowService] Workflow ${workflowId} not found or already deleted for user ${userId}`);
      return false;
    } catch (error) {
      logger.error(`[WorkflowService] Error deleting workflow:`, error);
      throw error;
    }
  }

  /**
   * Permanently delete workflow (hard delete - removes from database)
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async permanentlyDeleteWorkflow(workflowId, userId) {
    try {
      const result = await deleteSchedulerTask(workflowId, userId);
      
      if (result.deletedCount > 0) {
        logger.info(`[WorkflowService] Workflow ${workflowId} permanently deleted for user ${userId}`);
        await this.notifyWorkflowEvent(userId, 'permanently_deleted', { id: workflowId });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`[WorkflowService] Error permanently deleting workflow:`, error);
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

      // First get the current task to check its trigger and schedule
      const { getSchedulerTaskById } = require('~/models/SchedulerTask');
      const currentTask = await getSchedulerTaskById(workflowId, userId);
      
      if (!currentTask) {
        throw new Error('Workflow not found');
      }

      // Handle trigger deployment for app-based triggers
      if (currentTask.trigger && currentTask.trigger.type === 'app') {
        await this.handleTriggerDeployment(currentTask, userId, isActive);
      }

      // If activating a workflow, calculate next_run time for scheduled workflows
      if (isActive) {
        if (currentTask.trigger) {
          const triggerType = currentTask.trigger.type;
          
          // Handle scheduled workflows
          if (triggerType === 'schedule') {
            const { calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils');
            
            // Support both legacy 'schedule' field and new 'trigger.config.schedule' field
            const cronExpression = currentTask.trigger.config?.schedule || currentTask.schedule;
            
            if (cronExpression) {
              const nextRun = calculateNextRun(cronExpression);
              if (nextRun) {
                updateData.next_run = nextRun;
                logger.info(`[WorkflowService] Calculated next_run for scheduled workflow ${workflowId}: ${nextRun.toISOString()}`);
              } else {
                logger.warn(`[WorkflowService] Failed to calculate next_run for workflow ${workflowId} with cron: ${cronExpression}`);
                // If we can't calculate next run, don't activate the workflow
                throw new Error(`Invalid cron expression: ${cronExpression}`);
              }
            } else {
              logger.warn(`[WorkflowService] No cron expression found for scheduled workflow ${workflowId}`);
              throw new Error('Scheduled workflow is missing cron expression');
            }
          } else {
            // For manual workflows, explicitly set next_run to null to prevent immediate execution
            updateData.next_run = null;
            logger.info(`[WorkflowService] Setting next_run to null for manual workflow ${workflowId}`);
          }
        }
      } else {
        // When deactivating, clear next_run to prevent future executions
        updateData.next_run = null;
        logger.info(`[WorkflowService] Clearing next_run for deactivated workflow ${workflowId}`);
      }

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
   * Handle trigger deployment for app-based triggers
   * @param {Object} workflowTask - Workflow task from database
   * @param {string} userId - User ID
   * @param {boolean} isActive - Whether to activate or deactivate
   */
  async handleTriggerDeployment(workflowTask, userId, isActive) {
    try {
      const PipedreamComponents = require('~/server/services/Pipedream/PipedreamComponents');
      
      if (isActive) {
        // Deploy trigger when activating
        logger.info(`[WorkflowService] Deploying trigger for workflow ${workflowTask.id}`);
        
        // Get the actual component ID from Pipedream triggers
        const componentId = await this.getActualComponentId(
          workflowTask.trigger.config.appSlug, 
          workflowTask.trigger.config.triggerKey
        );
        
        logger.info(`[WorkflowService] Found component ID: ${componentId} for ${workflowTask.trigger.config.appSlug}:${workflowTask.trigger.config.triggerKey}`);
        
        if (!componentId) {
          throw new Error(`Component not found for ${workflowTask.trigger.config.appSlug}:${workflowTask.trigger.config.triggerKey}`);
        }
        
        const deploymentOptions = {
          componentId,
          workflowId: workflowTask.id,
          configuredProps: workflowTask.trigger.config.parameters || {},
          appSlug: workflowTask.trigger.config.appSlug,
          triggerKey: workflowTask.trigger.config.triggerKey,
        };

        const deploymentResult = await PipedreamComponents.deployTrigger(userId, deploymentOptions);
        
        if (deploymentResult.success) {
          logger.info(`[WorkflowService] Successfully deployed trigger for workflow ${workflowTask.id}`);
        } else {
          throw new Error(`Failed to deploy trigger: ${deploymentResult.error}`);
        }
      } else {
        // Delete trigger when deactivating
        logger.info(`[WorkflowService] Deleting trigger for workflow ${workflowTask.id}`);
        
        const deleteResult = await PipedreamComponents.deleteTrigger(userId, workflowTask.id);
        
        if (deleteResult.success) {
          logger.info(`[WorkflowService] Successfully deleted trigger for workflow ${workflowTask.id}`);
        } else {
          logger.warn(`[WorkflowService] Failed to delete trigger for workflow ${workflowTask.id}: ${deleteResult.error}`);
          // Don't throw error for delete failures - workflow can still be deactivated
        }
      }
    } catch (error) {
      logger.error(`[WorkflowService] Error handling trigger deployment:`, error);
      throw new Error(`Trigger deployment failed: ${error.message}`);
    }
  }

  /**
   * Get actual component ID from Pipedream triggers data
   * @param {string} appSlug - App slug (e.g., 'gmail')
   * @param {string} triggerKey - Trigger key (e.g., 'new_email_received')
   * @returns {Promise<string|null>} Actual component ID or null if not found
   */
  async getActualComponentId(appSlug, triggerKey) {
    try {
      const PipedreamComponents = require('~/server/services/Pipedream/PipedreamComponents');
      
      logger.info(`[WorkflowService] Looking up component ID for ${appSlug}:${triggerKey}`);
      
      // Get triggers for the app
      const appComponents = await PipedreamComponents.getAppComponents(appSlug, 'triggers');
      
      logger.info(`[WorkflowService] Found ${appComponents.triggers?.length || 0} triggers for ${appSlug}`);
      
      if (!appComponents.triggers || appComponents.triggers.length === 0) {
        logger.warn(`[WorkflowService] No triggers found for app ${appSlug}`);
        return null;
      }
      
      // Log all available triggers for debugging
      logger.info(`[WorkflowService] Available triggers for ${appSlug}:`, 
        appComponents.triggers.map(t => ({ key: t.key, id: t.id, name: t.name }))
      );
      
      // Find the trigger with matching key
      const trigger = appComponents.triggers.find(t => t.key === triggerKey);
      
      if (!trigger) {
        logger.warn(`[WorkflowService] Trigger ${triggerKey} not found for app ${appSlug}`);
        logger.warn(`[WorkflowService] Available trigger keys:`, appComponents.triggers.map(t => t.key));
        return null;
      }
      
      // Return the actual component ID (could be trigger.id or trigger.key)
      const componentId = trigger.id || trigger.key;
      logger.info(`[WorkflowService] Found component ID ${componentId} for ${appSlug}:${triggerKey}`);
      logger.debug(`[WorkflowService] Full trigger object:`, trigger);
      
      return componentId;
    } catch (error) {
      logger.error(`[WorkflowService] Error getting component ID for ${appSlug}:${triggerKey}:`, error);
      return null;
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
   * Execute a workflow immediately
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @param {Object} context - Execution context
   * @param {boolean} isTest - Whether this is a test execution
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflow(workflowId, userId, context = {}, isTest = false) {
    try {
      logger.info(`[WorkflowService] ${isTest ? 'Testing' : 'Executing'} workflow ${workflowId}`);

      // Get the workflow by ID
      const workflow = await this.getWorkflowById(workflowId, userId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Create execution record
      const { createSchedulerExecution } = require('~/models/SchedulerExecution');
      const executionId = `exec_${workflowId}_${Date.now()}`;
      
      const execution = await createSchedulerExecution({
        id: executionId,
        task_id: workflowId,
        user: userId,
        status: 'running',
        start_time: new Date(),
        context: {
          isTest,
          workflowName: workflow.name,
          trigger: { type: 'manual', source: isTest ? 'test' : 'manual' },
          ...context,
        },
      });

      // Use WorkflowExecutor singleton to execute the workflow
      const WorkflowExecutor = require('./WorkflowExecutor');
      const workflowExecutor = WorkflowExecutor.getInstance();

      // Create execution context
      const executionContext = {
        ...context,
        isTest,
        trigger: {
          type: 'manual',
          source: isTest ? 'test' : 'manual',
        },
      };

      // Execute the workflow
      const result = await workflowExecutor.executeWorkflow(
        workflow,
        { id: executionId, user: userId },
        executionContext
      );

      logger.info(`[WorkflowService] Workflow ${workflowId} execution completed successfully`);
      return result;
    } catch (error) {
      logger.error(`[WorkflowService] Error executing workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Stop a running workflow execution
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Stop result
   */
  async stopWorkflow(workflowId, userId) {
    try {
      logger.info(`[WorkflowService] Stopping workflow executions for ${workflowId}`);

      // Use WorkflowExecutor singleton to stop the workflow
      const WorkflowExecutor = require('./WorkflowExecutor');
      const workflowExecutor = WorkflowExecutor.getInstance();

      // Stop all running executions for this workflow
      const stopped = await workflowExecutor.stopWorkflowExecutions(workflowId, userId);

      if (stopped) {
        logger.info(`[WorkflowService] Successfully stopped executions for workflow ${workflowId}`);
        return {
          success: true,
          message: 'Workflow execution stopped successfully',
        };
      } else {
        logger.info(`[WorkflowService] No running executions found for workflow ${workflowId}`);
        return {
          success: true,
          message: 'No running executions to stop',
        };
      }
    } catch (error) {
      logger.error(`[WorkflowService] Error stopping workflow ${workflowId}:`, error);
      throw error;
    }
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
