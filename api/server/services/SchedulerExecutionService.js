const { logger } = require('~/config');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { Providers } = require('@librechat/agents');
const PQueue = require('p-queue').default;
const SchedulerService = require('./SchedulerService');
const { 
  createSchedulerExecution, 
  updateSchedulerExecution 
} = require('~/models/SchedulerExecution');
const { updateSchedulerTask, getReadySchedulerTasks } = require('~/models/SchedulerTask');
const { getAgent } = require('~/models/Agent');
const paths = require('~/config/paths');

class SchedulerExecutionService {
  constructor() {
    logger.debug('[SchedulerExecutionService] Constructor called');
    
    // Initialize task queue with concurrency limits
    this.taskQueue = new PQueue({ 
      concurrency: parseInt(process.env.SCHEDULER_CONCURRENCY || '3'), // Max 3 concurrent executions by default
      timeout: parseInt(process.env.SCHEDULER_TASK_TIMEOUT || '300000'), // 5 minute timeout per task
      throwOnTimeout: true,
      intervalCap: 10, // Max 10 tasks per interval
      interval: 60000, // 1 minute interval for rate limiting
    });

    // Separate queue for retries with lower concurrency
    this.retryQueue = new PQueue({ 
      concurrency: 1,
      timeout: parseInt(process.env.SCHEDULER_RETRY_TIMEOUT || '180000'), // 3 minute timeout for retries
    });

    // Queue event handlers
    this.taskQueue.on('add', () => {
      logger.debug(`[SchedulerExecutionService] Task added to queue. Queue size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`);
    });

    this.taskQueue.on('active', () => {
      logger.debug(`[SchedulerExecutionService] Task started. Active: ${this.taskQueue.pending}, Waiting: ${this.taskQueue.size}`);
    });

    this.taskQueue.on('completed', (result) => {
      logger.debug(`[SchedulerExecutionService] Task completed. Queue size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`);
    });

    this.taskQueue.on('error', (error) => {
      logger.error(`[SchedulerExecutionService] Task queue error:`, error);
    });

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

  /**
   * Calculate task priority based on various factors
   * Higher number = higher priority
   */
  calculatePriority(task) {
    let priority = 0;
    
    // Higher priority for one-time tasks
    if (task.do_only_once) {
      priority += 10;
    }
    
    // Higher priority for older tasks (avoid starvation)
    const taskAge = Date.now() - new Date(task.createdAt || task.next_run).getTime();
    const ageHours = taskAge / (1000 * 60 * 60);
    priority += Math.min(ageHours, 24); // Max 24 points for age
    
    // Higher priority for failed tasks that are being retried
    if (task.status === 'failed') {
      priority += 5;
    }
    
    return Math.round(priority);
  }

  /**
   * Check if an error is retriable
   */
  isRetriableError(error) {
    const retriableErrors = [
      'timeout',
      'network',
      'rate limit',
      'temporary',
      'service unavailable',
      'too many requests',
      'connection reset',
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retriableErrors.some(retryError => errorMessage.includes(retryError));
  }

  /**
   * Execute a task with retry logic
   */
  async executeTaskWithRetry(task, attempt = 1) {
    const maxRetries = parseInt(process.env.SCHEDULER_MAX_RETRIES || '3');
    
    try {
      logger.info(`[SchedulerExecutionService] Executing task ${task.id} (attempt ${attempt}/${maxRetries})`);
      const result = await this.executeTask(task);
      return result;
    } catch (error) {
      logger.error(`[SchedulerExecutionService] Task ${task.id} failed on attempt ${attempt}:`, error);
      
      if (attempt < maxRetries && this.isRetriableError(error)) {
        const backoffDelay = Math.min(Math.pow(2, attempt) * 1000, 30000); // Exponential backoff, max 30s
        logger.info(`[SchedulerExecutionService] Retrying task ${task.id} in ${backoffDelay}ms`);
        
        // Schedule retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        // Add to retry queue instead of main queue
        return this.retryQueue.add(() => this.executeTaskWithRetry(task, attempt + 1), {
          priority: this.calculatePriority(task) + 100, // Higher priority for retries
        });
      }
      
      throw error;
    }
  }

  /**
   * Get queue status for monitoring
   */
  getQueueStatus() {
    return {
      main: {
        size: this.taskQueue.size,
        pending: this.taskQueue.pending,
        isPaused: this.taskQueue.isPaused,
      },
      retry: {
        size: this.retryQueue.size,
        pending: this.retryQueue.pending,
        isPaused: this.retryQueue.isPaused,
      },
    };
  }

  async executeTask(task) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`[SchedulerExecutionService] Starting task execution: ${task.id} (${task.name})`);
    
    // Find the last message in the conversation for proper threading
    let lastMessageId = null;
    try {
      const { getMessages } = require('~/models/Message');
      const messages = await getMessages({ conversationId: task.conversation_id, user: task.user.toString() });
      if (messages && messages.length > 0) {
        const sortedMessages = messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        lastMessageId = sortedMessages[0].messageId;
        logger.debug(`[SchedulerExecutionService] Found last message for notifications: ${lastMessageId}`);
      }
    } catch (error) {
      logger.warn(`[SchedulerExecutionService] Error finding last message: ${error.message}`);
    }
    
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
        userId: task.user.toString(),
        conversationId: task.conversation_id,
        taskId: task.id,
        taskName: task.name,
        notificationType: 'start',
        parentMessageId: lastMessageId,
      });
    } catch (error) {
      logger.warn(`[SchedulerExecutionService] Failed to send start notification: ${error.message}`);
    }

    // Send task status update for schedules panel refresh
    try {
      await SchedulerService.sendTaskStatusUpdate({
        userId: task.user.toString(),
        taskId: task.id,
        taskName: task.name,
        notificationType: 'started',
      });
    } catch (error) {
      logger.warn(`[SchedulerExecutionService] Failed to send status update: ${error.message}`);
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
          logger.info(`[SchedulerExecutionService] Recurring task ${task.id} completed, next run: ${nextUpdate.next_run}`);
        } catch (error) {
          logger.error(`[SchedulerExecutionService] Failed to calculate next run time: ${error.message}`);
          nextUpdate.status = 'failed';
          taskStatus = 'failed';
        }
      }
      
      logger.debug(`[SchedulerExecutionService] Updating task ${task.id} with:`, nextUpdate);
      const updatedTask = await updateSchedulerTask(task.id, task.user, nextUpdate);
      logger.debug(`[SchedulerExecutionService] Task ${task.id} updated successfully, new status: ${updatedTask?.status}`);

      // Send task completion notification
      try {
        await SchedulerService.sendTaskResult({
          userId: task.user.toString(),
          conversationId: task.conversation_id,
          taskId: task.id,
          taskName: task.name,
          result: result,
          success: true,
          parentMessageId: lastMessageId,
        });
      } catch (error) {
        logger.warn(`[SchedulerExecutionService] Failed to send completion notification: ${error.message}`);
      }

      // Send task status update for schedules panel refresh
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: task.user.toString(),
          taskId: task.id,
          taskName: task.name,
          notificationType: 'completed',
        });
      } catch (error) {
        logger.warn(`[SchedulerExecutionService] Failed to send completion status update: ${error.message}`);
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
          userId: task.user.toString(),
          conversationId: task.conversation_id,
          taskId: task.id,
          taskName: task.name,
          result: error.message,
          success: false,
          parentMessageId: lastMessageId,
        });
      } catch (notificationError) {
        logger.warn(`[SchedulerExecutionService] Failed to send failure notification: ${notificationError.message}`);
      }

      // Send task status update for schedules panel refresh
      try {
        await SchedulerService.sendTaskStatusUpdate({
          userId: task.user.toString(),
          taskId: task.id,
          taskName: task.name,
          notificationType: 'failed',
          details: error.message,
        });
      } catch (statusError) {
        logger.warn(`[SchedulerExecutionService] Failed to send failure status update: ${statusError.message}`);
      }
      
      // Re-throw error for retry logic
      throw error;
    }
  }

  async executePrompt(task) {
    const { prompt, endpoint, ai_model, agent_id, conversation_id } = task;
    
    if (!prompt) {
      throw new Error('No prompt provided for task execution');
    }

    logger.info(`[SchedulerExecutionService] Executing prompt for task ${task.id} using ${endpoint}/${agent_id || ai_model}`);

    // Find the last message in the conversation to maintain thread continuity
    let parentMessageId = task.parent_message_id;
    if (!parentMessageId || parentMessageId === '00000000-0000-0000-0000-000000000000') {
      try {
        const { getMessages } = require('~/models/Message');
        const messages = await getMessages({ conversationId: conversation_id, user: task.user.toString() });
        if (messages && messages.length > 0) {
          // Sort messages by createdAt to get the most recent one
          const sortedMessages = messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          parentMessageId = sortedMessages[0].messageId;
          logger.info(`[SchedulerExecutionService] Found last message in conversation ${conversation_id}: ${parentMessageId}`);
        } else {
          logger.info(`[SchedulerExecutionService] No existing messages found in conversation ${conversation_id}`);
          parentMessageId = null;
        }
      } catch (error) {
        logger.warn(`[SchedulerExecutionService] Error getting messages for conversation ${conversation_id}:`, error);
        parentMessageId = null;
      }
    }

    const targetEndpoint = endpoint || EModelEndpoint.openAI;
    // For agents, ai_model might be the base model, agent_id is the primary identifier
    const targetModel = targetEndpoint === EModelEndpoint.agents ? agent_id : (ai_model || 'gpt-4o-mini');

    logger.debug(`[SchedulerExecutionService] Target endpoint: ${targetEndpoint}, Target model/agent: ${targetModel}`);

    const initializeClient = this.endpointInitializers[targetEndpoint];
    if (!initializeClient) {
      logger.error(`[SchedulerExecutionService] No initializer found for endpoint: ${targetEndpoint}`);
      throw new Error(`Unsupported endpoint: ${targetEndpoint}`);
    }

    // Initialize basic tools and MCP for all endpoints
    const { loadAndFormatTools } = require('~/server/services/ToolService');
    let availableTools = loadAndFormatTools({
      directory: paths.structuredTools,
    });

    // Initialize user-specific MCP connections using the standardized pattern
    const MCPInitializer = require('~/server/services/MCPInitializer');
    const mcpInitializer = MCPInitializer.getInstance();
    const mcpResult = await mcpInitializer.ensureUserMCPReady(
      task.user.toString(), 
      'SchedulerExecutionService', 
      availableTools
    );
    
    if (mcpResult.success) {
      logger.info(`[SchedulerExecutionService] MCP initialization successful: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools in ${mcpResult.duration}ms`);
    } else {
      logger.warn(`[SchedulerExecutionService] MCP initialization failed for user ${task.user.toString()}: ${mcpResult.error}`);
      // Continue without MCP tools - this is not critical for task execution
    }

    let agent = null;
    let agentTools = [];

    if (targetEndpoint === EModelEndpoint.agents && agent_id) {
      // Load agent and its tools
      agent = await getAgent({ id: agent_id, author: task.user.toString() });
      if (!agent) {
        throw new Error(`Agent with ID ${agent_id} not found or not accessible by user.`);
      }

      logger.debug(`[SchedulerExecutionService] Loading tools for agent ${agent_id} with ${agent.tools?.length || 0} configured tools`);

      // Create proper mock request for agent tool loading
      const mockToolReq = {
        user: { id: task.user.toString() },
        body: {
          model: agent_id,
          endpoint: targetEndpoint,
        },
        app: {
          locals: {
            paths: paths,
            availableTools: availableTools, // Pass the MCP-enhanced tools
            fileStrategy: process.env.CDN_PROVIDER || 'local',
          }
        }
      };

      const mockToolRes = {
        write: () => {},
        end: () => {},
        status: () => mockToolRes,
        json: () => mockToolRes,
        send: () => mockToolRes,
        setHeader: () => {},
        locals: {},
      };

      try {
        // Load agent-specific tools including MCP
        const { loadAgentTools } = require('~/server/services/ToolService');
        const toolResult = await loadAgentTools({
          req: mockToolReq,
          res: mockToolRes,
          agent: agent,
          tool_resources: agent.tool_resources || {},
        });

        agentTools = toolResult.tools || [];
        logger.info(`[SchedulerExecutionService] Loaded ${agentTools.length} tools for agent ${agent_id}`);

        // Log the tool names for debugging
        const toolNames = agentTools.map(tool => tool.name).join(', ');
        logger.debug(`[SchedulerExecutionService] Available tools: ${toolNames}`);

        // Log detailed tool information
        agentTools.forEach(tool => {
          logger.debug(`[SchedulerExecutionService] Tool details: ${tool.name} - ${tool.description || 'No description'} - MCP: ${tool.mcp || false}`);
        });

        // Also merge agent tools into availableTools for the mock request
        agentTools.forEach(tool => {
          if (tool.name) {
            availableTools[tool.name] = {
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description || '',
                parameters: tool.schema ? require('zod-to-json-schema').zodToJsonSchema(tool.schema) : {}
              }
            };
          }
        });

        logger.debug(`[SchedulerExecutionService] Total availableTools after merging: ${Object.keys(availableTools).length}`);

      } catch (error) {
        logger.error(`[SchedulerExecutionService] Error loading agent tools: ${error.message}`);
        // Continue with basic tools
      }
    }

    const mockRes = {
      write: () => {},
      end: () => {},
      status: () => mockRes,
      json: () => mockRes,
      send: () => mockRes,
      setHeader: () => {},
      locals: {},
    };

    const mockReq = {
      user: { id: task.user.toString() },
      body: {
        model: targetModel, // This will be agent_id if endpoint is agents
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
            // For agents, the actual model is part of the agentConfig
            model: targetEndpoint === EModelEndpoint.agents ? null : targetModel,
          },
        },
      },
      app: {
        locals: {
          paths: paths,
          availableTools: availableTools, // MCP-enhanced tools
          fileStrategy: process.env.CDN_PROVIDER || 'local',
        }
      }
    };

    let endpointOption;
    
    if (targetEndpoint === EModelEndpoint.agents) {
      if (!agent) {
        throw new Error('Agent not loaded for agent endpoint');
      }

      // Use the fetched agent's configuration - keep original tool names (strings) in tools array
      const agentConfig = {
        id: agent.id,
        name: agent.name,
        model: agent.model, // The actual underlying model of the agent
        provider: agent.provider,
        endpoint: agent.provider, // Assuming agent.provider maps to an endpoint provider
        instructions: agent.instructions,
        tools: agent.tools || [], // Keep original tool names (strings), not tool objects
        model_parameters: agent.model_parameters || { model: agent.model },
        description: agent.description,
        agent_ids: agent.agent_ids || [],
        tool_resources: agent.tool_resources || {},
        // Add additional properties that AgentClient expects
        attachments: [],
        toolContextMap: {},
        maxContextTokens: agent.maxContextTokens || 4096,
        // Pass the loaded tool objects separately (this is the key!)
        loadedTools: agentTools,
      };
      
      logger.debug(`[SchedulerExecutionService] Agent config tools: ${JSON.stringify(agent.tools)} | Loaded tools count: ${agentTools.length}`);
      
      mockReq.body.model = agent.id; // Ensure the agent_id is passed as model in req.body for AgentClient
      mockReq.body.endpointOption.model_parameters.model = agent.model; // Pass the agent's actual model

      endpointOption = {
        endpoint: targetEndpoint,
        model: agent.id, // Pass agent_id as the model for AgentClient initialization
        modelOptions: {
          model: agent.model, // The agent's underlying model
        },
        model_parameters: {
           model: agent.model, // The agent's underlying model
        },
        agent: Promise.resolve(agentConfig),
        req: mockReq,
        res: mockRes,
        modelLabel: agent.name || 'Agent',
        maxContextTokens: agent.maxContextTokens || 4096, // Use agent's config or default
        resendFiles: false, 
      };
    } else {
      endpointOption = {
        endpoint: targetEndpoint,
        model: targetModel,
        modelOptions: {
          model: targetModel,
        },
      };
    }

    logger.debug(`[SchedulerExecutionService] Calling initializeClient for endpoint: ${targetEndpoint}`);

    try {
      const clientResult = await initializeClient({
        req: mockReq,
        res: mockRes,
        endpointOption: endpointOption,
      });

      const client = clientResult?.client || clientResult;
      
      if (!client) {
        throw new Error(`Failed to initialize client for ${targetEndpoint}`);
      }

      logger.debug(`[SchedulerExecutionService] Client initialized successfully for ${targetEndpoint}`);

      // Add a more explicit prompt for scheduled tasks
      const enhancedPrompt = `[SCHEDULED TASK EXECUTION]: ${prompt}

You are executing a scheduled task. Please perform the requested action using your available tools. This is not a conversation about scheduling - you should actually execute the task.`;

      await client.sendMessage(enhancedPrompt, {
        user: task.user.toString(),
        conversationId: conversation_id,
        parentMessageId: parentMessageId,
        // For AgentClient, model here should be the agent_id
        model: targetEndpoint === EModelEndpoint.agents ? agent_id : targetModel,
        endpoint: targetEndpoint,
      });

      // For AgentClient, get response from content parts
      const contentParts = client.getContentParts && client.getContentParts();
      let responseText;

      if (contentParts && Array.isArray(contentParts) && contentParts.length > 0) {
        // Extract text from content parts
        const { ContentTypes } = require('librechat-data-provider');
        
        // Find text content parts and combine them
        const textParts = contentParts
          .filter(part => part.type === ContentTypes.TEXT)
          .map(part => {
            // Handle different text content structures
            if (typeof part.text === 'string') {
              return part.text;
            } else if (part[ContentTypes.TEXT]) {
              if (typeof part[ContentTypes.TEXT] === 'string') {
                return part[ContentTypes.TEXT];
              } else if (part[ContentTypes.TEXT].value) {
                return part[ContentTypes.TEXT].value;
              }
            }
            return '';
          })
          .filter(text => text.length > 0);

        responseText = textParts.join('\n').trim();
        
        logger.debug(`[SchedulerExecutionService] Extracted ${textParts.length} text parts from ${contentParts.length} content parts for task ${task.id}`);
      }

      if (!responseText) {
        // Fallback: try to get the response from the client directly
        if (client.responseMessage && client.responseMessage.text) {
          responseText = client.responseMessage.text;
        } else if (client.finalMessage && client.finalMessage.text) {
          responseText = client.finalMessage.text;
        }
      }

      if (!responseText) {
        throw new Error('No response received from AI client - content parts were empty or invalid');
      }

      logger.info(`[SchedulerExecutionService] Task ${task.id} completed successfully with agent ${agent_id || 'N/A'}`);
      return responseText;

    } catch (error) {
      logger.error(`[SchedulerExecutionService] Error executing prompt for task ${task.id} with agent ${agent_id || 'N/A'}:`, error);
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
    logger.info(`[SchedulerExecutionService] Starting scheduler with concurrency limit: ${this.taskQueue.concurrency}`);

    const schedulerLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const readyTasks = await this.getReadyTasks();
        
        if (readyTasks.length > 0) {
          logger.info(`[SchedulerExecutionService] Found ${readyTasks.length} ready tasks, adding to queue`);
          
          // Add tasks to queue with priority instead of executing all simultaneously
          readyTasks.forEach(task => {
            const priority = this.calculatePriority(task);
            logger.debug(`[SchedulerExecutionService] Adding task ${task.id} to queue with priority ${priority}`);
            
            this.taskQueue.add(() => this.executeTaskWithRetry(task), {
              priority: priority,
            }).catch(error => {
              logger.error(`[SchedulerExecutionService] Task ${task.id} failed after all retries:`, error);
            });
          });
          
          // Log queue status for monitoring
          const queueStatus = this.getQueueStatus();
          logger.info(`[SchedulerExecutionService] Queue status - Main: ${queueStatus.main.pending} active, ${queueStatus.main.size} waiting | Retry: ${queueStatus.retry.pending} active, ${queueStatus.retry.size} waiting`);
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

  async stopScheduler() {
    logger.info('[SchedulerExecutionService] Stopping scheduler...');
    this.isRunning = false;
    
    // Gracefully shutdown task queues
    try {
      logger.info('[SchedulerExecutionService] Waiting for active tasks to complete...');
      
      // Pause queues to prevent new tasks
      this.taskQueue.pause();
      this.retryQueue.pause();
      
      // Wait for active tasks to complete (with timeout)
      const shutdownTimeout = parseInt(process.env.SCHEDULER_SHUTDOWN_TIMEOUT || '60000'); // 1 minute default
      const startTime = Date.now();
      
      while ((this.taskQueue.pending > 0 || this.retryQueue.pending > 0) && 
             (Date.now() - startTime) < shutdownTimeout) {
        logger.debug(`[SchedulerExecutionService] Waiting for ${this.taskQueue.pending + this.retryQueue.pending} active tasks...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (this.taskQueue.pending > 0 || this.retryQueue.pending > 0) {
        logger.warn(`[SchedulerExecutionService] Shutdown timeout reached. ${this.taskQueue.pending + this.retryQueue.pending} tasks may be terminated.`);
      } else {
        logger.info('[SchedulerExecutionService] All active tasks completed successfully');
      }
      
      // Clear any remaining queued tasks
      this.taskQueue.clear();
      this.retryQueue.clear();
      
    } catch (error) {
      logger.error('[SchedulerExecutionService] Error during shutdown:', error);
    }
    
    logger.info('[SchedulerExecutionService] Scheduler stopped');
  }
}

module.exports = SchedulerExecutionService;