const { logger } = require('~/config');
const SchedulerService = require('./SchedulerService');

class SchedulerNotificationManager {
  constructor() {
    logger.debug('[SchedulerNotificationManager] Initialized');
  }

  /**
   * Send task started notification
   * @param {Object} task - The scheduler task
   * @returns {Promise<void>}
   */
  async sendTaskStartedNotification(task) {
    try {
      await SchedulerService.sendTaskStatusUpdate({
        userId: task.user.toString(),
        taskId: task.id,
        taskName: task.name,
        notificationType: 'started',
        details: 'Task execution has begun'
      });
      logger.debug(`[SchedulerNotificationManager] Sent task started notification for task ${task.id}`);
    } catch (error) {
      logger.warn(`[SchedulerNotificationManager] Failed to send task started notification: ${error.message}`);
      // Don't fail the task execution if notification fails
    }
  }

  /**
   * Send task completed notification
   * @param {Object} task - The scheduler task
   * @param {number} duration - Execution duration in milliseconds
   * @returns {Promise<void>}
   */
  async sendTaskCompletedNotification(task, duration) {
    try {
      await SchedulerService.sendTaskStatusUpdate({
        userId: task.user.toString(),
        taskId: task.id,
        taskName: task.name,
        notificationType: 'completed',
        details: `Task completed successfully in ${duration}ms`
      });
      logger.debug(`[SchedulerNotificationManager] Sent task completed notification for task ${task.id}`);
    } catch (error) {
      logger.warn(`[SchedulerNotificationManager] Failed to send task completed notification: ${error.message}`);
      // Don't fail the task execution if notification fails
    }
  }

  /**
   * Send task failed notification
   * @param {Object} task - The scheduler task
   * @param {number} duration - Execution duration in milliseconds
   * @param {Error} error - The error that caused the failure
   * @returns {Promise<void>}
   */
  async sendTaskFailedNotification(task, duration, error) {
    try {
      await SchedulerService.sendTaskStatusUpdate({
        userId: task.user.toString(),
        taskId: task.id,
        taskName: task.name,
        notificationType: 'failed',
        details: `Task failed after ${duration}ms: ${error.message}`
      });
      logger.debug(`[SchedulerNotificationManager] Sent task failed notification for task ${task.id}`);
    } catch (notificationError) {
      logger.warn(`[SchedulerNotificationManager] Failed to send task failed notification: ${notificationError.message}`);
      // Don't fail the task execution if notification fails
    }
  }

  /**
   * Send task result message to user
   * @param {Object} task - The scheduler task
   * @param {string} result - The task execution result
   * @returns {Promise<void>}
   */
  async sendTaskResultMessage(task, result) {
    try {
      await SchedulerService.sendSchedulerMessage({
        userId: task.user.toString(),
        conversationId: task.conversation_id,
        message: typeof result === 'string' ? result : JSON.stringify(result),
        taskId: task.id,
        taskName: task.name,
        parentMessageId: task.parent_message_id,
      });
      logger.debug(`[SchedulerNotificationManager] Sent task result message for task ${task.id}`);
    } catch (error) {
      logger.error(`[SchedulerNotificationManager] Failed to send task result message: ${error.message}`);
      throw error; // This is more critical than status notifications
    }
  }

  /**
   * Send task failure message to user
   * @param {Object} task - The scheduler task
   * @param {Error} error - The error that caused the failure
   * @returns {Promise<void>}
   */
  async sendTaskFailureMessage(task, error) {
    try {
      await SchedulerService.sendSchedulerMessage({
        userId: task.user.toString(),
        conversationId: task.conversation_id,
        message: `Task execution failed: ${error.message}`,
        taskId: task.id,
        taskName: task.name,
        parentMessageId: task.parent_message_id,
      });
      logger.debug(`[SchedulerNotificationManager] Sent task failure message for task ${task.id}`);
    } catch (sendError) {
      logger.error(`[SchedulerNotificationManager] Failed to send task failure message: ${sendError.message}`);
      // Don't throw here as we're already handling a failure
    }
  }

  /**
   * Send all notifications for a successful task completion
   * @param {Object} task - The scheduler task
   * @param {string} result - The task execution result
   * @param {number} duration - Execution duration in milliseconds
   * @returns {Promise<void>}
   */
  async sendSuccessNotifications(task, result, duration) {
    // Send result message to user (critical)
    await this.sendTaskResultMessage(task, result);
    
    // Note: We intentionally skip sendTaskCompletedNotification here to avoid duplicate notifications
    // The task result message already indicates successful completion
  }

  /**
   * Send all notifications for a failed task
   * @param {Object} task - The scheduler task
   * @param {Error} error - The error that caused the failure
   * @param {number} duration - Execution duration in milliseconds
   * @returns {Promise<void>}
   */
  async sendFailureNotifications(task, error, duration) {
    // Send failure message to user (less critical than status)
    await this.sendTaskFailureMessage(task, error);
    
    // Send status notification (non-critical)
    await this.sendTaskFailedNotification(task, duration, error);
  }
}

module.exports = SchedulerNotificationManager; 