const { logger } = require('~/config');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { 
  createSchedulerExecution, 
  updateSchedulerExecution 
} = require('~/models/SchedulerExecution');
const { updateSchedulerTask } = require('~/models/SchedulerTask');
const { calculateNextRun } = require('./utils/cronUtils');
const { createMockRequest, createMockResponse, createMinimalMockResponse } = require('./utils/mockUtils');
const { getCustomConfig } = require('~/server/services/Config');
const SchedulerClientFactory = require('./SchedulerClientFactory');
const SchedulerAgentHandler = require('./SchedulerAgentHandler');
const SchedulerRetryManager = require('./SchedulerRetryManager');
const SchedulerNotificationManager = require('./SchedulerNotificationManager');

class SchedulerTaskExecutor {
  constructor() {
    this.clientFactory = new SchedulerClientFactory();
    this.agentHandler = new SchedulerAgentHandler();
    this.notificationManager = new SchedulerNotificationManager();
    
    logger.debug('[SchedulerTaskExecutor] Initialized');
  }

  /**
   * Get configured model and endpoint from librechat.yaml scheduler config
   * @returns {Promise<Object>} Configuration with model, endpoint, and endpointName
   */
  async getConfiguredModelAndEndpoint() {
    try {
      const config = await getCustomConfig();
      const configuredModel = config?.scheduler?.defaultModel || 'gpt-4o-mini';
      const configuredEndpoint = config?.scheduler?.defaultEndpoint || 'openAI';
      
      // Map config endpoint names to EModelEndpoint values
      const endpointMapping = {
        'openAI': EModelEndpoint.openAI,
        'anthropic': EModelEndpoint.anthropic,
        'google': EModelEndpoint.google,
        'azureOpenAI': EModelEndpoint.azureOpenAI,
        'custom': EModelEndpoint.custom,
        'bedrock': EModelEndpoint.bedrock,
      };
      
      const mappedEndpoint = endpointMapping[configuredEndpoint] || EModelEndpoint.openAI;
      
      logger.info(`[SchedulerTaskExecutor] Using configured model: ${configuredModel} on endpoint: ${configuredEndpoint} (${mappedEndpoint})`);
      
      return {
        model: configuredModel,
        endpoint: mappedEndpoint,
        endpointName: configuredEndpoint
      };
    } catch (error) {
      logger.warn('[SchedulerTaskExecutor] Failed to load scheduler config, using defaults:', error);
      return {
        model: 'gpt-4o-mini',
        endpoint: EModelEndpoint.openAI,
        endpointName: 'openAI'
      };
    }
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
    
    // Check if task is already running to prevent double execution
    if (task.status === 'running') {
      logger.warn(`[SchedulerTaskExecutor] Task ${task.id} is already running, skipping execution`);
      return {
        success: false,
        error: 'Task is already running',
        skipped: true,
      };
    }
    
    // Check if one-time task is already completed/disabled
    if (task.do_only_once && (!task.enabled || task.status === 'completed')) {
      logger.warn(`[SchedulerTaskExecutor] One-time task ${task.id} is already completed or disabled, skipping execution`);
      return {
        success: false,
        error: 'One-time task already completed',
        skipped: true,
      };
    }
    
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
      // Update task status to running (atomic update to prevent race conditions)
      const updatedTask = await updateSchedulerTask(task.id, task.user, { 
        status: 'running',
        last_run: startTime,
      });
      
      // Verify the update succeeded and task wasn't modified by another process
      if (!updatedTask) {
        throw new Error('Failed to update task status to running - task may have been deleted');
      }
      
      logger.debug(`[SchedulerTaskExecutor] Task ${task.id} status updated to running`);

      // Use the updated task for the rest of the execution
      task = updatedTask;

      // Send notification that task has started
      await this.notificationManager.sendTaskStartedNotification(task);

      let result;
      
      // Check if this is a workflow execution task
      if (this.isWorkflowTask(task)) {
        logger.info(`[SchedulerTaskExecutor] Detected workflow task ${task.id}, executing workflow`);
        result = await this.executeWorkflowTask(task, executionId);
      } else {
        // Regular task execution
        logger.info(`[SchedulerTaskExecutor] Starting regular task execution for ${task.id}`);
        logger.debug(`[SchedulerTaskExecutor] Task details:`, {
          id: task.id,
          name: task.name,
          endpoint: task.endpoint,
          ai_model: task.ai_model,
          agent_id: task.agent_id,
          user: task.user,
          conversation_id: task.conversation_id,
          parent_message_id: task.parent_message_id
        });
        
        // Check if we should use ephemeral agent (either explicitly requested or due to MCP tools)
        const isEphemeralTask = task.agent_id === Constants.EPHEMERAL_AGENT_ID;
        logger.info(`[SchedulerTaskExecutor] Task ${task.id} ephemeral check: isEphemeralTask=${isEphemeralTask}`);
        
        const shouldUseEphemeralAgent = isEphemeralTask || await this.agentHandler.shouldUseEphemeralAgent(task);
        logger.info(`[SchedulerTaskExecutor] Task ${task.id} final decision: shouldUseEphemeralAgent=${shouldUseEphemeralAgent}`);
      
        if (shouldUseEphemeralAgent) {
          if (isEphemeralTask) {
            logger.info(`[SchedulerTaskExecutor] Using ephemeral agent for task ${task.id} (originally created with ephemeral agent)`);
          } else {
            logger.info(`[SchedulerTaskExecutor] Using ephemeral agent for task ${task.id} due to MCP tools`);
          }
          result = await this.executeWithEphemeralAgent(task);
        } else {
          logger.info(`[SchedulerTaskExecutor] Using direct endpoint for task ${task.id} - no ephemeral agent needed`);
          result = await this.executePrompt(task);
        }
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
   * Execute task using ephemeral agent pattern with agents endpoint (simplified workflow approach)
   * @param {Object} task - The scheduler task
   * @returns {Promise<string>} Execution result
   */
  async executeWithEphemeralAgent(task) {
    logger.info(`[SchedulerTaskExecutor] Using simplified ephemeral agent execution for task ${task.id}`);
    
    try {
      // Get configured model and endpoint from librechat.yaml
      const config = await this.getConfiguredModelAndEndpoint();
      const configuredModel = config.model;
      const configuredEndpoint = config.endpoint;
      const endpointName = config.endpointName;
      
      logger.info(`[SchedulerTaskExecutor] Using configured ${endpointName}/${configuredModel} for task ${task.id}`);
      
      // Set up ephemeral agent configuration (reuse existing agent handler for MCP setup)
      const setupResult = await this.agentHandler.createEphemeralAgentSetup(task);
      
      logger.info(`[SchedulerTaskExecutor] MCP setup complete for task ${task.id}: ${setupResult.mcpServerNames.length} servers, ${setupResult.availableToolsCount} tools`);
      
      // Create ephemeral agent configuration
      const ephemeralAgent = {
        scheduler: true,
        workflow: true,
        execute_code: false,
        web_search: true,
        mcp: setupResult.mcpServerNames
      };
      
      // Update request for ephemeral agent (use configured model/endpoint instead of task's)
      const { updateRequestForEphemeralAgent } = require('./utils/mockUtils');
      updateRequestForEphemeralAgent(setupResult.mockReq, task, ephemeralAgent, configuredEndpoint, configuredModel);
      
      // Load ephemeral agent using configured endpoint
      const { loadAgent } = require('~/models/Agent');
      const agent = await loadAgent({
        req: setupResult.mockReq,
        agent_id: Constants.EPHEMERAL_AGENT_ID,
        endpoint: configuredEndpoint,
        model_parameters: { model: configuredModel }
      });
      
      if (!agent) {
        throw new Error('Failed to load ephemeral agent for scheduler task');
      }
      
      logger.info(`[SchedulerTaskExecutor] Loaded ephemeral agent for task ${task.id}: ${agent.tools?.length || 0} tools using ${endpointName}/${configuredModel}`);
      
      // === KEY CHANGE: Use agents endpoint instead of underlying endpoint ===
      const endpointOption = this.clientFactory.createAgentsEndpointOption(agent, configuredModel);
      
      // Disable automatic title generation to preserve conversation flow
      endpointOption.titleConvo = false;
      
      // Create minimal mock response for client initialization
      const mockRes = createMinimalMockResponse();
      
      // Initialize the AGENTS client (not the underlying endpoint client)
      const clientResult = await this.clientFactory.initializeClient({ 
        req: setupResult.mockReq, 
        res: mockRes, 
        endpointOption 
      });
      
      const client = clientResult.client;
      
      if (!client) {
        throw new Error('Failed to initialize agents client for scheduler task');
      }
      
      logger.info(`[SchedulerTaskExecutor] AgentClient initialized successfully for task ${task.id} using ${endpointName}/${configuredModel}`);
      
      // Execute using the agents client (automatically handles all tools)
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
      const result = this.extractResponseText(response);
      logger.info(`[SchedulerTaskExecutor] Extracted result for task ${task.id}: ${result?.substring(0, 200)}...`);
      
      return result;
      
    } catch (error) {
      logger.error(`[SchedulerTaskExecutor] Ephemeral agent execution failed for task ${task.id}:`, error);
      throw error;
    }
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
    if (task.do_only_once) {
      // For one-time tasks, disable immediately to prevent double execution
      const updateData = { 
        status: 'completed',
        last_run: endTime,
        enabled: false, // Disable immediately
      };
      
      logger.info(`[SchedulerTaskExecutor] Disabling one-time task ${task.id} after successful execution`);
      await updateSchedulerTask(task.id, task.user, updateData);
    } else {
      // For recurring tasks, calculate next run time
      const cronTime = calculateNextRun(task.schedule);
      if (cronTime) {
        const updateData = { 
          status: 'pending',
          last_run: endTime,
          next_run: cronTime,
        };
        
        logger.info(`[SchedulerTaskExecutor] Scheduling next run for recurring task ${task.id} at ${cronTime.toISOString()}`);
        await updateSchedulerTask(task.id, task.user, updateData);
      } else {
        // Disable if we can't calculate next run
        const updateData = { 
          status: 'failed',
          last_run: endTime,
          enabled: false,
        };
        
        logger.warn(`[SchedulerTaskExecutor] Unable to calculate next run for task ${task.id}, disabling`);
        await updateSchedulerTask(task.id, task.user, updateData);
      }
    }
  }

  /**
   * Check if a task is a workflow execution task
   * @param {Object} task - The scheduler task
   * @returns {boolean} True if this is a workflow task
   */
  isWorkflowTask(task) {
    return task.prompt && task.prompt.startsWith('WORKFLOW_EXECUTION:');
  }

  /**
   * Execute a workflow task
   * @param {Object} task - The scheduler task representing a workflow
   * @param {string} executionId - The scheduler execution ID
   * @returns {Promise<string>} Execution result
   */
  async executeWorkflowTask(task, executionId) {
    try {
      // Parse workflow information from the task prompt
      const workflowInfo = this.parseWorkflowInfo(task.prompt);
      
      if (!workflowInfo) {
        throw new Error('Invalid workflow task format');
      }

      logger.info(`[SchedulerTaskExecutor] Executing workflow ${workflowInfo.workflowId} (${workflowInfo.workflowName})`);

      // Get workflow data from task metadata
      if (!task.metadata || task.metadata.type !== 'workflow') {
        throw new Error('Task is not a workflow or missing workflow metadata');
      }

      // Create workflow object from task metadata
      const workflow = {
        id: task.metadata.workflowId,
        name: workflowInfo.workflowName,
        description: task.metadata.description,
        trigger: task.metadata.trigger,
        steps: task.metadata.steps,
        isDraft: task.metadata.isDraft,
        isActive: task.enabled,
        user: task.user,
        conversation_id: task.conversation_id,
        parent_message_id: task.parent_message_id,
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
        metadata: task.metadata, // Include full metadata for access to dedicatedConversationId
      };

      // Create execution context for scheduler-triggered execution
      const context = {
        trigger: {
          type: 'schedule',
          source: 'scheduler',
          data: {
            schedulerTaskId: task.id,
            schedulerExecutionId: executionId,
            schedule: task.schedule
          }
        }
      };

      // Use WorkflowExecutor directly to avoid circular dependency
      const WorkflowExecutor = require('~/server/services/Workflows/WorkflowExecutor');
      const workflowExecutor = new WorkflowExecutor();

      // Execute the workflow using WorkflowExecutor
      const workflowResult = await workflowExecutor.executeWorkflow(
        workflow,
        { id: executionId, user: task.user },
        context
      );

      if (workflowResult.success) {
        logger.info(`[SchedulerTaskExecutor] Workflow ${workflowInfo.workflowId} executed successfully`);
        return `Workflow "${workflowInfo.workflowName}" executed successfully. ${workflowResult.result?.summary || ''}`;
      } else {
        logger.error(`[SchedulerTaskExecutor] Workflow ${workflowInfo.workflowId} execution failed:`, workflowResult.error);
        throw new Error(`Workflow execution failed: ${workflowResult.error}`);
      }

    } catch (error) {
      logger.error(`[SchedulerTaskExecutor] Error executing workflow task ${task.id}:`, error);
      throw error;
    }
  }

  /**
   * Parse workflow information from task prompt
   * @param {string} prompt - The task prompt in format "WORKFLOW_EXECUTION:workflowId:workflowName"
   * @returns {Object|null} Parsed workflow info or null if invalid
   */
  parseWorkflowInfo(prompt) {
    try {
      if (!prompt || !prompt.startsWith('WORKFLOW_EXECUTION:')) {
        return null;
      }

      const parts = prompt.split(':');
      if (parts.length < 3) {
        return null;
      }

      return {
        workflowId: parts[1],
        workflowName: parts.slice(2).join(':') // Handle workflow names with colons
      };
    } catch (error) {
      logger.error(`[SchedulerTaskExecutor] Error parsing workflow info from prompt: ${prompt}`, error);
      return null;
    }
  }
}

module.exports = SchedulerTaskExecutor; 