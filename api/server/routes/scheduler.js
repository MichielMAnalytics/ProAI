const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { sendSchedulerMessage } = require('~/server/controllers/scheduler');
const SchedulerService = require('~/server/services/Scheduler/SchedulerService');
const SchedulerExecutionService = require('~/server/services/Scheduler/SchedulerExecutionService');
const { notificationManager } = require('~/server/services/Scheduler/SchedulerService');
const { setHeaders } = require('~/server/middleware');
const { 
  getSchedulerTasksByUser,
  getSchedulerTasksOnlyByUser,
  getSchedulerWorkflowsByUser,
  getSchedulerTaskById,
  updateSchedulerTask,
  deleteSchedulerTask,
  enableSchedulerTask,
  disableSchedulerTask
} = require('~/models/SchedulerTask');
const {
  getSchedulerExecutionsByTask,
  getSchedulerExecutionsByUser,
  getSchedulerExecutionById
} = require('~/models/SchedulerExecution');

const router = express.Router();

/**
 * Get all scheduler tasks for the authenticated user
 * @route GET /scheduler/tasks
 * @query {string} [type] - Optional type filter ('task' | 'workflow')
 * @returns {object} Array of scheduler tasks
 */
router.get('/tasks', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query;
    
    let tasks;
    if (type === 'task') {
      tasks = await getSchedulerTasksOnlyByUser(userId);
    } else if (type === 'workflow') {
      tasks = await getSchedulerWorkflowsByUser(userId);
    } else {
      tasks = await getSchedulerTasksByUser(userId, type);
    }
    
    res.json({
      success: true,
      tasks: tasks.map(task => ({
        id: task.id,
        name: task.name,
        schedule: task.schedule,
        prompt: task.prompt,
        enabled: task.enabled,
        do_only_once: task.do_only_once,
        type: task.type,
        status: task.status,
        last_run: task.last_run,
        next_run: task.next_run,
        conversation_id: task.conversation_id,
        parent_message_id: task.parent_message_id,
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get a specific scheduler task by ID
 * @route GET /scheduler/tasks/:taskId
 * @param {string} taskId - The task ID
 * @returns {object} Scheduler task details
 */
router.get('/tasks/:taskId', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    
    const task = await getSchedulerTaskById(taskId, userId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
              task: {
        id: task.id,
        name: task.name,
        schedule: task.schedule,
        prompt: task.prompt,
        enabled: task.enabled,
        do_only_once: task.do_only_once,
        type: task.type,
        status: task.status,
        last_run: task.last_run,
        next_run: task.next_run,
        conversation_id: task.conversation_id,
        parent_message_id: task.parent_message_id,
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Update a scheduler task
 * @route PUT /scheduler/tasks/:taskId
 * @param {string} taskId - The task ID
 * @returns {object} Updated scheduler task
 */
router.put('/tasks/:taskId', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    const updateData = req.body;
    
    const updatedTask = await updateSchedulerTask(taskId, userId, updateData);
    
    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: `Task "${updatedTask.name}" updated successfully`,
              task: {
        id: updatedTask.id,
        name: updatedTask.name,
        schedule: updatedTask.schedule,
        prompt: updatedTask.prompt,
        enabled: updatedTask.enabled,
        do_only_once: updatedTask.do_only_once,
        type: updatedTask.type,
        status: updatedTask.status,
        next_run: updatedTask.next_run,
        conversation_id: updatedTask.conversation_id,
        parent_message_id: updatedTask.parent_message_id,
        endpoint: updatedTask.endpoint,
        ai_model: updatedTask.ai_model,
        agent_id: updatedTask.agent_id,
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Delete a scheduler task
 * @route DELETE /scheduler/tasks/:taskId
 * @param {string} taskId - The task ID
 * @returns {object} Success response
 */
router.delete('/tasks/:taskId', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    
    const result = await deleteSchedulerTask(taskId, userId);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Enable a scheduler task
 * @route POST /scheduler/tasks/:taskId/enable
 * @param {string} taskId - The task ID
 * @returns {object} Updated scheduler task
 */
router.post('/tasks/:taskId/enable', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    
    const task = await enableSchedulerTask(taskId, userId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: `Task "${task.name}" enabled successfully`,
      task: {
        id: task.id,
        name: task.name,
        enabled: task.enabled,
        type: task.type,
        status: task.status,
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Disable a scheduler task
 * @route POST /scheduler/tasks/:taskId/disable
 * @param {string} taskId - The task ID
 * @returns {object} Updated scheduler task
 */
router.post('/tasks/:taskId/disable', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    
    const task = await disableSchedulerTask(taskId, userId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: `Task "${task.name}" disabled successfully`,
      task: {
        id: task.id,
        name: task.name,
        enabled: task.enabled,
        type: task.type,
        status: task.status,
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

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
 * SSE endpoint for real-time scheduler notifications
 * @route GET /scheduler/notifications
 * @returns {stream} Server-Sent Events stream
 */
router.get('/notifications', setHeaders, async (req, res) => {
  try {
    // Extract token from query parameter since EventSource doesn't support custom headers
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }
    
    // Manually verify the JWT token
    const jwt = require('jsonwebtoken');
    const { User } = require('~/db/models');
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userId = user._id.toString();
    
    // Add this connection to the notification manager
    notificationManager.addConnection(userId, res);
    
    // Send initial connection confirmation
    res.write('data: {"type":"connected","message":"Connected to scheduler notifications"}\n\n');
    
    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write('data: {"type":"heartbeat"}\n\n');
      } catch (error) {
        clearInterval(heartbeat);
      }
    }, 30000); // 30 seconds
    
    // Clean up on connection close
    req.on('close', () => {
      clearInterval(heartbeat);
      notificationManager.removeConnection(userId, res);
    });
    
  } catch (error) {
    console.error('Error setting up SSE connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

/**
 * Get scheduler queue status for monitoring
 * @route GET /scheduler/status
 * @returns {object} Queue status information
 */
router.get('/status', requireJwtAuth, async (req, res) => {
  try {
    // Get global scheduler instance (you'll need to make this accessible)
    // For now, return basic status - this can be enhanced later
    const status = {
      scheduler: {
        isRunning: true, // This would come from the actual scheduler instance
        lastCheck: new Date().toISOString(),
      },
      queue: {
        main: {
          size: 0,
          pending: 0,
          isPaused: false,
        },
        retry: {
          size: 0,
          pending: 0,
          isPaused: false,
        },
      },
      config: {
        concurrency: parseInt(process.env.SCHEDULER_CONCURRENCY || '3'),
        taskTimeout: parseInt(process.env.SCHEDULER_TASK_TIMEOUT || '300000'),
        maxRetries: parseInt(process.env.SCHEDULER_MAX_RETRIES || '3'),
        shutdownTimeout: parseInt(process.env.SCHEDULER_SHUTDOWN_TIMEOUT || '60000'),
      }
    };
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get scheduler executions - either all executions for user or executions for a specific task
 * @route GET /scheduler/executions
 * @route GET /scheduler/tasks/:taskId/executions
 * @returns {object} Array of scheduler executions
 */
router.get('/executions', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    
    const executions = await getSchedulerExecutionsByUser(userId, limit);
    
    res.json({
      success: true,
      executions
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

router.get('/tasks/:taskId/executions', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const executions = await getSchedulerExecutionsByTask(taskId, userId, limit);
    
    res.json({
      success: true,
      executions
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get a specific scheduler execution by ID
 * @route GET /scheduler/executions/:executionId
 * @param {string} executionId - The execution ID
 * @returns {object} Scheduler execution details
 */
router.get('/executions/:executionId', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { executionId } = req.params;
    
    const execution = await getSchedulerExecutionById(executionId, userId);
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }
    
    res.json({
      success: true,
      execution
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router; 