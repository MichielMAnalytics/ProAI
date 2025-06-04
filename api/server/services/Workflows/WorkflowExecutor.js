const { logger } = require('~/config');
const { 
  createWorkflowStepExecution,
  updateWorkflowStepExecution,
  updateWorkflowExecution,
  updateExecutionContext
} = require('~/models/WorkflowExecution');
const UserMCPService = require('~/server/services/UserMCPService');
const PipedreamUserIntegrations = require('~/server/services/Pipedream/PipedreamUserIntegrations');
const { evaluateCondition } = require('./utils/conditionEvaluator');

/**
 * WorkflowExecutor - Handles the execution of workflows
 * 
 * This service manages:
 * - Step-by-step workflow execution
 * - Integration with MCP tools and Pipedream actions
 * - Error handling and retry logic
 * - Context management between steps
 * - Execution flow control (success/failure paths)
 */
class WorkflowExecutor {
  constructor() {
    this.runningExecutions = new Map(); // Track running executions
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

    try {
      logger.info(`[WorkflowExecutor] Starting workflow execution: ${workflowId}`);

      // Track this execution
      this.runningExecutions.set(executionId, {
        workflowId,
        startTime: new Date(),
        status: 'running',
      });

      // Initialize execution context
      let executionContext = {
        ...context,
        workflow: {
          id: workflowId,
          name: workflow.name,
        },
        execution: {
          id: executionId,
          startTime: new Date(),
        },
        steps: {},
        variables: {},
      };

      // Update execution record
      await updateWorkflowExecution(executionId, {
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
      await updateWorkflowExecution(executionId, {
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

      // Update execution context with step result
      context.steps[step.id] = stepResult;
      await updateExecutionContext(execution.id, context);

      // Update current step in execution
      await updateWorkflowExecution(execution.id, {
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
    const stepExecution = await createWorkflowStepExecution({
      executionId: execution.id,
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
      status: 'running',
      startTime: new Date(),
      input: step.config,
      retryCount: 0,
    });

    try {
      let result;

      switch (step.type) {
        case 'delay':
          result = await this.executeDelayStep(step, context);
          break;
        case 'condition':
          result = await this.executeConditionStep(step, context);
          break;
        case 'mcp_tool':
          result = await this.executeMCPToolStep(step, context, execution.userId);
          break;
        case 'action':
          result = await this.executePipedreamActionStep(step, context, execution.userId);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      // Update step execution with success
      await updateWorkflowStepExecution(execution.id, step.id, {
        status: 'completed',
        endTime: new Date(),
        output: result,
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
      await updateWorkflowStepExecution(execution.id, step.id, {
        status: 'failed',
        endTime: new Date(),
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
   * Execute an MCP tool step
   * @param {Object} step - The MCP tool step
   * @param {Object} context - Execution context
   * @param {string} userId - User ID for the execution
   * @returns {Promise<Object>} Step result
   */
  async executeMCPToolStep(step, context, userId) {
    const { toolName, parameters = {} } = step.config;
    
    logger.info(`[WorkflowExecutor] Executing MCP tool: ${toolName}`);
    
    if (!toolName) {
      throw new Error('Tool name is required for MCP tool step');
    }

    try {
      // Get user's MCP tools
      const mcpTools = await UserMCPService.getUserMCPTools(userId);
      const tool = mcpTools.find(t => t.name === toolName);
      
      if (!tool) {
        throw new Error(`MCP tool not found: ${toolName}`);
      }

      // Resolve parameters from context
      const resolvedParameters = this.resolveParameters(parameters, context);

      // Execute the MCP tool
      // Note: This is a simplified implementation. In a real scenario,
      // you would need to use the MCP client to execute the tool
      const result = await this.executeMCPTool(tool, resolvedParameters, userId);

      return {
        type: 'mcp_tool',
        toolName,
        parameters: resolvedParameters,
        result,
      };
    } catch (error) {
      logger.error(`[WorkflowExecutor] MCP tool execution failed: ${toolName}`, error);
      throw error;
    }
  }

  /**
   * Execute a Pipedream action step
   * @param {Object} step - The Pipedream action step
   * @param {Object} context - Execution context
   * @param {string} userId - User ID for the execution
   * @returns {Promise<Object>} Step result
   */
  async executePipedreamActionStep(step, context, userId) {
    const { pipedreamAction } = step.config;
    
    if (!pipedreamAction) {
      throw new Error('Pipedream action configuration is required');
    }

    const { componentId, appSlug, config = {} } = pipedreamAction;
    
    logger.info(`[WorkflowExecutor] Executing Pipedream action: ${componentId} (${appSlug})`);

    try {
      // Check if user has the required integration
      const integrations = await PipedreamUserIntegrations.getUserIntegrations(userId);
      const integration = integrations.find(i => i.appSlug === appSlug && i.isActive);
      
      if (!integration) {
        throw new Error(`Pipedream integration not found or inactive: ${appSlug}`);
      }

      // Resolve parameters from context
      const resolvedConfig = this.resolveParameters(config, context);

      // Execute the Pipedream action
      // Note: This is a simplified implementation. In a real scenario,
      // you would need to use the Pipedream API to execute the action
      const result = await this.executePipedreamAction(
        componentId, 
        resolvedConfig, 
        integration
      );

      return {
        type: 'pipedream_action',
        componentId,
        appSlug,
        config: resolvedConfig,
        result,
      };
    } catch (error) {
      logger.error(`[WorkflowExecutor] Pipedream action execution failed: ${componentId}`, error);
      throw error;
    }
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
   * Execute Pipedream action (placeholder implementation)
   * @param {string} componentId - Pipedream component ID
   * @param {Object} config - Action configuration
   * @param {Object} integration - User integration
   * @returns {Promise<*>} Action execution result
   */
  async executePipedreamAction(componentId, config, integration) {
    // This is a placeholder implementation
    // In a real scenario, you would use the Pipedream API to execute the action
    logger.info(`[WorkflowExecutor] Executing Pipedream action ${componentId} with config:`, config);
    
    // Simulate action execution
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      status: 'success',
      message: `Pipedream action ${componentId} executed successfully`,
      app: integration.appSlug,
      data: config,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Cancel a running workflow execution
   * @param {string} executionId - Execution ID to cancel
   * @returns {Promise<boolean>} Success status
   */
  async cancelExecution(executionId) {
    if (this.runningExecutions.has(executionId)) {
      logger.info(`[WorkflowExecutor] Cancelling execution: ${executionId}`);
      
      this.runningExecutions.delete(executionId);
      
      await updateWorkflowExecution(executionId, {
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