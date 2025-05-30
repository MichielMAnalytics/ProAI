const { logger } = require('~/config');
const { EModelEndpoint } = require('librechat-data-provider');
const { 
  createSchedulerExecution, 
  updateSchedulerExecution 
} = require('~/models/SchedulerExecution');
const { updateSchedulerTask } = require('~/models/SchedulerTask');
const { calculateNextRun } = require('./utils/cronUtils');
const { createMockRequest, createMockResponse, createMinimalMockResponse } = require('./utils/mockUtils');
const SchedulerClientFactory = require('./SchedulerClientFactory');
const SchedulerAgentHandler = require('./SchedulerAgentHandler');
const SchedulerNotificationManager = require('./SchedulerNotificationManager');

class SchedulerTaskExecutor {
  constructor() {
    this.clientFactory = new SchedulerClientFactory();
    this.agentHandler = new SchedulerAgentHandler();
    this.notificationManager = new SchedulerNotificationManager();
    
    logger.debug('[SchedulerTaskExecutor] Initialized');
  }

  /**
   * Execute a single scheduler task
   * @param {Object} task - The scheduler task to execute
   * @returns {Promise<Object>} Execution result
   */
  async executeTask(task) {
    const executionId = `exec_${task.id}_${Date.now()}`;
    const startTime = new Date();
    
    logger.info(`[SchedulerTaskExecutor] Starting execution: ${executionId} for task ${task.id} (${task.name})`);
    
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

      // Send notification that task has started
      await this.notificationManager.sendTaskStartedNotification(task);

      let result;
      
      // Check if we need to use MCP tools (automatic ephemeral agent switch)
      const shouldUseEphemeralAgent = await this.agentHandler.shouldUseEphemeralAgent(task);
      
      if (shouldUseEphemeralAgent) {
        logger.info(`[SchedulerTaskExecutor] Using ephemeral agent for task ${task.id} due to MCP tools`);
        result = await this.executeWithEphemeralAgent(task);
      } else {
        logger.info(`[SchedulerTaskExecutor] Using direct endpoint for task ${task.id}`);
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
      await this.updateTaskAfterSuccess(task, endTime);

      // Send all success notifications
      await this.notificationManager.sendSuccessNotifications(task, result, duration);

      logger.info(`[SchedulerTaskExecutor] Task ${task.id} completed successfully in ${duration}ms`);
      
      return {
        success: true,
        executionId,
        duration,
        result,
      };
      
    } catch (error) {
      const endTime = new Date();
      const duration = endTime - startTime;
      
      logger.error(`[SchedulerTaskExecutor] Task execution failed: ${task.id} -`, error.message);

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

      // Send all failure notifications
      await this.notificationManager.sendFailureNotifications(task, error, duration);

      throw error;
    }
  }

  /**
   * Execute task using ephemeral agent pattern (for MCP tools support)
   * @param {Object} task - The scheduler task
   * @returns {Promise<string>} Execution result
   */
  async executeWithEphemeralAgent(task) {
    logger.info(`[SchedulerTaskExecutor] Using direct agents client for task ${task.id}`);
    
    // Set up ephemeral agent configuration
    const setupResult = await this.agentHandler.createEphemeralAgentSetup(task);
    
    // Load ephemeral agent
    const agent = await this.agentHandler.loadEphemeralAgent(setupResult);
    
    // Create proper endpointOption for agents endpoint
    const endpointOption = this.clientFactory.createAgentsEndpointOption(agent, setupResult.underlyingModel);
    
    // Create minimal mock response for client initialization
    const mockRes = createMinimalMockResponse();

    // Initialize the agents client directly
    const { client } = await this.clientFactory.initializeClient({ 
      req: setupResult.mockReq, 
      res: mockRes, 
      endpointOption 
    });
    
    if (!client) {
      throw new Error('Failed to initialize agents client');
    }
    
    logger.debug(`[SchedulerTaskExecutor] AgentClient initialized successfully`);
    
    // Execute using the client's sendMessage method
    const response = await client.sendMessage(task.prompt, {
      user: task.user,
      conversationId: task.conversation_id,
      parentMessageId: task.parent_message_id,
      onProgress: (data) => {
        logger.debug(`[SchedulerTaskExecutor] Agent progress for task ${task.id}:`, data?.text?.substring(0, 100));
      }
    });
    
    if (!response) {
      throw new Error('No response received from agent');
    }
    
    logger.info(`[SchedulerTaskExecutor] Agent execution completed for task ${task.id}`);
    
    // Extract response text from agent response
    return this.extractResponseText(response);
  }

