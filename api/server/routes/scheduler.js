const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { sendSchedulerMessage } = require('~/server/controllers/scheduler');
const SchedulerService = require('~/server/services/SchedulerService');

const router = express.Router();

/**
 * Send a message from the scheduler to a user (requires authentication)
 * @route POST /scheduler/message
 * @param {string} userId - The user ID to send the message to
 * @param {string} conversationId - The conversation ID
 * @param {string} message - The message content
 * @param {string} taskId - The task ID that generated this message
 * @param {string} taskName - The name of the task
 * @returns {object} Success response
 */
router.post('/message', requireJwtAuth, sendSchedulerMessage);

/**
 * Internal endpoint for scheduler to send messages (no authentication required)
 * This is used by the MCP scheduler server to send messages internally
 * @route POST /scheduler/internal/message
 * @param {string} userId - The user ID to send the message to
 * @param {string} conversationId - The conversation ID
 * @param {string} message - The message content
 * @param {string} taskId - The task ID that generated this message
 * @param {string} taskName - The name of the task
 * @returns {object} Success response
 */
router.post('/internal/message', async (req, res) => {
  try {
    const result = await SchedulerService.sendSchedulerMessage(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Internal endpoint for scheduler to send task results (no authentication required)
 * @route POST /scheduler/internal/task-result
 * @param {string} userId - The LibreChat user ID
 * @param {string} conversationId - The conversation ID to send the message to
 * @param {string} taskName - Name of the task that completed
 * @param {string} taskId - ID of the task
 * @param {string} result - The result content to send
 * @param {string} taskType - Type of task (ai, command, api, reminder)
 * @param {boolean} success - Whether the task completed successfully
 * @returns {object} Success response
 */
router.post('/internal/task-result', async (req, res) => {
  try {
    const result = await SchedulerService.sendTaskResult(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Internal endpoint for scheduler to send task notifications (no authentication required)
 * @route POST /scheduler/internal/notification
 * @param {string} userId - The LibreChat user ID
 * @param {string} conversationId - The conversation ID
 * @param {string} taskName - Name of the task
 * @param {string} taskId - ID of the task
 * @param {string} notificationType - Type of notification (started, failed, cancelled)
 * @param {string} [details] - Optional additional details
 * @returns {object} Success response
 */
router.post('/internal/notification', async (req, res) => {
  try {
    const result = await SchedulerService.sendTaskNotification(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router; 