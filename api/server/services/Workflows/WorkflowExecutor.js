const { logger } = require('~/config');
const { Constants } = require('librechat-data-provider');
const { updateSchedulerExecution } = require('~/models/SchedulerExecution');
const { loadAgent } = require('~/models/Agent');
const User = require('~/models/User');
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
 * - Step-by-step workflow execution
 * - Integration with MCP tools and Pipedream actions
 * - Error handling and retry logic
 * - Context management between steps
 * - Execution flow control (success/failure paths)
 * - Dynamic MCP server initialization
 * - Dedicated workflow execution conversation management
 * - Workflow-level agent initialization and reuse across steps
 *
 * CONVERSATION MANAGEMENT:
 * - Creates a dedicated conversation for each workflow execution
 * - Names conversations: "Workflow execution [name] [timestamp]"
 * - Maintains proper message threading between steps
 * - Prevents creation of multiple conversations per execution
 */
class WorkflowExecutor {
  constructor() {
    this.runningExecutions = new Map(); // Track running executions
    this.mcpInitialized = new Map(); // Track MCP initialization per user
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
      );

      // Store the result
      const result = {
        success: mcpResult.success,
        availableTools,
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

      // Track this execution
      this.runningExecutions.set(executionId, {
        workflowId,
        startTime: new Date(),
        status: 'running',
        mcpResult,
      });

      // Get or create a dedicated conversation for workflow execution logging
      const { v4: uuidv4 } = require('uuid');
      let workflowExecutionConversationId;

      // Check if workflow already has a dedicated conversation ID in metadata
      const WorkflowService = require('./WorkflowService');
      const workflowService = new WorkflowService();
      const currentWorkflow = await workflowService.getWorkflowById(workflowId, userId);

      if (
        currentWorkflow &&
        currentWorkflow.metadata &&
        currentWorkflow.metadata.dedicatedConversationId
      ) {
        // Reuse existing conversation
        workflowExecutionConversationId = currentWorkflow.metadata.dedicatedConversationId;
        logger.info(
          `[WorkflowExecutor] Reusing existing dedicated conversation: ${workflowExecutionConversationId} for workflow: ${workflow.name}`,
        );
      } else {
        // Create new conversation for this workflow
        workflowExecutionConversationId = uuidv4();

        // Extract clean workflow name (remove "Workflow: " prefix if present)
        const cleanWorkflowName = workflow.name.replace(/^Workflow:\s*/, '');
        const workflowExecutionTitle = `Workflow executions: ${cleanWorkflowName}`;

        // Create the workflow execution conversation
        const { saveConvo } = require('~/models/Conversation');
        const mockReq = {
          user: { id: userId },
          body: {}, // Add body property to prevent saveConvo errors
          app: { locals: {} },
        };

        await saveConvo(
          mockReq,
          {
            conversationId: workflowExecutionConversationId,
            title: workflowExecutionTitle,
            endpoint: 'openAI',
            model: 'gpt-4o-mini',
            isArchived: false,
          },
          { context: 'WorkflowExecutor.executeWorkflow - dedicated execution conversation' },
        );

        // Store the conversation ID in workflow metadata for future reuse
        try {
          await workflowService.updateWorkflow(workflowId, userId, {
            metadata: {
              ...currentWorkflow?.metadata,
              dedicatedConversationId: workflowExecutionConversationId,
            },
          });
          logger.info(
            `[WorkflowExecutor] Created and stored dedicated conversation: ${workflowExecutionConversationId} for workflow: ${workflow.name}`,
          );
        } catch (metadataError) {
          logger.warn(
            `[WorkflowExecutor] Failed to store conversation ID in workflow metadata: ${metadataError.message}`,
          );
          // Continue with execution even if metadata update fails
        }

        logger.info(
          `[WorkflowExecutor] Created dedicated execution conversation: ${workflowExecutionConversationId} with title: ${workflowExecutionTitle}`,
        );
      }

      // Initialize workflow-level agent for reuse across all steps
      let workflowAgent = null;
      let workflowClient = null;

      if (mcpResult.success && mcpResult.toolCount > 0) {
        try {
          logger.info(
            `[WorkflowExecutor] Initializing workflow-level agent with ${mcpResult.toolCount} MCP tools`,
          );

          // Get the configured model and endpoint
          const config = await getConfiguredModelAndEndpoint(workflow);
          const { model: configuredModel, endpoint: configuredEndpoint, endpointName } = config;

          // Determine which agent to load
          const agentIdToLoad =
            workflow.endpoint === 'agents' && workflow.agent_id
              ? workflow.agent_id
              : Constants.EPHEMERAL_AGENT_ID;

          logger.info(`[WorkflowExecutor] Determined agent for workflow execution: ${agentIdToLoad}`);

          // Create mock request for agent initialization with proper MCP context
          const mockReq = createMockRequestForWorkflow(
            {
              workflow: { conversationId: workflowExecutionConversationId },
              mcp: { availableTools: mcpResult.availableTools },
            },
            user,
            'Workflow execution agent',
            configuredModel,
            configuredEndpoint,
          );

          // If we are using an ephemeral agent, we need to set up its config
          if (agentIdToLoad === Constants.EPHEMERAL_AGENT_ID) {
            // Extract MCP server names from available tools
            const mcpServerNames = extractMCPServerNames(mcpResult.availableTools);

            // Create ephemeral agent configuration
            const ephemeralAgent = {
              workflow: true,
              execute_code: false,
              web_search: false,
              mcp: mcpServerNames,
            };

            // Update request for ephemeral agent
            const underlyingEndpoint = configuredEndpoint;
            const underlyingModel = configuredModel;

            updateRequestForEphemeralAgent(
              mockReq,
              {
                prompt: 'Workflow execution agent',
                user: userId,
                conversation_id: workflowExecutionConversationId,
                parent_message_id: null,
              },
              ephemeralAgent,
              underlyingEndpoint,
              underlyingModel,
            );
          }

          // Load agent
          const agent = await loadAgent({
            req: mockReq,
            agent_id: agentIdToLoad,
            endpoint: configuredEndpoint,
            model_parameters: { model: configuredModel },
          });

          if (agent) {
            logger.info(
              `[WorkflowExecutor] Loaded workflow-level agent with ${
                agent.tools?.length || 0
              } tools using ${endpointName}/${configuredModel}`,
            );

            // Initialize client factory and create agents endpoint option
            const clientFactory = new SchedulerClientFactory();
            const endpointOption = clientFactory.createAgentsEndpointOption(
              agent,
              configuredModel,
            );

            // Disable automatic title generation to preserve our custom workflow execution title
            endpointOption.titleConvo = false;

            // Create minimal mock response for client initialization
            const mockRes = createMinimalMockResponse();

            // Initialize the agents client
            const { client } = await clientFactory.initializeClient({
              req: mockReq,
              res: mockRes,
              endpointOption,
            });

            if (client) {
              workflowAgent = agent;
              workflowClient = client;
              logger.info(`[WorkflowExecutor] Workflow-level agent and client initialized successfully`);
            } else {
              logger.warn(`[WorkflowExecutor] Failed to initialize workflow-level client`);
            }
          } else {
            logger.warn(`[WorkflowExecutor] Failed to load workflow-level agent`);
          }
        } catch (error) {
          logger.error(`[WorkflowExecutor] Failed to initialize workflow-level agent:`, error);
          // Continue without workflow-level agent - steps will fall back to individual initialization
        }
      }

      // Initialize execution context with MCP tools, dedicated conversation, and workflow-level agent
      executionContext = {
        ...context,
        user, // Add full user object to context
        workflow: {
          // Include full workflow object for context access
          ...workflow,
          // Override/add execution-specific properties
          conversationId: workflowExecutionConversationId,
          parentMessageId: null, // Start fresh in the execution conversation
          // Store workflow-level agent and client for reuse
          agent: workflowAgent,
          client: workflowClient,
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
        },
        steps: {},
        variables: {},
      };

      // Update execution record with serializable context
      const serializableContext = createSerializableContext(executionContext);
      await updateSchedulerExecution(executionId, execution.user, {
        status: 'running',
        startTime: new Date(),
        context: serializableContext,
      });

      // Find the first step (usually the one without any incoming connections)
      const firstStep = findFirstStep(workflow.steps);
      if (!firstStep) {
        throw new Error('No starting step found in workflow');
      }

      // Execute steps starting from the first step
      const result = await this.executeStepChain(workflow, execution, firstStep.id, executionContext);

      // Clean up workflow-level agent resources
      if (executionContext.workflow?.client) {
        try {
          // Note: AgentClient typically doesn't require explicit cleanup
          // but we can add any necessary cleanup here in the future
          logger.debug(`[WorkflowExecutor] Workflow-level agent cleanup completed for ${workflowId}`);
        } catch (cleanupError) {
          logger.warn(`[WorkflowExecutor] Error during workflow-level agent cleanup:`, cleanupError);
        }
      }

      // Clean up tracking
      this.runningExecutions.delete(executionId);

      logger.info(`[WorkflowExecutor] Workflow execution completed: ${workflowId}`);
      return result;
    } catch (error) {
      // Clean up workflow-level agent resources in error case
      try {
        if (executionContext && executionContext.workflow?.client) {
          logger.debug(
            `[WorkflowExecutor] Workflow-level agent cleanup in error case for ${workflowId}`,
          );
        }
      } catch (cleanupError) {
        logger.warn(
          `[WorkflowExecutor] Error during workflow-level agent cleanup in error case:`,
          cleanupError,
        );
      }

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
   * @returns {Promise<Object>} Execution result
   */
  async executeStepChain(workflow, execution, currentStepId, context) {
    let currentStep = currentStepId;
    const executionResult = { success: true, error: null };
    const accumulatedStepResults = [];

    while (currentStep) {
      const step = workflow.steps.find((s) => s.id === currentStep);
      if (!step) {
        throw new Error(`Step not found: ${currentStep}`);
      }

      logger.info(`[WorkflowExecutor] Executing step: ${step.name} (${step.type})`);

      // Execute the current step
      const stepResult = await executeStep(workflow, execution, step, context);

      // Update the parent message ID for the next step to maintain conversation threading
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