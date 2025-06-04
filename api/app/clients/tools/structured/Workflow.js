const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('~/config');
const { 
  createUserWorkflow, 
  getUserWorkflows, 
  getUserWorkflowById,
  updateUserWorkflow,
  deleteUserWorkflow,
  toggleUserWorkflow
} = require('~/models/UserWorkflow');
const WorkflowService = require('~/server/services/Workflows/WorkflowService');
const UserMCPService = require('~/server/services/UserMCPService');
const PipedreamUserIntegrations = require('~/server/services/Pipedream/PipedreamUserIntegrations');

class WorkflowTool extends Tool {
  static lc_name() {
    return 'WorkflowTool';
  }

  constructor(fields = {}) {
    super();
    this.override = fields.override ?? false;
    this.userId = fields.userId;
    this.conversationId = fields.conversationId;
    this.parentMessageId = fields.parentMessageId;
    this.endpoint = fields.endpoint;
    this.model = fields.model;
    this.req = fields.req;
    
    logger.debug(`[WorkflowTool] Constructor called with:`, {
      userId: this.userId,
      conversationId: this.conversationId,
      parentMessageId: this.parentMessageId,
      endpoint: this.endpoint,
      model: this.model,
      override: this.override,
      hasReq: !!this.req,
    });
    
    this.name = 'workflows';
    this.description = `Create and manage automated workflows that can execute sequences of actions and tools.
    
    Available actions:
    - create_workflow: Create a new workflow with steps and triggers
    - list_workflows: List all user's workflows
    - get_workflow: Get details of a specific workflow
    - update_workflow: Update an existing workflow
    - delete_workflow: Delete a workflow
    - activate_workflow: Activate a workflow for execution
    - deactivate_workflow: Deactivate a workflow
    - test_workflow: Execute a workflow once for testing
    - get_available_tools: Get available MCP tools and Pipedream actions for workflow creation
    - generate_artifact: Generate a workflow visualization artifact`;
    
    this.schema = z.object({
      action: z.enum([
        'create_workflow', 
        'list_workflows', 
        'get_workflow', 
        'update_workflow', 
        'delete_workflow', 
        'activate_workflow', 
        'deactivate_workflow', 
        'test_workflow',
        'get_available_tools',
        'generate_artifact'
      ]).describe('The action to perform'),
      
      // Workflow creation/update fields
      name: z.string().optional()
        .describe('Name of the workflow (required for create_workflow)'),
      description: z.string().optional()
        .describe('Description of the workflow'),
      trigger: z.object({
        type: z.enum(['manual', 'schedule', 'webhook', 'email', 'event']),
        config: z.record(z.unknown()).optional(),
      }).optional()
        .describe('Workflow trigger configuration'),
      steps: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(['action', 'condition', 'delay', 'mcp_tool']),
        config: z.record(z.unknown()),
        onSuccess: z.string().optional(),
        onFailure: z.string().optional(),
        position: z.object({
          x: z.number(),
          y: z.number(),
        }),
      })).optional()
        .describe('Array of workflow steps'),
      
      // Workflow management fields
      workflow_id: z.string().optional()
        .describe('Workflow ID for get, update, delete, activate, deactivate, test actions'),
      
