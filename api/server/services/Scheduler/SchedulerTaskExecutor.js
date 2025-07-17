const { logger } = require('~/config');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const {
  createSchedulerExecution,
  updateSchedulerExecution,
  optimisticUpdateSchedulerExecution,
  getSchedulerExecutionById,
} = require('~/models/SchedulerExecution');
const { updateSchedulerTask, atomicUpdateTaskStatus } = require('~/models/SchedulerTask');
const { User } = require('~/db/models');
const { replaceSpecialVars } = require('librechat-data-provider');
const { calculateNextRun } = require('./utils/cronUtils');
const {
  createMockRequest,
  createMockResponse,
  createMinimalMockResponse,
} = require('./utils/mockUtils');
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
        openAI: EModelEndpoint.openAI,
        anthropic: EModelEndpoint.anthropic,
        google: EModelEndpoint.google,
        azureOpenAI: EModelEndpoint.azureOpenAI,
        custom: EModelEndpoint.custom,
        bedrock: EModelEndpoint.bedrock,
      };

      const mappedEndpoint = endpointMapping[configuredEndpoint] || EModelEndpoint.openAI;

      logger.info(
        `[SchedulerTaskExecutor] Using configured model: ${configuredModel} on endpoint: ${configuredEndpoint} (${mappedEndpoint})`,
      );

      return {
        model: configuredModel,
        endpoint: mappedEndpoint,
        endpointName: configuredEndpoint,
      };
    } catch (error) {
      logger.warn(
        '[SchedulerTaskExecutor] Failed to load scheduler config, using defaults:',
        error,
      );
      return {
        model: 'gpt-4o-mini',
        endpoint: EModelEndpoint.openAI,
        endpointName: 'openAI',
      };
    }
  }

  /**
   * Execute a single scheduler task
   *
   * Execution Logic:
   * - All scheduler tasks use ephemeral agent execution to ensure MCP tools access
   * - Use stored context (endpoint/model/agent_id) if available, otherwise fall back to librechat.yaml defaults
   * - This ensures both correct model/endpoint AND access to MCP tools
   *
   * @param {Object} task - The scheduler task to execute
   * @param {Object} executionContext - Optional execution context for test mode or custom trigger info
   * @returns {Promise<Object>} Execution result
   */
  async executeTask(task, executionContext = {}) {
    const executionId = `exec_${task.id}_${Date.now()}`;
    const startTime = new Date();
    const isTest = executionContext.isTest || false;

    logger.info(
      `[SchedulerTaskExecutor] Starting ${isTest ? 'TEST ' : ''}execution: ${executionId} for task ${task.id} (${task.name})`,
    );

    // Fetch user for context replacement
    const user = await User.findById(task.user).lean();
    if (!user) {
      throw new Error(`User not found: ${task.user}`);
    }

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
      logger.warn(
        `[SchedulerTaskExecutor] One-time task ${task.id} is already completed or disabled, skipping execution`,
      );
      return {
        success: false,
        error: 'One-time task already completed',
        skipped: true,
      };
    }

    // Determine trigger type based on execution context
    const triggerType = isTest ? 'test' : (executionContext.triggerType || 'schedule');
    const triggerSource = isTest ? 'workflow_test' : (executionContext.triggerSource || 'scheduler');

    // Create execution record
    const execution = await createSchedulerExecution({
      id: executionId,
      task_id: task.id,
      user: task.user,
      status: 'running',
      start_time: startTime,
      context: {
        trigger: {
          type: triggerType,
          source: triggerSource,
          scheduledTime: startTime,
          isTest: isTest,
        },
        workflow: task.type === 'workflow' ? {
          id: task.id,
          name: task.name,
          totalSteps: task.metadata?.steps?.length || 0,
        } : undefined,
        isTest: isTest, // Add test flag at top level for easy access
        ...executionContext, // Merge any additional context
      },
      steps: task.type === 'workflow' ? (task.metadata?.steps || []).map(step => ({
        ...step,
        status: 'pending',
        retryCount: 0,
        toolsUsed: [],
        mcpToolsCount: 0,
      })) : [],
      progress: task.type === 'workflow' ? {
        completedSteps: 0,
        totalSteps: task.metadata?.steps?.length || 0,
        percentage: 0,
      } : undefined,
    });

    try {
      // Skip atomic status update for test executions - tests should not modify task state
      if (!isTest) {
        // Atomically update task status to running (prevents race conditions)
        const updatedTask = await atomicUpdateTaskStatus(
          task.id, 
          task.user, 
          'pending',  // Expected current status
          'running',  // New status
          { last_run: startTime }
        );

        // Verify the update succeeded - if null, another process already picked up this task
        if (!updatedTask) {
          logger.info(`[SchedulerTaskExecutor] Task ${task.id} was already picked up by another process, skipping`);
          return {
            success: false,
            error: 'Task already running in another process',
            skipped: true,
          };
        }

        logger.debug(`[SchedulerTaskExecutor] Task ${task.id} status atomically updated to running`);

        // Use the updated task for the rest of the execution
        task = updatedTask;
      } else {
        logger.debug(`[SchedulerTaskExecutor] Skipping task status update for test execution`);
      }

      // Send notification that task has started
      await this.notificationManager.sendTaskStartedNotification(task);

      let result;

      // Check if this is a workflow execution task
      if (this.isWorkflowTask(task)) {
        logger.info(
          `[SchedulerTaskExecutor] Detected workflow task ${task.id}, executing workflow`,
        );
        result = await this.executeWorkflowTask(task, executionId, execution);
      } else {
        // All scheduler tasks now use ephemeral agent execution to ensure MCP tools access
        logger.info(
          `[SchedulerTaskExecutor] Executing task ${task.id} with ephemeral agent (ensures MCP tools access)`,
        );
        result = await this.executeWithEphemeralAgent(task, user);
      }

      const endTime = new Date();
      const duration = endTime - startTime;

      // Update execution record with success using optimistic locking
      const successUpdateData = {
        status: 'completed',
        end_time: endTime,
        duration,
        result: typeof result === 'string' ? result : JSON.stringify(result),
      };
      
      try {
        const currentExecution = await getSchedulerExecutionById(executionId, task.user);
        if (currentExecution) {
          const currentVersion = currentExecution.version || 1;
          const updatedExecution = await optimisticUpdateSchedulerExecution(
            executionId, 
            task.user, 
            currentVersion, 
            successUpdateData
          );
          
          if (!updatedExecution) {
            logger.warn(`[SchedulerTaskExecutor] Success update conflict for ${executionId}, using fallback`);
            await updateSchedulerExecution(executionId, task.user, successUpdateData);
          }
        } else {
          await updateSchedulerExecution(executionId, task.user, successUpdateData);
        }
      } catch (updateError) {
        logger.error(`[SchedulerTaskExecutor] Error during optimistic success update: ${updateError.message}`);
        await updateSchedulerExecution(executionId, task.user, successUpdateData);
      }

      // Update task status and schedule next run if recurring (skip for test executions)
      if (!isTest) {
        await this.updateTaskAfterSuccess(task, endTime);
      } else {
        logger.debug(`[SchedulerTaskExecutor] Skipping task status update after success for test execution`);
      }

      // Send all success notifications (don't let notification failures fail the execution)
      try {
        await this.notificationManager.sendSuccessNotifications(task, result, duration);
      } catch (notificationError) {
        logger.warn(
          `[SchedulerTaskExecutor] Task ${task.id} completed successfully but notification failed: ${notificationError.message}`,
        );
        // Don't throw - the task itself was successful
      }

      logger.info(
        `[SchedulerTaskExecutor] Task ${task.id} completed successfully in ${duration}ms`,
      );

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

      // Update execution record with failure using optimistic locking
      const failureUpdateData = {
        status: 'failed',
        end_time: endTime,
        duration,
        error: error.message,
      };
      
      try {
        const currentExecution = await getSchedulerExecutionById(executionId, task.user);
        if (currentExecution) {
          const currentVersion = currentExecution.version || 1;
          const updatedExecution = await optimisticUpdateSchedulerExecution(
            executionId, 
            task.user, 
            currentVersion, 
            failureUpdateData
          );
          
          if (!updatedExecution) {
            logger.warn(`[SchedulerTaskExecutor] Failure update conflict for ${executionId}, using fallback`);
            await updateSchedulerExecution(executionId, task.user, failureUpdateData);
          }
        } else {
          await updateSchedulerExecution(executionId, task.user, failureUpdateData);
        }
      } catch (updateError) {
        logger.error(`[SchedulerTaskExecutor] Error during optimistic failure update: ${updateError.message}`);
        await updateSchedulerExecution(executionId, task.user, failureUpdateData);
      }

      // Update task status (skip for test executions)
      if (!isTest) {
        await updateSchedulerTask(task.id, task.user, {
          status: 'failed',
          last_run: endTime,
        });
      } else {
        logger.debug(`[SchedulerTaskExecutor] Skipping task status update after failure for test execution`);
      }

      // Send all failure notifications (don't let notification failures mask the original error)
      try {
        await this.notificationManager.sendFailureNotifications(task, error, duration);
      } catch (notificationError) {
        logger.warn(
          `[SchedulerTaskExecutor] Task ${task.id} failed and notification also failed: ${notificationError.message}`,
        );
        // Don't throw the notification error - preserve the original task error
      }

      throw error;
    }
  }

  /**
   * Execute task using ephemeral agent pattern with MCP tools
   * Uses stored task context if available, otherwise falls back to librechat.yaml defaults
   * @param {Object} task - The scheduler task
   * @returns {Promise<string>} Execution result
   */
  async executeWithEphemeralAgent(task, user) {
    logger.info(`[SchedulerTaskExecutor] Using ephemeral agent execution for task ${task.id}`);

    try {
      // Determine model and endpoint to use
      let configuredModel, configuredEndpoint, endpointName;

      if (task.endpoint && task.ai_model) {
        // Use stored task context
        configuredEndpoint = task.endpoint;
        configuredModel = task.ai_model;
        endpointName = task.endpoint;
        logger.info(
          `[SchedulerTaskExecutor] Using stored task context for ${task.id}: ${endpointName}/${configuredModel}`,
        );
      } else if (task.agent_id && task.endpoint === EModelEndpoint.agents) {
        // Task was created with an agent - load the agent to get its model/endpoint
        const agent = await this.agentHandler.loadAgentForTask(task);
        if (agent && !agent.fallback) {
          configuredModel = agent.model;
          configuredEndpoint = agent.provider || EModelEndpoint.openAI;
          endpointName = agent.provider || 'openAI';
          logger.info(
            `[SchedulerTaskExecutor] Using agent context for ${task.id}: agent=${task.agent_id}, model=${configuredModel}, endpoint=${endpointName}`,
          );
        } else {
          // Agent not found or not accessible, fallback to agent's stored context or defaults
          const fallback = this.agentHandler.determineFallbackConfiguration(task, agent);
          configuredEndpoint = fallback.endpoint;
          configuredModel = fallback.model;
          endpointName = fallback.endpoint;
          logger.warn(
            `[SchedulerTaskExecutor] Agent ${task.agent_id} not accessible, using fallback for ${task.id}: ${endpointName}/${configuredModel}`,
          );
        }
      } else {
        // No stored context, fallback to librechat.yaml defaults
        const config = await this.getConfiguredModelAndEndpoint();
        configuredModel = config.model;
        configuredEndpoint = config.endpoint;
        endpointName = config.endpointName;
        logger.warn(
          `[SchedulerTaskExecutor] No stored context for task ${task.id}, using librechat.yaml defaults: ${endpointName}/${configuredModel}`,
        );
      }

      // Replace special variables in the prompt (for non-workflow tasks)
      const prompt = task.prompt ? replaceSpecialVars({ text: task.prompt, user }) : task.name;

      // Set up ephemeral agent configuration with MCP tools
      const setupResult = await this.agentHandler.createEphemeralAgentSetup(task, user);

      logger.info(
        `[SchedulerTaskExecutor] MCP setup complete for task ${task.id}: ${setupResult.mcpServerNames.length} servers, ${setupResult.availableToolsCount} tools`,
      );

      // Create ephemeral agent configuration
      const ephemeralAgent = {
        scheduler: true,
        workflow: true,
        execute_code: false,
        web_search: true,
        mcp: setupResult.mcpServerNames,
      };

      // Update request for ephemeral agent with the determined endpoint/model
      const { updateRequestForEphemeralAgent } = require('./utils/mockUtils');
      updateRequestForEphemeralAgent(
        setupResult.mockReq,
        task,
        ephemeralAgent,
        configuredEndpoint,
        configuredModel,
      );

      // Load ephemeral agent using the determined model/endpoint
      const { loadAgent } = require('~/models/Agent');
      const agent = await loadAgent({
        req: setupResult.mockReq,
        agent_id: Constants.EPHEMERAL_AGENT_ID,
        endpoint: configuredEndpoint,
        model_parameters: { model: configuredModel },
      });

      if (!agent) {
        throw new Error('Failed to load ephemeral agent for scheduler task');
      }

      logger.info(
        `[SchedulerTaskExecutor] Loaded ephemeral agent for task ${task.id}: ${agent.tools?.length || 0} tools using ${endpointName}/${configuredModel}`,
      );

      // Use agents endpoint for ephemeral agent
      const endpointOption = this.clientFactory.createAgentsEndpointOption(agent, configuredModel);
      endpointOption.titleConvo = false;

      // Create minimal mock response for client initialization
      const mockRes = createMinimalMockResponse();

      // Initialize the AGENTS client
      const clientResult = await this.clientFactory.initializeClient({
        req: setupResult.mockReq,
        res: mockRes,
        endpointOption,
      });

      const client = clientResult.client;

      if (!client) {
        throw new Error('Failed to initialize agents client for scheduler task');
      }

      logger.info(
        `[SchedulerTaskExecutor] AgentClient initialized successfully for task ${task.id} using ${endpointName}/${configuredModel}`,
      );

      // Execute using the agents client
      const response = await client.sendMessage(prompt, {
        user: task.user,
        conversationId: task.conversation_id,
        parentMessageId: task.parent_message_id,
        onProgress: (data) => {
          logger.debug(
            `[SchedulerTaskExecutor] Agent progress for task ${task.id}:`,
            data?.text ? data.text.substring(0, 100) : 'No text content',
          );
        },
      });

      if (!response) {
        throw new Error('No response received from agent');
      }

      logger.info(`[SchedulerTaskExecutor] Agent execution completed for task ${task.id}`);

      // Extract response text from agent response
      const result = this.extractResponseText(response);
      logger.info(
        `[SchedulerTaskExecutor] Extracted result for task ${task.id}: ${result ? result.substring(0, 200) : 'No result'}...`,
      );

      return result;
    } catch (error) {
      logger.error(
        `[SchedulerTaskExecutor] Ephemeral agent execution failed for task ${task.id}:`,
        error,
      );
      throw error;
    }
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
        .filter((part) => part.type === 'text')
        .map((part) => part.text || part.content?.text || part.content)
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

      logger.info(
        `[SchedulerTaskExecutor] Disabling one-time task ${task.id} after successful execution`,
      );
      await updateSchedulerTask(task.id, task.user, updateData);
    } else {
      // Check if this is a manual workflow or scheduled workflow
      if (task.trigger?.type === 'manual') {
        // For manual workflows, mark as completed and disable to prevent re-execution
        const updateData = {
          status: 'completed',
          last_run: endTime,
          enabled: false, // Disable manual workflows after execution
        };

        logger.info(
          `[SchedulerTaskExecutor] Manual workflow ${task.id} completed successfully - disabling to prevent re-execution`,
        );
        await updateSchedulerTask(task.id, task.user, updateData);
      } else if (task.trigger?.type === 'schedule' && task.trigger?.config?.schedule) {
        // For scheduled workflows, calculate next run time
        const cronExpression = task.trigger.config.schedule;
        const cronTime = calculateNextRun(cronExpression);
        if (cronTime) {
          const updateData = {
            status: 'pending',
            last_run: endTime,
            next_run: cronTime,
          };

          logger.info(
            `[SchedulerTaskExecutor] Scheduling next run for recurring task ${task.id} at ${cronTime.toISOString()}`,
          );
          await updateSchedulerTask(task.id, task.user, updateData);
        } else {
          // Disable if we can't calculate next run
          const updateData = {
            status: 'failed',
            last_run: endTime,
            enabled: false,
          };

          logger.warn(
            `[SchedulerTaskExecutor] Unable to calculate next run for task ${task.id}, disabling`,
          );
          await updateSchedulerTask(task.id, task.user, updateData);
        }
      }
    }
  }

  /**
   * Check if a task is a workflow execution task
   * @param {Object} task - The scheduler task
   * @returns {boolean} True if this is a workflow task
   */
  isWorkflowTask(task) {
    return task.type === 'workflow';
  }

  /**
   * Execute a workflow task
   * @param {Object} task - The scheduler task representing a workflow
   * @param {string} executionId - The scheduler execution ID
   * @returns {Promise<string>} Execution result
   */
  async executeWorkflowTask(task, executionId, execution) {
    try {
      // Modern workflow tasks have the workflow ID as the task ID and metadata structure
      const workflowId = task.id;
      const workflowName = task.name;

      if (!workflowId) {
        throw new Error('Invalid workflow task format - missing workflow ID');
      }

      const isTest = execution.context.isTest || false;
      logger.info(
        `[SchedulerTaskExecutor] Executing ${isTest ? 'TEST ' : ''}workflow ${workflowId} (${workflowName})`,
      );

      // Get workflow data from task metadata
      if (!task.metadata || !task.metadata.steps) {
        throw new Error('Task is not a workflow or missing workflow steps');
      }

      // Create workflow object from task metadata
      const workflow = {
        id: workflowId,
        name: workflowName,
        trigger: task.trigger,
        steps: task.metadata.steps,
        isDraft: task.metadata.isDraft || false,
        isActive: task.enabled,
        user: task.user,
        conversation_id: task.conversation_id,
        parent_message_id: task.parent_message_id,
        endpoint: task.endpoint,
        ai_model: task.ai_model,
        agent_id: task.agent_id,
        metadata: task.metadata, // Include full metadata for access to dedicatedConversationId
      };

      // Create execution context using the execution record's context (includes test flag)
      // Include memory and agents config like the test execution does
      const config = await getCustomConfig();
      const context = {
        trigger: execution.context.trigger, // Use trigger from execution record (includes isTest flag)
        isTest: execution.context.isTest || false, // Pass test flag through
        memoryConfig: config?.memory || {},
        agentsConfig: config?.endpoints?.agents || {},
      };

      // Use WorkflowExecutor singleton to maintain execution state
      const WorkflowExecutor = require('~/server/services/Workflows/WorkflowExecutor');
      const workflowExecutor = WorkflowExecutor.getInstance();

      // Execute the workflow using WorkflowExecutor
      const workflowResult = await workflowExecutor.executeWorkflow(
        workflow,
        { id: executionId, user: task.user },
        context,
      );

      if (workflowResult.success) {
        logger.info(
          `[SchedulerTaskExecutor] Workflow ${workflowId} executed successfully`,
        );
        return `Workflow "${workflowName}" executed successfully. ${workflowResult.result?.summary || ''}`;
      } else {
        logger.error(
          `[SchedulerTaskExecutor] Workflow ${workflowId} execution failed:`,
          workflowResult.error,
        );
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
        workflowName: parts.slice(2).join(':'), // Handle workflow names with colons
      };
    } catch (error) {
      logger.error(
        `[SchedulerTaskExecutor] Error parsing workflow info from prompt: ${prompt}`,
        error,
      );
      return null;
    }
  }

  /**
   * Execute workflow from webhook trigger
   * @param {Object} options - Webhook execution options
   * @param {string} options.workflowId - Workflow ID
   * @param {string} options.triggerKey - Trigger key
   * @param {Object} options.triggerEvent - Event data from webhook
   * @param {string} options.userId - User ID
   * @param {string} options.deploymentId - Deployment ID
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflowFromWebhook(options) {
    const { workflowId, triggerKey, triggerEvent, userId, deploymentId } = options;
    
    logger.info(`[SchedulerTaskExecutor] Executing workflow ${workflowId} from webhook trigger ${triggerKey}`);

    try {
      // Get the workflow task from scheduler
      const { getSchedulerTaskById } = require('~/models/SchedulerTask');
      const workflowTask = await getSchedulerTaskById(workflowId, userId);
      
      if (!workflowTask) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      if (workflowTask.type !== 'workflow') {
        throw new Error(`Task ${workflowId} is not a workflow`);
      }

      if (!workflowTask.enabled) {
        throw new Error(`Workflow ${workflowId} is not enabled`);
      }

      // Create execution record
      const executionId = `exec_${workflowId}_${Date.now()}`;
      const execution = await createSchedulerExecution({
        id: executionId,
        task_id: workflowId,
        user: userId,
        status: 'running',
        start_time: new Date(),
        context: {
          triggerType: 'webhook',
          triggerKey,
          triggerEvent,
          deploymentId,
          workflowName: workflowTask.name,
        },
      });

      // Execute the workflow using the WorkflowExecutor
      const WorkflowExecutor = require('~/server/services/Workflows/WorkflowExecutor');
      const workflowExecutor = WorkflowExecutor.getInstance();

      // Convert scheduler task to workflow format
      const WorkflowService = require('~/server/services/Workflows/WorkflowService');
      const workflowService = new WorkflowService();
      const workflow = workflowService.schedulerTaskToWorkflow(workflowTask);

      // Create execution context with trigger event data (include memory config like cron execution)
      const config = await getCustomConfig();
      const executionContext = {
        trigger: {
          type: 'webhook',
          key: triggerKey,
          event: triggerEvent,
          deploymentId,
        },
        isTest: false,
        memoryConfig: config?.memory || {},
        agentsConfig: config?.endpoints?.agents || {},
      };

      // Load full user object for workflow execution (required for memory loading)
      const user = await User.findById(userId).lean();
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Execute the workflow (user parameter expects user ID string, not user object)
      const result = await workflowExecutor.executeWorkflow(
        workflow,
        { id: executionId, user: user._id.toString() },
        executionContext
      );

      // Update execution record with success
      await updateSchedulerExecution(executionId, userId, {
        status: 'completed',
        end_time: new Date(),
        result: result.success ? 'success' : 'failed',
        output: result.output || JSON.stringify(result),
        error: result.error || null,
      });

      logger.info(`[SchedulerTaskExecutor] Webhook execution completed for workflow ${workflowId}`);
      
      return {
        success: true,
        executionId,
        workflowId,
        result: result.output || result,
      };

    } catch (error) {
      logger.error(`[SchedulerTaskExecutor] Webhook execution failed for workflow ${workflowId}:`, error);
      
      // Update execution record with failure
      const executionId = `exec_${workflowId}_${Date.now()}`;
      await updateSchedulerExecution(executionId, userId, {
        status: 'failed',
        end_time: new Date(),
        result: 'failed',
        error: error.message,
      });

      throw error;
    }
  }
}

module.exports = SchedulerTaskExecutor;
