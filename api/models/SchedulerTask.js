const mongoose = require('mongoose');
const { schedulerTaskSchema } = require('@librechat/data-schemas');
const SchedulerTask = mongoose.model('SchedulerTask', schedulerTaskSchema);

/**
 * Create a new scheduler task
 * @param {ISchedulerTask} taskData - The task data
 * @returns {Promise<ISchedulerTask>} The created task document
 */
async function createSchedulerTask(taskData) {
  try {
    return await SchedulerTask.create(taskData);
  } catch (error) {
    throw new Error(`Error creating scheduler task: ${error.message}`);
  }
}

/**
 * Get a scheduler task by ID (excludes deleted by default)
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @param {boolean} [includeDeleted=false] - Whether to include soft-deleted tasks
 * @returns {Promise<ISchedulerTask|null>} The task document or null if not found
 */
async function getSchedulerTaskById(id, userId, includeDeleted = false) {
  try {
    const query = { id, user: userId };
    if (!includeDeleted) {
      query.deleted = { $ne: true }; // Exclude deleted items
    }
    return await SchedulerTask.findOne(query).lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler task: ${error.message}`);
  }
}

/**
 * Get all scheduler tasks for a user (excludes deleted by default)
 * @param {string} userId - The user's ObjectId
 * @param {string} [type] - Optional type filter ('task' | 'workflow')
 * @param {boolean} [includeDeleted=false] - Whether to include soft-deleted tasks
 * @returns {Promise<ISchedulerTask[]>} Array of task documents
 */
async function getSchedulerTasksByUser(userId, type = null, includeDeleted = false) {
  try {
    const query = { user: userId };
    if (type) {
      query.type = type;
    }
    if (!includeDeleted) {
      query.deleted = { $ne: true }; // Exclude deleted items
    }
    return await SchedulerTask.find(query).lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler tasks: ${error.message}`);
  }
}

/**
 * Get enabled scheduler tasks that are ready to run (excludes deleted tasks)
 * @returns {Promise<ISchedulerTask[]>} Array of task documents
 */
async function getReadySchedulerTasks() {
  try {
    const now = new Date();
    return await SchedulerTask.find({
      enabled: true,
      deleted: { $ne: true }, // Exclude deleted tasks
      $or: [
        // Pending tasks that are ready to run
        {
          status: 'pending',
          $or: [{ next_run: { $lte: now } }, { next_run: null }],
        },
        // Only recurring tasks (not do_only_once) that have completed and are ready for next run
        {
          status: 'completed',
          do_only_once: false,
          $or: [{ next_run: { $lte: now } }, { next_run: null }],
        },
      ],
    }).lean();
  } catch (error) {
    throw new Error(`Error fetching ready scheduler tasks: ${error.message}`);
  }
}

/**
 * Update a scheduler task
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @param {Partial<ISchedulerTask>} updateData - The data to update
 * @returns {Promise<ISchedulerTask|null>} The updated task document or null if not found
 */
async function updateSchedulerTask(id, userId, updateData) {
  try {
    return await SchedulerTask.findOneAndUpdate(
      { id, user: userId },
      { ...updateData, updatedAt: new Date() },
      { new: true },
    ).lean();
  } catch (error) {
    throw new Error(`Error updating scheduler task: ${error.message}`);
  }
}

/**
 * Soft delete a scheduler task (marks as deleted instead of removing from database)
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ISchedulerTask|null>} The updated task document or null if not found
 */
async function softDeleteSchedulerTask(id, userId) {
  try {
    return await SchedulerTask.findOneAndUpdate(
      { id, user: userId, deleted: { $ne: true } }, // Only delete non-deleted tasks
      { 
        deleted: true, 
        deleted_at: new Date(),
        deleted_by: userId,
        enabled: false, // Disable when deleted
        status: 'disabled',
        updatedAt: new Date() 
      },
      { new: true }
    ).lean();
  } catch (error) {
    throw new Error(`Error soft deleting scheduler task: ${error.message}`);
  }
}

/**
 * Hard delete a scheduler task (permanently removes from database)
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function deleteSchedulerTask(id, userId) {
  try {
    return await SchedulerTask.deleteOne({ id, user: userId });
  } catch (error) {
    throw new Error(`Error deleting scheduler task: ${error.message}`);
  }
}

/**
 * Atomically update task status (compare-and-swap operation for race condition prevention)
 * Only updates if the current status matches the expected status
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @param {string} expectedStatus - The expected current status
 * @param {string} newStatus - The new status to set
 * @param {Partial<ISchedulerTask>} [additionalData] - Additional data to update
 * @returns {Promise<ISchedulerTask|null>} The updated task document or null if status didn't match
 */