      // Artifact generation
      artifact_title: z.string().optional()
        .describe('Title for the workflow visualization artifact'),
    });
  }

  async getAvailableTools(userId) {
    try {
      // Get MCP tools
      const mcpTools = await UserMCPService.getUserMCPTools(userId);
      
      // Get Pipedream integrations
      const integrations = await PipedreamUserIntegrations.getUserIntegrations(userId);
      
      // Format available tools
      const availableTools = {
        mcpTools: mcpTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          type: 'mcp_tool',
        })),
        pipedreamActions: integrations.map(integration => ({
          name: integration.appName,
          slug: integration.appSlug,
          description: integration.appDescription,
          type: 'pipedream_action',
          categories: integration.appCategories,
        })),
      };

      return {
        success: true,
        message: `Found ${availableTools.mcpTools.length} MCP tools and ${availableTools.pipedreamActions.length} Pipedream integrations`,
        tools: availableTools,
      };
    } catch (error) {
      logger.error('[WorkflowTool] Error getting available tools:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createWorkflow(data, userId, conversationId, parentMessageId, endpoint, model) {
    const { name, description, trigger, steps } = data;

    if (!name || !trigger || !steps || steps.length === 0) {
      throw new Error('Missing required fields: name, trigger, and steps are required');
    }

    const workflowId = `workflow_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    
    const workflowData = {
      id: workflowId,
      name,
      description,
      trigger,
      steps,
      isDraft: true,
      isActive: false,
      user: userId,
      conversation_id: conversationId,
      parent_message_id: parentMessageId,
      endpoint: endpoint || this.endpoint,
      version: 1,
      created_from_agent: true,
    };

    // Set agent_id if using agents endpoint
    if ((endpoint || this.endpoint) === 'agents') {
      workflowData.agent_id = model || this.model;
    } else {
      workflowData.ai_model = model || this.model;
    }

    try {
      const workflow = await createUserWorkflow(workflowData);
      logger.info(`[WorkflowTool] Created workflow: ${workflowId} (${name}) for user ${userId}`);
      
      return {
        success: true,
        message: `Workflow "${name}" created successfully as draft`,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: workflow.steps,
          isDraft: workflow.isDraft,
          isActive: workflow.isActive,
          version: workflow.version,
        }
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error creating workflow:`, error);
      throw new Error(`Failed to create workflow: ${error.message}`);
    }
  }

  async listWorkflows(userId) {
    try {
      const workflows = await getUserWorkflows(userId);
      
      return {
        success: true,
        message: `Found ${workflows.length} workflows`,
        workflows: workflows.map(workflow => ({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          isDraft: workflow.isDraft,
          isActive: workflow.isActive,
          stepCount: workflow.steps?.length || 0,
          last_run: workflow.last_run,
          run_count: workflow.run_count || 0,
          success_count: workflow.success_count || 0,
          failure_count: workflow.failure_count || 0,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        }))
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error listing workflows:`, error);
      throw new Error(`Failed to list workflows: ${error.message}`);
    }
  }

  async getWorkflow(workflowId, userId) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    try {
      const workflow = await getUserWorkflowById(workflowId, userId);
      
      if (!workflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      return {
        success: true,
        message: `Workflow details retrieved`,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: workflow.steps,
          isDraft: workflow.isDraft,
          isActive: workflow.isActive,
          version: workflow.version,
          last_run: workflow.last_run,
          run_count: workflow.run_count || 0,
          success_count: workflow.success_count || 0,
          failure_count: workflow.failure_count || 0,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        }
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error getting workflow:`, error);
      throw new Error(`Failed to get workflow: ${error.message}`);
    }
  }

  async updateWorkflow(workflowId, userId, updateData) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    try {
      const updatedWorkflow = await updateUserWorkflow(workflowId, userId, updateData);
      
      if (!updatedWorkflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      return {
        success: true,
        message: `Workflow "${updatedWorkflow.name}" updated successfully`,
        workflow: {
          id: updatedWorkflow.id,
          name: updatedWorkflow.name,
          description: updatedWorkflow.description,
          trigger: updatedWorkflow.trigger,
          steps: updatedWorkflow.steps,
          isDraft: updatedWorkflow.isDraft,
          isActive: updatedWorkflow.isActive,
          version: updatedWorkflow.version,
        }
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error updating workflow:`, error);
      throw new Error(`Failed to update workflow: ${error.message}`);
    }
  }

  async deleteWorkflow(workflowId, userId) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    try {
      const result = await deleteUserWorkflow(workflowId, userId);
      
      if (result.deletedCount === 0) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      return {
        success: true,
        message: `Workflow deleted successfully`
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error deleting workflow:`, error);
      throw new Error(`Failed to delete workflow: ${error.message}`);
    }
  }

  async toggleWorkflow(workflowId, userId, isActive) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    try {
      const workflow = await toggleUserWorkflow(workflowId, userId, isActive);
      
      if (!workflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      return {
        success: true,
        message: `Workflow "${workflow.name}" ${isActive ? 'activated' : 'deactivated'} successfully`
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error toggling workflow:`, error);
      throw new Error(`Failed to ${isActive ? 'activate' : 'deactivate'} workflow: ${error.message}`);
    }
  }

  async testWorkflow(workflowId, userId) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    try {
      const workflow = await getUserWorkflowById(workflowId, userId);
      
      if (!workflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      // Execute workflow via WorkflowService
      const execution = await WorkflowService.executeWorkflow(workflow, {
        type: 'manual',
        source: 'agent_test',
        data: { initiated_by: 'agent' }
      });

      return {
        success: true,
        message: `Test execution started for workflow "${workflow.name}"`,
        execution: {
          id: execution.id,
          status: execution.status,
          startTime: execution.startTime,
        }
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error testing workflow:`, error);
      throw new Error(`Failed to test workflow: ${error.message}`);
    }
  }

  async generateArtifact(workflowId, userId, artifactTitle) {
    if (!workflowId) {
      throw new Error('Workflow ID is required for artifact generation');
    }

    try {
      const workflow = await getUserWorkflowById(workflowId, userId);
      
      if (!workflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      // Generate workflow visualization artifact
      const artifactIdentifier = `workflow-${workflowId}`;
      
      // Update workflow with artifact identifier
      await updateUserWorkflow(workflowId, userId, { 
        artifact_identifier: artifactIdentifier 
      });

      return {
        success: true,
        message: `Workflow visualization artifact will be generated`,
        artifact: {
          identifier: artifactIdentifier,
          title: artifactTitle || `Workflow: ${workflow.name}`,
          type: 'application/vnd.workflow',
          workflow: workflow,
        }
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error generating artifact:`, error);
      throw new Error(`Failed to generate artifact: ${error.message}`);
    }
  }

  async _call(input, config) {
    try {
      const { action, ...data } = input;
      
      const userId = this.userId;
      const conversationId = config?.configurable?.thread_id || 
                           config?.configurable?.conversationId ||
                           this.conversationId;
      
      let parentMessageId = this.req?.body?.userMessageId || this.req?.body?.overrideUserMessageId;
      if (!parentMessageId) {
        parentMessageId = this.parentMessageId;
      }
      
      const endpoint = this.endpoint;
      const model = this.model;
      
      if (!userId) {
        throw new Error('User context not available');
      }

      logger.debug(`[WorkflowTool] Executing action: ${action}`, { 
        userId, 
        conversationId, 
        parentMessageId,
        endpoint,
        model,
      });

      switch (action) {
        case 'create_workflow':
          return await this.createWorkflow(data, userId, conversationId, parentMessageId, endpoint, model);
        
        case 'list_workflows':
          return await this.listWorkflows(userId);
        
        case 'get_workflow':
          return await this.getWorkflow(data.workflow_id, userId);
        
        case 'update_workflow':
          const { workflow_id, ...updateData } = data;
          return await this.updateWorkflow(workflow_id, userId, updateData);
        
        case 'delete_workflow':
          return await this.deleteWorkflow(data.workflow_id, userId);
        
        case 'activate_workflow':
          return await this.toggleWorkflow(data.workflow_id, userId, true);
        
        case 'deactivate_workflow':
          return await this.toggleWorkflow(data.workflow_id, userId, false);
        
        case 'test_workflow':
          return await this.testWorkflow(data.workflow_id, userId);
        
        case 'get_available_tools':
          return await this.getAvailableTools(userId);
        
        case 'generate_artifact':
          return await this.generateArtifact(data.workflow_id, userId, data.artifact_title);
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error(`[WorkflowTool] Error in _call:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = WorkflowTool; 