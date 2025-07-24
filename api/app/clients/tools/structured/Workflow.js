const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('~/config');
const WorkflowService = require('~/server/services/Workflows/WorkflowService');
const UserMCPService = require('~/server/services/UserMCPService');
const PipedreamUserIntegrations = require('~/server/services/Pipedream/PipedreamUserIntegrations');
const PipedreamComponents = require('~/server/services/Pipedream/PipedreamComponents');
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
    this.description = `Access agent information and create complete automated workflows with multiple steps.
    
    Available actions:
    - retrieve_agent_details: Get detailed information about a specific agent including description, instructions, and tools
    - create_workflow: Create a complete workflow with multiple steps, each assigned to specific agents
    - update_workflow: Update existing workflows with support for trigger changes, step modifications, and metadata updates
    
    IMPORTANT: When creating workflows, always start the workflow_name with an appropriate emoji that represents the workflow's purpose or main function.
    
    Usage Examples:
    
    1. Get Agent Details:
       {
         "action": "retrieve_agent_details",
         "agent_id": "agent_Jmkl3bFgY1rr6esZ1iSKX"
       }
    
    2. Create Scheduled Workflow:
       {
         "action": "create_workflow",
         "workflow_name": "📊 Daily Report Generation",
         "trigger_type": "schedule",
         "schedule_config": "0 9 * * *",
         "workflow_steps": [
           {
             "step_name": "Data Collection",
             "agent_id": "agent_data_collector_123",
             "task_instruction": "Collect and analyze daily metrics from various sources"
           },
           {
             "step_name": "Report Generation", 
             "agent_id": "agent_report_gen_456",
             "task_instruction": "Generate comprehensive daily report with insights and recommendations"
           }
         ]
       }
    
    3. Create Gmail-Triggered Workflow:
       {
         "action": "create_workflow",
         "workflow_name": "📧 Gmail Auto-Response System",
         "trigger_type": "app",
         "app_slug": "gmail",
         "trigger_key": "gmail-new-email-received",
         "trigger_config": {
           "labels": ["INBOX"],
           "from": "important@company.com"
         },
         "pass_trigger_to_first_step": true,
         "workflow_steps": [
           {
             "step_name": "Email Analysis",
             "agent_id": "agent_email_analyzer_123",
             "task_instruction": "Analyze the incoming email content and determine appropriate response type"
           },
           {
             "step_name": "Response Generation",
             "agent_id": "agent_response_writer_456", 
             "task_instruction": "Generate personalized response based on email content and sender information"
           }
         ]
       }
    
    4. Update Workflow Trigger:
       {
         "action": "update_workflow",
         "workflow_id": "workflow_123456789",
         "update_type": "trigger",
         "trigger_type": "schedule",
         "schedule_config": "0 14 * * 1-5"
       }
    
    5. Update Workflow Steps:
       {
         "action": "update_workflow",
         "workflow_id": "workflow_123456789",
         "update_type": "steps",
         "step_operations": [
           {
             "operation": "add",
             "position": 2,
             "step_data": {
               "step_name": "Data Validation",
               "agent_id": "agent_validator_456",
               "task_instruction": "Validate incoming data for completeness and accuracy"
             }
           },
           {
             "operation": "update",
             "step_index": 0,
             "step_data": {
               "step_name": "Enhanced Email Monitoring",
               "task_instruction": "Monitor customer support inbox with advanced filtering"
             }
           }
         ]
       }
    
    6. Update Workflow Metadata:
       {
         "action": "update_workflow",
         "workflow_id": "workflow_123456789",
         "update_type": "metadata",
         "workflow_name": "💬 Enhanced Customer Support Automation",
         "description": "Improved automation with additional validation steps"
       }`;

    this.schema = z.object({
      action: z
        .enum(['retrieve_agent_details', 'create_workflow', 'update_workflow'])
        .describe('The action to perform'),

      // Agent details retrieval
      agent_id: z
        .string()
        .optional()
        .describe('Agent ID to retrieve details for (required for retrieve_agent_details action)'),

      // Complete workflow creation fields
      workflow_name: z
        .string()
        .optional()
        .describe('Name for the workflow (required for create_workflow action)'),

      trigger_type: z
        .enum(['manual', 'schedule', 'app'])
        .optional()
        .default('manual')
        .describe('How the workflow should be triggered'),

      schedule_config: z
        .string()
        .optional()
        .describe('Cron expression for scheduled workflows (e.g., "0 9 * * *" for daily at 9 AM)'),

      app_slug: z
        .string()
        .optional()
        .describe(
          'App slug for app-based triggers (e.g., "gmail", "slack") - required when trigger_type is "app"',
        ),

      trigger_key: z
        .string()
        .optional()
        .describe(
          'Specific trigger key within the app (e.g., "gmail-new-email-received") - required when trigger_type is "app"',
        ),

      trigger_config: z
        .record(z.any())
        .optional()
        .describe(
          'Configuration parameters specific to the trigger (e.g., {"labels": ["INBOX"], "filterBySender": "email@domain.com"})',
        ),

      pass_trigger_to_first_step: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'Whether to pass trigger output data to the first workflow step (useful for app triggers)',
        ),

      workflow_steps: z
        .array(
          z.object({
            step_name: z.string().describe('Human-readable name for this step'),
            agent_id: z.string().describe('ID of the agent that will execute this step'),
            task_instruction: z
              .string()
              .describe('Detailed instructions for what this agent should do in this step'),
          }),
        )
        .optional()
        .describe(
          'Array of workflow steps with agent assignments and instructions (required for create_workflow action)',
        ),

      // Workflow update fields
      workflow_id: z
        .string()
        .optional()
        .describe('ID of the workflow to update (required for update_workflow action)'),

      update_type: z
        .enum(['trigger', 'steps', 'metadata', 'batch'])
        .optional()
        .describe('Type of update to perform (required for update_workflow action)'),

      step_operations: z
        .array(
          z.object({
            operation: z
              .enum(['add', 'update', 'delete', 'reorder'])
              .describe('Operation to perform on the step'),
            step_index: z
              .number()
              .optional()
              .describe('Index of existing step to update/delete (0-based)'),
            position: z
              .number()
              .optional()
              .describe('Position to insert new step or move existing step to (0-based)'),
            step_data: z
              .object({
                step_name: z.string().optional().describe('Human-readable name for this step'),
                agent_id: z
                  .string()
                  .optional()
                  .describe('ID of the agent that will execute this step'),
                task_instruction: z
                  .string()
                  .optional()
                  .describe('Detailed instructions for what this agent should do in this step'),
              })
              .optional()
              .describe('Step data for add/update operations'),
          }),
        )
        .optional()
        .describe('Array of step operations to perform (required for steps update_type)'),

      description: z
        .string()
        .optional()
        .describe('Updated description for the workflow (for metadata updates)'),
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
        version: agent.version || 0,
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
   * Map user-provided trigger parameter names to frontend-expected parameter names
   * @param {string} appSlug - App slug (e.g., 'gmail', 'slack')
   * @param {Object} triggerConfig - User-provided trigger configuration
   * @returns {Object} Mapped trigger configuration with frontend-expected parameter names
   */
  mapTriggerParameters(appSlug, triggerConfig) {
    const mappedConfig = { ...triggerConfig };

    switch (appSlug) {
      case 'gmail':
        // Map Gmail-specific parameters to frontend expected names
        if (triggerConfig.from) {
          mappedConfig.fromEmail = triggerConfig.from;
          delete mappedConfig.from;
        }
        if (triggerConfig.filterBySender) {
          mappedConfig.fromEmail = triggerConfig.filterBySender;
          delete mappedConfig.filterBySender;
        }
        break;

      // Add mappings for other apps as needed
      case 'slack':
        // Future: Add Slack parameter mappings
        break;

      default:
        // No special mapping needed for other apps
        break;
    }

    return mappedConfig;
  }

  /**
   * Create trigger configuration based on trigger type
   * @param {string} triggerType - Type of trigger ('manual', 'schedule', or 'app')
   * @param {string} scheduleConfig - Cron expression for scheduled workflows
   * @param {string} appSlug - App slug for app-based triggers
   * @param {string} triggerKey - Specific trigger key within the app
   * @param {Object} triggerConfig - Configuration parameters specific to the trigger
   * @param {boolean} passTriggerToFirstStep - Whether to pass trigger output to first step
   * @returns {Object} Trigger configuration object
   */
  createTriggerConfig(
    triggerType,
    scheduleConfig,
    appSlug,
    triggerKey,
    triggerConfig,
    passTriggerToFirstStep,
  ) {
    const baseConfig = {
      type: triggerType || 'manual',
      config: {},
    };

    switch (triggerType) {
      case 'schedule':
        if (scheduleConfig) {
          baseConfig.config.schedule = scheduleConfig;
        }
        break;

      case 'app': {
        // Map user-provided parameter names to frontend-expected parameter names
        const mappedTriggerConfig = this.mapTriggerParameters(appSlug, triggerConfig || {});
        
        baseConfig.config = {
          appSlug,
          triggerKey,
          parameters: {
            ...mappedTriggerConfig,
            passTriggerToFirstStep: passTriggerToFirstStep ?? true,
          },
        };
        break;
      }

      case 'manual':
      default:
        // Manual triggers don't need additional config
        break;
    }

    return baseConfig;
  }

  /**
   * Create a complete workflow with multiple steps assigned to specific agents
   * @param {string} userId - User ID
   * @param {string} workflowName - Name for the workflow
   * @param {string} triggerType - How the workflow should be triggered ('manual', 'schedule', or 'app')
   * @param {string} scheduleConfig - Cron expression for scheduled workflows
   * @param {Array} workflowSteps - Array of step objects with agent assignments
   * @param {string} appSlug - App slug for app-based triggers (required when triggerType is 'app')
   * @param {string} triggerKey - Specific trigger key within the app (required when triggerType is 'app')
   * @param {Object} triggerConfig - Configuration parameters specific to the trigger
   * @param {boolean} passTriggerToFirstStep - Whether to pass trigger output to first step
   * @returns {Promise<Object>} Response with created workflow details
   */
  async createWorkflow(
    userId,
    workflowName,
    triggerType,
    scheduleConfig,
    workflowSteps,
    appSlug,
    triggerKey,
    triggerConfig,
    passTriggerToFirstStep,
  ) {
    try {
      // Validate required parameters
      if (!workflowName) {
        throw new Error('workflow_name is required for create_workflow action');
      }
      if (!workflowSteps || !Array.isArray(workflowSteps) || workflowSteps.length === 0) {
        throw new Error(
          'workflow_steps array is required and must contain at least one step for create_workflow action',
        );
      }

      // Get user's timezone for schedule conversion
      let userTimezone = 'UTC'; // Default to UTC
      try {
        const { User } = require('~/db/models');
        const user = await User.findById(userId).select('timezone').lean();
        if (user && user.timezone) {
          userTimezone = user.timezone;
          logger.debug(`[WorkflowTool] Using user timezone: ${userTimezone} for user ${userId}`);
        }
      } catch (error) {
        logger.warn(`[WorkflowTool] Could not get user timezone for ${userId}, using UTC:`, error);
      }

      // Convert schedule from user timezone to UTC if needed
      if (triggerType === 'schedule' && scheduleConfig && userTimezone !== 'UTC') {
        try {
          const { convertTimeToUTC } = require('~/server/services/Scheduler/utils/cronUtils');
          
          // Parse the cron expression (assumes format: minute hour day month weekday)
          const parts = scheduleConfig.trim().split(/\s+/);
          if (parts.length === 5) {
            const [minute, hour, day, month, weekday] = parts;
            
            // Only convert if hour and minute are specific values (not wildcards)
            if (hour !== '*' && minute !== '*' && !hour.includes('/') && !minute.includes('/')) {
              const hourNum = parseInt(hour);
              const minuteNum = parseInt(minute);
              
              if (!isNaN(hourNum) && !isNaN(minuteNum)) {
                // Convert to UTC using the same function as frontend
                const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hourNum, minuteNum, userTimezone);
                scheduleConfig = `${utcMinute} ${utcHour} ${day} ${month} ${weekday}`;
                
                logger.info(`[WorkflowTool] Converted schedule from ${userTimezone} to UTC: ${hour}:${minute} -> ${utcHour}:${utcMinute}`);
              }
            }
          }
        } catch (error) {
          logger.error(`[WorkflowTool] Error converting schedule to UTC:`, error);
          // Continue with original schedule if conversion fails
        }
      }

      // Track app connection status for messaging
      let isAppConnected = true;

      // Validate app trigger parameters
      if (triggerType === 'app') {
        if (!appSlug) {
          throw new Error('app_slug is required when trigger_type is "app"');
        }
        if (!triggerKey) {
          throw new Error('trigger_key is required when trigger_type is "app"');
        }

        // Check if user has active integration for this app
        const { UserIntegration } = require('~/models');
        const userIntegration = await UserIntegration.findOne({
          userId,
          appSlug,
          isActive: true,
        }).lean();

        // Store connection status for later messaging, but don't block workflow creation
        isAppConnected = !!userIntegration;

        // Validate trigger exists for this app
        try {
          const appComponents = await PipedreamComponents.getAppComponents(appSlug, 'triggers');

          const triggerExists = appComponents.triggers?.some(
            (trigger) => trigger.key === triggerKey,
          );
          if (!triggerExists) {
            throw new Error(`Trigger "${triggerKey}" not found for app "${appSlug}"`);
          }
        } catch (error) {
          throw new Error(`Failed to validate trigger: ${error.message}`);
        }
      }

      // Validate each workflow step
      for (let i = 0; i < workflowSteps.length; i++) {
        const step = workflowSteps[i];
        if (!step.step_name) {
          throw new Error(`Step ${i + 1} is missing step_name`);
        }
        if (!step.agent_id) {
          throw new Error(`Step ${i + 1} is missing agent_id`);
        }
        if (!step.task_instruction) {
          throw new Error(`Step ${i + 1} is missing task_instruction`);
        }

        // Verify that the agent exists and user has access
        const { getAgent } = require('~/models/Agent');
        const agent = await getAgent({ id: step.agent_id });
        if (!agent) {
          throw new Error(`Agent with ID ${step.agent_id} not found for step "${step.step_name}"`);
        }

        // Check access (same logic as retrieveAgentDetails)
        let hasAccess = false;
        if (agent.author.toString() === userId) {
          hasAccess = true;
        } else {
          try {
            const { getProjectByName } = require('~/models/Project');
            const { Constants } = require('librechat-data-provider');
            const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, [
              'agentIds',
            ]);
            if (
              globalProject &&
              globalProject.agentIds &&
              globalProject.agentIds.includes(step.agent_id)
            ) {
              hasAccess = true;
            }
          } catch (error) {
            // Continue with access denied
          }
        }

        if (!hasAccess) {
          throw new Error(
            `Access denied to agent ${step.agent_id} ("${agent.name}") for step "${step.step_name}"`,
          );
        }
      }

      logger.info(`[WorkflowTool] Creating complete workflow for user ${userId}`, {
        workflowName,
        triggerType,
        scheduleConfig,
        stepCount: workflowSteps.length,
      });

      // No need to get calling agent - we're creating steps with specified agents

      // Generate a unique workflow ID
      const workflowId = `workflow_${Date.now()}`;

      // Create all workflow steps from the provided array
      const createdSteps = workflowSteps.map((stepData, index) => ({
        id: `step_${Date.now()}_${index}`,
        name: stepData.step_name,
        type: 'mcp_agent_action',
        instruction: stepData.task_instruction,
        agent_id: stepData.agent_id,
      }));

      // Prepare workflow data for creation
      const workflowData = {
        id: workflowId,
        name: workflowName,
        trigger: this.createTriggerConfig(
          triggerType,
          scheduleConfig,
          appSlug,
          triggerKey,
          triggerConfig,
          passTriggerToFirstStep,
        ),
        steps: createdSteps,
        isActive: false, // Start inactive by default
        isDraft: false, // Mark as not draft since we're saving
        version: 1,
        conversation_id: this.conversationId, // Include the conversation ID (using underscore for consistency with WorkflowService)
        parent_message_id: this.parentMessageId, // Include the parent message ID to maintain conversation thread
      };

      // Create the workflow using WorkflowService
      try {
        const WorkflowService = require('~/server/services/Workflows/WorkflowService');
        const workflowService = new WorkflowService();
        const createdWorkflow = await workflowService.createWorkflow(workflowData, userId);

        logger.info(
          `[WorkflowTool] Successfully created workflow: ${createdWorkflow.id} (${createdWorkflow.name}) with ${createdSteps.length} steps`,
        );

        // Send SSE notification to trigger workflow builder opening with the created workflow ID
        try {
          const SchedulerService = require('~/server/services/Scheduler/SchedulerService');
          await SchedulerService.sendWorkflowStatusUpdate({
            userId: userId,
            workflowName: workflowName,
            workflowId: createdWorkflow.id,
            notificationType: 'open_workflow_builder_edit',
            details: `Created complete workflow "${workflowName}" with ${createdSteps.length} steps`,
            workflowData: {
              action: 'open_workflow_builder_edit',
              type: 'workflow_builder_panel',
              createdWorkflowId: createdWorkflow.id,
              conversationId: this.conversationId,
            },
          });
        } catch (notificationError) {
          logger.warn(`[WorkflowTool] Failed to send notification: ${notificationError.message}`);
          // Don't fail the operation if notification fails
        }

        // Create success message with connection guidance if needed
        let successMessage = `Complete workflow "${workflowName}" created successfully with ${createdSteps.length} steps`;
        if (triggerType === 'app' && !isAppConnected) {
          successMessage += `\n\n⚠️ Note: Your ${appSlug} account is not connected. To activate this workflow, please connect your ${appSlug} account by clicking on the app icon in the workflow builder or visiting the Apps section.`;
        }

        return {
          success: true,
          action: 'workflow_created',
          message: successMessage,
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
            stepDetails: createdSteps.map((step, index) => ({
              stepNumber: index + 1,
              stepName: step.name,
              agentId: step.agent_id,
              instruction: step.instruction,
            })),
          },
        };
      } catch (workflowCreationError) {
        logger.error(`[WorkflowTool] Failed to create workflow:`, workflowCreationError);
        throw new Error(`Failed to create workflow: ${workflowCreationError.message}`);
      }
    } catch (error) {
      logger.error(`[WorkflowTool] Error in createWorkflow:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update an existing workflow with various modification types
   * @param {string} userId - User ID
   * @param {string} workflowId - ID of the workflow to update
   * @param {string} updateType - Type of update ('trigger', 'steps', 'metadata', 'batch')
   * @param {Object} updateData - Update data specific to the update type
   * @returns {Promise<Object>} Response with updated workflow details
   */
  async updateWorkflow(userId, workflowId, updateType, updateData) {
    try {
      // Validate required parameters
      if (!workflowId) {
        throw new Error('workflow_id is required for update_workflow action');
      }
      if (!updateType) {
        throw new Error('update_type is required for update_workflow action');
      }

      // Get the existing workflow
      const WorkflowService = require('~/server/services/Workflows/WorkflowService');
      const workflowService = new WorkflowService();
      const existingWorkflow = await workflowService.getWorkflowById(workflowId, userId);

      if (!existingWorkflow) {
        throw new Error(`Workflow with ID ${workflowId} not found or access denied`);
      }

      logger.info(
        `[WorkflowTool] Updating workflow ${workflowId} with update type: ${updateType}`,
        { userId, workflowId, updateType },
      );

      // Prepare update object based on update type
      let workflowUpdate = {};

      switch (updateType) {
        case 'trigger':
          if (!updateData.trigger_type) {
            throw new Error('trigger_type is required for trigger updates');
          }

          // Validate app trigger parameters if needed
          if (updateData.trigger_type === 'app') {
            if (!updateData.app_slug) {
              throw new Error('app_slug is required when trigger_type is "app"');
            }
            if (!updateData.trigger_key) {
              throw new Error('trigger_key is required when trigger_type is "app"');
            }
          }

          workflowUpdate.trigger = this.createTriggerConfig(
            updateData.trigger_type,
            updateData.schedule_config,
            updateData.app_slug,
            updateData.trigger_key,
            updateData.trigger_config,
            updateData.pass_trigger_to_first_step,
          );
          break;

        case 'metadata':
          if (updateData.workflow_name) {
            workflowUpdate.name = updateData.workflow_name;
          }
          if (updateData.description) {
            workflowUpdate.description = updateData.description;
          }
          break;

        case 'steps': {
          if (!updateData.step_operations || !Array.isArray(updateData.step_operations)) {
            throw new Error('step_operations array is required for steps updates');
          }

          // Clone current steps to modify
          let updatedSteps = [...existingWorkflow.steps];

          // Process each step operation
          for (const operation of updateData.step_operations) {
            switch (operation.operation) {
              case 'add': {
                if (!operation.step_data) {
                  throw new Error('step_data is required for add operations');
                }

                // Validate agent access for new steps
                if (operation.step_data.agent_id) {
                  const { getAgent } = require('~/models/Agent');
                  const agent = await getAgent({ id: operation.step_data.agent_id });
                  if (!agent) {
                    throw new Error(`Agent with ID ${operation.step_data.agent_id} not found`);
                  }

                  // Check access (same logic as create workflow)
                  let hasAccess = false;
                  if (agent.author.toString() === userId) {
                    hasAccess = true;
                  } else {
                    try {
                      const { getProjectByName } = require('~/models/Project');
                      const { Constants } = require('librechat-data-provider');
                      const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, [
                        'agentIds',
                      ]);
                      if (
                        globalProject &&
                        globalProject.agentIds &&
                        globalProject.agentIds.includes(operation.step_data.agent_id)
                      ) {
                        hasAccess = true;
                      }
                    } catch (error) {
                      // Continue with access denied
                    }
                  }

                  if (!hasAccess) {
                    throw new Error(
                      `Access denied to agent ${operation.step_data.agent_id} ("${agent.name}")`,
                    );
                  }
                }

                const newStep = {
                  id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                  name: operation.step_data.step_name || `Step ${updatedSteps.length + 1}`,
                  type: 'mcp_agent_action',
                  instruction: operation.step_data.task_instruction,
                  agent_id: operation.step_data.agent_id,
                };

                const insertPosition =
                  operation.position !== undefined ? operation.position : updatedSteps.length;
                updatedSteps.splice(insertPosition, 0, newStep);
                break;
              }

              case 'update': {
                if (
                  operation.step_index === undefined ||
                  operation.step_index < 0 ||
                  operation.step_index >= updatedSteps.length
                ) {
                  throw new Error(
                    `Invalid step_index ${operation.step_index} for update operation`,
                  );
                }
                if (!operation.step_data) {
                  throw new Error('step_data is required for update operations');
                }

                const stepToUpdate = updatedSteps[operation.step_index];
                if (operation.step_data.step_name) {
                  stepToUpdate.name = operation.step_data.step_name;
                }
                if (operation.step_data.task_instruction) {
                  stepToUpdate.instruction = operation.step_data.task_instruction;
                }
                if (operation.step_data.agent_id) {
                  // Validate new agent access
                  const { getAgent } = require('~/models/Agent');
                  const agent = await getAgent({ id: operation.step_data.agent_id });
                  if (!agent) {
                    throw new Error(`Agent with ID ${operation.step_data.agent_id} not found`);
                  }
                  stepToUpdate.agent_id = operation.step_data.agent_id;
                }
                break;
              }

              case 'delete': {
                if (
                  operation.step_index === undefined ||
                  operation.step_index < 0 ||
                  operation.step_index >= updatedSteps.length
                ) {
                  throw new Error(
                    `Invalid step_index ${operation.step_index} for delete operation`,
                  );
                }
                updatedSteps.splice(operation.step_index, 1);
                break;
              }

              case 'reorder': {
                if (operation.step_index === undefined || operation.position === undefined) {
                  throw new Error(
                    'Both step_index and position are required for reorder operations',
                  );
                }
                if (operation.step_index < 0 || operation.step_index >= updatedSteps.length) {
                  throw new Error(
                    `Invalid step_index ${operation.step_index} for reorder operation`,
                  );
                }

                const [stepToMove] = updatedSteps.splice(operation.step_index, 1);
                updatedSteps.splice(operation.position, 0, stepToMove);
                break;
              }

              default:
                throw new Error(`Unknown step operation: ${operation.operation}`);
            }
          }

          workflowUpdate.steps = updatedSteps;
          break;
        }

        case 'batch':
          // Allow multiple update types in one operation
          if (updateData.trigger_type) {
            workflowUpdate.trigger = this.createTriggerConfig(
              updateData.trigger_type,
              updateData.schedule_config,
              updateData.app_slug,
              updateData.trigger_key,
              updateData.trigger_config,
              updateData.pass_trigger_to_first_step,
            );
          }
          if (updateData.workflow_name) {
            workflowUpdate.name = updateData.workflow_name;
          }
          if (updateData.description) {
            workflowUpdate.description = updateData.description;
          }
          // Note: step operations for batch updates would need additional handling
          break;

        default:
          throw new Error(`Unknown update_type: ${updateType}`);
      }

      // Perform the workflow update
      try {
        const updatedWorkflow = await workflowService.updateWorkflow(
          workflowId,
          userId,
          workflowUpdate,
        );

        logger.info(
          `[WorkflowTool] Successfully updated workflow: ${updatedWorkflow.id} (${updatedWorkflow.name})`,
        );

        // Send SSE notification about the update
        try {
          const SchedulerService = require('~/server/services/Scheduler/SchedulerService');
          await SchedulerService.sendWorkflowStatusUpdate({
            userId: userId,
            workflowName: updatedWorkflow.name,
            workflowId: updatedWorkflow.id,
            notificationType: 'workflow_updated',
            details: `Workflow "${updatedWorkflow.name}" updated successfully`,
            workflowData: {
              action: 'workflow_updated',
              type: 'workflow_update',
              workflowId: updatedWorkflow.id,
              updateType: updateType,
            },
          });
        } catch (notificationError) {
          logger.warn(
            `[WorkflowTool] Failed to send update notification: ${notificationError.message}`,
          );
          // Don't fail the operation if notification fails
        }

        return {
          success: true,
          action: 'workflow_updated',
          message: `Workflow "${updatedWorkflow.name}" updated successfully`,
          data: {
            workflowId: updatedWorkflow.id,
            updateType: updateType,
            workflow: {
              id: updatedWorkflow.id,
              name: updatedWorkflow.name,
              trigger: updatedWorkflow.trigger,
              steps: updatedWorkflow.steps,
              isActive: updatedWorkflow.isActive,
              isDraft: updatedWorkflow.isDraft,
              description: updatedWorkflow.description,
            },
          },
        };
      } catch (workflowUpdateError) {
        logger.error(`[WorkflowTool] Failed to update workflow:`, workflowUpdateError);
        throw new Error(`Failed to update workflow: ${workflowUpdateError.message}`);
      }
    } catch (error) {
      logger.error(`[WorkflowTool] Error in updateWorkflow:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async _call(input) {
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

        case 'create_workflow':
          return await this.createWorkflow(
            userId,
            data.workflow_name,
            data.trigger_type,
            data.schedule_config,
            data.workflow_steps,
            data.app_slug,
            data.trigger_key,
            data.trigger_config,
            data.pass_trigger_to_first_step,
          );

        case 'update_workflow':
          return await this.updateWorkflow(userId, data.workflow_id, data.update_type, data);

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
