const { logger } = require('~/config');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { 
  updateSchedulerExecution,
} = require('~/models/SchedulerExecution');
const UserMCPService = require('~/server/services/UserMCPService');
const { evaluateCondition } = require('./utils/conditionEvaluator');
const { loadAgent } = require('~/models/Agent');
const { createMockRequest, createMockResponse, createMinimalMockResponse, updateRequestForEphemeralAgent } = require('~/server/services/Scheduler/utils/mockUtils');
const { getCustomConfig } = require('~/server/services/Config/getCustomConfig');

// Import client factory for agents
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
        availableTools
      );
      
      // Store the result
      const result = {
        success: mcpResult.success,
        availableTools,
        toolCount: mcpResult.toolCount,
        serverCount: mcpResult.serverCount
      };
      
      this.mcpInitialized.set(userId, result);
      
      logger.info(`[WorkflowExecutor] MCP initialized for user ${userId}: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools`);
      return result;
    } catch (error) {
      logger.error(`[WorkflowExecutor] Failed to initialize MCP for user ${userId}:`, error);
      
      const errorResult = {
        success: false,
        availableTools: {},
        toolCount: 0,
        serverCount: 0,
        error: error.message
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

    try {
      logger.info(`[WorkflowExecutor] Starting workflow execution: ${workflowId}`);

      // Initialize MCP tools for the user
      const mcpResult = await this.ensureMCPReady(userId);
      logger.info(`[WorkflowExecutor] MCP ready for workflow ${workflowId}: ${mcpResult.toolCount} tools available`);

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
      
      if (currentWorkflow && currentWorkflow.metadata && currentWorkflow.metadata.dedicatedConversationId) {
        // Reuse existing conversation
        workflowExecutionConversationId = currentWorkflow.metadata.dedicatedConversationId;
        logger.info(`[WorkflowExecutor] Reusing existing dedicated conversation: ${workflowExecutionConversationId} for workflow: ${workflow.name}`);
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
          app: { locals: {} }
        };
        
        await saveConvo(mockReq, {
          conversationId: workflowExecutionConversationId,
          title: workflowExecutionTitle,
          endpoint: 'openAI',
          model: 'gpt-4o-mini',
          isArchived: false,
        }, { context: 'WorkflowExecutor.executeWorkflow - dedicated execution conversation' });

        // Store the conversation ID in workflow metadata for future reuse
        try {
          await workflowService.updateWorkflow(workflowId, userId, {
            metadata: {
              ...currentWorkflow?.metadata,
              dedicatedConversationId: workflowExecutionConversationId
            }
          });
          logger.info(`[WorkflowExecutor] Created and stored dedicated conversation: ${workflowExecutionConversationId} for workflow: ${workflow.name}`);
        } catch (metadataError) {
          logger.warn(`[WorkflowExecutor] Failed to store conversation ID in workflow metadata: ${metadataError.message}`);
          // Continue with execution even if metadata update fails
        }
        
        logger.info(`[WorkflowExecutor] Created dedicated execution conversation: ${workflowExecutionConversationId} with title: ${workflowExecutionTitle}`);
      }

      // Initialize execution context with MCP tools and dedicated conversation
      let executionContext = {
        ...context,
        workflow: {
          id: workflowId,
          name: workflow.name,
          // Use dedicated conversation for all workflow execution logging
          conversationId: workflowExecutionConversationId,
          parentMessageId: null, // Start fresh in the execution conversation
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

      // Update execution record
      await updateSchedulerExecution(executionId, execution.user, {
        status: 'running',
        startTime: new Date(),
        context: executionContext,
      });

      // Find the first step (usually the one without any incoming connections)
      const firstStep = this.findFirstStep(workflow.steps);
      if (!firstStep) {
        throw new Error('No starting step found in workflow');
      }

      // Execute steps starting from the first step
      const result = await this.executeStepChain(
        workflow, 
        execution, 
        firstStep.id, 
        executionContext
      );

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
   * @returns {Promise<Object>} Execution result
   */
  async executeStepChain(workflow, execution, currentStepId, context) {
    let currentStep = currentStepId;
    let executionResult = { success: true, result: null };

    while (currentStep) {
      const step = workflow.steps.find(s => s.id === currentStep);
      if (!step) {
        throw new Error(`Step not found: ${currentStep}`);
      }

      logger.info(`[WorkflowExecutor] Executing step: ${step.name} (${step.type})`);

      // Execute the current step
      const stepResult = await this.executeStep(workflow, execution, step, context);

      // Update the parent message ID for the next step to maintain conversation threading
      if (stepResult && stepResult.responseMessageId) {
        context.workflow.parentMessageId = stepResult.responseMessageId;
        logger.debug(`[WorkflowExecutor] Updated parentMessageId for next step: ${stepResult.responseMessageId}`);
      }

      // Update execution context with step result
      context.steps[step.id] = stepResult;
      await updateSchedulerExecution(execution.id, execution.user, { context });

      // Update current step in execution
      await updateSchedulerExecution(execution.id, execution.user, {
        currentStepId: step.id,
      });

      // Determine next step based on result
      if (stepResult.success) {
        currentStep = step.onSuccess;
        executionResult.result = stepResult.result;
      } else {
        currentStep = step.onFailure;
        if (!currentStep) {
          // No failure path defined, workflow fails
          executionResult = {
            success: false,
            error: stepResult.error || 'Step failed without failure path',
            result: stepResult.result,
          };
          break;
        }
      }
    }

    return executionResult;
  }

  /**
   * Execute a single workflow step
   * @param {Object} workflow - The workflow
   * @param {Object} execution - The execution record
   * @param {Object} step - The step to execute
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Step execution result
   */
  async executeStep(workflow, execution, step, context) {
    const stepExecutionData = {
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
      status: 'running',
      startTime: new Date(),
      input: step.config,
      retryCount: 0,
    };
    
    await updateSchedulerExecution(execution.id, execution.user, stepExecutionData);

    try {
      let result;

      switch (step.type) {
        case 'delay':
          result = await this.executeDelayStep(step, context);
          break;
        case 'condition':
          result = await this.executeConditionStep(step, context);
          break;
        case 'action':
          result = await this.executePipedreamActionStep(step, context, execution.user);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      // Update step execution with success
      await updateSchedulerExecution(execution.id, execution.user, {
        currentStepId: step.id,
      });

      logger.info(`[WorkflowExecutor] Step completed: ${step.name}`);
      return {
        success: true,
        result: result,
        stepId: step.id,
      };
    } catch (error) {
      logger.error(`[WorkflowExecutor] Step failed: ${step.name}`, error);

      // Update step execution with failure
      await updateSchedulerExecution(execution.id, execution.user, {
        currentStepId: step.id,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        result: null,
        stepId: step.id,
      };
    }
  }

  /**
   * Execute a delay step
   * @param {Object} step - The delay step
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Step result
   */
  async executeDelayStep(step, context) {
    const delayMs = step.config.delayMs || 1000;
    
    logger.info(`[WorkflowExecutor] Executing delay: ${delayMs}ms`);
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    return {
      type: 'delay',
      delayMs,
      message: `Delayed execution for ${delayMs}ms`,
    };
  }

  /**
   * Execute a condition step
   * @param {Object} step - The condition step
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Step result
   */
  async executeConditionStep(step, context) {
    const condition = step.config.condition;
    
    logger.info(`[WorkflowExecutor] Evaluating condition: ${condition}`);
    
    if (!condition) {
      throw new Error('Condition expression is required');
    }

    const result = evaluateCondition(condition, context);
    
    return {
      type: 'condition',
      condition,
      result,
      evaluated: true,
    };
  }

  /**
   * Execute a Pipedream action step using agent with MCP tools
   * @param {Object} step - The action step
   * @param {Object} context - Execution context
   * @param {string} userId - User ID for the execution
   * @returns {Promise<Object>} Step result
   */
  async executePipedreamActionStep(step, context, userId) {
    logger.info(`[WorkflowExecutor] Executing action step: "${step.name}"`);
    
    // Check if MCP tools are available
    if (!context.mcp?.available || context.mcp.toolCount === 0) {
      logger.warn(`[WorkflowExecutor] No MCP tools available for action step "${step.name}". Returning mock result.`);
      return this.createMockActionResult(step, 'No MCP tools available');
    }

    try {
      logger.info(`[WorkflowExecutor] Using agent with ${context.mcp.toolCount} MCP tools for action step "${step.name}"`);
      
      // Create a task prompt based on the step
      const taskPrompt = this.createTaskPromptForStep(step, context);
      
      // Execute using agent with MCP tools (similar to scheduler approach)
      const result = await this.executeStepWithAgent(step, taskPrompt, context, userId);
      
      return {
        type: 'mcp_agent_action',
        stepName: step.name,
        prompt: taskPrompt,
        result,
      };
    } catch (error) {
      logger.error(`[WorkflowExecutor] Agent execution failed for step "${step.name}":`, error);
      
      // Fall back to mock result if agent execution fails
      return this.createMockActionResult(step, `Agent execution failed: ${error.message}`);
    }
  }

  /**
   * Create a task prompt for a workflow step
   * @param {Object} step - Workflow step
   * @param {Object} context - Execution context
   * @returns {string} Task prompt for the agent
   */
  createTaskPromptForStep(step, context) {
    // Start with a more specific, actionable prompt
    let prompt = `WORKFLOW STEP EXECUTION:

Step Name: "${step.name}"
Step Type: ${step.type}

INSTRUCTIONS:`;

    // For action steps, be very specific about what tool to use and how
    if (step.type === 'action') {
      if (step.config.toolName) {
        // If a specific tool is configured, instruct the agent to use it directly
        prompt += `\n1. Call the MCP tool "${step.config.toolName}" directly`;
        
        // Handle parameters from the standard parameters object
        let parametersToUse = {};
        
        // Primary source: parameters object
        if (step.config.parameters) {
          parametersToUse = this.resolveParameters(step.config.parameters, context);
        }
        
        // Secondary source: toolParameters (for backward compatibility)
        if (step.config.toolParameters) {
          parametersToUse = { ...parametersToUse, ...step.config.toolParameters };
        }
        
        if (Object.keys(parametersToUse).length > 0) {
          prompt += `\n2. Use these parameters:`;
          for (const [key, value] of Object.entries(parametersToUse)) {
            prompt += `\n   - ${key}: ${JSON.stringify(value)}`;
          }
        } else {
          prompt += `\n2. Check the step configuration for parameter requirements`;
        }
        
        // Add special handling for email steps
        if (step.config.toolName.includes('EMAIL')) {
          prompt += this.generateEmailStepGuidance(step, context);
        }
        
        if (step.config.instruction) {
          prompt += `\n3. Additional instruction: ${step.config.instruction}`;
        }
        
        prompt += `\n4. Return the raw tool result without additional commentary`;
        prompt += `\n\nIMPORTANT: Call the specified tool exactly once and return its result immediately. Do not make multiple tool calls or attempt to interpret the data.`;
      } else {
        // If no specific tool is configured, give guidance based on step name
        prompt += `\n1. ${this.generateActionInstructions(step.name, step.config)}`;
        prompt += `\n2. Use the most appropriate MCP tool from the available tools`;
        prompt += `\n3. Make only ONE tool call to complete this task`;
        prompt += `\n4. Return the result in a structured format`;
      }
    }
    
    // Add context from previous steps if available and relevant
    if (context.steps && Object.keys(context.steps).length > 0) {
      prompt += `\n\nPREVIOUS STEP RESULTS (for reference only):`;
      
      // Only include the last 2 steps to avoid overwhelming the agent
      const stepEntries = Object.entries(context.steps);
      const recentSteps = stepEntries.slice(-2);
      
      for (const [stepId, stepResult] of recentSteps) {
        if (stepResult.success && stepResult.result) {
          // Summarize large results to avoid token limits
          const resultSummary = this.summarizeStepResult(stepResult.result);
          prompt += `\n- ${stepId}: ${resultSummary}`;
        }
      }
      
      // Add workflow execution context
      prompt += `\n\nWORKFLOW CONTEXT:`;
      prompt += `\n- Workflow: ${context.workflow?.name || 'Unknown'}`;
      prompt += `\n- Current Step: ${step.id}`;
      prompt += `\n- Step ${stepEntries.length + 1} of ${context.workflow?.totalSteps || 'unknown'}`;
    } else {
      // Add workflow execution context even if no previous steps
      prompt += `\n\nWORKFLOW CONTEXT:`;
      prompt += `\n- Workflow: ${context.workflow?.name || 'Unknown'}`;
      prompt += `\n- Current Step: ${step.id}`;
      prompt += `\n- Step 1 of ${context.workflow?.totalSteps || 'unknown'}`;
    }

    // Final instructions to prevent recursion
    prompt += `\n\nEXECUTION RULES:`;
    prompt += `\n1. Execute this step exactly once`;
    prompt += `\n2. Do not call multiple tools unless explicitly required`;
    prompt += `\n3. Do not attempt to validate or modify the results`;
    prompt += `\n4. Return results immediately after tool execution`;
    prompt += `\n5. Do not ask for clarification or additional input`;
    
    return prompt;
  }

  /**
   * Generate specific guidance for email steps
   * @param {Object} step - Workflow step
   * @param {Object} context - Execution context
   * @returns {string} Email-specific guidance
   */
  generateEmailStepGuidance(step, context) {
    let guidance = `\n\nEMAIL STEP GUIDANCE:`;
    
    // Helper function to find parameter - prioritize parameters object
    const findParameter = (paramNames) => {
      const names = Array.isArray(paramNames) ? paramNames : [paramNames];
      
      for (const paramName of names) {
        // Primary location: parameters object
        if (step.config.parameters?.[paramName]) {
          return step.config.parameters[paramName];
        }
        
        // Fallback: toolParameters for backward compatibility
        if (step.config.toolParameters?.[paramName]) {
          return step.config.toolParameters[paramName];
        }
      }
      return null;
    };
    
    // Check if recipient is configured
    const recipient = findParameter(['recipient', 'to', 'email']);
    if (recipient) {
      guidance += `\n- Send to: ${recipient}`;
    } else {
      guidance += `\n- WARNING: No recipient configured. Use a default or derive from context.`;
    }
    
    // Check if subject is configured
    const subject = findParameter(['subject', 'title']);
    if (subject) {
      guidance += `\n- Subject: ${subject}`;
    } else {
      guidance += `\n- Generate appropriate subject line based on step purpose`;
    }
    
    // Check if content template is provided
    const content = findParameter(['contentTemplate', 'content', 'message', 'body']);
    if (content) {
      guidance += `\n- Content template: ${content}`;
      guidance += `\n- Populate template with data from previous steps`;
    } else {
      guidance += `\n- Generate email content based on step name and previous step data`;
    }
    
    // Add data availability guidance
    const availableData = this.identifyAvailableDataForEmail(context);
    if (availableData.length > 0) {
      guidance += `\n- Available data: ${availableData.join(', ')}`;
    }
    
    return guidance;
  }

  /**
   * Identify what data is available from previous steps for email content
   * @param {Object} context - Execution context
   * @returns {Array} Array of available data types
   */
  identifyAvailableDataForEmail(context) {
    const availableData = [];
    
    if (context.steps) {
      for (const [stepId, stepResult] of Object.entries(context.steps)) {
        if (stepResult.success && stepResult.result) {
          const result = stepResult.result;
          
          // Check for agent response text
          if (result.agentResponse && typeof result.agentResponse === 'string') {
            availableData.push('text data from previous steps');
          }
          
          // Check if result contains structured data
          if (typeof result === 'object' && result !== null) {
            const keys = Object.keys(result);
            if (keys.length > 0) {
              availableData.push('structured data');
            }
          }
          
          // Check for arrays (lists of items)
          if (Array.isArray(result)) {
            availableData.push('list data');
          }
        }
      }
    }
    
    return [...new Set(availableData)]; // Remove duplicates
  }

  /**
   * Generate specific action instructions based on step name patterns
   * @param {string} stepName - Name of the step
   * @param {Object} config - Step configuration
   * @returns {string} Specific instruction
   */
  generateActionInstructions(stepName, config) {
    const name = stepName.toLowerCase();
    
    // Pattern matching for common workflow step types
    if (name.includes('fetch') || name.includes('get') || name.includes('retrieve')) {
      if (name.includes('strava')) {
        return 'Use a Strava MCP tool to fetch the requested data';
      } else if (name.includes('linkedin')) {
        return 'Use a LinkedIn MCP tool to retrieve the requested information';
      } else {
        return 'Use the appropriate MCP tool to fetch the requested data';
      }
    }
    
    if (name.includes('create') || name.includes('post') || name.includes('publish')) {
      if (name.includes('linkedin')) {
        return 'Use the LinkedIn CREATE-TEXT-POST-USER tool to create a post';
      } else {
        return 'Use the appropriate MCP tool to create the requested content';
      }
    }
    
    if (name.includes('extract') || name.includes('parse') || name.includes('analyze')) {
      return 'Process the data from previous steps and extract the required information';
    }
    
    if (name.includes('compose') || name.includes('format') || name.includes('generate')) {
      return 'Generate the requested text/content based on the available data';
    }
    
    // Default instruction
    return `Complete the task: "${stepName}"`;
  }

  /**
   * Summarize step results to avoid overwhelming subsequent prompts
   * @param {any} result - Step result to summarize
   * @returns {string} Summarized result
   */
  summarizeStepResult(result) {
    if (typeof result === 'string') {
      return result.length > 200 ? result.substring(0, 200) + '...' : result;
    }
    
    if (typeof result === 'object' && result !== null) {
      // For objects, provide a brief summary
      if (Array.isArray(result)) {
        return `Array with ${result.length} items: ${JSON.stringify(result.slice(0, 2))}${result.length > 2 ? '...' : ''}`;
      } else {
        const keys = Object.keys(result);
        if (keys.length > 5) {
          return `Object with keys: ${keys.slice(0, 5).join(', ')}... (${keys.length} total)`;
        } else {
          return JSON.stringify(result);
        }
      }
    }
    
    return JSON.stringify(result);
  }

  /**
   * Get the configured default model and endpoint for workflows
   * @returns {Promise<Object>} The configured model and endpoint or default fallbacks
   */
  async getConfiguredModelAndEndpoint() {
    try {
      const config = await getCustomConfig();
      const configuredModel = config?.workflows?.defaultModel || 'gpt-4o-mini';
      const configuredEndpoint = config?.workflows?.defaultEndpoint || 'openAI';
      
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
      
      logger.info(`[WorkflowExecutor] Using configured model: ${configuredModel} on endpoint: ${configuredEndpoint} (${mappedEndpoint})`);
      
      return {
        model: configuredModel,
        endpoint: mappedEndpoint,
        endpointName: configuredEndpoint
      };
    } catch (error) {
      logger.warn('[WorkflowExecutor] Failed to load config, using defaults:', error);
      return {
        model: 'gpt-4o-mini',
        endpoint: EModelEndpoint.openAI,
        endpointName: 'openAI'
      };
    }
  }

  /**
   * Get the configured default model for workflows
   * @returns {Promise<string>} The configured model or default fallback
   * @deprecated Use getConfiguredModelAndEndpoint() instead
   */
  async getConfiguredModel() {
    const config = await this.getConfiguredModelAndEndpoint();
    return config.model;
  }

  /**
   * Execute a step using agent with MCP tools (similar to scheduler approach)
   * @param {Object} step - Workflow step
   * @param {string} prompt - Task prompt
   * @param {Object} context - Execution context
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Execution result
   */
  async executeStepWithAgent(step, prompt, context, userId) {
    logger.info(`[WorkflowExecutor] Executing step "${step.name}" with agent`);
    
    try {
      // Get the configured model and endpoint
      const config = await this.getConfiguredModelAndEndpoint();
      const { model: configuredModel, endpoint: configuredEndpoint, endpointName } = config;
      
      // Create mock request and setup ephemeral agent (similar to scheduler)
      const mockReq = this.createMockRequestForWorkflow(step, context, userId, prompt, configuredModel, configuredEndpoint);
      
      // Extract MCP server names from available tools
      const mcpServerNames = this.extractMCPServerNames(context.mcp.availableTools);
      
      // Create ephemeral agent configuration
      const ephemeralAgent = {
        workflow: true,
        execute_code: false,
        web_search: false,
        mcp: mcpServerNames
      };
      
      // Update request for ephemeral agent
      const underlyingEndpoint = configuredEndpoint;
      const underlyingModel = configuredModel;
      
      updateRequestForEphemeralAgent(mockReq, {
        prompt,
        user: userId,
        conversation_id: context.workflow?.conversationId,
        parent_message_id: context.workflow?.parentMessageId,
      }, ephemeralAgent, underlyingEndpoint, underlyingModel);
      
      // Load ephemeral agent
      const agent = await loadAgent({
        req: mockReq,
        agent_id: Constants.EPHEMERAL_AGENT_ID,
        endpoint: underlyingEndpoint,
        model_parameters: { model: underlyingModel }
      });
      
      if (!agent) {
        throw new Error('Failed to load ephemeral agent for workflow step');
      }
      
      logger.info(`[WorkflowExecutor] Loaded ephemeral agent with ${agent.tools?.length || 0} tools using ${endpointName}/${underlyingModel}`);
      
      // Initialize client factory and create agents endpoint option
      const clientFactory = new SchedulerClientFactory();
      const endpointOption = clientFactory.createAgentsEndpointOption(agent, underlyingModel);
      
      // Disable automatic title generation to preserve our custom workflow execution title
      endpointOption.titleConvo = false;
      
      // Create minimal mock response for client initialization
      const mockRes = createMinimalMockResponse();
      
      // Initialize the agents client
      const { client } = await clientFactory.initializeClient({ 
        req: mockReq, 
        res: mockRes, 
        endpointOption 
      });
      
      if (!client) {
        throw new Error('Failed to initialize agents client for workflow step');
      }
      
      logger.info(`[WorkflowExecutor] AgentClient initialized successfully for step "${step.name}"`);
      
      // Execute the step using the agent
      const response = await client.sendMessage(prompt, {
        user: userId,
        conversationId: context.workflow?.conversationId,
        parentMessageId: context.workflow?.parentMessageId,
        onProgress: (data) => {
          logger.debug(`[WorkflowExecutor] Agent progress for step "${step.name}":`, data?.text?.substring(0, 100));
        }
      });
      
      if (!response) {
        throw new Error('No response received from agent');
      }
      
      logger.info(`[WorkflowExecutor] Agent execution completed for step "${step.name}"`);
      
      // Extract response text from agent response
      const responseText = this.extractResponseText(response);
      
      return {
        status: 'success',
        message: `Successfully executed step "${step.name}" with agent using ${endpointName}/${underlyingModel}`,
        agentResponse: responseText,
        toolsUsed: agent.tools || [],
        mcpToolsCount: agent.tools?.filter(tool => tool.includes(Constants.mcp_delimiter)).length || 0,
        modelUsed: underlyingModel,
        endpointUsed: endpointName,
        timestamp: new Date().toISOString(),
        // Capture the response message ID for conversation threading
        responseMessageId: response.messageId || response.id,
        conversationId: context.workflow?.conversationId,
      };
      
    } catch (error) {
      logger.error(`[WorkflowExecutor] Agent execution failed for step "${step.name}":`, error);
      throw error;
    }
  }

  /**
   * Create mock request for workflow execution
   * @param {Object} step - Workflow step
   * @param {Object} context - Execution context
   * @param {string} userId - User ID
   * @param {string} prompt - Task prompt
   * @param {string} model - Model to use
   * @param {string} endpoint - Endpoint to use
   * @returns {Object} Mock request object
   */
  createMockRequestForWorkflow(step, context, userId, prompt, model, endpoint) {
    // Generate message IDs for proper conversation threading
    const { v4: uuidv4 } = require('uuid');
    const userMessageId = uuidv4();
    
    return {
      user: { 
        id: userId.toString()
      },
      body: {
        endpoint: endpoint,
        model: model,
        userMessageId: userMessageId,
        parentMessageId: context.workflow?.parentMessageId,
        conversationId: context.workflow?.conversationId,
        promptPrefix: prompt,
        ephemeralAgent: null, // Will be set later
      },
      app: {
        locals: {
          availableTools: context.mcp.availableTools || {},
        }
      }
    };
  }

  /**
   * Extract MCP server names from available tools
   * @param {Object} availableTools - Available tools registry
   * @returns {string[]} Array of MCP server names
   */
  extractMCPServerNames(availableTools) {
    const mcpServerNames = [];
    const availableToolKeys = Object.keys(availableTools || {});
    
    for (const toolKey of availableToolKeys) {
      if (toolKey.includes(Constants.mcp_delimiter)) {
        const serverName = toolKey.split(Constants.mcp_delimiter)[1];
        if (serverName && !mcpServerNames.includes(serverName)) {
          mcpServerNames.push(serverName);
        }
      }
    }
    
    logger.debug(`[WorkflowExecutor] Found MCP server names: ${mcpServerNames.join(', ')}`);
    return mcpServerNames;
  }

  /**
   * Extract response text from agent response
   * @param {Object} response - Agent response
   * @returns {string} Response text
   */
  extractResponseText(response) {
    if (typeof response === 'string') {
      return response;
    }
    
    if (response.text) {
      return response.text;
    }
    
    if (response.message) {
      return response.message;
    }
    
    if (response.content) {
      return response.content;
    }
    
    // If response is an object, stringify it
    return JSON.stringify(response);
  }

  /**
   * Create a mock result for action steps
   * @param {Object} step - Workflow step
   * @param {string} reason - Reason for mock result
   * @returns {Object} Mock result
   */
  createMockActionResult(step, reason) {
    return {
      type: 'action_mock',
      stepName: step.name,
      config: step.config,
      result: {
        status: 'success',
        message: `Mock execution of action step: ${step.name}`,
        reason,
        data: step.config,
        timestamp: new Date().toISOString(),
        note: 'This step executed with mock data. Configure MCP tools for real execution.'
      },
    };
  }

  /**
   * Find the first step in a workflow (step with no incoming connections)
   * @param {Array} steps - Array of workflow steps
   * @returns {Object|null} First step or null
   */
  findFirstStep(steps) {
    const stepIds = new Set(steps.map(s => s.id));
    const referencedSteps = new Set();
    
    // Collect all steps that are referenced as onSuccess or onFailure
    steps.forEach(step => {
      if (step.onSuccess && stepIds.has(step.onSuccess)) {
        referencedSteps.add(step.onSuccess);
      }
      if (step.onFailure && stepIds.has(step.onFailure)) {
        referencedSteps.add(step.onFailure);
      }
    });
    
    // Find steps that are not referenced (potential starting points)
    const unreferencedSteps = steps.filter(step => !referencedSteps.has(step.id));
    
    // Return the first unreferenced step, or the first step if all are referenced
    return unreferencedSteps.length > 0 ? unreferencedSteps[0] : steps[0];
  }

  /**
   * Resolve parameters by replacing context variables
   * @param {Object} parameters - Parameters with potential context references
   * @param {Object} context - Execution context
   * @returns {Object} Resolved parameters
   */
  resolveParameters(parameters, context) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // Extract variable path (e.g., "{{steps.step1.result.data}}")
        const varPath = value.slice(2, -2).trim();
        resolved[key] = this.getValueFromPath(context, varPath);
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveParameters(value, context);
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }

  /**
   * Get value from object path (e.g., "steps.step1.result.data")
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-separated path
   * @returns {*} Value at path or undefined
   */
  getValueFromPath(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Execute MCP tool (placeholder implementation)
   * @param {Object} tool - MCP tool definition
   * @param {Object} parameters - Tool parameters
   * @param {string} userId - User ID
   * @returns {Promise<*>} Tool execution result
   */
  async executeMCPTool(tool, parameters, userId) {
    // This is a placeholder implementation
    // In a real scenario, you would use the MCP client to execute the tool
    logger.info(`[WorkflowExecutor] Executing MCP tool ${tool.name} with parameters:`, parameters);
    
    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      status: 'success',
      message: `MCP tool ${tool.name} executed successfully`,
      data: parameters,
      timestamp: new Date().toISOString(),
    };
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

  /**
   * Generate execution hints for a workflow step
   * @param {Object} step - Workflow step
   * @returns {Object} Execution hints
   */
  generateExecutionHints(step) {
    const hints = {
      expectedExecutionTime: 'fast', // fast, medium, slow
      retryable: true,
      criticalPath: false,
    };

    const stepName = step.name.toLowerCase();

    // Adjust hints based on step type and name
    if (step.type === 'action') {
      if (stepName.includes('create') || stepName.includes('post') || stepName.includes('publish')) {
        hints.expectedExecutionTime = 'medium';
        hints.criticalPath = true; // Creating content is usually critical
      } else if (stepName.includes('get') || stepName.includes('fetch')) {
        hints.expectedExecutionTime = 'fast';
      } else if (stepName.includes('analyze') || stepName.includes('process') || stepName.includes('compose')) {
        hints.expectedExecutionTime = 'medium';
      }
    } else if (step.type === 'delay') {
      hints.expectedExecutionTime = 'slow';
      hints.retryable = false;
    }

    return hints;
  }
}

module.exports = WorkflowExecutor; 