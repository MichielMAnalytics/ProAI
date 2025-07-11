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
        details: 'Task execution has begun',
      });
      logger.debug(
        `[SchedulerNotificationManager] Sent task started notification for task ${task.id}`,
      );
    } catch (error) {
      logger.warn(
        `[SchedulerNotificationManager] Failed to send task started notification: ${error.message}`,
      );
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
        details: `Task completed successfully in ${duration}ms`,
      });
      logger.debug(
        `[SchedulerNotificationManager] Sent task completed notification for task ${task.id}`,
      );
    } catch (error) {
      logger.warn(
        `[SchedulerNotificationManager] Failed to send task completed notification: ${error.message}`,
      );
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
        details: `Task failed after ${duration}ms: ${error.message}`,
      });
      logger.debug(
        `[SchedulerNotificationManager] Sent task failed notification for task ${task.id}`,
      );
    } catch (notificationError) {
      logger.warn(
        `[SchedulerNotificationManager] Failed to send task failed notification: ${notificationError.message}`,
      );
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
      // Skip message sending for manual workflows without conversation context
      if (!task.conversation_id) {
        logger.debug(
          `[SchedulerNotificationManager] Skipping task result message for task ${task.id} - no conversation context (manual workflow)`,
        );
        return;
      }

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
      logger.error(
        `[SchedulerNotificationManager] Failed to send task result message: ${error.message}`,
      );
      // Don't throw for manual workflows - they don't need conversation messages
      if (task.conversation_id) {
        throw error; // This is more critical than status notifications for conversation-based tasks
      }
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
      // Skip message sending for manual workflows without conversation context
      if (!task.conversation_id) {
        logger.debug(
          `[SchedulerNotificationManager] Skipping task failure message for task ${task.id} - no conversation context (manual workflow)`,
        );
        return;
      }

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
      logger.error(
        `[SchedulerNotificationManager] Failed to send task failure message: ${sendError.message}`,
      );
      // Don't throw here as we're already handling a failure
    }
  }

  /**
   * Send conversation refresh notification to update UI
   * @param {Object} task - The scheduler task
   * @param {string} messageId - The message ID that was created
   * @returns {Promise<void>}
   */
  async sendConversationRefreshNotification(task, messageId) {
    try {
      await SchedulerService.sendTaskStatusUpdate({
        userId: task.user.toString(),
        taskId: task.id,
        taskName: task.name,
        notificationType: 'conversation_refresh',
        details: JSON.stringify({
          conversationId: task.conversation_id,
          messageId: messageId,
          action: 'refresh_messages',
        }),
      });
      logger.debug(
        `[SchedulerNotificationManager] Sent conversation refresh notification for task ${task.id}`,
      );
    } catch (error) {
      logger.warn(
        `[SchedulerNotificationManager] Failed to send conversation refresh notification: ${error.message}`,
      );
      // Don't fail the task execution if notification fails
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
    // For tasks that execute within a conversation context (have conversation_id),
    // the agent execution already creates a message in the conversation via client.sendMessage().
    // We should NOT send an additional scheduler message to avoid duplicates.
    // Only send scheduler messages for:
    // 1. Tasks without conversation_id (standalone tasks)
    // 2. Tasks that don't execute through agents (direct endpoint execution)

    const hasConversationContext =
      task.conversation_id && task.conversation_id !== '00000000-0000-0000-0000-000000000000';

    if (!hasConversationContext) {
      // This is a standalone task (no conversation context), send the result message
      logger.debug(
        `[SchedulerNotificationManager] Sending task result message for standalone task ${task.id}`,
      );
      await this.sendTaskResultMessage(task, result);
    } else {
      // This task executed within a conversation context, the result is already in the conversation
      // Send a conversation refresh notification to update the UI instead
      logger.debug(
        `[SchedulerNotificationManager] Sending conversation refresh notification for task ${task.id} in conversation ${task.conversation_id}`,
      );
      await this.sendConversationRefreshNotification(task, null); // messageId will be determined by the client
    }

    // Always send status update notification (SSE only, no conversation message)
    await this.sendTaskCompletedNotification(task, duration);
  }

  /**
   * Send all notifications for a failed task
   * @param {Object} task - The scheduler task
   * @param {Error} error - The error that caused the failure
   * @param {number} duration - Execution duration in milliseconds
   * @returns {Promise<void>}
   */
  async sendFailureNotifications(task, error, duration) {
    // For tasks that execute within a conversation context (have conversation_id),
    // we should be more careful about sending failure messages to avoid duplicates.
    // However, unlike success cases, failures might not always create conversation messages,
    // so we'll still send failure messages but with more context.

    const hasConversationContext =
      task.conversation_id && task.conversation_id !== '00000000-0000-0000-0000-000000000000';

    if (!hasConversationContext) {
      // This is a standalone task (no conversation context), send the failure message
      logger.debug(
        `[SchedulerNotificationManager] Sending task failure message for standalone task ${task.id}`,
      );
      await this.sendTaskFailureMessage(task, error);
    } else {
      // This task executed within a conversation context
      // For now, still send failure messages as they may not always be captured in conversation
      logger.debug(
        `[SchedulerNotificationManager] Sending task failure message for conversation task ${task.id} in conversation ${task.conversation_id}`,
      );
      await this.sendTaskFailureMessage(task, error);
    }

    // Always send status notification (SSE only, no conversation message)
    await this.sendTaskFailedNotification(task, duration, error);
  }
}

module.exports = SchedulerNotificationManager;
