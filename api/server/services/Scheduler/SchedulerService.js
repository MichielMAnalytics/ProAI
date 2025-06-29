const { v4: uuidv4 } = require('uuid');
const { saveMessage, getMessages } = require('~/models/Message');
const { getConvo, saveConvo } = require('~/models/Conversation');
const { logger } = require('~/config');

/**
 * Simple notification manager for SSE connections
 */
class NotificationManager {
  constructor() {
    this.connections = new Map(); // userId -> Set of response objects
  }

  addConnection(userId, res) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId).add(res);

    // Clean up when connection closes
    res.on('close', () => {
      this.removeConnection(userId, res);
    });

    logger.debug(`[NotificationManager] Added SSE connection for user ${userId}`);
  }

  removeConnection(userId, res) {
    if (this.connections.has(userId)) {
      this.connections.get(userId).delete(res);
      if (this.connections.get(userId).size === 0) {
        this.connections.delete(userId);
      }
    }
    logger.debug(`[NotificationManager] Removed SSE connection for user ${userId}`);
  }

  sendNotification(userId, data) {
    logger.debug(`[NotificationManager] Attempting to send notification to user ${userId}`);
    logger.debug(`[NotificationManager] Active connections:`, Object.keys(this.connections));

    // Validate notification data
    if (!data) {
      logger.error(
        `[NotificationManager] Cannot send notification to user ${userId}: data is null or undefined`,
      );
      return false;
    }

    // Log notification data with safe serialization
    try {
      logger.info(
        `[NotificationManager] Sending notification to user ${userId}:`,
        JSON.stringify(data, null, 2),
      );
    } catch (serializationError) {
      logger.warn(
        `[NotificationManager] Failed to serialize notification data for logging:`,
        serializationError,
      );
      logger.info(
        `[NotificationManager] Sending notification to user ${userId} (data type: ${typeof data})`,
      );
    }

    if (this.connections.has(userId)) {
      const connections = this.connections.get(userId);

      // Safely serialize the notification data
      let message;
      try {
        message = `data: ${JSON.stringify(data)}\n\n`;
      } catch (jsonError) {
        logger.error(
          `[NotificationManager] Failed to serialize notification data for user ${userId}:`,
          jsonError,
        );
        // Send a fallback error notification
        message = `data: ${JSON.stringify({
          type: 'error',
          message: 'Failed to serialize notification data',
          originalType: data?.type || 'unknown',
        })}\n\n`;
      }

      connections.forEach((res) => {
        try {
          // Check if response is still writable before attempting to write
          if (res.destroyed || res.writableEnded || !res.writable) {
            logger.warn(
              `[NotificationManager] Connection for user ${userId} is not writable, removing...`,
            );
            this.removeConnection(userId, res);
            return;
          }

          res.write(message);
        } catch (error) {
          logger.warn(
            `[NotificationManager] Failed to send notification to user ${userId}:`,
            error,
          );
          this.removeConnection(userId, res);
        }
      });

      const remainingConnections = this.connections.get(userId)?.size || 0;
      logger.debug(
        `[NotificationManager] Sent notification to ${remainingConnections} connections for user ${userId}`,
      );
      return remainingConnections > 0;
    } else {
      logger.warn(`[NotificationManager] No active connections for user ${userId}`);
      logger.debug(
        `[NotificationManager] Available connection keys:`,
        Array.from(this.connections.keys()),
      );
    }
    return false;
  }
}

// Global notification manager instance
const notificationManager = new NotificationManager();

/**
 * Internal scheduler service for handling scheduler messages without HTTP calls
 */