async function atomicUpdateTaskStatus(id, userId, expectedStatus, newStatus, additionalData = {}) {
  try {
    return await SchedulerTask.findOneAndUpdate(
      { 
        id, 
        user: userId, 
        status: expectedStatus  // ← This is the "compare" part of compare-and-swap
      },
      { 
        status: newStatus,      // ← This is the "swap" part 
        updatedAt: new Date(),
        ...additionalData 
      },
      { new: true },
    ).lean();
  } catch (error) {
    throw new Error(`Error atomically updating scheduler task status: ${error.message}`);
  }
}

/**
 * Delete all scheduler tasks for a user
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function deleteSchedulerTasksByUser(userId) {
  try {
    return await SchedulerTask.deleteMany({ user: userId });
  } catch (error) {
    throw new Error(`Error deleting scheduler tasks: ${error.message}`);
  }
}

/**
 * Enable a scheduler task
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ISchedulerTask|null>} The updated task document or null if not found
 */
async function enableSchedulerTask(id, userId) {
  try {
    return await SchedulerTask.findOneAndUpdate(
      { id, user: userId },
      { enabled: true, status: 'pending', updatedAt: new Date() },
      { new: true },
    ).lean();
  } catch (error) {
    throw new Error(`Error enabling scheduler task: ${error.message}`);
  }
}

/**
 * Disable a scheduler task
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ISchedulerTask|null>} The updated task document or null if not found
 */
async function disableSchedulerTask(id, userId) {
  try {
    return await SchedulerTask.findOneAndUpdate(
      { id, user: userId },
      { enabled: false, status: 'disabled', updatedAt: new Date() },
      { new: true },
    ).lean();
  } catch (error) {
    throw new Error(`Error disabling scheduler task: ${error.message}`);
  }
}

/**
 * Get all scheduler tasks across all users (for admin/startup purposes)
 * @returns {Promise<ISchedulerTask[]>} Array of all task documents
 */
async function getAllSchedulerTasks() {
  try {
    return await SchedulerTask.find({}).lean();
  } catch (error) {
    throw new Error(`Error fetching all scheduler tasks: ${error.message}`);
  }
}

/**
 * Get only task-type scheduler tasks for a user
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ISchedulerTask[]>} Array of task documents
 */
async function getSchedulerTasksOnlyByUser(userId) {
  try {
    return await SchedulerTask.find({ user: userId, type: 'task' }).lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler tasks: ${error.message}`);
  }
}

/**
 * Get only workflow-type scheduler tasks for a user (excludes deleted by default)
 * @param {string} userId - The user's ObjectId
 * @param {boolean} [includeDeleted=false] - Whether to include soft-deleted workflows
 * @returns {Promise<ISchedulerTask[]>} Array of workflow documents
 */
async function getSchedulerWorkflowsByUser(userId, includeDeleted = false) {
  try {
    const query = { user: userId, type: 'workflow' };
    if (!includeDeleted) {
      query.deleted = { $ne: true }; // Exclude deleted items
    }
    return await SchedulerTask.find(query).lean();
  } catch (error) {
    throw new Error(`Error fetching scheduler workflows: ${error.message}`);
  }
}

/**
 * Get deleted scheduler tasks for a user (for admin/audit purposes)
 * @param {string} userId - The user's ObjectId
 * @param {string} [type] - Optional type filter ('task' | 'workflow')
 * @returns {Promise<ISchedulerTask[]>} Array of deleted task documents
 */
async function getDeletedSchedulerTasksByUser(userId, type = null) {
  try {
    const query = { user: userId, deleted: true };
    if (type) {
      query.type = type;
    }
    return await SchedulerTask.find(query).lean();
  } catch (error) {
    throw new Error(`Error fetching deleted scheduler tasks: ${error.message}`);
  }
}

/**
 * Restore a soft-deleted scheduler task
 * @param {string} id - The task ID (not MongoDB _id)
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ISchedulerTask|null>} The restored task document or null if not found
 */
async function restoreSchedulerTask(id, userId) {
  try {
    return await SchedulerTask.findOneAndUpdate(
      { id, user: userId, deleted: true }, // Only restore deleted tasks
      { 
        deleted: false,
        deleted_at: null,
        deleted_by: null,
        status: 'pending', // Set to pending when restored
        updatedAt: new Date() 
      },
      { new: true }
    ).lean();
  } catch (error) {
    throw new Error(`Error restoring scheduler task: ${error.message}`);
  }
}

module.exports = {
  createSchedulerTask,
  getSchedulerTaskById,
  getSchedulerTasksByUser,
  getSchedulerTasksOnlyByUser,
  getSchedulerWorkflowsByUser,
  getReadySchedulerTasks,
  updateSchedulerTask,
  atomicUpdateTaskStatus,
  deleteSchedulerTask,
  softDeleteSchedulerTask,
  deleteSchedulerTasksByUser,
  getDeletedSchedulerTasksByUser,
  restoreSchedulerTask,
  enableSchedulerTask,
  disableSchedulerTask,
  getAllSchedulerTasks,
};
