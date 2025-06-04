const mongoose = require('mongoose');
const { workflowExecutionSchema } = require('@librechat/data-schemas');
const { logger } = require('~/config');

const WorkflowExecution = mongoose.model('WorkflowExecution', workflowExecutionSchema);

/**
 * Create a new workflow execution
 * @param {Object} executionData - Execution data
 * @returns {Promise<Object>} Created execution
 */
async function createWorkflowExecution(executionData) {
  try {
    const execution = new WorkflowExecution(executionData);
    const savedExecution = await execution.save();
    logger.info(`[WorkflowExecution] Created execution: ${savedExecution.id} for workflow ${savedExecution.workflowId}`);
    return savedExecution;
  } catch (error) {
    logger.error('[WorkflowExecution] Error creating execution:', error);
    throw error;
  }
}

/**
 * Get executions by workflow ID
 * @param {string} workflowId - Workflow ID
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of executions
 */
async function getWorkflowExecutions(workflowId, userId, options = {}) {
  try {
    const query = { workflowId, user: userId };
    
    if (options.status) {
      query.status = options.status;
    }

    const limit = options.limit || 50;
    const skip = options.skip || 0;

    const executions = await WorkflowExecution.find(query)
      .sort({ startTime: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    logger.debug(`[WorkflowExecution] Found ${executions.length} executions for workflow ${workflowId}`);
    return executions;
  } catch (error) {
    logger.error(`[WorkflowExecution] Error getting executions for workflow ${workflowId}:`, error);
    throw error;
  }
}

/**
 * Get execution by ID
 * @param {string} executionId - Execution ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Execution or null
 */
async function getWorkflowExecutionById(executionId, userId) {
  try {
    const execution = await WorkflowExecution.findOne({
      id: executionId,
      user: userId,
    }).lean();
    
    return execution;
  } catch (error) {
    logger.error(`[WorkflowExecution] Error getting execution ${executionId}:`, error);
    throw error;
  }
}

/**
 * Update execution status
 * @param {string} executionId - Execution ID
 * @param {string} status - New status
 * @param {Object} updateData - Additional update data
 * @returns {Promise<Object|null>} Updated execution or null
 */
async function updateWorkflowExecution(executionId, status, updateData = {}) {
  try {
    const update = {
      status,
      ...updateData,
      updatedAt: new Date(),
    };

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      update.endTime = new Date();
    }

    const updatedExecution = await WorkflowExecution.findOneAndUpdate(
      { id: executionId },
      update,
      { new: true }
    );
    
    if (updatedExecution) {
      logger.info(`[WorkflowExecution] Updated execution ${executionId} status to ${status}`);
    }
    
    return updatedExecution;
  } catch (error) {
    logger.error(`[WorkflowExecution] Error updating execution ${executionId}:`, error);
    throw error;
  }
}

/**
 * Add step execution
 * @param {string} executionId - Execution ID
 * @param {Object} stepExecution - Step execution data
 * @returns {Promise<Object|null>} Updated execution or null
 */
async function addStepExecution(executionId, stepExecution) {
  try {
    const updatedExecution = await WorkflowExecution.findOneAndUpdate(
      { id: executionId },
      { 
        $push: { stepExecutions: stepExecution },
        currentStepId: stepExecution.stepId,
        updatedAt: new Date(),
      },
      { new: true }
    );
    
    return updatedExecution;
  } catch (error) {
    logger.error(`[WorkflowExecution] Error adding step execution to ${executionId}:`, error);
    throw error;
  }
}

/**
 * Update step execution
 * @param {string} executionId - Execution ID
 * @param {string} stepId - Step ID
 * @param {Object} updateData - Step update data
 * @returns {Promise<Object|null>} Updated execution or null
 */
async function updateStepExecution(executionId, stepId, updateData) {
  try {
    const update = {
      ...updateData,
      updatedAt: new Date(),
    };

    if (updateData.status === 'completed' || updateData.status === 'failed') {
      update.endTime = new Date();
    }

    const updatedExecution = await WorkflowExecution.findOneAndUpdate(
      { 
        id: executionId,
        'stepExecutions.stepId': stepId 
      },
      { 
        $set: Object.keys(update).reduce((acc, key) => {
          acc[`stepExecutions.$.${key}`] = update[key];
          return acc;
        }, {}),
      },
      { new: true }
    );
    
    return updatedExecution;
  } catch (error) {
    logger.error(`[WorkflowExecution] Error updating step execution ${stepId}:`, error);
    throw error;
  }
}

/**
 * Update execution context
 * @param {string} executionId - Execution ID
 * @param {Object} context - Context data to merge
 * @returns {Promise<Object|null>} Updated execution or null
 */
async function updateExecutionContext(executionId, context) {
  try {
    const updatedExecution = await WorkflowExecution.findOneAndUpdate(
      { id: executionId },
      { 
        $set: { context },
        updatedAt: new Date(),
      },
      { new: true }
    );
    
    return updatedExecution;
  } catch (error) {
    logger.error(`[WorkflowExecution] Error updating context for execution ${executionId}:`, error);
    throw error;
  }
}

/**
 * Get running executions
 * @returns {Promise<Array>} Array of running executions
 */
async function getRunningExecutions() {
  try {
    const executions = await WorkflowExecution.find({
      status: { $in: ['pending', 'running'] },
    }).lean();
    
    return executions;
  } catch (error) {
    logger.error('[WorkflowExecution] Error getting running executions:', error);
    throw error;
  }
}

/**
 * Clean up old executions
 * @param {number} daysOld - Number of days to keep
 * @returns {Promise<Object>} Delete result
 */
async function cleanupOldExecutions(daysOld = 30) {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await WorkflowExecution.deleteMany({
      status: { $in: ['completed', 'failed', 'cancelled'] },
      endTime: { $lt: cutoffDate },
    });
    
    logger.info(`[WorkflowExecution] Cleaned up ${result.deletedCount} old executions`);
    return result;
  } catch (error) {
    logger.error('[WorkflowExecution] Error cleaning up executions:', error);
    throw error;
  }
}

module.exports = {
  WorkflowExecution,
  createWorkflowExecution,
  getWorkflowExecutions,
  getWorkflowExecutionById,
  updateWorkflowExecution,
  addStepExecution,
  updateStepExecution,
  updateExecutionContext,
  getRunningExecutions,
  cleanupOldExecutions,
}; 