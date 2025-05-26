const { v4: uuidv4 } = require('uuid');
const { saveMessage, getMessages } = require('~/models/Message');
const { getConvo, saveConvo } = require('~/models/Conversation');
const { logger } = require('~/config');

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
   * @returns {Promise<Object>} Success response with message details
   */
  static async sendSchedulerMessage({ userId, conversationId, message, taskId, taskName }) {
    try {
      // Validate required fields
      if (!userId || !conversationId || !message) {
        throw new Error('Missing required fields: userId, conversationId, message');
      }
      
      // Get the last message in the conversation to set proper parentMessageId
      let parentMessageId = null;
      try {
        const messages = await getMessages({ conversationId, user: userId });
        if (messages && messages.length > 0) {
          // Sort messages by createdAt to get the most recent one
          const sortedMessages = messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          parentMessageId = sortedMessages[0].messageId;
          logger.debug(`Found last message in conversation ${conversationId}: ${parentMessageId}`);
        } else {
          logger.debug(`No existing messages found in conversation ${conversationId}, using null parentMessageId`);
        }
      } catch (error) {
        logger.warn(`Error getting messages for conversation ${conversationId}:`, error);
        // Continue with null parentMessageId
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
          timestamp: new Date().toISOString()
        }
      };
      
      // Create a minimal req object for saveMessage
      const mockReq = {
        user: { id: userId },
        app: { locals: {} }
      };
      
      // Save the message to the database
      const savedMessage = await saveMessage(
        mockReq,
        systemMessage,
        { context: 'SchedulerService.sendSchedulerMessage' }
      );
      
      // Get or create the conversation
      let conversation;
      try {
        conversation = await getConvo(userId, conversationId);
        if (!conversation) {
          // Don't create a new conversation - just log that we couldn't find it
          // The message will still be saved with the correct conversationId
          logger.warn(`Conversation ${conversationId} not found for user ${userId}, but message will be saved anyway`);
          conversation = { conversationId, title: `Scheduler: ${taskName || 'Task Result'}` };
        }
      } catch (error) {
        logger.error('Error handling conversation for scheduler message:', error);
        // Continue even if conversation handling fails
        conversation = { conversationId, title: `Scheduler: ${taskName || 'Task Result'}` };
      }
      
      logger.info(`Scheduler message sent to user ${userId} in conversation ${conversationId}`);
      
      return {
        success: true,
        messageId: savedMessage.messageId,
        conversationId: savedMessage.conversationId,
        message: 'Message delivered successfully'
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
      if (taskType === "ai") {
        return `**AI Task Completed: ${taskName}**\n\n${result}`;
      } else if (taskType === "reminder") {
        return `🔔 **Reminder: ${taskName}**\n\n${result}`;
      } else if (taskType === "api_call") {
        return `**API Task Completed: ${taskName}**\n\n\`\`\`json\n${result}\n\`\`\``;
      } else if (taskType === "shell_command") {
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
    if (notificationType === "started") {
      return `⏳ **Task Started: ${taskName}**\n\nYour scheduled task is now running...`;
    } else if (notificationType === "failed") {
      return `❌ **Task Failed: ${taskName}**\n\n${details || 'The task encountered an error.'}`;
    } else if (notificationType === "cancelled") {
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
   * @returns {Promise<Object>} Success response
   */
  static async sendTaskResult(params) {
    const { userId, conversationId, taskName, taskId, result, taskType, success } = params;
    
    if (!userId || !conversationId) {
      logger.warning(`Cannot send message for task ${taskId}: missing userId or conversationId`);
      return { success: false, error: 'Missing userId or conversationId' };
    }
    
    const message = this.formatTaskMessage({ taskName, result, taskType, success });
    
    try {
      return await this.sendSchedulerMessage({
        userId,
        conversationId,
        message,
        taskId,
        taskName
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
   * @returns {Promise<Object>} Success response
   */
  static async sendTaskNotification(params) {
    const { userId, conversationId, taskName, taskId, notificationType, details } = params;
    
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
        taskName
      });
    } catch (error) {
      logger.error(`Error sending notification for task ${taskId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SchedulerService; 