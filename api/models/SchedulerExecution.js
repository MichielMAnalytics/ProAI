const mongoose = require('mongoose');
const { schedulerExecutionSchema } = require('@librechat/data-schemas');
const SchedulerExecution = mongoose.model('SchedulerExecution', schedulerExecutionSchema);

/**
 * Create a new scheduler execution
 * @param {ISchedulerExecution} executionData - The execution data
 * @returns {Promise<ISchedulerExecution>} The created execution document
 */
async function createSchedulerExecution(executionData) {
  try {
    return await SchedulerExecution.create(executionData);
  } catch (error) {
    throw new Error(`Error creating scheduler execution: ${error.message}`);
  }
}

/**
 * Get a scheduler execution by ID
 * @param {string} id - The execution ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ISchedulerExecution|null>} The execution document or null if not found
 */
async function getSchedulerExecutionById(id, userId) {
  try {
    return await SchedulerExecution.findOne({ id, user: userId }).lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler execution: ${error.message}`);
  }
}

/**
 * Get scheduler executions by task ID
 * @param {string} taskId - The task ID
 * @param {string} userId - The user's ObjectId
 * @param {number} limit - Maximum number of executions to return
 * @returns {Promise<ISchedulerExecution[]>} Array of execution documents
 */
async function getSchedulerExecutionsByTask(taskId, userId, limit = 10) {
  try {
    return await SchedulerExecution.find({ task_id: taskId, user: userId })
      .sort({ start_time: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler executions: ${error.message}`);
  }
}

/**
 * Get all scheduler executions for a user
 * @param {string} userId - The user's ObjectId
 * @param {number} limit - Maximum number of executions to return
 * @returns {Promise<ISchedulerExecution[]>} Array of execution documents
 */
async function getSchedulerExecutionsByUser(userId, limit = 50) {
  try {
    return await SchedulerExecution.find({ user: userId })
      .sort({ start_time: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler executions: ${error.message}`);
  }
}

/**
 * Update a scheduler execution
 * @param {string} id - The execution ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @param {Partial<ISchedulerExecution>} updateData - The data to update
 * @returns {Promise<ISchedulerExecution|null>} The updated execution document or null if not found
 */
async function updateSchedulerExecution(id, userId, updateData) {
  try {
    return await SchedulerExecution.findOneAndUpdate(
      { id, user: userId },
      { ...updateData, updatedAt: new Date() },
      { new: true },
    ).lean();
  } catch (error) {
    throw new Error(`Error updating scheduler execution: ${error.message}`);
  }
}

/**
 * Delete scheduler executions by task ID
 * @param {string} taskId - The task ID
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function deleteSchedulerExecutionsByTask(taskId, userId) {
  try {
    return await SchedulerExecution.deleteMany({ task_id: taskId, user: userId });
  } catch (error) {
    throw new Error(`Error deleting scheduler executions: ${error.message}`);
  }
}

/**
 * Delete all scheduler executions for a user
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function deleteSchedulerExecutionsByUser(userId) {
  try {
    return await SchedulerExecution.deleteMany({ user: userId });
  } catch (error) {
    throw new Error(`Error deleting scheduler executions: ${error.message}`);
  }
}

/**
 * Get running scheduler executions
 * @param {string} userId - The user's ObjectId (optional, if not provided returns all running executions)
 * @returns {Promise<ISchedulerExecution[]>} Array of running execution documents
 */
async function getRunningSchedulerExecutions(userId = null) {
  try {
    const query = { status: 'running' };
    if (userId) {
      query.user = userId;
    }
    return await SchedulerExecution.find(query).lean();
  } catch (error) {
    throw new Error(`Error fetching running scheduler executions: ${error.message}`);
  }
}

/**
 * Clean up old scheduler executions (keep only the most recent N executions per task)
 * @param {string} userId - The user's ObjectId
 * @param {number} keepCount - Number of executions to keep per task
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function cleanupOldSchedulerExecutions(userId, keepCount = 10) {
  try {
    // Get all tasks for the user
    const tasks = await SchedulerExecution.distinct('task_id', { user: userId });

    let totalDeleted = 0;

    for (const taskId of tasks) {
      // Get executions for this task, sorted by start_time descending
      const executions = await SchedulerExecution.find({ task_id: taskId, user: userId })
        .sort({ start_time: -1 })
        .select('_id')
        .lean();

      // If we have more than keepCount executions, delete the oldest ones
      if (executions.length > keepCount) {
        const toDelete = executions.slice(keepCount).map((exec) => exec._id);
        const result = await SchedulerExecution.deleteMany({ _id: { $in: toDelete } });
        totalDeleted += result.deletedCount || 0;
      }
    }

    return { deletedCount: totalDeleted };
  } catch (error) {
    throw new Error(`Error cleaning up scheduler executions: ${error.message}`);
  }
}

module.exports = {
  createSchedulerExecution,
  getSchedulerExecutionById,
  getSchedulerExecutionsByTask,
  getSchedulerExecutionsByUser,
  updateSchedulerExecution,
  deleteSchedulerExecutionsByTask,
  deleteSchedulerExecutionsByUser,
  getRunningSchedulerExecutions,
  cleanupOldSchedulerExecutions,
};
