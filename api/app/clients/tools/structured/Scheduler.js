const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('~/config');
const SchedulerService = require('~/server/services/Scheduler/SchedulerService');
const { 
  createSchedulerTask, 
  getSchedulerTasksByUser, 
  getSchedulerTaskById,
  updateSchedulerTask,
  deleteSchedulerTask,
  enableSchedulerTask,
  disableSchedulerTask
} = require('~/models/SchedulerTask');
const { EModelEndpoint } = require('librechat-data-provider'); // Import EModelEndpoint for model endpoint
const { validateCronExpression, calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils'); // Use standardized cron utilities

class SchedulerTool extends Tool {
  static lc_name() {
    return 'SchedulerTool';
  }

  constructor(fields = {}) {
    super();
    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    this.userId = fields.userId;
    this.conversationId = fields.conversationId;
    this.parentMessageId = fields.parentMessageId;
    this.endpoint = fields.endpoint;
    this.model = fields.model;
    this.req = fields.req;
    
    // Debug logging to see what context we receive
    logger.debug(`[SchedulerTool] Constructor called with:`, {
      userId: this.userId,
      conversationId: this.conversationId,
      parentMessageId: this.parentMessageId,
      endpoint: this.endpoint,
      model: this.model,
      override: this.override,
      hasReq: !!this.req,
      reqBodyModel: this.req?.body?.model,
      reqBodyEndpoint: this.req?.body?.endpoint,
      reqBodyEndpointOption: this.req?.body?.endpointOption,
    });
    
    this.name = 'scheduler';
    this.description = `Create and manage scheduled tasks that can execute prompts at specified times using cron expressions.
    
    Available actions:
    - create_task: Create a new scheduled task with cron timing
    - list_tasks: List all user's scheduled tasks  
    - get_task: Get details of a specific task
    - update_task: Update an existing task (schedule, prompt, settings)
    - delete_task: Delete a scheduled task
    - enable_task: Enable a disabled task
    - disable_task: Disable an active task
    
    SCHEDULE CONFIGURATION:
    
    All schedules use UTC-based cron expressions for consistency with workflows.
    
    Cron format: "minute hour day_of_month month day_of_week"
    - minute: 0-59 or * (every minute) or */N (every N minutes)
    - hour: 0-23 or * (every hour) or */N (every N hours)  
    - day_of_month: 1-31 or * (every day)
    - month: 1-12 or * (every month)
    - day_of_week: 0-6 (0=Sunday) or * (every day)
    
    Common UTC-based cron expressions:
    - "0 9 * * *" = Daily at 9 AM UTC
    - "0 14 * * *" = Daily at 2 PM UTC
    - "*/30 * * * *" = Every 30 minutes
    - "0 */6 * * *" = Every 6 hours
    - "0 9 * * 1" = Every Monday at 9 AM UTC
    - "0 0 1 * *" = First day of every month at midnight UTC
    
    TASK CONFIGURATION OPTIONS:
    
    - do_only_once: true = Task runs only once then disables itself
    - do_only_once: false = Task runs repeatedly according to schedule
    - enabled: true = Task is active and will execute on schedule
    - enabled: false = Task is created but disabled (won't execute)
    
    EXAMPLE USAGE:
    
    Create a daily reminder:
    {
      "action": "create_task",
      "name": "Daily Status Report",
      "schedule": "0 9 * * *",
      "prompt": "Generate a daily status report for the team",
      "do_only_once": false,
      "enabled": true
    }
    
    Create a one-time reminder:
    {
      "action": "create_task", 
      "name": "Meeting Reminder",
      "schedule": "30 14 25 12 *",
      "prompt": "Remind about the year-end meeting tomorrow",
      "do_only_once": true,
      "enabled": true
    }
    
    Update task schedule:
    {
      "action": "update_task",
      "task_id": "task_abc123",
      "schedule": "*/15 * * * *"
    }
    
    IMPORTANT NOTES:
    - All times are interpreted as UTC
    - Tasks are automatically enabled when created unless specified otherwise
    - Use do_only_once: true for one-time reminders or notifications
    - Use do_only_once: false for recurring tasks like daily reports
    - Tasks can be temporarily disabled without deletion using disable_task
    - Cron expressions are validated before task creation`;
    
    this.schema = z.object({
      action: z.enum(['create_task', 'list_tasks', 'get_task', 'update_task', 'delete_task', 'enable_task', 'disable_task'])
        .describe('The action to perform'),
      name: z.string().optional()
        .describe('Name of the task (required for create_task)'),
      schedule: z.string().optional()
        .describe('Cron expression for scheduling (required for create_task). Examples: "0 9 * * *" (daily at 9 AM), "*/30 * * * *" (every 30 minutes)'),
      prompt: z.string().optional()
        .describe('The prompt to send to the AI agent when the task runs (required for create_task)'),
      do_only_once: z.boolean().optional().default(true)
        .describe('Whether to run the task only once (true) or repeatedly (false)'),
      enabled: z.boolean().optional().default(true)
        .describe('Whether the task is enabled'),
      task_id: z.string().optional()
        .describe('Task ID for get_task, update_task, delete_task, enable_task, disable_task actions'),
    });
  }

  /**
   * Create a new scheduled task
   * @param {Object} data - Task data
   * @param {string} userId - User ID  
   * @param {string} conversationId - Conversation ID
   * @param {string} parentMessageId - Parent message ID
   * @param {string} endpoint - Endpoint name
   * @param {string} model - Model name
   * @returns {Promise<Object>} Created task result
   */
  async createTask(data, userId, conversationId, parentMessageId, endpoint, model) {
    const { name, schedule, prompt, do_only_once, enabled } = data;

    // Validate required fields
    if (!name || !schedule || !prompt) {
      throw new Error('Missing required fields: name, schedule, and prompt are required');
    }

    // Validate cron expression using standardized validation
    const cronValidation = validateCronExpression(schedule);
    if (!cronValidation.valid) {
      throw new Error(`Invalid cron expression: ${cronValidation.error}`);
    }

    const taskId = `task_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

    const taskData = {
      id: taskId,
      name,
      schedule,
      prompt,
      enabled: enabled !== undefined ? enabled : true,
      do_only_once: do_only_once !== undefined ? do_only_once : true,
      type: 'task',
      next_run: cronValidation.nextRun,
      status: 'pending',
      user: userId,
      conversation_id: conversationId,
      parent_message_id: parentMessageId,
    };

    logger.info(`[SchedulerTool] Creating task: ${taskId} (${name}) - will use configured model/endpoint from librechat.yaml`);
    logger.debug(`[SchedulerTool] Task data:`, { ...taskData, prompt: prompt.substring(0, 100) + '...' });

    try {
      const task = await createSchedulerTask(taskData);
      
      // Send notification to refresh schedules panel  
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: userId,
          taskId: taskId,
          taskName: name,
          notificationType: 'created',
          details: 'New task created via chat interface'
        });
        logger.debug(`[SchedulerTool] Sent task creation notification for task ${taskId}`);
      } catch (notificationError) {
        logger.warn(`[SchedulerTool] Failed to send task creation notification: ${notificationError.message}`);
      }

      logger.info(`[SchedulerTool] Created task: ${taskId} (${name}) for user ${userId}`);
      
      return {
        success: true,
        message: `Task "${name}" created successfully. ${do_only_once ? 'It will run once' : 'It will run repeatedly'} according to schedule: ${schedule}`,
        task: {
          id: task.id,
          name: task.name,
          schedule: task.schedule,
          prompt: task.prompt,
          enabled: task.enabled,
          do_only_once: task.do_only_once,
          status: task.status,
          next_run: task.next_run,
          conversation_id: task.conversation_id,
          parent_message_id: task.parent_message_id,
        }
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error creating task:`, error);
      throw new Error(`Failed to create task: ${error.message}`);
    }
  }

  async listTasks(userId) {
    try {
      const tasks = await getSchedulerTasksByUser(userId);
      
      return {
        success: true,
        message: `Found ${tasks.length} tasks`,
        tasks: tasks.map(task => ({
          id: task.id,
          name: task.name,
          schedule: task.schedule,
          prompt: task.prompt.substring(0, 100) + (task.prompt.length > 100 ? '...' : ''),
          enabled: task.enabled,
          do_only_once: task.do_only_once,
          status: task.status,
          last_run: task.last_run,
          next_run: task.next_run,
          conversation_id: task.conversation_id,
          parent_message_id: task.parent_message_id,
        }))
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error listing tasks:`, error);
      throw new Error(`Failed to list tasks: ${error.message}`);
    }
  }

  async getTask(taskId, userId) {
    if (!taskId) {
      throw new Error('Task ID is required');
    }

    try {
      const task = await getSchedulerTaskById(taskId, userId);
      
      if (!task) {
        return {
          success: false,
          message: `Task with ID ${taskId} not found`
        };
      }

      return {
        success: true,
        message: `Task details retrieved`,
        task: {
          id: task.id,
          name: task.name,
          schedule: task.schedule,
          prompt: task.prompt,
          enabled: task.enabled,
          do_only_once: task.do_only_once,
          status: task.status,
          last_run: task.last_run,
          next_run: task.next_run,
          conversation_id: task.conversation_id,
          parent_message_id: task.parent_message_id,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
        }
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error getting task:`, error);
      throw new Error(`Failed to get task: ${error.message}`);
    }
  }

  async updateTask(taskId, userId, updateData) {
    if (!taskId) {
      throw new Error('Task ID is required');
    }

    // Validate cron expression if schedule is being updated
    if (updateData.schedule) {
      const cronValidation = validateCronExpression(updateData.schedule);
      if (!cronValidation.valid) {
        throw new Error(`Invalid cron expression: ${cronValidation.error}`);
      }
      updateData.next_run = cronValidation.nextRun;
      logger.debug(`[SchedulerTool] Updated schedule for task ${taskId}: ${updateData.schedule}, next run: ${cronValidation.nextRun?.toISOString()}`);
    }

    try {
      const updatedTask = await updateSchedulerTask(taskId, userId, updateData);
      
      if (!updatedTask) {
        return {
          success: false,
          message: `Task with ID ${taskId} not found`
        };
      }

      // Send notification to refresh schedules panel
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: userId,
          taskId: taskId,
          taskName: updatedTask.name,
          notificationType: 'updated',
          details: 'Task updated via chat interface'
        });
        logger.debug(`[SchedulerTool] Sent task update notification for task ${taskId}`);
      } catch (notificationError) {
        logger.warn(`[SchedulerTool] Failed to send task update notification: ${notificationError.message}`);
      }

      return {
        success: true,
        message: `Task "${updatedTask.name}" updated successfully`,
        task: {
          id: updatedTask.id,
          name: updatedTask.name,
          schedule: updatedTask.schedule,
          prompt: updatedTask.prompt,
          enabled: updatedTask.enabled,
          do_only_once: updatedTask.do_only_once,
          status: updatedTask.status,
          next_run: updatedTask.next_run,
          conversation_id: updatedTask.conversation_id,
          parent_message_id: updatedTask.parent_message_id,
        }
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error updating task ${taskId}:`, error);
      throw new Error(`Failed to update task: ${error.message}`);
    }
  }

  async deleteTask(taskId, userId) {
    if (!taskId) {
      throw new Error('Task ID is required');
    }

    try {
      const result = await deleteSchedulerTask(taskId, userId);
      
      if (result.deletedCount === 0) {
        return {
          success: false,
          message: `Task with ID ${taskId} not found`
        };
      }

      // Send notification to refresh schedules panel
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: userId,
          taskId: taskId,
          taskName: 'Deleted Task',
          notificationType: 'deleted',
          details: 'Task deleted via chat interface'
        });
        logger.debug(`[SchedulerTool] Sent task deletion notification for task ${taskId}`);
      } catch (notificationError) {
        logger.warn(`[SchedulerTool] Failed to send task deletion notification: ${notificationError.message}`);
      }

      return {
        success: true,
        message: `Task deleted successfully`
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error deleting task:`, error);
      throw new Error(`Failed to delete task: ${error.message}`);
    }
  }

  async enableTask(taskId, userId) {
    if (!taskId) {
      throw new Error('Task ID is required');
    }

    try {
      const task = await enableSchedulerTask(taskId, userId);
      
      if (!task) {
        return {
          success: false,
          message: `Task with ID ${taskId} not found`
        };
      }

      // Send notification to refresh schedules panel
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: userId,
          taskId: taskId,
          taskName: task.name,
          notificationType: 'enabled',
          details: 'Task enabled via chat interface'
        });
        logger.debug(`[SchedulerTool] Sent task enable notification for task ${taskId}`);
      } catch (notificationError) {
        logger.warn(`[SchedulerTool] Failed to send task enable notification: ${notificationError.message}`);
      }

      return {
        success: true,
        message: `Task "${task.name}" enabled successfully`
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error enabling task:`, error);
      throw new Error(`Failed to enable task: ${error.message}`);
    }
  }

  async disableTask(taskId, userId) {
    if (!taskId) {
      throw new Error('Task ID is required');
    }

    try {
      const task = await disableSchedulerTask(taskId, userId);
      
      if (!task) {
        return {
          success: false,
          message: `Task with ID ${taskId} not found`
        };
      }

      // Send notification to refresh schedules panel
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: userId,
          taskId: taskId,
          taskName: task.name,
          notificationType: 'disabled',
          details: 'Task disabled via chat interface'
        });
        logger.debug(`[SchedulerTool] Sent task disable notification for task ${taskId}`);
      } catch (notificationError) {
        logger.warn(`[SchedulerTool] Failed to send task disable notification: ${notificationError.message}`);
      }

      return {
        success: true,
        message: `Task "${task.name}" disabled successfully`
      };
    } catch (error) {
      logger.error(`[SchedulerTool] Error disabling task:`, error);
      throw new Error(`Failed to disable task: ${error.message}`);
    }
  }

  async _call(input, config) {
    try {
      const { action, ...data } = input;
      
      // Extract user context from the tool instance and config
      const userId = this.userId;
      // Try to get conversationId from config first (like MCP tools), then fall back to instance
      const conversationId = config?.configurable?.thread_id || 
                           config?.configurable?.conversationId ||
                           this.conversationId;
      
      // Debug logging to understand message ID flow
      logger.debug(`[SchedulerTool._call] Available message IDs:`, {
        'req.body.userMessageId': this.req?.body?.userMessageId,
        'req.body.overrideUserMessageId': this.req?.body?.overrideUserMessageId,
        'req.body.parentMessageId': this.req?.body?.parentMessageId,
        'req.body.messageId': this.req?.body?.messageId,
        'config.configurable': config?.configurable,
        'instance.parentMessageId': this.parentMessageId,
      });
      
      // Try to get parentMessageId from various sources
      // First priority: use the current user message ID
      let parentMessageId = this.req?.body?.userMessageId || this.req?.body?.overrideUserMessageId;
      
      // Fallback to other sources if userMessageId not found
      if (!parentMessageId) {
        parentMessageId = this.parentMessageId;
      }
      if (!parentMessageId && this.req?.body?.parentMessageId) {
        parentMessageId = this.req.body.parentMessageId;
      }
      if (!parentMessageId && config?.configurable?.parentMessageId) {
        parentMessageId = config.configurable.parentMessageId;
      }
      
      const endpoint = this.endpoint;
      const model = this.model;
      
      if (!userId) {
        throw new Error('User context not available');
      }

      logger.debug(`[SchedulerTool] Executing action: ${action}`, { 
        userId, 
        conversationId, 
        parentMessageId,
        userMessageId: this.req?.body?.userMessageId,
        overrideUserMessageId: this.req?.body?.overrideUserMessageId,
        configThreadId: config?.configurable?.thread_id,
        instanceConversationId: this.conversationId,
        hasConfig: !!config,
        configKeys: config ? Object.keys(config) : 'no config',
        configurableKeys: config?.configurable ? Object.keys(config.configurable) : 'no configurable',
      });

      switch (action) {
        case 'create_task':
          return await this.createTask(data, userId, conversationId, parentMessageId, endpoint, model);
        
        case 'list_tasks':
          return await this.listTasks(userId);
        
        case 'get_task':
          return await this.getTask(data.task_id, userId);
        
        case 'update_task':
          const { task_id, ...updateData } = data;
          return await this.updateTask(task_id, userId, updateData);
        
        case 'delete_task':
          return await this.deleteTask(data.task_id, userId);
        
        case 'enable_task':
          return await this.enableTask(data.task_id, userId);
        
        case 'disable_task':
          return await this.disableTask(data.task_id, userId);
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error(`[SchedulerTool] Error in _call:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SchedulerTool; 