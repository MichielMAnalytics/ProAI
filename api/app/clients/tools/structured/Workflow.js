const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('~/config');
const WorkflowService = require('~/server/services/Workflows/WorkflowService');
const UserMCPService = require('~/server/services/UserMCPService');
const PipedreamUserIntegrations = require('~/server/services/Pipedream/PipedreamUserIntegrations');
const { EModelEndpoint, Constants } = require('librechat-data-provider');

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
    this.agent = fields.agent; // Store agent information

    logger.debug(`[WorkflowTool] Constructor called with:`, {
      userId: this.userId,
      conversationId: this.conversationId,
      parentMessageId: this.parentMessageId,
      endpoint: this.endpoint,
      model: this.model,
      override: this.override,
      hasReq: !!this.req,
      hasAgent: !!this.agent,
      agentId: this.agent?.id,
    });

    this.name = 'workflows';
    this.description = `Access agent information and open the workflow creation panel for manual workflow building.
    
    Available actions:
    - retrieve_agent_details: Get detailed information about a specific agent including description, instructions, and tools
    - open_sidepanel: Open the workflow creation panel with pre-populated workflow details
    
    Usage Examples:
    
    1. Get Agent Details:
       {
         "action": "retrieve_agent_details",
         "agent_id": "agent_Jmkl3bFgY1rr6esZ1iSKX"
       }
    
    2. Open Workflow Panel with Details:
       {
         "action": "open_sidepanel",
         "workflow_name": "Customer Support Automation",
         "first_step_task": "Analyze the customer inquiry and determine the appropriate response type"
       }`;

    this.schema = z.object({
      action: z
        .enum(['retrieve_agent_details', 'open_sidepanel'])
        .describe('The action to perform'),

      // Agent details retrieval
      agent_id: z
        .string()
        .optional()
        .describe('Agent ID to retrieve details for (required for retrieve_agent_details action)'),

      // Workflow creation fields
      workflow_name: z
        .string()
        .optional()
        .describe('Name for the workflow (required for open_sidepanel action)'),
      
      first_step_task: z
        .string()
        .optional()
        .describe('Description of the task for the first step, which will be executed by the calling agent (required for open_sidepanel action)'),
    });
  }

  /**
   * Retrieve detailed information about a specific agent
   * @param {string} agentId - The agent ID to retrieve details for
   * @param {string} userId - User ID for access control
   * @returns {Promise<Object>} Agent details including description, instructions, and tools
   */
  async retrieveAgentDetails(agentId, userId) {
    try {
      if (!agentId) {
        throw new Error('Agent ID is required');
      }

      logger.info(
        `[WorkflowTool] Retrieving details for agent ${agentId} requested by user ${userId}`,
      );

      // Get agent details from the database
      const { getAgent } = require('~/models/Agent');
      const agent = await getAgent({ id: agentId });

      if (!agent) {
        return {
          success: false,
          message: `Agent with ID ${agentId} not found`,
        };
      }

      // Check if user has access to this agent (either owner or it's in a shared project)
      let hasAccess = false;

      // User is the author
      if (agent.author.toString() === userId) {
        hasAccess = true;
      } else {
        // Check if agent is in a shared project
        const { getProjectByName } = require('~/models/Project');
        const { Constants } = require('librechat-data-provider');

        try {
          const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, ['agentIds']);
          if (globalProject && globalProject.agentIds && globalProject.agentIds.includes(agentId)) {
            hasAccess = true;
          }
        } catch (error) {
          logger.debug(`[WorkflowTool] Could not check global project access: ${error.message}`);
        }
      }

      if (!hasAccess) {
        return {
          success: false,
          message: `Access denied to agent ${agentId}`,
        };
      }

      // Return agent details
      const agentDetails = {
        id: agent.id,
        name: agent.name,
        description: agent.description || '',
        instructions: agent.instructions || '',
        provider: agent.provider,
        model: agent.model,
        tools: agent.tools || [],
        isCollaborative: agent.isCollaborative || false,
        version: agent.versions ? agent.versions.length : 0,
      };

      logger.info(
        `[WorkflowTool] Successfully retrieved details for agent ${agentId} (${agent.name})`,
      );

      return {
        success: true,
        message: `Retrieved details for agent "${agent.name}"`,
        agent: agentDetails,
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error retrieving agent details:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Open the workflow sidepanel for manual workflow creation
   * @param {string} userId - User ID
   * @param {string} workflowName - Name for the workflow
   * @param {string} firstStepTask - Task description for the first step
   * @returns {Promise<Object>} Response indicating sidepanel should be opened
   */
  async openSidepanel(userId, workflowName, firstStepTask) {
    try {
      // Validate required parameters
      if (!workflowName) {
        throw new Error('workflow_name is required for open_sidepanel action');
      }
      if (!firstStepTask) {
        throw new Error('first_step_task is required for open_sidepanel action');
      }

      logger.info(
        `[WorkflowTool] Opening workflow sidepanel and creating workflow for user ${userId}`,
        {
          workflowName,
          firstStepTask,
        },
      );

      // Get current agent information for the first step
      let callingAgentId = null;
      
      // Try multiple sources to get the calling agent ID
      if (this.agent && this.agent.id && this.agent.id !== 'ephemeral') {
        callingAgentId = this.agent.id;
        logger.info(`[WorkflowTool] Using agent ID from agent context: ${callingAgentId}`);
      } else if (this.endpoint === 'agents' && this.model) {
        // In agent endpoint, model field contains the agent ID
        callingAgentId = this.model;
        logger.info(`[WorkflowTool] Using agent ID from model field: ${callingAgentId}`);
      } else if (this.req && this.req.body && this.req.body.agent_id) {
        callingAgentId = this.req.body.agent_id;
        logger.info(`[WorkflowTool] Using agent ID from request body: ${callingAgentId}`);
      } else {
        logger.warn(`[WorkflowTool] No calling agent ID found. Available context:`, {
          hasAgent: !!this.agent,
          agentId: this.agent?.id,
          endpoint: this.endpoint,
          model: this.model,
          hasReqBody: !!(this.req && this.req.body),
          reqBodyAgentId: this.req?.body?.agent_id,
        });
      }

      // Only create workflow if we have a calling agent
      if (!callingAgentId) {
        throw new Error('Cannot create workflow: no calling agent ID found');
      }

      // Generate a unique workflow ID
      const workflowId = `workflow_${Date.now()}`;
      
      // Create the first step with the calling agent
      const firstStep = {
        id: `step_${Date.now()}`,
        name: 'Step 1',
        type: 'mcp_agent_action',
        config: {
          toolName: `agent_${callingAgentId}`,
          parameters: {
            instruction: firstStepTask,
            agent_id: callingAgentId,
          },
        },
      };

      // Prepare workflow data for creation
      const workflowData = {
        id: workflowId,
        name: workflowName,
        trigger: {
          type: 'manual',
          config: {},
        },
        steps: [firstStep],
        isActive: false, // Start inactive by default
        isDraft: false, // Mark as not draft since we're saving
        version: 1,
        conversation_id: this.conversationId, // Include the conversation ID (using underscore for consistency with WorkflowService)
      };

      // Create the workflow using WorkflowService
      try {
        const WorkflowService = require('~/server/services/Workflows/WorkflowService');
        const workflowService = new WorkflowService();
        const createdWorkflow = await workflowService.createWorkflow(workflowData, userId);
        
        logger.info(`[WorkflowTool] Successfully created workflow: ${createdWorkflow.id} (${createdWorkflow.name})`);
        
        // Send SSE notification to trigger workflow builder opening with the created workflow ID
        try {
          const SchedulerService = require('~/server/services/Scheduler/SchedulerService');
          await SchedulerService.sendWorkflowStatusUpdate({
            userId: userId,
            workflowName: workflowName,
            workflowId: createdWorkflow.id,
            notificationType: 'open_workflow_builder_edit', // New notification type for editing
            details: `Opening workflow builder to edit "${workflowName}"...`,
            workflowData: {
              action: 'open_workflow_builder_edit',
              type: 'workflow_builder_panel',
              createdWorkflowId: createdWorkflow.id,
              conversationId: this.conversationId,
            },
          });
        } catch (notificationError) {
          logger.warn(
            `[WorkflowTool] Failed to send sidepanel notification: ${notificationError.message}`,
          );
          // Don't fail the operation if notification fails
        }

        return {
          success: true,
          action: 'open_workflow_sidepanel',
          message: `Workflow "${workflowName}" created and opened for editing`,
          data: {
            type: 'workflow_builder',
            title: 'Workflow Builder',
            panel_type: 'workflow_editing',
            workflowId: createdWorkflow.id,
            workflow: {
              id: createdWorkflow.id,
              name: createdWorkflow.name,
              trigger: createdWorkflow.trigger,
              steps: createdWorkflow.steps,
              isActive: createdWorkflow.isActive,
              isDraft: createdWorkflow.isDraft,
            },
          },
        };
      } catch (workflowCreationError) {
        logger.error(`[WorkflowTool] Failed to create workflow:`, workflowCreationError);
        throw new Error(`Failed to create workflow: ${workflowCreationError.message}`);
      }
    } catch (error) {
      logger.error(`[WorkflowTool] Error in openSidepanel:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async _call(input, config) {
    try {
      const { action, ...data } = input;

      const userId = this.userId;

      if (!userId) {
        throw new Error('User context not available');
      }

      logger.debug(`[WorkflowTool] Executing action: ${action}`, {
        userId,
      });

      switch (action) {
        case 'retrieve_agent_details':
          return await this.retrieveAgentDetails(data.agent_id, userId);

        case 'open_sidepanel':
          return await this.openSidepanel(
            userId,
            data.workflow_name,
            data.first_step_task,
          );

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error(`[WorkflowTool] Error in _call:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = WorkflowTool;
