const { logger } = require('~/config');
const { Constants } = require('librechat-data-provider');
const { updateSchedulerExecution } = require('~/models/SchedulerExecution');
const { loadAgent } = require('~/models/Agent');
const { User } = require('~/db/models');
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
      const mcpToolRegistry = new Map(); // Create MCP tool registry for workflow execution
      
      const mcpResult = await mcpInitializer.ensureUserMCPReady(
        userId,
        'WorkflowExecutor',
        availableTools,
        { mcpToolRegistry } // Pass the MCP tool registry
      );

      // Store the result
      const result = {
        success: mcpResult.success,
        availableTools,
        mcpToolRegistry, // Include the MCP tool registry in the result
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
        mcpToolRegistry: new Map(), // Include empty registry in error case
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
          mcpToolRegistry: mcpResult.mcpToolRegistry, // Include the MCP tool registry
        },
        steps: {},
        variables: {},
      };

      // Extract workflow name for metadata
      const workflowName = workflow.name?.replace(/^Workflow:\s*/, '') || 'Unnamed Workflow';
      
      // Initialize metadata with isTest flag and workflow info
      const executionMetadata = {
        isTest: context.isTest || false,
        workflowName,
        steps: workflow.steps?.map(step => ({
          id: step.id,
          name: step.name,
          type: step.type,
          status: 'pending'
        })) || []
      };

      // Update execution record with serializable context and metadata
      const serializableContext = createSerializableContext(executionContext);
      await updateSchedulerExecution(executionId, execution.user, {
        status: 'running',
        startTime: new Date(),
        context: serializableContext,
        metadata: executionMetadata,
      });

      // Find the first step (usually the one without any incoming connections)
      const firstStep = findFirstStep(workflow.steps);
      if (!firstStep) {
        throw new Error('No starting step found in workflow');
      }

      // Execute steps starting from the first step
      const result = await this.executeStepChain(workflow, execution, firstStep.id, executionContext, executionMetadata);

      // Clean up tracking
      this.runningExecutions.delete(executionId);

      logger.info(`[WorkflowExecutor] Workflow execution completed: ${workflowId}`);
      return result;
    } catch (error) {
      // Clean up tracking
      this.runningExecutions.delete(executionId);

      logger.error(`[WorkflowExecutor] Workflow execution failed: ${workflowId}`, error);

      // Update execution status
      await updateSchedulerExecution(executionId, execution.user, {
        status: 'failed',
        endTime: new Date(),
        error: error.message,
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
   * @param {Object} metadata - Execution metadata with step tracking
   * @returns {Promise<Object>} Execution result
   */
  async executeStepChain(workflow, execution, currentStepId, context, metadata) {
    let currentStep = currentStepId;
    const executionResult = { success: true, error: null };
    const accumulatedStepResults = [];

    while (currentStep) {
      // Check if execution has been cancelled
      const executionData = this.runningExecutions.get(execution.id);
      if (!executionData) {
        logger.info(`[WorkflowExecutor] Execution ${execution.id} was stopped, terminating workflow`);
        throw new Error('Execution was cancelled by user');
      }
      
      if (executionData.abortController && executionData.abortController.signal.aborted) {
        logger.info(`[WorkflowExecutor] Execution ${execution.id} was aborted, terminating workflow`);
        throw new Error('Execution was cancelled by user');
      }

      const step = workflow.steps.find((s) => s.id === currentStep);
      if (!step) {
        throw new Error(`Step not found: ${currentStep}`);
      }

      logger.info(`[WorkflowExecutor] Executing step: ${step.name} (${step.type})`);

      // Update step status to running in metadata
      const stepMetadata = metadata.steps.find(s => s.id === step.id);
      if (stepMetadata) {
        stepMetadata.status = 'running';
        stepMetadata.startTime = new Date();
        
        // Update execution with current step status
        await updateSchedulerExecution(execution.id, execution.user, {
          metadata: { ...metadata },
        });
      }

      // Execute the current step (each step gets a fresh agent)
      const stepResult = await executeStep(workflow, execution, step, context, executionData.abortController?.signal);

      // Update step status and results in metadata
      if (stepMetadata) {
        stepMetadata.status = stepResult.success ? 'completed' : 'failed';
        stepMetadata.endTime = new Date();
        
        // Capture step output and error
        if (stepResult.result && typeof stepResult.result === 'string') {
          stepMetadata.output = stepResult.result;
        } else if (stepResult.result && typeof stepResult.result === 'object') {
          stepMetadata.output = JSON.stringify(stepResult.result, null, 2);
        }
        
        if (stepResult.error) {
          stepMetadata.error = stepResult.error;
        }
        
        // Update execution with step results
        await updateSchedulerExecution(execution.id, execution.user, {
          metadata: { ...metadata },
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
        currentStep = step.onSuccess;
      } else {
        executionResult.success = false;
        executionResult.error =
          stepResult.error || `Step "${step.name}" failed without a specific error.`;
        currentStep = step.onFailure;
        if (!currentStep) {
          // No failure path defined, workflow fails and stops
          break;
        }
      }
    }

    executionResult.result = accumulatedStepResults;
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
        logger.info(`[WorkflowExecutor] Stopping execution ${executionId} for workflow ${workflowId}`);
        
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
            error: 'Execution stopped by user'
          });
        } catch (error) {
          logger.warn(`[WorkflowExecutor] Failed to update execution status for ${executionId}: ${error.message}`);
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