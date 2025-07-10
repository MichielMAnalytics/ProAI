const { logger } = require('~/config');
const { Constants } = require('librechat-data-provider');
const { updateSchedulerExecution } = require('~/models/SchedulerExecution');
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
      if (result.data.summary || result.data.description) {
        return result.data.summary || result.data.description;
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
   * Ensure MCP tools are ready for a user (similar to scheduler approach)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} MCP initialization result
   */
  async ensureMCPReady(userId) {
    // Check if already initialized for this user
    if (this.mcpInitialized.has(userId)) {
      return this.mcpInitialized.get(userId);
    }

    try {
      logger.info(`[WorkflowExecutor] Initializing MCP for user ${userId}`);

      const MCPInitializer = require('~/server/services/MCPInitializer');
      const mcpInitializer = MCPInitializer.getInstance();

      const availableTools = {};

      const mcpResult = await mcpInitializer.ensureUserMCPReady(
        userId,
        'WorkflowExecutor',
        availableTools,
        {}, // No additional options needed
      );

      // Store the result
      const result = {
        success: mcpResult.success,
        availableTools, // Enhanced tools with embedded metadata
        toolCount: mcpResult.toolCount,
        serverCount: mcpResult.serverCount,
      };

      this.mcpInitialized.set(userId, result);

      logger.info(
        `[WorkflowExecutor] MCP initialized for user ${userId}: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools`,
      );
      return result;
    } catch (error) {
      logger.error(`[WorkflowExecutor] Failed to initialize MCP for user ${userId}:`, error);

      const errorResult = {
        success: false,
        availableTools: {},
        toolCount: 0,
        serverCount: 0,
        error: error.message,
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
    let stepMessages = []; // Initialize here to ensure it's in scope for error handling

    try {
      logger.info(`[WorkflowExecutor] Starting workflow execution: ${workflowId}`);

      // Fetch user object for context
      const userDbObject = await User.findById(userId).lean();
      if (!userDbObject) {
        throw new Error(`User not found: ${userId}`);
      }
      const user = { ...userDbObject, id: userDbObject._id.toString() };

      // Initialize MCP tools for the user
      const mcpResult = await this.ensureMCPReady(userId);
      logger.info(
        `[WorkflowExecutor] MCP ready for workflow ${workflowId}: ${mcpResult.toolCount} tools available`,
      );

      // Create cancellation controller for this execution
      const abortController = new AbortController();

      // Track this execution with cancellation support
      this.runningExecutions.set(executionId, {
        workflowId,
        startTime: new Date(),
        status: 'running',
        mcpResult,
        abortController,
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

      // Clean up tracking
      this.runningExecutions.delete(executionId);

      logger.info(`[WorkflowExecutor] Workflow execution completed: ${workflowId}`);
      return result;
    } catch (error) {
      // Clean up tracking
      this.runningExecutions.delete(executionId);

      logger.error(`[WorkflowExecutor] Workflow execution failed: ${workflowId}`, error);

      // Create error summary with any partial results
      let errorOutput = `Workflow failed: ${error.message}`;
      if (executionContext && stepMessages && stepMessages.length > 0) {
        const partialSummary = getBufferString(stepMessages);
        errorOutput = `${errorOutput}\n\nPartial results before failure:\n${partialSummary}`;
      }

      // Update execution status with error
      const errorEndTime = new Date();
      const errorStartTime = executionContext?.execution?.startTime || new Date();
      await updateSchedulerExecution(executionId, execution.user, {
        status: 'failed',
        end_time: errorEndTime,
        duration: errorEndTime.getTime() - errorStartTime.getTime(),
        error: error.message,
        output: errorOutput,
      });

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
      const stepResult = await executeStep(
        workflow,
        execution,
        step,
        stepInput,
        executionData.abortController?.signal,
      );

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

    await updateSchedulerExecution(execution.id, execution.user, finalUpdateData);

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

      this.runningExecutions.delete(executionId);

      await updateSchedulerExecution(executionId, userId, {
        status: 'cancelled',
        endTime: new Date(),
      });

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

        // Remove from running executions
        this.runningExecutions.delete(executionId);

        // Update execution status
        try {
          await updateSchedulerExecution(executionId, userId, {
            status: 'cancelled',
            endTime: new Date(),
            error: 'Execution stopped by user',
          });
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
      ...data,
    }));
  }
}

module.exports = WorkflowExecutor;
