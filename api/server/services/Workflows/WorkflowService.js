const { logger } = require('~/config');
const { 
  createUserWorkflow, 
  getUserWorkflows, 
  getUserWorkflowById,
  updateUserWorkflow,
  deleteUserWorkflow,
  toggleUserWorkflow,
  getActiveWorkflows,
  updateWorkflowStats
} = require('~/models/UserWorkflow');
const { 
  createWorkflowExecution,
  updateWorkflowExecution,
  getWorkflowExecution,
  createWorkflowStepExecution,
  updateWorkflowStepExecution
} = require('~/models/WorkflowExecution');
const WorkflowExecutor = require('./WorkflowExecutor');
const { v4: uuidv4 } = require('uuid');

class WorkflowService {
  constructor() {
    this.executor = new WorkflowExecutor();
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
      
      // Create workflow
      const workflow = await createUserWorkflow({
        ...workflowData,
        user: userId,
      });
      
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
      
      const workflows = await getUserWorkflows(userId, filters);
      
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
      
      const workflow = await getUserWorkflowById(workflowId, userId);
      
      if (!workflow) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for user ${userId}`);
        return null;
      }
      
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
        this.validateWorkflowData(updateData);
      }
      
      const updatedWorkflow = await updateUserWorkflow(workflowId, userId, updateData);
      
      if (!updatedWorkflow) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for update`);
        return null;
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
      
      const result = await deleteUserWorkflow(workflowId, userId);
      
      if (result.deletedCount === 0) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for deletion`);
        return false;
      }
      
      logger.info(`[WorkflowService] Deleted workflow ${workflowId}`);
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
      
      const workflow = await toggleUserWorkflow(workflowId, userId, isActive);
      
      if (!workflow) {
        logger.warn(`[WorkflowService] Workflow ${workflowId} not found for toggle`);
        return null;
      }
      
      // If activating, schedule the workflow if it has a schedule trigger
      if (isActive && workflow.trigger.type === 'schedule') {
        await this.scheduleWorkflow(workflow);
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
      
      // Create execution record
      const executionId = `exec_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
      const execution = await createWorkflowExecution({
        id: executionId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        user: userId,
        trigger: {
          type: context.trigger?.type || 'manual',
          source: context.trigger?.source || (isTest ? 'test' : 'api'),
          data: context.trigger?.data || {}
        },
        status: 'running',
        startTime: new Date(),
        context,
        isTest,
      });
      
      try {
        // Execute workflow
        const result = await this.executor.executeWorkflow(workflow, execution, context);
        
        // Update execution status
        await updateWorkflowExecution(execution.id, result.success ? 'completed' : 'failed', {
          endTime: new Date(),
          result: result.result,
          error: result.error,
        });
        
        // Update workflow stats (only for non-test executions)
        if (!isTest) {
          await updateWorkflowStats(workflowId, result.success);
        }
        
        logger.info(`[WorkflowService] ${isTest ? 'Test' : 'Execution'} completed for workflow ${workflowId}: ${result.success ? 'success' : 'failed'}`);
        return result;
      } catch (error) {
        // Update execution status on error
        await updateWorkflowExecution(execution.id, 'failed', {
          endTime: new Date(),
          error: error.message,
        });
        
        // Update workflow stats (only for non-test executions)
        if (!isTest) {
          await updateWorkflowStats(workflowId, false);
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
      
      const workflows = await getActiveWorkflows();
      
      logger.debug(`[WorkflowService] Found ${workflows.length} active workflows`);
      return workflows;
    } catch (error) {
      logger.error('[WorkflowService] Error getting active workflows:', error);
      throw error;
    }
  }

  /**
   * Schedule workflow (placeholder for scheduler integration)
   * @param {Object} workflow - Workflow to schedule
   * @returns {Promise<void>}
   */
  async scheduleWorkflow(workflow) {
    try {
      logger.info(`[WorkflowService] Scheduling workflow ${workflow.id}`);
      
      // TODO: Integrate with scheduler service
      // This would register the workflow with the scheduler based on trigger configuration
      
      logger.info(`[WorkflowService] Scheduled workflow ${workflow.id}`);
    } catch (error) {
      logger.error(`[WorkflowService] Error scheduling workflow ${workflow.id}:`, error);
      throw error;
    }
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

    const validStepTypes = ['action', 'condition', 'delay'];
    if (!validStepTypes.includes(step.type)) {
      throw new Error(`Step ${index} has invalid type: ${step.type}`);
    }

    if (!step.config) {
      throw new Error(`Step ${index} missing config`);
    }

    // Validate step-specific configuration
    switch (step.type) {
      case 'delay':
        if (typeof step.config.delayMs !== 'number' || step.config.delayMs < 0) {
          throw new Error(`Step ${index} delay must be a positive number`);
        }
        break;
      case 'condition':
        if (!step.config.condition) {
          throw new Error(`Step ${index} condition missing condition expression`);
        }
        break;
      case 'action':
        // Action steps can use MCP tools dynamically via agent selection
        // or be configured with specific toolName for direct tool calls
        logger.debug(`[WorkflowService] Action step ${index} configured for ${step.config.toolName ? 'direct tool call' : 'agent-driven execution'}`);
        break;
    }

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
}

module.exports = WorkflowService; 