class SchedulerService {
  /**
   * Send a message from the scheduler to a user internally
   * @param {Object} params - Message parameters
   * @param {string} params.userId - The user ID to send the message to
   * @param {string} params.conversationId - The conversation ID
   * @param {string} params.message - The message content
   * @param {string} params.taskId - The task ID that generated this message
   * @param {string} params.taskName - The name of the task
   * @param {string} [params.parentMessageId] - The parent message ID to maintain conversation thread
   * @returns {Promise<Object>} Success response with message details
   */
  static async sendSchedulerMessage({
    userId,
    conversationId,
    message,
    taskId,
    taskName,
    parentMessageId: providedParentMessageId,
  }) {
    try {
      // Validate required fields
      if (!userId || !conversationId || !message) {
        throw new Error('Missing required fields: userId, conversationId, message');
      }

      // Always try to find the last message in the conversation for proper threading
      let parentMessageId = providedParentMessageId;

      // Even if a parentMessageId is provided, if it's the NO_PARENT constant, try to find the real parent
      if (!parentMessageId || parentMessageId === '00000000-0000-0000-0000-000000000000') {
        try {
          const messages = await getMessages({ conversationId, user: userId });
          if (messages && messages.length > 0) {
            // Sort messages by createdAt to get the most recent one
            const sortedMessages = messages.sort(
              (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
            );
            parentMessageId = sortedMessages[0].messageId;
            logger.debug(
              `[SchedulerService] Found last message in conversation ${conversationId}: ${parentMessageId}`,
            );
          } else {
            logger.debug(
              `[SchedulerService] No existing messages found in conversation ${conversationId}, using null parentMessageId`,
            );
            parentMessageId = null;
          }
        } catch (error) {
          logger.warn(
            `[SchedulerService] Error getting messages for conversation ${conversationId}:`,
            error,
          );
          // Continue with null parentMessageId
          parentMessageId = null;
        }
      } else {
        logger.debug(
          `[SchedulerService] Using provided parentMessageId ${parentMessageId} for conversation ${conversationId}`,
        );
      }

      // Create a system message from the scheduler
      const messageId = uuidv4();
      const systemMessage = {
        messageId,
        conversationId,
        parentMessageId, // Use the last message ID for proper threading
        text: message,
        sender: 'Scheduler',
        isCreatedByUser: false,
        user: userId,
        unfinished: false,
        error: false,
        // Add metadata about the task
        metadata: {
          taskId,
          taskName,
          source: 'scheduler',
          timestamp: new Date().toISOString(),
        },
      };

      // Create a minimal req object for saveMessage
      const mockReq = {
        user: { id: userId },
        app: { locals: {} },
      };

      // Save the message to the database
      const savedMessage = await saveMessage(mockReq, systemMessage, {
        context: 'SchedulerService.sendSchedulerMessage',
      });

      // Get or create the conversation
      let conversation;
      try {
        conversation = await getConvo(userId, conversationId);
        if (!conversation) {
          // Don't create a new conversation - just log that we couldn't find it
          // The message will still be saved with the correct conversationId
          logger.warn(
            `Conversation ${conversationId} not found for user ${userId}, but message will be saved anyway`,
          );
          conversation = { conversationId, title: `Scheduler: ${taskName || 'Task Result'}` };
        }
      } catch (error) {
        logger.error('Error handling conversation for scheduler message:', error);
        // Continue even if conversation handling fails
        conversation = { conversationId, title: `Scheduler: ${taskName || 'Task Result'}` };
      }

      logger.info(`Scheduler message sent to user ${userId} in conversation ${conversationId}`);

      // Send real-time notification via SSE if user is connected
      const wasNotified = notificationManager.sendNotification(userId, {
        type: 'scheduler_message',
        messageId: savedMessage.messageId,
        conversationId: savedMessage.conversationId,
        taskId,
        taskName,
        message: message,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`[SchedulerService] SSE notification sent: ${wasNotified} for user ${userId}`);

      return {
        success: true,
        messageId: savedMessage.messageId,
        conversationId: savedMessage.conversationId,
        message: 'Message delivered successfully',
        notified: wasNotified,
      };
    } catch (error) {
      logger.error('Error sending scheduler message:', error);
      throw new Error(`Failed to send scheduler message: ${error.message}`);
    }
  }

  /**
   * Format a task result message based on task type and success
   * @param {Object} params - Formatting parameters
   * @param {string} params.taskName - Name of the task
   * @param {string} params.result - The result content
   * @param {string} params.taskType - Type of task (ai, command, api, reminder)
   * @param {boolean} params.success - Whether the task completed successfully
   * @returns {string} Formatted message
   */
  static formatTaskMessage({ taskName, result, taskType, success }) {
    if (success) {
      if (taskType === 'ai') {
        return `**AI Task Completed: ${taskName}**\n\n${result}`;
      } else if (taskType === 'reminder') {
        return `🔔 **Reminder: ${taskName}**\n\n${result}`;
      } else if (taskType === 'api_call') {
        return `**API Task Completed: ${taskName}**\n\n\`\`\`json\n${result}\n\`\`\``;
      } else if (taskType === 'shell_command') {
        return `**Command Completed: ${taskName}**\n\n\`\`\`bash\n${result}\n\`\`\``;
      } else {
        return `**Task Completed: ${taskName}**\n\n${result}`;
      }
    } else {
      return `❌ **Task Failed: ${taskName}**\n\n${result}`;
    }
  }

  /**
   * Format a task notification message
   * @param {Object} params - Notification parameters
   * @param {string} params.taskName - Name of the task
   * @param {string} params.notificationType - Type of notification (started, failed, cancelled)
   * @param {string} [params.details] - Optional additional details
   * @returns {string} Formatted notification message
   */
  static formatNotificationMessage({ taskName, notificationType, details }) {
    if (notificationType === 'started') {
      return `⏳ **Task Started: ${taskName}**\n\nYour scheduled task is now running...`;
    } else if (notificationType === 'failed') {
      return `❌ **Task Failed: ${taskName}**\n\n${details || 'The task encountered an error.'}`;
    } else if (notificationType === 'cancelled') {
      return `🚫 **Task Cancelled: ${taskName}**\n\n${details || 'The task was cancelled.'}`;
    } else {
      return `📋 **Task Update: ${taskName}**\n\n${details || 'Task status updated.'}`;
    }
  }

  /**
   * Send a task result message to a user
   * @param {Object} params - Task result parameters
   * @param {string} params.userId - The LibreChat user ID
   * @param {string} params.conversationId - The conversation ID to send the message to
   * @param {string} params.taskName - Name of the task that completed
   * @param {string} params.taskId - ID of the task
   * @param {string} params.result - The result content to send
   * @param {string} params.taskType - Type of task (ai, command, api, reminder)
   * @param {boolean} params.success - Whether the task completed successfully
   * @param {string} [params.parentMessageId] - The parent message ID to maintain conversation thread
   * @returns {Promise<Object>} Success response
   */
  static async sendTaskResult(params) {
    const { userId, conversationId, taskName, taskId, result, taskType, success, parentMessageId } =
      params;

    if (!userId || !conversationId) {
      logger.warn(`Cannot send message for task ${taskId}: missing userId or conversationId`);
      return { success: false, error: 'Missing userId or conversationId' };
    }

    const message = this.formatTaskMessage({ taskName, result, taskType, success });

    try {
      return await this.sendSchedulerMessage({
        userId,
        conversationId,
        message,
        taskId,
        taskName,
        parentMessageId,
      });
    } catch (error) {
      logger.error(`Error sending task result for task ${taskId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a task notification to a user
   * @param {Object} params - Notification parameters
   * @param {string} params.userId - The LibreChat user ID
   * @param {string} params.conversationId - The conversation ID
   * @param {string} params.taskName - Name of the task
   * @param {string} params.taskId - ID of the task
   * @param {string} params.notificationType - Type of notification (started, failed, cancelled)
   * @param {string} [params.details] - Optional additional details
   * @param {string} [params.parentMessageId] - The parent message ID to maintain conversation thread
   * @returns {Promise<Object>} Success response
   */
  static async sendTaskNotification(params) {
    const { userId, conversationId, taskName, taskId, notificationType, details, parentMessageId } =
      params;

    if (!userId || !conversationId) {
      return { success: false, error: 'Missing userId or conversationId' };
    }

    const message = this.formatNotificationMessage({ taskName, notificationType, details });

    try {
      return await this.sendSchedulerMessage({
        userId,
        conversationId,
        message,
        taskId,
        taskName,
        parentMessageId,
      });
    } catch (error) {
      logger.error(`Error sending notification for task ${taskId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a task status update notification via SSE without creating a message
   * This is useful for notifying about task status changes that don't need to appear in chat
   * @param {Object} params - Status update parameters
   * @param {string} params.userId - The LibreChat user ID
   * @param {string} params.taskName - Name of the task
   * @param {string} params.taskId - ID of the task
   * @param {string} params.notificationType - Type of notification (started, failed, cancelled, completed)
   * @param {string} [params.details] - Optional additional details
   * @returns {Promise<Object>} Success response
   */
  static async sendTaskStatusUpdate(params) {
    const { userId, taskName, taskId, notificationType, details } = params;

    if (!userId) {
      return { success: false, error: 'Missing userId' };
    }

    try {
      // Send real-time notification via SSE if user is connected
      const wasNotified = notificationManager.sendNotification(userId, {
        type: 'task_status_update',
        taskId,
        taskName,
        notificationType,
        details,
        timestamp: new Date().toISOString(),
      });

      logger.debug(
        `[SchedulerService] Task status update sent: ${wasNotified} for user ${userId}, task ${taskId}, status: ${notificationType}`,
      );

      return {
        success: true,
        message: 'Status update sent successfully',
        notified: wasNotified,
      };
    } catch (error) {
      logger.error(`Error sending task status update for task ${taskId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a workflow status update notification via SSE without creating a message
   * This notifies about workflow status changes that don't need to appear in chat
   * @param {Object} params - Status update parameters
   * @param {string} params.userId - The LibreChat user ID
   * @param {string} params.workflowName - Name of the workflow
   * @param {string} params.workflowId - ID of the workflow
   * @param {string} params.notificationType - Type of notification (activated, deactivated, created, updated, deleted, test_started, execution_started, execution_completed, execution_failed, step_started, step_completed, step_failed)
   * @param {string} [params.details] - Optional additional details
   * @param {Object} [params.workflowData] - Optional workflow data for context
   * @param {Object} [params.stepData] - Optional step data for step-level notifications
   * @param {Object} [params.executionResult] - Optional execution result data
   * @returns {Promise<Object>} Success response
   */
  static async sendWorkflowStatusUpdate(params) {
    const {
      userId,
      workflowName,
      workflowId,
      notificationType,
      details,
      workflowData,
      stepData,
      executionResult,
    } = params;

    if (!userId) {
      return { success: false, error: 'Missing userId' };
    }

    try {
      // Send real-time notification via SSE if user is connected
      const wasNotified = notificationManager.sendNotification(userId, {
        type: 'workflow_status_update',
        workflowId,
        workflowName,
        notificationType,
        details,
        workflowData,
        stepData,
        executionResult,
        timestamp: new Date().toISOString(),
      });

      logger.debug(
        `[SchedulerService] Workflow status update sent: ${wasNotified} for user ${userId}, workflow ${workflowId}, status: ${notificationType}${stepData ? `, step: ${stepData.stepName}` : ''}`,
      );

      return {
        success: true,
        message: 'Workflow status update sent successfully',
        notified: wasNotified,
      };
    } catch (error) {
      logger.error(`Error sending workflow status update for workflow ${workflowId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SchedulerService;
module.exports.NotificationManager = NotificationManager;
module.exports.notificationManager = notificationManager;
