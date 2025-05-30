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
const { loadAgent, getAgent } = require('~/models/Agent');
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
      interval: 60000, // 1 minute interval
    });

    // Initialize retry queue with lower concurrency
    this.retryQueue = new PQueue({ 
      concurrency: parseInt(process.env.SCHEDULER_RETRY_CONCURRENCY || '1'), // More conservative for retries
      timeout: parseInt(process.env.SCHEDULER_TASK_TIMEOUT || '300000'),
      throwOnTimeout: true,
    });

    this.isRunning = false;
    this.schedulerInterval = null;
    this.shutdownTimeout = null;
    this.maxRetries = parseInt(process.env.SCHEDULER_MAX_RETRIES || '3');
    
    // Initialize endpoint initializers dynamically to avoid circular dependencies
    this.endpointInitializers = {};
    this.initializeEndpointClients();
    
    // Bind queue event handlers
    this.setupQueueHandlers();
    
    logger.info('[SchedulerExecutionService] Initialized with concurrency:', {
      taskConcurrency: this.taskQueue.concurrency,
      retryConcurrency: this.retryQueue.concurrency,
      maxRetries: this.maxRetries,
      taskTimeout: this.taskQueue.timeout,
      availableEndpoints: Object.keys(this.endpointInitializers),
    });
  }

  /**
   * Initialize endpoint client initializers
   */
  initializeEndpointClients() {
    try {
      const { initializeClient: initOpenAIClient } = require('~/server/services/Endpoints/openAI');
      const { initializeClient: initCustomClient } = require('~/server/services/Endpoints/custom');
      const { initializeClient: initAnthropicClient } = require('~/server/services/Endpoints/anthropic');
      const { initializeClient: initGoogleClient } = require('~/server/services/Endpoints/google');
      const { initializeClient: initAgentsClient } = require('~/server/services/Endpoints/agents');
      
      this.endpointInitializers = {
        [EModelEndpoint.openAI]: initOpenAIClient,
        [EModelEndpoint.azureOpenAI]: initOpenAIClient,
        [EModelEndpoint.custom]: initCustomClient,
        [EModelEndpoint.anthropic]: initAnthropicClient,
        [EModelEndpoint.google]: initGoogleClient,
        [EModelEndpoint.agents]: initAgentsClient,
      };
      
      logger.info('[SchedulerExecutionService] Endpoint initializers loaded:', Object.keys(this.endpointInitializers));
    } catch (error) {
      logger.error('[SchedulerExecutionService] Error loading endpoint initializers:', error);
      this.endpointInitializers = {};
    }
  }

  /**
   * Initialize client for a specific endpoint
   */
  async initializeClient({ req, res, endpointOption }) {
    const endpoint = endpointOption.endpoint;
    const initializeClientFn = this.endpointInitializers[endpoint];
    
    if (!initializeClientFn) {
      throw new Error(`No initializer found for endpoint: ${endpoint}`);
    }
    
    return await initializeClientFn({ req, res, endpointOption });
  }

  setupQueueHandlers() {
    // Main queue handlers
    this.taskQueue.on('add', () => {
      logger.debug(`[SchedulerExecutionService] Task added to queue. Size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`);
    });

    this.taskQueue.on('active', () => {
      logger.debug(`[SchedulerExecutionService] Task started. Size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`);
    });

    this.taskQueue.on('completed', (result) => {
      logger.debug(`[SchedulerExecutionService] Task completed. Size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`);
    });

    this.taskQueue.on('error', (error, task) => {
      logger.error(`[SchedulerExecutionService] Task queue error:`, error);
    });

    // Retry queue handlers  
    this.retryQueue.on('error', (error, task) => {
      logger.error(`[SchedulerExecutionService] Retry queue error:`, error);
    });
  }

  /**
   * Calculate priority for task execution
   * Higher priority = executed sooner
   */
  calculatePriority(task) {
    const now = new Date();
    const nextRun = new Date(task.next_run);
    const overdue = Math.max(0, now - nextRun); // milliseconds overdue
    
    // Base priority: more overdue = higher priority
    let priority = Math.floor(overdue / 60000); // 1 point per minute overdue
    
    // Boost priority for one-time tasks
    if (task.do_only_once) {
      priority += 100;
    }
    
    // Lower priority for tasks that have failed recently
    if (task.status === 'failed') {
      priority -= 50;
    }
    
    return priority;
  }

  /**
   * Determine if an error is retriable
   */
  isRetriableError(error) {
    const nonRetriablePatterns = [
      /authentication/i,
      /unauthorized/i,
      /forbidden/i,
      /not found/i,
      /invalid.*key/i,
      /invalid.*token/i,
      /malformed/i,
      /syntax.*error/i,
    ];
    
    return !nonRetriablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Execute task with retry logic
   */
  async executeTaskWithRetry(task, attempt = 1) {
    try {
      const result = await this.executeTask(task);
      return result;
    } catch (error) {
      logger.error(`[SchedulerExecutionService] Task ${task.id} failed on attempt ${attempt}:`, error.message);
      
      if (attempt < this.maxRetries && this.isRetriableError(error)) {
        // Exponential backoff: 2^attempt * 1000ms
        const delay = Math.pow(2, attempt) * 1000;
        logger.info(`[SchedulerExecutionService] Retrying task ${task.id} in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
        
        // Schedule retry
        setTimeout(() => {
          this.retryQueue.add(() => this.executeTaskWithRetry(task, attempt + 1), {
            priority: this.calculatePriority(task) - attempt * 10, // Lower priority for retries
          });
        }, delay);
        
        return { success: false, retry: true, attempt, error: error.message };
      } else {
        logger.error(`[SchedulerExecutionService] Task ${task.id} failed after all retries:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Get current queue status
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

  /**
   * Execute a single scheduler task
   */
  async executeTask(task) {
    const executionId = `exec_${task.id}_${Date.now()}`;
    const startTime = new Date();
    
    logger.info(`[SchedulerExecutionService] Starting execution: ${executionId} for task ${task.id} (${task.name})`);
    
    // Create execution record
    const execution = await createSchedulerExecution({
      id: executionId,
      task_id: task.id,
      user: task.user,
      status: 'running',
      start_time: startTime,
      context: {
        task_name: task.name,
        prompt: task.prompt.substring(0, 500), // Truncate for storage
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
      }
    });

    try {
      // Update task status to running
      await updateSchedulerTask(task.id, task.user, { 
        status: 'running',
        last_run: startTime,
      });

      let result;
      
      // Check if we need to use MCP tools (automatic ephemeral agent switch)
      const shouldUseEphemeralAgent = await this.shouldUseEphemeralAgent(task);
      
      if (shouldUseEphemeralAgent) {
        logger.info(`[SchedulerExecutionService] Using ephemeral agent for task ${task.id} due to MCP tools`);
        result = await this.executeWithEphemeralAgent(task);
      } else {
        logger.info(`[SchedulerExecutionService] Using direct endpoint for task ${task.id}`);
        result = await this.executePrompt(task);
      }

      const endTime = new Date();
      const duration = endTime - startTime;

      // Update execution record with success
      await updateSchedulerExecution(executionId, task.user, {
        status: 'completed',
        end_time: endTime,
        duration,
        result: typeof result === 'string' ? result : JSON.stringify(result),
      });

      // Update task status and schedule next run if recurring
      const updateData = { 
        status: 'completed',
        last_run: endTime,
      };

      if (!task.do_only_once) {
        // Calculate next run time for recurring tasks
        const cronTime = this.calculateNextRun(task.schedule);
        if (cronTime) {
          updateData.next_run = cronTime;
          updateData.status = 'pending';
        } else {
          updateData.enabled = false; // Disable if we can't calculate next run
        }
      } else {
        // Disable one-time tasks after execution
        updateData.enabled = false;
      }

      await updateSchedulerTask(task.id, task.user, updateData);

      // Send the result as a message to the user
      await SchedulerService.sendSchedulerMessage({
        userId: task.user,
        conversationId: task.conversation_id,
        message: typeof result === 'string' ? result : JSON.stringify(result),
        taskId: task.id,
        taskName: task.name,
        parentMessageId: task.parent_message_id,
      });

      logger.info(`[SchedulerExecutionService] Task ${task.id} completed successfully in ${duration}ms`);
      
      return {
        success: true,
        executionId,
        duration,
        result,
      };
      
    } catch (error) {
      const endTime = new Date();
      const duration = endTime - startTime;
      
      logger.error(`[SchedulerExecutionService] Task execution failed: ${task.id} -`, error.message);

      // Update execution record with failure
      await updateSchedulerExecution(executionId, task.user, {
        status: 'failed',
        end_time: endTime,
        duration,
        error: error.message,
      });

      // Update task status
      await updateSchedulerTask(task.id, task.user, {
        status: 'failed',
        last_run: endTime,
      });

      // Send failure notification
      await SchedulerService.sendSchedulerMessage({
        userId: task.user,
        conversationId: task.conversation_id,
        message: `Task execution failed: ${error.message}`,
        taskId: task.id,
        taskName: task.name,
        parentMessageId: task.parent_message_id,
      });

      throw error;
    }
  }

  /**
   * Create a mock request object for agent initialization
   */
  createMockRequest(task) {
    return {
      user: { 
        id: task.user.toString() // Ensure user ID is a string, not ObjectId
      },
      body: {
        endpoint: task.endpoint || EModelEndpoint.openAI,
        model: task.ai_model || task.agent_id,
        userMessageId: null, // Not available in scheduler context
        parentMessageId: task.parent_message_id,
        conversationId: task.conversation_id,
        promptPrefix: task.prompt,
        ephemeralAgent: null, // Will be set if needed
      },
      app: {
        locals: {
          availableTools: {}, // Will be populated during initialization
          fileStrategy: global.fileStrategy || null,
        }
      }
    };
  }

  /**
   * Create a mock response object for client initialization
   */
  createMockResponse() {
    return {
      write: () => {},
      end: () => {},
      status: () => this.createMockResponse(),
      json: () => this.createMockResponse(),
      send: () => this.createMockResponse(),
      setHeader: () => {},
      locals: {},
    };
  }

  /**
   * Determine if we should use ephemeral agent pattern for a task
   * Only switch to ephemeral agent for non-agent tasks that have MCP tools
   */
  async shouldUseEphemeralAgent(task) {
    // If task already has an agent_id, it's a real agent task - don't convert it
    if (task.agent_id) {
      logger.info(`[SchedulerExecutionService] Task ${task.id} has agent_id ${task.agent_id}, using real agent`);
      return false;
    }
    
    // For non-agent tasks, check if user has MCP tools
    const MCPInitializer = require('~/server/services/MCPInitializer');
    const mcpInitializer = MCPInitializer.getInstance();
    
    const mcpResult = await mcpInitializer.ensureUserMCPReady(
      task.user, 
      'SchedulerExecutionService.shouldUseEphemeralAgent',
      {}
    );
    
    if (mcpResult.toolCount > 0) {
      logger.info(`[SchedulerExecutionService] Found ${mcpResult.toolCount} MCP tools for user ${task.user}, switching to ephemeral agent`);
      return true;
    }
    
    return false;
  }

  /**
   * Execute task using ephemeral agent pattern (for MCP tools support)
   * This uses the direct client approach, bypassing HTTP middleware
   */
  async executeWithEphemeralAgent(task) {
    logger.info(`[SchedulerExecutionService] Using direct agents client for task ${task.id}`);
    
    // Create mock request structure for agent initialization
    const mockReq = this.createMockRequest(task);
    
    // Initialize MCP tools and populate availableTools
    const MCPInitializer = require('~/server/services/MCPInitializer');
    const mcpInitializer = MCPInitializer.getInstance();
    
    const mcpResult = await mcpInitializer.ensureUserMCPReady(
      task.user, 
      'SchedulerExecutionService.executeWithEphemeralAgent',
      mockReq.app.locals.availableTools
    );
    
    if (!mcpResult.success) {
      logger.warn(`[SchedulerExecutionService] MCP initialization failed: ${mcpResult.error}`);
    } else {
      logger.info(`[SchedulerExecutionService] MCP initialized: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools`);
    }
    
    // Extract MCP server names from available tools
    const mcpServerNames = [];
    const availableToolKeys = Object.keys(mockReq.app.locals.availableTools);
    logger.debug(`[SchedulerExecutionService] Available tool keys: ${availableToolKeys.join(', ')}`);
    
    for (const toolKey of availableToolKeys) {
      if (toolKey.includes(Constants.mcp_delimiter)) {
        const serverName = toolKey.split(Constants.mcp_delimiter)[1];
        if (serverName && !mcpServerNames.includes(serverName)) {
          mcpServerNames.push(serverName);
          logger.debug(`[SchedulerExecutionService] Extracted MCP server name: ${serverName} from tool: ${toolKey}`);
        }
      }
    }
    
    logger.info(`[SchedulerExecutionService] Found MCP server names: ${mcpServerNames.join(', ')}`);
    logger.info(`[SchedulerExecutionService] Total available tools: ${availableToolKeys.length}`);
    
    if (mcpServerNames.length === 0) {
      logger.warn(`[SchedulerExecutionService] No MCP server names extracted despite ${availableToolKeys.length} available tools. MCP delimiter: ${Constants.mcp_delimiter}`);
      // Log a few tool keys for debugging
      logger.debug(`[SchedulerExecutionService] Sample tool keys: ${availableToolKeys.slice(0, 5).join(', ')}`);
    }
    
    // Set up ephemeral agent configuration
    const underlyingEndpoint = task.endpoint || EModelEndpoint.openAI;
    const underlyingModel = task.ai_model || 'gpt-4o-mini';
    
    // Create ephemeral agent configuration
    const ephemeralAgent = {
      scheduler: true,
      execute_code: false,
      web_search: false,
      mcp: mcpServerNames
    };
    
    // Set up request body for agent loading
    mockReq.body = {
      ...mockReq.body,
      text: task.prompt,
      endpoint: underlyingEndpoint,
      model: underlyingModel,
      conversationId: task.conversation_id,
      parentMessageId: task.parent_message_id,
      ephemeralAgent: ephemeralAgent,
      endpointOption: {
        endpoint: underlyingEndpoint,
        model: underlyingModel,
        model_parameters: { model: underlyingModel }
      }
    };
    
    // Debug: Log the ephemeral agent configuration
    logger.info(`[SchedulerExecutionService] Ephemeral agent config:`, {
      scheduler: ephemeralAgent.scheduler,
      mcpServers: ephemeralAgent.mcp,
      availableToolsCount: Object.keys(mockReq.app.locals.availableTools).length
    });
    
    // Load ephemeral agent using the loadAgent function
    const agent = await loadAgent({
      req: mockReq,
      agent_id: Constants.EPHEMERAL_AGENT_ID,
      endpoint: underlyingEndpoint,
      model_parameters: { model: underlyingModel }
    });
    
    if (!agent) {
      throw new Error('Failed to load ephemeral agent');
    }
    
    logger.info(`[SchedulerExecutionService] Loaded ephemeral agent with ${agent.tools?.length || 0} tools: ${agent.tools?.join(', ') || 'none'}`);
    
    // Log MCP tools specifically
    const mcpTools = agent.tools?.filter(tool => tool.includes(Constants.mcp_delimiter)) || [];
    logger.info(`[SchedulerExecutionService] Ephemeral agent MCP tools (${mcpTools.length}): ${mcpTools.join(', ')}`);
    
    if (mcpTools.length === 0 && mcpServerNames.length > 0) {
      logger.error(`[SchedulerExecutionService] Expected MCP tools but agent has none. Server names: ${mcpServerNames.join(', ')}, Available tools: ${availableToolKeys.length}`);
    }
    
    // Create proper endpointOption for agents endpoint
    const endpointOption = {
      endpoint: EModelEndpoint.agents,
      model: underlyingModel,
      model_parameters: { model: underlyingModel },
      agent: Promise.resolve(agent), // Agents endpoint expects a promise
    };
    
    // Create minimal mock response for client initialization
    const mockRes = {
      write: () => {},
      end: () => {},
      on: () => {},
      removeListener: () => {},
      locals: {},
    };
    
    // Initialize the agents client directly
    const { initializeClient } = require('~/server/services/Endpoints/agents');
    const { client } = await initializeClient({ 
      req: mockReq, 
      res: mockRes, 
      endpointOption 
    });
    
    if (!client) {
      throw new Error('Failed to initialize agents client');
    }
    
    logger.debug(`[SchedulerExecutionService] AgentClient initialized successfully`);
    
    // Execute using the client's sendMessage method
    const response = await client.sendMessage(task.prompt, {
      user: task.user,
      conversationId: task.conversation_id,
      parentMessageId: task.parent_message_id,
      onProgress: (data) => {
        logger.debug(`[SchedulerExecutionService] Agent progress for task ${task.id}:`, data?.text?.substring(0, 100));
      }
    });
    
    if (!response) {
      throw new Error('No response received from agent');
    }
    
    logger.info(`[SchedulerExecutionService] Agent execution completed for task ${task.id}`);
    
    // Extract response text from agent response
    let resultText = '';
    if (response.text) {
      resultText = response.text;
    } else if (response.content && Array.isArray(response.content)) {
      // Handle AgentClient content array format
      resultText = response.content
        .filter(part => part.type === 'text')
        .map(part => part.text || part.content?.text || part.content)
        .filter(Boolean)
        .join('\n');
    } else if (response.content) {
      resultText = response.content;
    } else {
      resultText = 'Agent task completed successfully';
    }
    
    return resultText;
  }

  /**
   * Execute a prompt using the configured AI model/agent
   */
  async executePrompt(task) {
    logger.info(`[SchedulerExecutionService] Executing prompt for task ${task.id}: ${task.name}`);
    logger.debug(`[SchedulerExecutionService] Task details:`, {
      endpoint: task.endpoint,
      ai_model: task.ai_model,
      agent_id: task.agent_id,
      promptLength: task.prompt?.length,
    });

    const mockReq = this.createMockRequest(task);
    const mockRes = this.createMockResponse();
    let agent = null;
    let endpoint = task.endpoint || EModelEndpoint.openAI;
    let model = task.ai_model;

    // Load agent if this task uses an agent
    if (task.agent_id && endpoint === EModelEndpoint.agents) {
      agent = await loadAgent({
        req: mockReq,
        agent_id: task.agent_id,
        endpoint: endpoint,
        model_parameters: { model: task.ai_model }
      });
      
      if (!agent) {
        // Try to get agent details for error context
        const agentDetails = await getAgent({ id: task.agent_id });
        if (agentDetails) {
          logger.warn(`[SchedulerExecutionService] Agent ${task.agent_id} found but not accessible for user ${task.user}`);
        } else {
          logger.warn(`[SchedulerExecutionService] Agent ${task.agent_id} not found, falling back to direct model execution`);
        }
        
        // Fall back to the agent's underlying model if available
        if (agentDetails && agentDetails.model) {
          endpoint = agentDetails.provider || EModelEndpoint.openAI;
          model = agentDetails.model;
          logger.info(`[SchedulerExecutionService] Using fallback: endpoint=${endpoint}, model=${model}`);
        } else {
          // Last resort fallback
          endpoint = EModelEndpoint.openAI;
          model = 'gpt-4o-mini';
          logger.info(`[SchedulerExecutionService] Using default fallback: endpoint=${endpoint}, model=${model}`);
        }
      } else {
        logger.info(`[SchedulerExecutionService] Loaded agent ${task.agent_id} successfully`);
        model = agent.model;
      }
    }

    // Initialize the appropriate client
    const { client } = await this.initializeClient({
      req: mockReq,
      res: mockRes,
      endpointOption: {
        endpoint: endpoint,
        model: model,
        agent_id: agent?.id,
        model_parameters: agent?.model_parameters || {},
        ...(agent && endpoint === EModelEndpoint.agents && { agent: Promise.resolve(agent) }),
      }
    });

    if (!client) {
      throw new Error(`Failed to initialize ${endpoint} client`);
    }

    logger.debug(`[SchedulerExecutionService] Client initialized for endpoint: ${endpoint}, model: ${model}`);

    // Execute the prompt using the client's sendMessage method with just the text
    const response = await client.sendMessage(task.prompt, {
      user: task.user,
      conversationId: task.conversation_id,
      parentMessageId: task.parent_message_id,
      onProgress: (data) => {
        // Log progress for debugging but don't send to UI
        logger.debug(`[SchedulerExecutionService] Progress for task ${task.id}:`, data.text?.substring(0, 100));
      }
    });

    if (!response) {
      throw new Error('No response received from AI model');
    }

    logger.info(`[SchedulerExecutionService] Prompt execution completed for task ${task.id}`);

    // Extract response text
    let resultText = '';
    if (response.text) {
      resultText = response.text;
    } else if (response.content && Array.isArray(response.content)) {
      // Handle AgentClient content array format
      resultText = response.content
        .filter(part => part.type === 'text')
        .map(part => part.text || part.content?.text || part.content)
        .filter(Boolean)
        .join('\n');
    } else if (response.content) {
      resultText = response.content;
    } else if (response.message) {
      resultText = response.message.content || response.message;
    } else {
      resultText = JSON.stringify(response);
    }

    return resultText;
  }

  /**
   * Calculate next run time using cron expression
   */
  calculateNextRun(cronExpression) {
    try {
      const { parseCronExpression } = require('cron-schedule');
      const cron = parseCronExpression(cronExpression);
      return cron.getNextDate();
    } catch (error) {
      logger.error(`[SchedulerExecutionService] Failed to calculate next run for cron: ${cronExpression}`, error);
      return null;
    }
  }

  /**
   * Get tasks that are ready for execution
   */
  async getReadyTasks() {
    try {
      return await getReadySchedulerTasks();
    } catch (error) {
      logger.error('[SchedulerExecutionService] Error fetching ready tasks:', error);
      return [];
    }
  }

  /**
   * Start the scheduler
   */
  async startScheduler() {
    if (this.isRunning) {
      logger.warn('[SchedulerExecutionService] Scheduler is already running');
      return;
    }

    logger.info('[SchedulerExecutionService] Starting scheduler...');
    this.isRunning = true;

    const schedulerLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const readyTasks = await this.getReadyTasks();
        
        if (readyTasks.length > 0) {
          logger.info(`[SchedulerExecutionService] Found ${readyTasks.length} ready tasks`);
          
          for (const task of readyTasks) {
            const priority = this.calculatePriority(task);
            
            this.taskQueue.add(
              () => this.executeTaskWithRetry(task),
              { 
                priority,
                // Add task metadata for debugging
                meta: {
                  taskId: task.id,
                  taskName: task.name,
                  userId: task.user,
                }
              }
            );
          }
        } else {
          logger.debug('[SchedulerExecutionService] No ready tasks found');
        }
      } catch (error) {
        logger.error('[SchedulerExecutionService] Error in scheduler loop:', error);
      }
    };

    // Run immediately, then every 30 seconds
    await schedulerLoop();
    this.schedulerInterval = setInterval(schedulerLoop, 30000);
    
    logger.info('[SchedulerExecutionService] Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  async stopScheduler() {
    logger.info('[SchedulerExecutionService] Stopping scheduler...');
    this.isRunning = false;
    
    // Clear the interval
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    // Wait for current tasks to complete or timeout
    const shutdownTimeout = parseInt(process.env.SCHEDULER_SHUTDOWN_TIMEOUT || '60000');
    
    const waitForQueues = new Promise((resolve) => {
      const checkQueues = () => {
        if (this.taskQueue.size === 0 && this.taskQueue.pending === 0 && 
            this.retryQueue.size === 0 && this.retryQueue.pending === 0) {
          resolve();
      } else {
          logger.debug(`[SchedulerExecutionService] Waiting for queues to empty: main(${this.taskQueue.size}/${this.taskQueue.pending}), retry(${this.retryQueue.size}/${this.retryQueue.pending})`);
          setTimeout(checkQueues, 1000);
      }
      };
      checkQueues();
    });
      
    this.shutdownTimeout = setTimeout(() => {
      logger.warn('[SchedulerExecutionService] Shutdown timeout reached, forcing stop');
      this.taskQueue.clear();
      this.retryQueue.clear();
    }, shutdownTimeout);

    try {
      await Promise.race([
        waitForQueues,
        new Promise(resolve => setTimeout(resolve, shutdownTimeout))
      ]);
    } finally {
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }
    }

    logger.info('[SchedulerExecutionService] Scheduler stopped successfully');
  }
}

module.exports = SchedulerExecutionService;