const mongoose = require('mongoose');
const { userWorkflowSchema } = require('@librechat/data-schemas');
const { logger } = require('~/config');

const UserWorkflow = mongoose.model('UserWorkflow', userWorkflowSchema);

/**
 * Create a new workflow
 * @param {Object} workflowData - Workflow data
 * @returns {Promise<Object>} Created workflow
 */
async function createUserWorkflow(workflowData) {
  try {
    const workflow = new UserWorkflow(workflowData);
    const savedWorkflow = await workflow.save();
    logger.info(`[UserWorkflow] Created workflow: ${savedWorkflow.id} for user ${savedWorkflow.user}`);
    return savedWorkflow;
  } catch (error) {
    logger.error('[UserWorkflow] Error creating workflow:', error);
    throw error;
  }
}

/**
 * Get workflows by user ID
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of workflows
 */
async function getUserWorkflows(userId, options = {}) {
  try {
    const query = { user: userId };
    
    if (options.isActive !== undefined) {
      query.isActive = options.isActive;
    }
    
    if (options.isDraft !== undefined) {
      query.isDraft = options.isDraft;
    }

    const workflows = await UserWorkflow.find(query)
      .sort({ updatedAt: -1 })
      .lean();
    
    logger.debug(`[UserWorkflow] Found ${workflows.length} workflows for user ${userId}`);
    return workflows;
  } catch (error) {
    logger.error(`[UserWorkflow] Error getting workflows for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get workflow by ID and user
 * @param {string} workflowId - Workflow ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Workflow or null
 */
async function getUserWorkflowById(workflowId, userId) {
  try {
    const workflow = await UserWorkflow.findOne({
      id: workflowId,
      user: userId,
    }).lean();
    
    if (workflow) {
      logger.debug(`[UserWorkflow] Found workflow ${workflowId} for user ${userId}`);
    } else {
      logger.debug(`[UserWorkflow] Workflow ${workflowId} not found for user ${userId}`);
    }
    
    return workflow;
  } catch (error) {
    logger.error(`[UserWorkflow] Error getting workflow ${workflowId}:`, error);
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
async function updateUserWorkflow(workflowId, userId, updateData) {
  try {
    const updatedWorkflow = await UserWorkflow.findOneAndUpdate(
      { id: workflowId, user: userId },
      { 
        ...updateData, 
        updatedAt: new Date(),
        version: updateData.version ? updateData.version + 1 : undefined,
      },
      { new: true }
    );
    
    if (updatedWorkflow) {
      logger.info(`[UserWorkflow] Updated workflow ${workflowId} for user ${userId}`);
    } else {
      logger.warn(`[UserWorkflow] Workflow ${workflowId} not found for update`);
    }
    
    return updatedWorkflow;
  } catch (error) {
    logger.error(`[UserWorkflow] Error updating workflow ${workflowId}:`, error);
    throw error;
  }
}

/**
 * Delete workflow
 * @param {string} workflowId - Workflow ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Delete result
 */
async function deleteUserWorkflow(workflowId, userId) {
  try {
    const result = await UserWorkflow.deleteOne({
      id: workflowId,
      user: userId,
    });
    
    logger.info(`[UserWorkflow] Deleted workflow ${workflowId} for user ${userId}`);
    return result;
  } catch (error) {
    logger.error(`[UserWorkflow] Error deleting workflow ${workflowId}:`, error);
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
async function toggleUserWorkflow(workflowId, userId, isActive) {
  try {
    const updatedWorkflow = await UserWorkflow.findOneAndUpdate(
      { id: workflowId, user: userId },
      { 
        isActive,
        isDraft: isActive ? false : undefined, // If activating, remove draft status
        updatedAt: new Date(),
      },
      { new: true }
    );
    
    if (updatedWorkflow) {
      logger.info(`[UserWorkflow] ${isActive ? 'Activated' : 'Deactivated'} workflow ${workflowId}`);
    }
    
    return updatedWorkflow;
  } catch (error) {
    logger.error(`[UserWorkflow] Error toggling workflow ${workflowId}:`, error);
    throw error;
  }
}

/**
 * Get active workflows for scheduling
 * @returns {Promise<Array>} Array of active workflows
 */
async function getActiveWorkflows() {
  try {
    const workflows = await UserWorkflow.find({
      isActive: true,
      isDraft: false,
    }).lean();
    
    logger.debug(`[UserWorkflow] Found ${workflows.length} active workflows`);
    return workflows;
  } catch (error) {
    logger.error('[UserWorkflow] Error getting active workflows:', error);
    throw error;
  }
}

/**
 * Update workflow execution stats
 * @param {string} workflowId - Workflow ID
 * @param {boolean} success - Whether execution was successful
 * @returns {Promise<Object|null>} Updated workflow or null
 */
async function updateWorkflowStats(workflowId, success) {
  try {
    const updateData = {
      last_run: new Date(),
      run_count: { $inc: 1 },
      updatedAt: new Date(),
    };
    
    if (success) {
      updateData.success_count = { $inc: 1 };
    } else {
      updateData.failure_count = { $inc: 1 };
    }
    
    const updatedWorkflow = await UserWorkflow.findOneAndUpdate(
      { id: workflowId },
      updateData,
      { new: true }
    );
    
    return updatedWorkflow;
  } catch (error) {
    logger.error(`[UserWorkflow] Error updating stats for workflow ${workflowId}:`, error);
    throw error;
  }
}

module.exports = {
  UserWorkflow,
  createUserWorkflow,
  getUserWorkflows,
  getUserWorkflowById,
  updateUserWorkflow,
  deleteUserWorkflow,
  toggleUserWorkflow,
  getActiveWorkflows,
  updateWorkflowStats,
}; 