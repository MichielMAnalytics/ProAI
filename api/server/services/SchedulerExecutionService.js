const { logger } = require('~/config');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { Providers } = require('@librechat/agents');
const SchedulerService = require('./SchedulerService');
const { 
  createSchedulerExecution, 
  updateSchedulerExecution 
} = require('~/models/SchedulerExecution');
const { updateSchedulerTask, getReadySchedulerTasks } = require('~/models/SchedulerTask');

class SchedulerExecutionService {
  constructor() {
    logger.debug('[SchedulerExecutionService] Constructor called');
    
    // Import endpoint initializers dynamically to avoid circular dependencies
    this.endpointInitializers = {};
    
    try {
      const { initializeClient: initOpenAIClient } = require('~/server/services/Endpoints/openAI/initialize');
      const { initializeClient: initCustomClient } = require('~/server/services/Endpoints/custom/initialize');
      const { initializeClient: initAnthropicClient } = require('~/server/services/Endpoints/anthropic/initialize');
      const { initializeClient: initGoogleClient } = require('~/server/services/Endpoints/google/initialize');
      const { initializeClient: initAgentsClient } = require('~/server/services/Endpoints/agents/initialize');
      
      this.endpointInitializers = {
        [EModelEndpoint.openAI]: initOpenAIClient,
        [EModelEndpoint.azureOpenAI]: initOpenAIClient,
        [EModelEndpoint.custom]: initCustomClient,
        [EModelEndpoint.anthropic]: initAnthropicClient,
        [EModelEndpoint.google]: initGoogleClient,
        [EModelEndpoint.agents]: initAgentsClient,
      };
      
      logger.debug('[SchedulerExecutionService] Endpoint initializers loaded:', Object.keys(this.endpointInitializers));
    } catch (error) {
      logger.error('[SchedulerExecutionService] Error loading endpoint initializers:', error);
    }
    
    this.isRunning = false;
  }

