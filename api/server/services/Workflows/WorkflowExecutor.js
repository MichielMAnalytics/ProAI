const { logger } = require('~/config');
const { Constants } = require('librechat-data-provider');
const { updateSchedulerExecution, optimisticUpdateSchedulerExecution, getSchedulerExecutionById } = require('~/models/SchedulerExecution');
const { loadAgent } = require('~/models/Agent');
const { User } = require('~/db/models');
const { getBufferString } = require('@langchain/core/messages');
const { HumanMessage } = require('@langchain/core/messages');
const {
  createMinimalMockResponse,
  updateRequestForEphemeralAgent,
} = require('~/server/services/Scheduler/utils/mockUtils');
const {
  findFirstStep,
  createSerializableContext,
  getConfiguredModelAndEndpoint,
  createMockRequestForWorkflow,
  extractMCPServerNames,
  executeStep,
} = require('./executor');
const SchedulerClientFactory = require('~/server/services/Scheduler/SchedulerClientFactory');

/**
 * Extract meaningful content from step result object for display
 * @param {Object} result - Step result object
 * @returns {string|null} Meaningful content or null if not found
 */
function extractMeaningfulContent(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  // Handle LibreChat agent response objects with content array
  if (result.content && Array.isArray(result.content)) {
    // Extract text content from agent response content array
    const textParts = result.content
      .filter((part) => part.type === 'text' && part.text && part.text.trim())
      .map((part) => part.text.trim());

    if (textParts.length > 0) {
      return textParts.join('\n').trim();
    }
  }

  // Check for direct text field
  if (result.text && typeof result.text === 'string' && result.text.trim()) {
    return result.text.trim();
  }

  // Handle nested agent response objects (common in LibreChat)
  if (result.agentResponse) {
    if (typeof result.agentResponse === 'string') {
      return result.agentResponse;
    }
    if (typeof result.agentResponse === 'object') {
      // Try to extract text from nested agent response content
      if (result.agentResponse.content && Array.isArray(result.agentResponse.content)) {
        const textParts = result.agentResponse.content
          .filter((part) => part.type === 'text' && part.text && part.text.trim())
          .map((part) => part.text.trim());

        if (textParts.length > 0) {
          return textParts.join('\n').trim();
        }
      }

      // Check for direct text in agent response
      if (
        result.agentResponse.text &&
        typeof result.agentResponse.text === 'string' &&
        result.agentResponse.text.trim()
      ) {
        return result.agentResponse.text.trim();
      }

      // Check for message content in agent response
      if (result.agentResponse.content && typeof result.agentResponse.content === 'string') {
        return result.agentResponse.content;
      }
    }
  }

  // Check for tool results
  if (result.toolResults && Array.isArray(result.toolResults)) {
    const meaningfulResults = result.toolResults
      .map((tool) => {
        if (tool.result && typeof tool.result === 'string') {
          return `Tool "${tool.name || 'unknown'}": ${tool.result}`;
        }
        if (tool.result && typeof tool.result === 'object') {
          // Try to extract meaningful data from tool result
          if (tool.result.data || tool.result.message || tool.result.content) {
            const content = tool.result.data || tool.result.message || tool.result.content;
            return `Tool "${tool.name || 'unknown'}": ${typeof content === 'string' ? content : JSON.stringify(content)}`;
          }
        }
        return null;
      })
      .filter(Boolean);

    if (meaningfulResults.length > 0) {
      return meaningfulResults.join('\n');
    }
  }

  // Check for direct content fields
  if (result.content && typeof result.content === 'string') {
    return result.content;
  }

  if (result.message && typeof result.message === 'string') {
    return result.message;
  }

  if (result.data) {
    if (typeof result.data === 'string') {
      return result.data;
    }
    if (typeof result.data === 'object') {
      // Try to extract summary information from data objects
      if (Array.isArray(result.data)) {
        return `Retrieved ${result.data.length} items`;
      }
      if (result.data.summary) {
        return result.data.summary;
      }
    }
  }

  // Check for successful execution indicators
  if (result.success && result.type) {
    return `Successfully executed ${result.type} operation`;
  }

  return null;
}

/**
 * WorkflowExecutor - Handles the execution of workflows
 *
 * This service manages:
 * - Step-by-step workflow execution with isolated agents
 * - Integration with MCP tools and Pipedream actions
 * - Error handling and retry logic
 * - Context management between steps
 * - Execution flow control (success/failure paths)
 * - Fresh agent creation for each step (no reuse)
 *
 * EXECUTION TRACKING:
 * - Uses ExecutionDashboard component for execution history viewing
 * - Conversations are not saved (skipSaveConvo=true) during workflow execution
 * - Execution details are tracked in the scheduler execution records
 * - Step results and errors are captured in execution metadata
 *
 * AGENT ISOLATION:
 * - Each step gets a fresh agent instance
 * - No agent reuse across steps to prevent context bleeding
 * - All steps are 'mcp_agent_action' type
 *
 * SINGLETON PATTERN:
 * - Maintains shared state for running executions across instances
 * - Ensures proper execution tracking and stop functionality
 */
class WorkflowExecutor {
  constructor() {
    // Use singleton pattern to maintain shared state
    if (WorkflowExecutor.instance) {
      return WorkflowExecutor.instance;
    }

    this.runningExecutions = new Map(); // Track running executions
    this.mcpInitialized = new Map(); // Track MCP initialization per user
    
    // Memory cleanup configuration
    this.EXECUTION_TIMEOUT_MS = parseInt(process.env.WORKFLOW_EXECUTION_TIMEOUT) || 30 * 60 * 1000; // 30 minutes
    this.MCP_CACHE_TIMEOUT_MS = parseInt(process.env.MCP_CACHE_TIMEOUT) || 60 * 60 * 1000; // 1 hour
    this.MAX_CONCURRENT_EXECUTIONS = parseInt(process.env.MAX_CONCURRENT_WORKFLOWS) || 50;
    
    // Start memory cleanup interval
    this.startMemoryCleanup();

    WorkflowExecutor.instance = this;
  }