  /**
   * Execute a prompt using the configured AI model/agent
   * @param {Object} task - The scheduler task
   * @returns {Promise<string>} Execution result
   */
  async executePrompt(task) {
    logger.info(`[SchedulerTaskExecutor] Executing prompt for task ${task.id}: ${task.name}`);
    logger.debug(`[SchedulerTaskExecutor] Task details:`, {
      endpoint: task.endpoint,
      ai_model: task.ai_model,
      agent_id: task.agent_id,
      promptLength: task.prompt?.length,
    });

    const mockReq = createMockRequest(task);
    const mockRes = createMockResponse();
    let agent = null;
    let endpoint = task.endpoint || EModelEndpoint.openAI;
    let model = task.ai_model;

    // Load agent if this task uses an agent
    if (task.agent_id && endpoint === EModelEndpoint.agents) {
      agent = await this.agentHandler.loadAgentForTask(task);
      
      if (!agent) {
        // Use fallback configuration
        const fallback = this.agentHandler.determineFallbackConfiguration(task, null);
        endpoint = fallback.endpoint;
        model = fallback.model;
      } else if (agent.fallback) {
        // Agent found but not accessible, use its configuration
        const fallback = this.agentHandler.determineFallbackConfiguration(task, agent);
        endpoint = fallback.endpoint;
        model = fallback.model;
        agent = null; // Don't use the agent object
      } else {
        logger.info(`[SchedulerTaskExecutor] Loaded agent ${task.agent_id} successfully`);
        model = agent.model;
      }
    }

    // Create endpoint option
    const endpointOption = this.clientFactory.createEndpointOption(
      endpoint, 
      model, 
      agent?.model_parameters || {}
    );
    
    if (agent && endpoint === EModelEndpoint.agents) {
      endpointOption.agent = Promise.resolve(agent);
      endpointOption.agent_id = agent.id;
    }

    // Initialize the appropriate client
    const { client } = await this.clientFactory.initializeClient({
      req: mockReq,
      res: mockRes,
      endpointOption
    });

    if (!client) {
      throw new Error(`Failed to initialize ${endpoint} client`);
    }

    logger.debug(`[SchedulerTaskExecutor] Client initialized for endpoint: ${endpoint}, model: ${model}`);

    // Execute the prompt using the client's sendMessage method
    const response = await client.sendMessage(task.prompt, {
      user: task.user,
      conversationId: task.conversation_id,
      parentMessageId: task.parent_message_id,
      onProgress: (data) => {
        // Log progress for debugging but don't send to UI
        logger.debug(`[SchedulerTaskExecutor] Progress for task ${task.id}:`, data.text?.substring(0, 100));
      }
    });

    if (!response) {
      throw new Error('No response received from AI model');
    }

    logger.info(`[SchedulerTaskExecutor] Prompt execution completed for task ${task.id}`);

    // Extract response text
    return this.extractResponseText(response);
  }

  /**
   * Extract response text from various response formats
   * @param {Object} response - The response object
   * @returns {string} Extracted text
   */
  extractResponseText(response) {
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

    return resultText || 'Task completed successfully';
  }

  /**
   * Update task after successful execution
   * @param {Object} task - The scheduler task
   * @param {Date} endTime - Execution end time
   * @returns {Promise<void>}
   */
  async updateTaskAfterSuccess(task, endTime) {
    const updateData = { 
      status: 'completed',
      last_run: endTime,
    };

    if (!task.do_only_once) {
      // Calculate next run time for recurring tasks
      const cronTime = calculateNextRun(task.schedule);
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
  }
}

module.exports = SchedulerTaskExecutor; 