  async executeTask(task) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`[SchedulerExecutionService] Starting task execution: ${task.id} (${task.name})`);
    
    // Create execution record
    const execution = await createSchedulerExecution({
      id: executionId,
      task_id: task.id,
      start_time: new Date(),
      status: 'running',
      user: task.user,
    });

    // Update task status
    await updateSchedulerTask(task.id, task.user, {
      status: 'running',
      last_run: new Date(),
    });

    // Send task start notification
    try {
      await SchedulerService.sendTaskNotification({
        userId: task.user,
        conversationId: task.conversation_id,
        taskId: task.id,
        taskName: task.name,
        notificationType: 'start',
      });
    } catch (error) {
      logger.warn(`[SchedulerExecutionService] Failed to send start notification: ${error.message}`);
    }

    try {
      // Execute the task by sending the prompt to the AI agent
      const result = await this.executePrompt(task);
      
      // Update execution with success
      await updateSchedulerExecution(executionId, task.user, {
        end_time: new Date(),
        status: 'completed',
        output: result,
      });

      // Update task status
      let taskStatus = 'completed';
      let nextUpdate = { status: taskStatus };
      
      // If it's a one-time task, disable it
      if (task.do_only_once) {
        nextUpdate.enabled = false;
        nextUpdate.status = 'disabled';
        taskStatus = 'disabled';
        logger.info(`[SchedulerExecutionService] One-time task ${task.id} completed, disabling it`);
      } else {
        // Calculate next run time for recurring tasks
        try {
          const { parseCronExpression } = require('cron-schedule');
          const cron = parseCronExpression(task.schedule);
          nextUpdate.next_run = cron.getNextDate();
          nextUpdate.status = 'pending';
          taskStatus = 'pending';
        } catch (error) {
          logger.error(`[SchedulerExecutionService] Failed to calculate next run time: ${error.message}`);
          nextUpdate.status = 'failed';
          taskStatus = 'failed';
        }
      }
      
      await updateSchedulerTask(task.id, task.user, nextUpdate);

      // Send task completion notification
      try {
        await SchedulerService.sendTaskResult({
          userId: task.user,
          conversationId: task.conversation_id,
          taskId: task.id,
          taskName: task.name,
          result: result,
          success: true,
        });
      } catch (error) {
        logger.warn(`[SchedulerExecutionService] Failed to send completion notification: ${error.message}`);
      }

      logger.info(`[SchedulerExecutionService] Task execution completed: ${task.id} - Status: ${taskStatus}`);
      
    } catch (error) {
      logger.error(`[SchedulerExecutionService] Task execution failed: ${task.id} - ${error.message}`);
      
      // Update execution with failure
      await updateSchedulerExecution(executionId, task.user, {
        end_time: new Date(),
        status: 'failed',
        error: error.message,
      });

      // Update task status
      await updateSchedulerTask(task.id, task.user, {
        status: 'failed',
      });

      // Send task failure notification
      try {
        await SchedulerService.sendTaskResult({
          userId: task.user,
          conversationId: task.conversation_id,
          taskId: task.id,
          taskName: task.name,
          result: error.message,
          success: false,
        });
      } catch (notificationError) {
        logger.warn(`[SchedulerExecutionService] Failed to send failure notification: ${notificationError.message}`);
      }
    }
  }

  async executePrompt(task) {
    const { prompt, endpoint, ai_model, user, conversation_id } = task;
    
    if (!prompt) {
      throw new Error('No prompt provided for task execution');
    }

    logger.info(`[SchedulerExecutionService] Executing prompt for task ${task.id} using ${endpoint}/${ai_model}`);

    // Use the original endpoint from the task, don't fall back to OpenAI for agents
    const targetEndpoint = endpoint || EModelEndpoint.openAI;
    const targetModel = ai_model || 'gpt-4o-mini';

    logger.debug(`[SchedulerExecutionService] Target endpoint: ${targetEndpoint}, Available endpoints:`, Object.keys(this.endpointInitializers));

    // Get the appropriate client initializer
    const initializeClient = this.endpointInitializers[targetEndpoint];
    if (!initializeClient) {
      logger.error(`[SchedulerExecutionService] No initializer found for endpoint: ${targetEndpoint}`);
      logger.error(`[SchedulerExecutionService] Available initializers:`, Object.keys(this.endpointInitializers));
      throw new Error(`Unsupported endpoint: ${targetEndpoint}`);
    }

    // Create a mock response object for endpoints that need it
    const mockRes = {
      write: () => {},
      end: () => {},
      status: () => mockRes,
      json: () => mockRes,
      send: () => mockRes,
      setHeader: () => {},
      locals: {},
    };

    // Create a mock request object with the necessary context
    const mockReq = {
      user: { id: user },
      body: {
        model: targetModel,
        endpoint: targetEndpoint,
        conversationId: conversation_id,
        messages: [
          {
            role: 'user',
            content: prompt,
          }
        ],
        endpointOption: {
          model_parameters: {
            model: targetModel,
          },
        },
      },
      app: {
        locals: {
          availableTools: {},
          fileStrategy: null,
        }
      }
    };

    // Create endpointOption based on the endpoint type
    let endpointOption;
    
    if (targetEndpoint === EModelEndpoint.agents) {
      // Create the agent configuration first
      const agentConfig = {
        id: Constants.EPHEMERAL_AGENT_ID,
        name: 'Scheduler Agent',
        model: targetModel,
        provider: Providers.OPENAI,
        endpoint: Providers.OPENAI,
        instructions: 'You are a helpful assistant executing scheduled tasks.',
        tools: [],
        model_parameters: {
          model: targetModel,
        },
        // Add other required fields
        description: 'Ephemeral agent for scheduler tasks',
        agent_ids: [],
        tool_resources: {},
      };

      // For agents endpoint, we need to provide agent configuration
      endpointOption = {
        endpoint: targetEndpoint,
        model: targetModel,
        modelOptions: {
          model: targetModel,
        },
        model_parameters: {
          model: targetModel,
        },
        // Create a minimal ephemeral agent configuration with all required fields
        agent: Promise.resolve(agentConfig),
        // Add required client options with proper structure
        req: mockReq,
        res: mockRes,
        modelLabel: 'Scheduler Agent',
        maxContextTokens: 4096,
        resendFiles: false,
      };
    } else {
      // For other endpoints, use standard configuration
      endpointOption = {
        endpoint: targetEndpoint,
        model: targetModel,
        modelOptions: {
          model: targetModel,
        },
      };
    }

    logger.debug(`[SchedulerExecutionService] Calling initializeClient with endpoint: ${targetEndpoint}`);

    try {
      // Initialize the client
      const clientResult = await initializeClient({
        req: mockReq,
        res: mockRes,
        endpointOption: endpointOption,
      });

      // Handle different return formats from different endpoints
      const client = clientResult?.client || clientResult;
      
      if (!client) {
        throw new Error(`Failed to initialize client for ${targetEndpoint}`);
      }

      logger.debug(`[SchedulerExecutionService] Client initialized successfully for ${targetEndpoint}`);

      // Send the message and get response
      await client.sendMessage(prompt, {
        user: user,
        conversationId: conversation_id,
        model: targetModel,
        endpoint: targetEndpoint,
      });

      // Extract the response from the client's contentParts
      const contentParts = client.getContentParts && client.getContentParts();
      const responseText = contentParts?.[0]?.text;

      if (!responseText) {
        throw new Error('No response received from AI client');
      }

      logger.info(`[SchedulerExecutionService] Task ${task.id} completed successfully`);
      return responseText;

    } catch (error) {
      logger.error(`[SchedulerExecutionService] Error executing prompt for task ${task.id}:`, error);
      throw new Error(`AI execution failed: ${error.message}`);
    }
  }

  async getReadyTasks() {
    try {
      return await getReadySchedulerTasks();
    } catch (error) {
      logger.error(`[SchedulerExecutionService] Error fetching ready tasks:`, error);
      return [];
    }
  }

  async startScheduler() {
    if (this.isRunning) {
      logger.warn('[SchedulerExecutionService] Scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('[SchedulerExecutionService] Starting scheduler');

    const schedulerLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const readyTasks = await this.getReadyTasks();
        
        if (readyTasks.length > 0) {
          logger.info(`[SchedulerExecutionService] Found ${readyTasks.length} ready tasks`);
          
          // Execute tasks in parallel
          const taskPromises = readyTasks.map(task => 
            this.executeTask(task).catch(error => {
              logger.error(`[SchedulerExecutionService] Error executing task ${task.id}:`, error);
            })
          );
          
          await Promise.all(taskPromises);
        }
      } catch (error) {
        logger.error('[SchedulerExecutionService] Error in scheduler loop:', error);
      }

      // Schedule next check in 30 seconds
      if (this.isRunning) {
        setTimeout(schedulerLoop, 30000);
      }
    };

    // Start the scheduler loop
    schedulerLoop();
  }

  stopScheduler() {
    logger.info('[SchedulerExecutionService] Stopping scheduler');
    this.isRunning = false;
  }
}

module.exports = SchedulerExecutionService; 