  /**
   * Get singleton instance
   * @returns {WorkflowExecutor} The singleton instance
   */
  static getInstance() {
    if (!WorkflowExecutor.instance) {
      WorkflowExecutor.instance = new WorkflowExecutor();
    }
    return WorkflowExecutor.instance;
  }

  /**
   * Start periodic memory cleanup to prevent memory leaks
   */
  startMemoryCleanup() {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, 5 * 60 * 1000);

    logger.debug('[WorkflowExecutor] Memory cleanup interval started');
  }

  /**
   * Perform memory cleanup - remove expired executions and MCP cache
   */
  performMemoryCleanup() {
    const now = Date.now();
    let cleanedExecutions = 0;
    let cleanedMcpCache = 0;

    // Clean up expired executions
    for (const [executionId, data] of this.runningExecutions.entries()) {
      const age = now - data.startTime.getTime();
      if (age > this.EXECUTION_TIMEOUT_MS) {
        logger.warn(`[WorkflowExecutor] Force cleaning up expired execution: ${executionId} (age: ${Math.round(age / 60000)}min)`);
        
        // Signal abort if possible
        if (data.abortController) {
          data.abortController.abort('Execution timeout - force cleanup');
        }
        
        this.runningExecutions.delete(executionId);
        cleanedExecutions++;
        
        // Update execution status if possible
        try {
          updateSchedulerExecution(executionId, data.userId || 'unknown', {
            status: 'failed',
            end_time: new Date(),
            error: 'Execution timeout - force cleanup',
          }).catch(err => logger.debug(`Failed to update execution status: ${err.message}`));
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    }

    // Clean up expired MCP cache entries
    for (const [userId, cacheEntry] of this.mcpInitialized.entries()) {
      // Add timestamp if missing (backwards compatibility)
      if (!cacheEntry.timestamp) {
        cacheEntry.timestamp = now;
        continue;
      }
      
      const age = now - cacheEntry.timestamp;
      if (age > this.MCP_CACHE_TIMEOUT_MS) {
        logger.debug(`[WorkflowExecutor] Cleaning up expired MCP cache for user: ${userId} (age: ${Math.round(age / 60000)}min)`);
        this.mcpInitialized.delete(userId);
        cleanedMcpCache++;
      }
    }

    // Log cleanup stats if anything was cleaned
    if (cleanedExecutions > 0 || cleanedMcpCache > 0) {
      logger.info(`[WorkflowExecutor] Memory cleanup completed: ${cleanedExecutions} executions, ${cleanedMcpCache} MCP cache entries`);
    }

    // Log current memory usage
    const stats = this.getMemoryStats();
    if (stats.runningExecutions > 20 || stats.mcpCacheEntries > 100) {
      logger.warn(`[WorkflowExecutor] High memory usage detected:`, stats);
    }
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats() {
    return {
      runningExecutions: this.runningExecutions.size,
      mcpCacheEntries: this.mcpInitialized.size,
      maxConcurrentExecutions: this.MAX_CONCURRENT_EXECUTIONS,
      executionTimeoutMinutes: Math.round(this.EXECUTION_TIMEOUT_MS / 60000),
      mcpCacheTimeoutMinutes: Math.round(this.MCP_CACHE_TIMEOUT_MS / 60000),
    };
  }


  /**
   * Force cleanup of all memory caches (emergency cleanup)
   */
  forceCleanupAll() {
    logger.warn('[WorkflowExecutor] Force cleanup of all caches initiated');
    
    // Abort all running executions
    for (const [executionId, data] of this.runningExecutions.entries()) {
      if (data.abortController) {
        data.abortController.abort('Force cleanup - system maintenance');
      }
    }
    
    const stats = {
      executions: this.runningExecutions.size,
      mcpCache: this.mcpInitialized.size,
    };
    
    this.runningExecutions.clear();
    this.mcpInitialized.clear();
    
    logger.warn(`[WorkflowExecutor] Force cleanup completed: ${stats.executions} executions, ${stats.mcpCache} MCP cache entries`);
    return stats;
  }

  /**
   * Ensure MCP tools are ready for a user in background execution context (workflows)
   * Uses system credentials as primary strategy for non-interactive OAuth flows
   * @param {string} userId - User ID
   * @returns {Promise<Object>} MCP initialization result
   */
  async ensureMCPReady(userId) {
    // Check if already initialized for this user
    if (this.mcpInitialized.has(userId)) {
      return this.mcpInitialized.get(userId);
    }

    try {
      logger.info(`[WorkflowExecutor] Initializing MCP for background execution (user ${userId})`);

      // Use background-optimized MCP initialization for workflow execution
      const MCPInitializer = require('~/server/services/MCPInitializer');
      const mcpInitializer = MCPInitializer.getInstance();

      // Create availableTools object to be populated by MCPInitializer
      const availableTools = {};

      // Use background-specific initialization that prioritizes system credentials
      const mcpResult = await mcpInitializer.ensureUserMCPReadyForBackground(
        userId,
        'WorkflowExecutor',
        availableTools, // This gets populated with MCP tools using system credentials
        {}, // No additional options needed
      );

      // Store the result with timestamp for cache expiration
      const result = {
        success: mcpResult.success,
        availableTools, // Enhanced tools with embedded metadata
        toolCount: mcpResult.toolCount,
        serverCount: mcpResult.serverCount,
        backgroundExecution: true, // Flag to indicate background execution
        timestamp: Date.now(), // For cache expiration
      };

      this.mcpInitialized.set(userId, result);

      logger.info(
        `[WorkflowExecutor] Background MCP initialized for user ${userId}: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools`,
      );
      return result;
    } catch (error) {
      logger.error(`[WorkflowExecutor] Failed to initialize background MCP for user ${userId}:`, error);

      const errorResult = {
        success: false,
        availableTools: {},
        toolCount: 0,
        serverCount: 0,
        error: error.message,
        backgroundExecution: true,
        timestamp: Date.now(), // For cache expiration
      };

      this.mcpInitialized.set(userId, errorResult);
      return errorResult;
    }
  }

  /**
   * Execute a complete workflow
   * @param {Object} workflow - The workflow to execute
   * @param {Object} execution - The execution record
   * @param {Object} context - Initial execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflow(workflow, execution, context = {}) {
    const workflowId = workflow.id;
    const executionId = execution.id;
    const userId = execution.user;
    let executionContext = null; // Initialize here to ensure it's in scope for error handling
    
    // Initialize step messages array with trigger context if user enabled it
    let stepMessages = [];
    
    logger.info(`[WorkflowExecutor] === TRIGGER CONTEXT DEBUG START ===`);
    logger.info(`[WorkflowExecutor] Full context object:`, JSON.stringify(context, null, 2));
    logger.info(`[WorkflowExecutor] Full workflow.trigger object:`, JSON.stringify(workflow.trigger, null, 2));
    logger.info(`[WorkflowExecutor] Checking trigger context conditions:`, {
      triggerType: context.trigger?.type,
      triggerKey: context.trigger?.key,
      passTriggerEnabled: workflow.trigger?.config?.parameters?.passTriggerToFirstStep,
      hasEvent: !!context.trigger?.event,
      eventKeys: context.trigger?.event ? Object.keys(context.trigger.event) : null
    });
    
    if ((context.trigger?.type === 'webhook' || context.trigger?.type === 'polling') && 
        workflow.trigger?.config?.parameters?.passTriggerToFirstStep === true) {
      
      logger.info(`[WorkflowExecutor] Trigger context conditions MET - proceeding to format trigger context`);
      logger.info(`[WorkflowExecutor] Raw trigger event data:`, JSON.stringify(context.trigger.event, null, 2));
      
      const triggerContext = this.formatTriggerContext(
        context.trigger.key, 
        context.trigger.event
      );
      
      if (triggerContext) {
        stepMessages.push(new HumanMessage(`TRIGGER CONTEXT:\n${triggerContext}`));
        logger.info(`[WorkflowExecutor] ✅ Successfully added ${context.trigger.key} trigger context to first step`);
        logger.info(`[WorkflowExecutor] Trigger context content (first 500 chars): ${triggerContext.substring(0, 500)}...`);
        logger.info(`[WorkflowExecutor] stepMessages array now has ${stepMessages.length} messages`);
      } else {
        logger.error(`[WorkflowExecutor] ❌ No trigger context generated for ${context.trigger.key}`);
        logger.error(`[WorkflowExecutor] Event data that failed to format:`, JSON.stringify(context.trigger.event, null, 2));
      }
    } else {
      logger.warn(`[WorkflowExecutor] ❌ Trigger context conditions NOT met:`);
      logger.warn(`[WorkflowExecutor] - Trigger type: ${context.trigger?.type} (expected: 'webhook' or 'polling')`);
      logger.warn(`[WorkflowExecutor] - passTriggerToFirstStep: ${workflow.trigger?.config?.parameters?.passTriggerToFirstStep} (expected: true)`);
    }
    logger.info(`[WorkflowExecutor] === TRIGGER CONTEXT DEBUG END ===`);
    logger.info(`[WorkflowExecutor] Final stepMessages array length: ${stepMessages.length}`);

    try {
      logger.info(`[WorkflowExecutor] Starting workflow execution: ${workflowId}`);

      // Fetch user object for context
      const userDbObject = await User.findById(userId).lean();
      if (!userDbObject) {
        throw new Error(`User not found: ${userId}`);
      }
      const user = { ...userDbObject, id: userDbObject._id.toString() };

      // Initialize MCP tools for the user using the same approach as scheduler
      const mcpResult = await this.ensureMCPReady(userId);
      logger.info(
        `[WorkflowExecutor] MCP ready for workflow ${workflowId}: ${mcpResult.toolCount} tools available`,
      );

      // Create cancellation controller for this execution
      const abortController = new AbortController();

      // Check concurrency limits before starting
      if (this.runningExecutions.size >= this.MAX_CONCURRENT_EXECUTIONS) {
        throw new Error(`Maximum concurrent workflow executions reached (${this.MAX_CONCURRENT_EXECUTIONS}). Please wait for other workflows to complete.`);
      }

      // Track this execution with enhanced data and timeout
      const timeoutHandle = setTimeout(() => {
        logger.warn(`[WorkflowExecutor] Execution ${executionId} timeout reached, force aborting`);
        if (abortController) {
          abortController.abort('Execution timeout');
        }
        this.forceCleanupExecution(executionId, userId);
      }, this.EXECUTION_TIMEOUT_MS);

      this.runningExecutions.set(executionId, {
        workflowId,
        userId,
        startTime: new Date(),
        status: 'running',
        mcpResult,
        abortController,
        timeoutHandle,
      });

      // Generate a conversation ID for step execution context (won't be saved due to skipSaveConvo)
      const { v4: uuidv4 } = require('uuid');
      let workflowExecutionConversationId = uuidv4(); // ID for context, but conversations won't be saved

      // Initialize execution context without workflow-level agent
      executionContext = {
        ...context,
        user, // Add full user object to context
        workflow: {
          // Include full workflow object for context access
          ...workflow,
          // Override/add execution-specific properties
          conversationId: workflowExecutionConversationId, // Used for context but not saved
          parentMessageId: null, // Start fresh for workflow execution
          // No workflow-level agent - each step will create its own
        },
        execution: {
          id: executionId,
          startTime: new Date(),
        },
        mcp: {
          available: mcpResult.success,
          toolCount: mcpResult.toolCount,
          serverCount: mcpResult.serverCount,
          availableTools: mcpResult.availableTools,
          // Enhanced tools already included in availableTools
        },
        steps: {},
        variables: {},
      };

      // Extract workflow name for metadata
      const workflowName = workflow.name?.replace(/^Workflow:\s*/, '') || 'Unnamed Workflow';

      // Initialize enhanced execution context with workflow info
      executionContext = {
        ...context,
        user, // Add full user object to context
        workflow: {
          // Include full workflow object for context access
          ...workflow,
          // Override/add execution-specific properties
          conversationId: workflowExecutionConversationId, // Used for context but not saved
          parentMessageId: null, // Start fresh for workflow execution
          // No workflow-level agent - each step will create its own
        },
        execution: {
          id: executionId,
          startTime: new Date(),
        },
        mcp: {
          available: mcpResult.success,
          toolCount: mcpResult.toolCount,
          serverCount: mcpResult.serverCount,
          availableTools: mcpResult.availableTools,
          // Enhanced tools already included in availableTools
        },
        steps: {},
        variables: {},
      };

      // Prepare structured execution record with enhanced schema
      const executionRecord = {
        id: executionId,
        task_id: workflowId,
        user: userId,
        start_time: new Date(),
        status: 'running',
        currentStepId: null,
        currentStepIndex: 0,
        progress: {
          completedSteps: 0,
          totalSteps: workflow.steps?.length || 0,
          percentage: 0,
        },
        steps: workflow.steps?.map((step) => ({
          id: step.id,
          name: step.name,
          type: step.type,
          instruction: step.instruction,
          agent_id: step.agent_id,
          status: 'pending',
          retryCount: 0,
          toolsUsed: [],
          mcpToolsCount: 0,
        })) || [],
        context: {
          isTest: context.isTest || false,
          trigger: {
            type: 'manual',
            source: context.isTest ? 'test' : 'manual',
            parameters: context.trigger?.parameters || {},
          },
          workflow: {
            id: workflowId,
            name: workflowName,
            version: workflow.version || 1,
            description: workflow.description || '',
            totalSteps: workflow.steps?.length || 0,
          },
          execution: {
            totalDuration: 0,
            successfulSteps: 0,
            failedSteps: 0,
            skippedSteps: 0,
          },
          mcp: {
            available: mcpResult.success,
            toolCount: mcpResult.toolCount,
            serverCount: mcpResult.serverCount,
            initializationTime: 0, // TODO: Track this
          },
          environment: {
            timezone: user.timezone || 'UTC',
            locale: user.locale || 'en-US',
            platform: process.platform,
          },
        },
        logs: [],
        notifications: [],
      };

      // Update the existing execution record with enhanced structure
      // (The execution record was already created in WorkflowService.executeWorkflow)
      await updateSchedulerExecution(executionId, execution.user, {
        ...executionRecord,
        // Remove fields that shouldn't be updated
        id: undefined,
        task_id: undefined,
        user: undefined,
      });

      // Find the first step (usually the one without any incoming connections)
      const firstStep = findFirstStep(workflow.steps);
      if (!firstStep) {
        throw new Error('No starting step found in workflow');
      }

      // Execute steps starting from the first step
      const result = await this.executeStepChain(
        workflow,
        execution,
        firstStep.id,
        executionContext,
        executionRecord,
        stepMessages,
      );

      // Clean up tracking with timeout cleanup
      this.cleanupExecution(executionId);

      logger.info(`[WorkflowExecutor] Workflow execution completed: ${workflowId}`);
      return result;
    } catch (error) {
      // Clean up tracking with timeout cleanup
      this.cleanupExecution(executionId);

      // Handle WorkflowStepFailureError specially
      if (error.isWorkflowStepFailure) {
        logger.warn(`[WorkflowExecutor] Workflow cancelled due to step failure: ${workflowId}`, error);

        // Create user-friendly error message for workflow step failures
        let errorOutput = `Workflow cancelled: ${error.reason}`;
        if (executionContext && stepMessages && stepMessages.length > 0) {
          const partialSummary = getBufferString(stepMessages);
          errorOutput = `${errorOutput}\n\nSteps completed before cancellation:\n${partialSummary}`;
        }

        // Update execution status as cancelled due to step failure
        const errorEndTime = new Date();
        const errorStartTime = executionContext?.execution?.startTime || new Date();
        const errorUpdateData = {
          status: 'cancelled_step_failure',
          end_time: errorEndTime,
          duration: errorEndTime.getTime() - errorStartTime.getTime(),
          error: error.message,
          output: errorOutput,
        };

        try {
          const currentExecution = await getSchedulerExecutionById(executionId, execution.user);
          if (currentExecution) {
            const currentVersion = currentExecution.version || 1;
            const updatedExecution = await optimisticUpdateSchedulerExecution(
              executionId, 
              execution.user, 
              currentVersion, 
              errorUpdateData
            );
            
            if (!updatedExecution) {
              logger.warn(`[WorkflowExecutor] Cancellation update conflict for ${executionId}, using fallback`);
              await updateSchedulerExecution(executionId, execution.user, errorUpdateData);
            }
          } else {
            await updateSchedulerExecution(executionId, execution.user, errorUpdateData);
          }
        } catch (updateError) {
          logger.error(`[WorkflowExecutor] Error during optimistic cancellation update: ${updateError.message}`);
          await updateSchedulerExecution(executionId, execution.user, errorUpdateData);
        }

        return {
          success: false,
          error: error.message,
          result: null,
          cancelled: true,
          reason: error.reason,
        };
      }

      // Handle regular workflow execution errors
      logger.error(`[WorkflowExecutor] Workflow execution failed: ${workflowId}`, error);

      // Create error summary with any partial results
      let errorOutput = `Workflow failed: ${error.message}`;
      if (executionContext && stepMessages && stepMessages.length > 0) {
        const partialSummary = getBufferString(stepMessages);
        errorOutput = `${errorOutput}\n\nPartial results before failure:\n${partialSummary}`;
      }

      // Update execution status with error using optimistic locking
      const errorEndTime = new Date();
      const errorStartTime = executionContext?.execution?.startTime || new Date();
      const errorUpdateData = {
        status: 'failed',
        end_time: errorEndTime,
        duration: errorEndTime.getTime() - errorStartTime.getTime(),
        error: error.message,
        output: errorOutput,
      };
      
      try {
        const currentExecution = await getSchedulerExecutionById(executionId, execution.user);
        if (currentExecution) {
          const currentVersion = currentExecution.version || 1;
          const updatedExecution = await optimisticUpdateSchedulerExecution(
            executionId, 
            execution.user, 
            currentVersion, 
            errorUpdateData
          );
          
          if (!updatedExecution) {
            logger.warn(`[WorkflowExecutor] Error update conflict for ${executionId}, using fallback`);
            await updateSchedulerExecution(executionId, execution.user, errorUpdateData);
          }
        } else {
          await updateSchedulerExecution(executionId, execution.user, errorUpdateData);
        }
      } catch (updateError) {
        logger.error(`[WorkflowExecutor] Error during optimistic error update: ${updateError.message}`);
        await updateSchedulerExecution(executionId, execution.user, errorUpdateData);
      }

      return {
        success: false,
        error: error.message,
        result: null,
      };
    }
  }

  /**
   * Execute a chain of steps starting from a specific step
   * @param {Object} workflow - The workflow
   * @param {Object} execution - The execution record
   * @param {string} currentStepId - Current step ID to execute
   * @param {Object} context - Execution context
   * @param {Object} executionRecord - Execution record with step tracking
   * @param {Array} stepMessages - Array to accumulate step outputs as messages
   * @returns {Promise<Object>} Execution result
   */
  async executeStepChain(workflow, execution, currentStepId, context, executionRecord, stepMessages) {
    let currentStep = currentStepId;
    const executionResult = { success: true, error: null };
    const accumulatedStepResults = [];

    while (currentStep) {
      // Check if execution has been cancelled
      const executionData = this.runningExecutions.get(execution.id);
      if (!executionData) {
        logger.info(
          `[WorkflowExecutor] Execution ${execution.id} was stopped, terminating workflow`,
        );
        throw new Error('Execution was cancelled by user');
      }

      if (executionData.abortController && executionData.abortController.signal.aborted) {
        logger.info(
          `[WorkflowExecutor] Execution ${execution.id} was aborted, terminating workflow`,
        );
        throw new Error('Execution was cancelled by user');
      }

      const step = workflow.steps.find((s) => s.id === currentStep);
      if (!step) {
        throw new Error(`Step not found: ${currentStep}`);
      }

      logger.info(`[WorkflowExecutor] Executing step: ${step.name} (${step.type}) (agent_id: ${step.agent_id || 'ephemeral'})`);

      // Update step status to running in execution record
      const stepRecord = executionRecord.steps.find((s) => s.id === step.id);
      if (stepRecord) {
        stepRecord.status = 'running';
        stepRecord.startTime = new Date();

        // Update execution with current step status
        await updateSchedulerExecution(execution.id, execution.user, {
          currentStepId: step.id,
          currentStepIndex: executionRecord.steps.findIndex(s => s.id === step.id),
          steps: executionRecord.steps,
        });
      }

      // Create input for the current step using buffer string approach
      let stepInput = context;
      if (stepMessages.length > 0) {
        // Convert accumulated step messages into a buffer string for the next step
        const bufferString = getBufferString(stepMessages);

        // Add the buffer string and stepMessages array as context for the current step
        stepInput = {
          ...context,
          previousStepsOutput: bufferString,
          stepMessages: stepMessages, // Pass the message array for enhanced context
          steps: context.steps, // Keep the structured step results for metadata
        };

        logger.info(`[WorkflowExecutor] === STEP INPUT DEBUG for step "${step.name}" ===`);
        logger.info(`[WorkflowExecutor] stepMessages array length: ${stepMessages.length}`);
        logger.info(`[WorkflowExecutor] stepMessages contents:`, stepMessages.map(msg => ({
          type: msg.constructor.name,
          content: msg.content.substring(0, 300) + (msg.content.length > 300 ? '...' : '')
        })));
        logger.info(`[WorkflowExecutor] Buffer string being passed to agent (first 500 chars): ${bufferString.substring(0, 500)}...`);
        logger.info(`[WorkflowExecutor] Full buffer string length: ${bufferString.length} characters`);
        logger.info(`[WorkflowExecutor] === STEP INPUT DEBUG END ===`);
        
        logger.debug(
          `[WorkflowExecutor] Passing accumulated output to step ${step.name}: ${bufferString.substring(0, 200)}...`,
        );
      } else {
        // Even if no previous messages, make sure stepMessages is available
        stepInput = {
          ...context,
          stepMessages: stepMessages,
        };
      }

      // Execute the current step (each step gets a fresh agent)
      let stepResult;
      try {
        stepResult = await executeStep(
          workflow,
          execution,
          step,
          stepInput,
          executionData.abortController?.signal,
        );
      } catch (error) {
        // Check if this is a WorkflowStepFailureError that should cancel the entire workflow
        if (error.isWorkflowStepFailure) {
          logger.warn(`[WorkflowExecutor] Workflow cancelled due to step failure: ${error.message}`);
          // Re-throw to cancel the entire workflow execution
          throw error;
        }
        
        // For other errors, create a failed step result and continue normal flow
        stepResult = {
          success: false,
          error: error.message,
          result: null,
          stepId: step.id,
        };
      }

      // Add step result to messages array for next step and capture meaningful output
      let meaningfulOutput = '';
      if (stepResult.success && stepResult.result) {
        // First, try to extract meaningful content for both buffer and display
        meaningfulOutput = extractMeaningfulContent(stepResult.result);

        // If we found meaningful content, use it for the buffer string
        if (meaningfulOutput) {
          // Create a HumanMessage with the meaningful content for the next step
          stepMessages.push(new HumanMessage(`Step "${step.name}" result: ${meaningfulOutput}`));

          logger.debug(
            `[WorkflowExecutor] Added meaningful step result to message chain: ${meaningfulOutput.substring(0, 200)}...`,
          );
        } else {
          // Fallback to raw result if no meaningful content can be extracted
          let resultText = '';
          if (typeof stepResult.result === 'string') {
            resultText = stepResult.result;
            meaningfulOutput = resultText;
          } else {
            resultText = JSON.stringify(stepResult.result, null, 2);
            meaningfulOutput = resultText;
          }

          // Create a HumanMessage with the fallback result for the next step
          stepMessages.push(new HumanMessage(`Step "${step.name}" result: ${resultText}`));

          logger.debug(
            `[WorkflowExecutor] Added fallback step result to message chain: ${resultText.substring(0, 200)}...`,
          );
        }
      }

      // Update step status and results in execution record
      if (stepRecord) {
        stepRecord.status = stepResult.success ? 'completed' : 'failed';
        stepRecord.endTime = new Date();
        
        // Calculate step duration
        if (stepRecord.startTime) {
          stepRecord.duration = stepRecord.endTime.getTime() - stepRecord.startTime.getTime();
        }

        // Store meaningful output instead of technical metadata
        if (meaningfulOutput) {
          stepRecord.output = meaningfulOutput;
        } else if (stepResult.result && typeof stepResult.result === 'string') {
          stepRecord.output = stepResult.result;
        } else if (stepResult.result && typeof stepResult.result === 'object') {
          // Fallback to technical metadata if no meaningful content can be extracted
          stepRecord.output = JSON.stringify(stepResult.result, null, 2);
        }

        if (stepResult.error) {
          stepRecord.error = stepResult.error;
        }

        // Update additional step metadata from result
        if (stepResult.result) {
          // Only track tools that were actually called, not just available
          // toolsUsed should be an array of strings (tool names)
          if (stepResult.result.toolsUsed && Array.isArray(stepResult.result.toolsUsed)) {
            stepRecord.toolsUsed = stepResult.result.toolsUsed.map(tool => 
              typeof tool === 'string' ? tool : tool.tool || tool.name || String(tool)
            );
          } else {
            stepRecord.toolsUsed = [];
          }
          
          stepRecord.mcpToolsCount = stepResult.result.mcpToolsCount || 0;
          stepRecord.modelUsed = stepResult.result.modelUsed;
          stepRecord.endpointUsed = stepResult.result.endpointUsed;
          stepRecord.conversationId = stepResult.result.conversationId;
          stepRecord.responseMessageId = stepResult.result.responseMessageId;
        }

        // Update progress
        executionRecord.progress.completedSteps = executionRecord.steps.filter(s => s.status === 'completed').length;
        executionRecord.progress.percentage = Math.round((executionRecord.progress.completedSteps / executionRecord.progress.totalSteps) * 100);

        // Update execution with step results
        await updateSchedulerExecution(execution.id, execution.user, {
          steps: executionRecord.steps,
          progress: executionRecord.progress,
        });
      }

      // Update the parent message ID for the next step to maintain context flow
      // (messages won't be saved due to skipSaveConvo, but IDs help with context)
      if (stepResult && stepResult.responseMessageId) {
        context.workflow.parentMessageId = stepResult.responseMessageId;
        logger.debug(
          `[WorkflowExecutor] Updated parentMessageId for next step: ${stepResult.responseMessageId}`,
        );
      }

      // Accumulate the result for the final summary
      accumulatedStepResults.push({
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        status: stepResult.success ? 'completed' : 'failed',
        result: stepResult.result,
        error: stepResult.error,
      });

      // Update execution context with step result
      context.steps[step.id] = stepResult;

      // Create a clean, serializable version of context for database storage
      const serializableContext = createSerializableContext(context);
      await updateSchedulerExecution(execution.id, execution.user, {
        context: serializableContext,
      });

      // Update current step in execution
      await updateSchedulerExecution(execution.id, execution.user, {
        currentStepId: step.id,
      });

      // Determine next step based on result
      if (stepResult.success) {
        // If explicit onSuccess is defined, use it
        if (step.onSuccess) {
          currentStep = step.onSuccess;
        } else {
          // For sequential execution, find the next step in the workflow
          const currentStepIndex = workflow.steps.findIndex(s => s.id === step.id);
          if (currentStepIndex !== -1 && currentStepIndex + 1 < workflow.steps.length) {
            // Move to next step in sequence
            currentStep = workflow.steps[currentStepIndex + 1].id;
            logger.info(`[WorkflowExecutor] Moving to next step in sequence: ${currentStep}`);
          } else {
            // No more steps in sequence
            currentStep = null;
            logger.info(`[WorkflowExecutor] Sequential execution completed - no more steps`);
          }
        }
      } else {
        executionResult.success = false;
        executionResult.error =
          stepResult.error || `Step "${step.name}" failed without a specific error.`;
        
        // If explicit onFailure is defined, use it
        if (step.onFailure) {
          currentStep = step.onFailure;
        } else {
          // No failure path defined, workflow fails and stops
          currentStep = null;
          logger.info(`[WorkflowExecutor] Workflow failed at step "${step.name}" - no failure path defined`);
          break;
        }
      }
    }

    executionResult.result = accumulatedStepResults;

    // Create a final summary using the buffer string approach
    const endTime = new Date();
    const finalSummary = stepMessages.length > 0 ? getBufferString(stepMessages) : '';
    executionResult.finalOutput = finalSummary;

    // Update execution record with final results
    const startTime = context.execution?.startTime || executionRecord.start_time;
    const finalUpdateData = {
      status: executionResult.success ? 'completed' : 'failed',
      end_time: endTime,
      duration: endTime.getTime() - new Date(startTime).getTime(),
      output: finalSummary, // Store the final buffer string as overall output
      steps: executionRecord.steps,
      progress: executionRecord.progress,
      context: {
        ...executionRecord.context,
        execution: {
          ...executionRecord.context.execution,
          totalDuration: endTime.getTime() - new Date(startTime).getTime(),
          successfulSteps: executionRecord.steps.filter(s => s.status === 'completed').length,
          failedSteps: executionRecord.steps.filter(s => s.status === 'failed').length,
          skippedSteps: executionRecord.steps.filter(s => s.status === 'skipped').length,
        },
      },
    };

    // Use optimistic locking for final status update to prevent conflicts
    let updateAttempts = 0;
    const maxRetries = 3;
    
    while (updateAttempts < maxRetries) {
      try {
        // Get current execution with version
        const currentExecution = await getSchedulerExecutionById(execution.id, execution.user);
        if (!currentExecution) {
          logger.error(`[WorkflowExecutor] Execution not found during final update: ${execution.id}`);
          break;
        }
        
        const currentVersion = currentExecution.version || 1;
        const updatedExecution = await optimisticUpdateSchedulerExecution(
          execution.id, 
          execution.user, 
          currentVersion, 
          finalUpdateData
        );
        
        if (updatedExecution) {
          logger.debug(`[WorkflowExecutor] Final status update successful on attempt ${updateAttempts + 1}`);
          break;
        } else {
          updateAttempts++;
          if (updateAttempts < maxRetries) {
            logger.warn(`[WorkflowExecutor] Final status update conflict, retrying... (${updateAttempts}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 50 * updateAttempts)); // Brief backoff
          } else {
            logger.error(`[WorkflowExecutor] Final status update failed after ${maxRetries} attempts - using fallback`);
            await updateSchedulerExecution(execution.id, execution.user, finalUpdateData);
          }
        }
      } catch (error) {
        logger.error(`[WorkflowExecutor] Error during optimistic final update: ${error.message}`);
        // Fallback to regular update
        await updateSchedulerExecution(execution.id, execution.user, finalUpdateData);
        break;
      }
    }

    return executionResult;
  }

  /**
   * Cancel a running workflow execution
   * @param {string} executionId - Execution ID to cancel
   * @param {string} userId - User ID for the execution
   * @returns {Promise<boolean>} Success status
   */
  async cancelExecution(executionId, userId) {
    if (this.runningExecutions.has(executionId)) {
      logger.info(`[WorkflowExecutor] Cancelling execution: ${executionId}`);

      const data = this.runningExecutions.get(executionId);
      
      // Signal abort if possible
      if (data && data.abortController) {
        data.abortController.abort('Execution cancelled by user');
      }

      // Clean up tracking
      this.cleanupExecution(executionId);

      // Use optimistic locking for cancellation to prevent conflicts
      try {
        const currentExecution = await getSchedulerExecutionById(executionId, userId);
        if (currentExecution && currentExecution.status === 'running') {
          const currentVersion = currentExecution.version || 1;
          const updatedExecution = await optimisticUpdateSchedulerExecution(
            executionId, 
            userId, 
            currentVersion, 
            {
              status: 'cancelled',
              end_time: new Date(),
              error: 'Execution cancelled by user',
            }
          );
          
          if (!updatedExecution) {
            logger.warn(`[WorkflowExecutor] Cancellation update conflict for ${executionId}, using fallback`);
            await updateSchedulerExecution(executionId, userId, {
              status: 'cancelled',
              end_time: new Date(),
              error: 'Execution cancelled by user',
            });
          }
        }
      } catch (error) {
        logger.error(`[WorkflowExecutor] Error during optimistic cancellation: ${error.message}`);
        await updateSchedulerExecution(executionId, userId, {
          status: 'cancelled',
          end_time: new Date(),
          error: 'Execution cancelled by user',
        });
      }

      return true;
    }

    return false;
  }

  /**
   * Stop all running executions for a specific workflow
   * @param {string} workflowId - Workflow ID to stop
   * @param {string} userId - User ID for verification
   * @returns {Promise<boolean>} True if any executions were stopped
   */
  async stopWorkflowExecutions(workflowId, userId) {
    let stopped = false;

    for (const [executionId, data] of this.runningExecutions.entries()) {
      if (data.workflowId === workflowId) {
        logger.info(
          `[WorkflowExecutor] Stopping execution ${executionId} for workflow ${workflowId}`,
        );

        // Signal cancellation to abort the execution
        if (data.abortController) {
          data.abortController.abort('Execution stopped by user');
          logger.info(`[WorkflowExecutor] Sent abort signal to execution ${executionId}`);
        }

        // Clean up tracking
        this.cleanupExecution(executionId);

        // Update execution status with optimistic locking
        try {
          const currentExecution = await getSchedulerExecutionById(executionId, userId);
          if (currentExecution && currentExecution.status === 'running') {
            const currentVersion = currentExecution.version || 1;
            const updatedExecution = await optimisticUpdateSchedulerExecution(
              executionId, 
              userId, 
              currentVersion, 
              {
                status: 'cancelled',
                end_time: new Date(),
                error: 'Execution stopped by user',
              }
            );
            
            if (!updatedExecution) {
              logger.warn(`[WorkflowExecutor] Stop update conflict for ${executionId}, using fallback`);
              await updateSchedulerExecution(executionId, userId, {
                status: 'cancelled',
                end_time: new Date(),
                error: 'Execution stopped by user',
              });
            }
          }
        } catch (error) {
          logger.warn(
            `[WorkflowExecutor] Failed to update execution status for ${executionId}: ${error.message}`,
          );
        }

        stopped = true;
      }
    }

    if (stopped) {
      logger.info(`[WorkflowExecutor] Stopped executions for workflow ${workflowId}`);
    } else {
      logger.info(`[WorkflowExecutor] No running executions found for workflow ${workflowId}`);
    }

    return stopped;
  }

  /**
   * Get status of running executions
   * @returns {Array} Array of running execution statuses
   */
  getRunningExecutions() {
    return Array.from(this.runningExecutions.entries()).map(([id, data]) => ({
      executionId: id,
      workflowId: data.workflowId,
      userId: data.userId,
      startTime: data.startTime,
      status: data.status,
      age: Date.now() - data.startTime.getTime(),
    }));
  }

  /**
   * Clean up a specific execution (removes from tracking and clears timeout)
   * @param {string} executionId - Execution ID to clean up
   */
  cleanupExecution(executionId) {
    const data = this.runningExecutions.get(executionId);
    if (data) {
      // Clear timeout if it exists
      if (data.timeoutHandle) {
        clearTimeout(data.timeoutHandle);
      }
      
      // Remove from tracking
      this.runningExecutions.delete(executionId);
      
      logger.debug(`[WorkflowExecutor] Cleaned up execution: ${executionId}`);
    }
  }

  /**
   * Force cleanup a specific execution with status update
   * @param {string} executionId - Execution ID to force cleanup
   * @param {string} userId - User ID for status update
   */
  async forceCleanupExecution(executionId, userId) {
    const data = this.runningExecutions.get(executionId);
    if (data) {
      logger.warn(`[WorkflowExecutor] Force cleaning up execution: ${executionId}`);
      
      // Clear timeout and remove tracking
      this.cleanupExecution(executionId);
      
      // Update execution status
      try {
        await updateSchedulerExecution(executionId, userId, {
          status: 'failed',
          end_time: new Date(),
          error: 'Execution timeout - force cleanup',
        });
      } catch (error) {
        logger.debug(`[WorkflowExecutor] Failed to update execution status during force cleanup: ${error.message}`);
      }
    }
  }

  /**
   * Stop the memory cleanup interval (for testing/shutdown)
   */
  stopMemoryCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('[WorkflowExecutor] Memory cleanup interval stopped');
    }
  }

  /**
   * Format trigger context based on trigger key and event data
   * @param {string} triggerKey - The trigger key (e.g. 'gmail')
   * @param {Object} event - The trigger event data
   * @returns {string|null} Formatted trigger context
   */
  formatTriggerContext(triggerKey, event) {
    if (!triggerKey || !event) {
      return null;
    }

    try {
      // Route to specific formatter based on trigger key
      switch (triggerKey) {
        case 'gmail':
          return this.formatGmailTriggerContext(event);
        default:
          return this.formatGenericTriggerContext(triggerKey, event);
      }
    } catch (error) {
      logger.warn(`[WorkflowExecutor] Error formatting trigger context for ${triggerKey}:`, error);
      return null;
    }
  }

  /**
   * Format Gmail-specific trigger context with email details
   * @param {Object} event - Gmail event data from webhook
   * @returns {string} Formatted Gmail trigger context
   */
  formatGmailTriggerContext(event) {
    logger.info(`[WorkflowExecutor] === GMAIL FORMATTER DEBUG START ===`);
    logger.info(`[WorkflowExecutor] Raw event data received:`, JSON.stringify(event, null, 2));
    
    try {
      // Extract email details from Gmail webhook event
      const emailData = event?.data || event;
      logger.info(`[WorkflowExecutor] Extracted email data:`, JSON.stringify(emailData, null, 2));
      logger.info(`[WorkflowExecutor] Available email data keys:`, Object.keys(emailData));
      
      let context = 'Gmail Email Received:\n';
      
      if (emailData.subject) {
        context += `Subject: ${emailData.subject}\n`;
        logger.info(`[WorkflowExecutor] Found subject: ${emailData.subject}`);
      }
      
      if (emailData.from) {
        context += `From: ${emailData.from}\n`;
        logger.info(`[WorkflowExecutor] Found from: ${emailData.from}`);
      }
      
      if (emailData.to) {
        context += `To: ${emailData.to}\n`;
        logger.info(`[WorkflowExecutor] Found to: ${emailData.to}`);
      }
      
      if (emailData.date) {
        context += `Date: ${emailData.date}\n`;
        logger.info(`[WorkflowExecutor] Found date: ${emailData.date}`);
      }
      
      if (emailData.snippet || emailData.body || emailData.payload) {
        const contentPreview = emailData.snippet || emailData.body?.substring(0, 300) || emailData.payload?.substring(0, 300) || '';
        context += `Content Preview: ${contentPreview}\n`;
        logger.info(`[WorkflowExecutor] Found content preview (${contentPreview.length} chars): ${contentPreview.substring(0, 100)}...`);
      }
      
      // Check for message ID in different possible field names
      if (emailData.messageId || emailData.id) {
        const messageId = emailData.messageId || emailData.id;
        context += `Message ID: ${messageId}\n`;
        logger.info(`[WorkflowExecutor] Found messageId: ${messageId}`);
      }
      
      if (emailData.threadId) {
        context += `Thread ID: ${emailData.threadId}\n`;
        logger.info(`[WorkflowExecutor] Found threadId: ${emailData.threadId}`);
      }
      
      // Log any additional fields that might be useful
      const additionalFields = ['labelIds', 'historyId', 'internalDate', 'sizeEstimate'];
      additionalFields.forEach(field => {
        if (emailData[field]) {
          logger.info(`[WorkflowExecutor] Found additional field ${field}:`, emailData[field]);
          if (field === 'labelIds' && Array.isArray(emailData[field])) {
            context += `Labels: ${emailData[field].join(', ')}\n`;
          }
        }
      });

      const finalContext = context.trim();
      logger.info(`[WorkflowExecutor] Generated Gmail trigger context (${finalContext.length} chars): ${finalContext.substring(0, 300)}...`);
      logger.info(`[WorkflowExecutor] === GMAIL FORMATTER DEBUG END ===`);
      return finalContext;
    } catch (error) {
      logger.error('[WorkflowExecutor] Error formatting Gmail trigger context:', error);
      logger.info(`[WorkflowExecutor] === GMAIL FORMATTER DEBUG END (ERROR) ===`);
      return this.formatGenericTriggerContext('gmail', event);
    }
  }

  /**
   * Generic fallback formatter for any trigger type
   * @param {string} triggerKey - The trigger key
   * @param {Object} event - The trigger event data
   * @returns {string} Formatted generic trigger context
   */
  formatGenericTriggerContext(triggerKey, event) {
    try {
      let context = `Trigger: ${triggerKey}\n`;
      context += `Event Data:\n${JSON.stringify(event, null, 2)}`;
      return context;
    } catch (error) {
      logger.warn(`[WorkflowExecutor] Error formatting generic trigger context for ${triggerKey}:`, error);
      return `Trigger: ${triggerKey}\nEvent: [Unable to format event data]`;
    }
  }

  /**
   * Destroy the singleton instance and clean up all resources
   */
  static async destroyInstance() {
    if (WorkflowExecutor.instance) {
      const instance = WorkflowExecutor.instance;
      
      // Stop cleanup interval
      instance.stopMemoryCleanup();
      
      // Force cleanup all executions
      const stats = instance.forceCleanupAll();
      
      // Clear singleton reference
      WorkflowExecutor.instance = null;
      
      logger.info('[WorkflowExecutor] Singleton instance destroyed', stats);
    }
  }
}

module.exports = WorkflowExecutor;
