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
    
    ⚡ ENHANCED CREATION APPROACH ⚡
    When creating workflows, follow the Enhanced Creation Process:
    1. RESEARCH: Always start with get_available_tools to understand capabilities
    2. TEST: Test each planned step individually before creating the workflow  
    3. VALIDATE: Ensure data flow between steps works correctly
    4. CREATE: Only create workflows after thorough testing and validation
    
    Available actions:
    - get_available_tools: Get available MCP tools and Pipedream actions for workflow creation (START HERE)
    - create_workflow: Create a new workflow with steps and triggers (ONLY AFTER TESTING)
    - list_workflows: List all user's workflows
    - get_workflow: Get details of a specific workflow
    - update_workflow: Update an existing workflow (supports intelligent step merging)
    - delete_workflow: Delete a workflow
    - activate_workflow: Activate a workflow for execution
    - deactivate_workflow: Deactivate a workflow
    - test_workflow: Execute a workflow once for testing
    - validate_workflow_design: Validate a workflow design before creation (NEW)

    ENHANCED CREATION WORKFLOW EXAMPLE:
    
    User: "Send my Strava data to my coach daily"
    
    Step 1: Call get_available_tools to see what's available
    Step 2: Test STRAVA-GET-ACTIVITIES to understand the data format
    Step 3: Test MICROSOFT_OUTLOOK-SEND-EMAIL with sample data
    Step 4: Validate that Strava data can be used in email content
    Step 5: Create workflow with tested and validated parameters
    
    This approach ensures high-quality, working workflows from day one.

    CRITICAL REQUIREMENT FOR ALL WORKFLOW UPDATES
    
    WHENEVER YOU UPDATE A WORKFLOW, YOU MUST INCLUDE THE 'description' FIELD!
    
    The description field is REQUIRED for ALL update_workflow calls and must reflect:
    - Current schedule timing (daily, hourly, every 5 minutes, etc.)
    - What actions the workflow performs
    - Who receives emails or notifications
    - Any filtering or processing logic
    
    WRONG - Missing description update:
    {
      "action": "update_workflow",
      "workflow_id": "workflow_123",
      "trigger": {"type": "schedule", "config": {"schedule": "*/5 * * * *"}}
    }
    
    CORRECT - With description update:
    {
      "action": "update_workflow", 
      "workflow_id": "workflow_123",
      "description": "Every 5 minutes fetch Strava activity and email coach",
      "trigger": {"type": "schedule", "config": {"schedule": "*/5 * * * *"}}
    }

    CRITICAL: WORKFLOW STEPS MUST BE CONNECTED!
    
    Every workflow step (except the final one) MUST have an "onSuccess" property pointing to the next step ID.
    This creates the execution flow: step1 -> step2 -> step3 -> etc.
    
    CORRECT STEP WITH CONNECTION:
    {
      "id": "step_1",
      "name": "Get Data", 
      "type": "mcp_agent_action",
      "config": {...},
      "onSuccess": "step_2",  // ← REQUIRED: Points to next step
      "position": {"x": 100, "y": 100}
    }
    
    WRONG: MISSING CONNECTION:
    {
      "id": "step_1", 
      "name": "Get Data",
      "type": "mcp_agent_action",
      "config": {...},
      // Missing onSuccess - step will be orphaned!
      "position": {"x": 100, "y": 100}
    }
    
    NOTE: The system will auto-connect steps in sequence if no connections are provided,
    but it's better to be explicit about the intended flow.

    CRITICAL: EXTRACT AND PRESERVE USER-SPECIFIC DETAILS
    
    When users provide specific information in their requests, you MUST extract and store these details in the workflow step configurations:
    
    EXTRACT THESE DETAILS:
    - Email addresses and recipients
    - Subject lines and content templates
    - Specific parameters and filters
    - Names, usernames, and identifiers
    - Time schedules and frequencies
    - File paths and locations
    - API endpoints and configurations
    
    DO NOT CREATE GENERIC PLACEHOLDERS:
    - Don't use "coach@example.com" when user says "michiel.voortman@hotmail.com"
    - Don't use "Recent Activity Update" when user wants specific content
    - Don't use generic parameters when user provides specific ones

    INTELLIGENT WORKFLOW UPDATES:
    
    The update_workflow action now supports intelligent step merging:
    
    1. MERGE MODE (default): Preserves existing steps and updates/adds provided steps
       - Provide only the steps you want to modify or add
       - Existing steps with different IDs remain unchanged
       - Steps with matching IDs get updated
       
       Example - Update just one step:
       {
         "action": "update_workflow",
         "workflow_id": "workflow_123",
         "steps": [
           {
             "id": "step_2",
             "name": "Updated Step Name",
             "type": "mcp_agent_action",
             "config": {"toolName": "NEW-TOOL"},
             "position": {"x": 100, "y": 200}
           }
         ]
       }
    
    2. REPLACE MODE: Completely replaces all workflow steps
       - Use when you want to replace the entire workflow structure
       - Set "update_mode": "replace" to explicitly replace all steps
       
       Example - Replace all steps:
       {
         "action": "update_workflow", 
         "workflow_id": "workflow_123",
         "update_mode": "replace",
         "steps": [...] // All new steps
       }

    CRITICAL: ALWAYS UPDATE DESCRIPTION TO MATCH CHANGES!
    
    When updating workflows, you MUST also update the description to accurately reflect the changes made.
    This is especially important for:
    
    SCHEDULE CHANGES:
    - User changes trigger from "daily at 9 AM" to "every minute"
    - OLD: "Daily at 9 AM fetch activity and email [name]"
    - NEW: "Every minute fetch activity and email [name]"
    
    STEP MODIFICATIONS:
    - User adds email filtering step
    - OLD: "Fetch activity and email [name]"
    - NEW: "Fetch activity, filter by running activities, and email [name]"
    
    RECIPIENT CHANGES:
    - User changes email recipient
    - OLD: "Send activity summary to [name]@[domain]"
    - NEW: "Send activity summary to [name]@[domain]"
    
    SCHEDULE TRIGGER CONFIGURATION:
    
    All schedule triggers use UTC-based cron expressions for consistency.
    Use this exact format:
    {
      "trigger": {
        "type": "schedule",
        "config": {
          "schedule": "*/1 * * * *"  // ← Use 'schedule' field, not 'cron'
        }
      }
    }
    
    Common cron expressions (UTC-based):
    - "*/1 * * * *" = Every minute
    - "*/5 * * * *" = Every 5 minutes  
    - "0 9 * * *" = Daily at 9 AM UTC
    - "0 14 * * *" = Daily at 2 PM UTC
    - "0 */6 * * *" = Every 6 hours
    - "0 * * * *" = Every hour
    
    SCHEDULE EXTRACTION FROM DESCRIPTIONS:
    
    When users describe schedules in natural language, the system will extract
    UTC-based cron expressions automatically. Common patterns:
    - "daily at 9 AM" → "0 9 * * *" (9 AM UTC)
    - "every 5 minutes" → "*/5 * * * *"
    - "every hour" → "0 * * * *"
    - "every morning" → "0 9 * * *" (9 AM UTC)
    
    COMPLETE UPDATE EXAMPLE:
    
    User request: "Change the workflow to run every 5 minutes instead of daily"
    
    Correct update with description change:
    {
      "action": "update_workflow",
      "workflow_id": "workflow_123",
      "description": "Every 5 minutes fetch the most recent Strava activity, summarize duration and distance, and send an email to running coach Michiel.",
      "trigger": {
        "type": "schedule", 
        "config": {
          "schedule": "*/5 * * * *"
        }
      }
       }

    WORKFLOW STEP TYPE: MCP_AGENT_ACTION ONLY
    
    ALL workflow steps MUST be of type "mcp_agent_action". This is the only supported step type.
    Each step will be executed using a fresh agent instance with MCP tools.
    
    STEP CONFIGURATION PATTERNS WITH REAL USER DATA:
    
    CRITICAL: ALL WORKFLOW STEPS MUST BE CONNECTED!
    Every step (except the last one) MUST have onSuccess pointing to the next step.
    Use onFailure for error handling steps if needed.
    
    1. EMAIL STEPS - Extract ALL email details from user request:
       {
         "id": "step_2",
         "name": "Send Email to Coach",
         "type": "mcp_agent_action",
         "config": {
           "toolName": "MICROSOFT_OUTLOOK-SEND-EMAIL",
           "parameters": {
             "recipient": "[name]@[domain]",
             "subject": "Activity Update - [Date]",
             "contentTemplate": "Detailed activity information including duration, distance, and performance metrics",
             "recipientName": "[name]"
           },
           "instruction": "Send detailed activity update email to coach with specified recipient and content"
         },
         "onSuccess": "step_3",  // REQUIRED: Connect to next step
         "position": {"x": 300, "y": 100}
       }
    
    2. DATA RETRIEVAL STEPS - Include specific filters and parameters:
       {
         "id": "step_1", 
         "name": "Get Recent Activity Data",
         "type": "mcp_agent_action",
         "config": {
           "toolName": "DATA-GET-ACTIVITY-LIST",
           "parameters": {
             "limit": 1,
             "activityType": "all",
             "includeDetails": true
           },
           "instruction": "Retrieve the most recent activity with full details"
         },
         "onSuccess": "step_2",  // REQUIRED: Connect to next step
         "position": {"x": 100, "y": 100}
       }
    
    3. CONTENT PROCESSING STEPS - Define specific output formats:
       {
         "id": "step_3",
         "name": "Format Activity Summary", 
         "type": "mcp_agent_action",
         "config": {
           "outputFormat": "summary",
           "includeFields": ["duration", "distance", "activity_type"],
           "instruction": "Create concise summary with duration and distance only"
         },
         "position": {"x": 200, "y": 100}
       }

    EXAMPLE: Complete Connected Email Workflow
    
    User request: "Send activity update to coach@training.com with detailed analysis"
    
    Correct workflow configuration with proper connections:
    {
      "steps": [
        {
          "id": "step_1",
          "name": "Get Recent Activity",
          "type": "mcp_agent_action", 
          "config": {
            "toolName": "ACTIVITY-GET-RECENT",
            "parameters": {"limit": 1, "includeMetrics": true},
            "instruction": "Fetch most recent activity with full metrics"
          },
          "onSuccess": "step_2",  // ← CONNECT TO NEXT STEP
          "position": {"x": 100, "y": 100}
        },
        {
          "id": "step_2",
          "name": "Format Activity Data",
          "type": "mcp_agent_action",
          "config": {
            "toolName": "FORMAT-DATA",
            "parameters": {"template": "Duration: {{duration}}, Distance: {{distance}}"},
            "instruction": "Format the activity data"
          },
          "onSuccess": "step_3",  // ← CONNECT TO NEXT STEP
          "position": {"x": 300, "y": 100}
        },
        {
          "id": "step_3",
          "name": "Send Email to Coach",
          "type": "mcp_agent_action",
          "config": {
            "toolName": "MICROSOFT_OUTLOOK-SEND-EMAIL",
            "parameters": {
              "recipient": "[name]@[domain]",
              "subject": "Activity Analysis - {{activity.date}}",
              "contentTemplate": "Here's the activity analysis: {{formatted_data}}"
            },
            "instruction": "Send comprehensive activity analysis to coach"
          },
          // ← NO onSuccess needed for final step
          "position": {"x": 500, "y": 100}
        }
      ]
    }

    CRITICAL STEP CONFIGURATION REQUIREMENTS:
    
    1. ALL STEPS MUST HAVE:
       - id: unique identifier (required)
       - name: descriptive name (required)
       - type: "mcp_agent_action" (required, only supported type)
       - config: configuration object (required, can be empty {})
       - position: {x: number, y: number} (required)
       - onSuccess: next step ID (required for all steps except the last one)
    
    2. STEP CONNECTIONS ARE CRITICAL:
       - Each step must connect to the next: "onSuccess": "next_step_id"
       - Final step should NOT have onSuccess (workflow ends there)
       - Use onFailure for error handling paths (optional)
    
    3. ERROR/SUCCESS HANDLING STEPS:
       Even handler steps need proper config and connections:
       {
         "id": "error_step",
         "name": "Error Handler", 
         "type": "mcp_agent_action",
         "config": {
           "instruction": "Log error and optionally notify user",
           "notificationEnabled": false
         },
         "onSuccess": "cleanup_step",  // Connect to next step or omit if final
         "position": {x: 350, y: 300}
       }
    
    IMPORTANT WORKFLOW CREATION SAFETY:
      - ALWAYS create workflows as DRAFTS (isDraft: true, isActive: false) by default
      - DO NOT automatically test or activate workflows unless the user EXPLICITLY requests it
      - Use create_workflow action to create the workflow structure only
      - Only use test_workflow action if user specifically asks to "test" the workflow
      - Only use activate_workflow action if user specifically asks to "activate" or "enable" the workflow
      - Let the user decide when they want to test or activate their workflow
      
    PARAMETER EXTRACTION CHECKLIST:
    Did you extract all email addresses mentioned by the user?
    Did you preserve all specific names and identifiers?
    Did you capture the intended content and formatting requirements?
    Did you include all filters, limits, and data requirements?
    Are the step configurations complete and executable?`;

    
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
        // 'get_available_tools', // COMMENTED OUT: Not needed with current architecture (tools available via system prompt variables)
        'validate_workflow_design'
      ]).describe('The action to perform'),
      
      // Workflow creation/update fields
      name: z.string().optional()
        .describe('Name of the workflow (required for create_workflow)'),
      description: z.string().optional()
        .describe('CRITICAL: Description of the workflow. For update_workflow actions, this field is MANDATORY and must be updated to reflect any changes made (schedule timing, step modifications, recipient changes, etc.). NEVER skip this field when updating workflows!'),
      trigger: z.object({
        type: z.enum(['manual', 'schedule', 'webhook', 'email', 'event']),
        config: z.record(z.unknown()).optional(),
      }).optional()
        .describe('Workflow trigger configuration'),
      steps: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(['mcp_agent_action']),
        config: z.record(z.unknown()),
        onSuccess: z.string().optional(),
        onFailure: z.string().optional(),
        position: z.object({
          x: z.number(),
          y: z.number(),
        }),
      })).optional()
        .describe('Array of workflow steps. All steps must be type "mcp_agent_action". For updates: provide only the steps you want to add/modify to preserve existing steps, or provide all steps to replace completely'),
      
      // Workflow management fields
      workflow_id: z.string().optional()
        .describe('Workflow ID for get, update, delete, activate, deactivate, test actions'),
      
      // Update-specific options
      update_mode: z.enum(['merge', 'replace']).optional()
        .describe('How to handle step updates: "merge" (default) preserves existing steps and updates provided ones, "replace" replaces all steps'),
      
      // Validation-specific fields
      workflow_design: z.object({
        name: z.string(),
        description: z.string().optional(),
        trigger: z.object({
          type: z.enum(['manual', 'schedule', 'webhook', 'email', 'event']),
          config: z.record(z.unknown()).optional(),
        }),
        steps: z.array(z.object({
          id: z.string(),
          name: z.string(),
          type: z.enum(['mcp_agent_action']),
          config: z.record(z.unknown()),
          onSuccess: z.string().optional(),
          onFailure: z.string().optional(),
          position: z.object({
            x: z.number(),
            y: z.number(),
          }),
        })),
      }).optional()
        .describe('Workflow design to validate (required for validate_workflow_design action)'),
    });
  }

  async getAvailableTools(userId) {
    try {
      // Get MCP tools via MCPInitializer (same pattern as WorkflowExecutor)
      const MCPInitializer = require('~/server/services/MCPInitializer');
      const mcpInitializer = MCPInitializer.getInstance();
      
      const availableTools = {};
      const mcpResult = await mcpInitializer.ensureUserMCPReady(
        userId, 
        'WorkflowTool',
        availableTools
      );
      
      // Extract MCP tools from availableTools registry
      let mcpTools = [];
      if (mcpResult.success && availableTools) {
        const toolKeys = Object.keys(availableTools);
        for (const toolKey of toolKeys) {
          const tool = availableTools[toolKey];
          if (tool && typeof tool === 'object' && tool.function && toolKey.includes(Constants.mcp_delimiter)) {
            const parts = toolKey.split(Constants.mcp_delimiter);
            const serverName = parts.length > 1 ? parts[1] : 'unknown';
            
            mcpTools.push({
              name: tool.function.name,
              description: tool.function.description || 'No description available',
              parameters: tool.function.parameters || {},
              type: 'mcp_tool',
              serverName: serverName,
              toolKey: toolKey, // Store the full toolKey for filtering
            });
          }
        }
      }

      // Filter MCP tools based on agent context if we're in an agent workflow
      if (this.endpoint === 'agents' && this.model && mcpTools.length > 0) {
        try {
          // In agent context, this.model is the agent_id
          const { getAgent } = require('~/models/Agent');
          const agent = await getAgent({ id: this.model });
          
          if (agent && agent.tools && Array.isArray(agent.tools)) {
            // Filter MCP tools to only include those selected for this agent
            const agentToolSet = new Set(agent.tools);
            mcpTools = mcpTools.filter(tool => {
              // Check if the full toolKey is in the agent's tools
              return agentToolSet.has(tool.toolKey);
            });
            
            logger.info(`[WorkflowTool] Filtered MCP tools for agent ${this.model}: ${mcpTools.length} tools (from ${agent.tools.filter(t => t.includes('_mcp_')).length} agent MCP tools)`);
          } else {
            logger.warn(`[WorkflowTool] Agent ${this.model} not found or has no tools, returning all MCP tools`);
          }
        } catch (error) {
          logger.warn(`[WorkflowTool] Failed to get agent tools for filtering: ${error.message}, returning all MCP tools`);
        }
      }
      
      // Get Pipedream integrations
      const integrations = await PipedreamUserIntegrations.getUserIntegrations(userId);
      
      // Format available tools
      const formattedTools = {
        mcpTools,
        pipedreamActions: integrations.map(integration => ({
          name: integration.appName,
          slug: integration.appSlug,
          description: integration.appDescription,
          type: 'pipedream_action',
          categories: integration.appCategories,
        })),
      };

      logger.info(`[WorkflowTool] Retrieved tools for user ${userId}: ${mcpTools.length} MCP tools, ${integrations.length} Pipedream integrations`);

      return {
        success: true,
        message: `Found ${formattedTools.mcpTools.length} MCP tools and ${formattedTools.pipedreamActions.length} Pipedream integrations`,
        tools: formattedTools,
        mcpResult: {
          success: mcpResult.success,
          serverCount: mcpResult.serverCount,
          toolCount: mcpResult.toolCount,
        }
      };
    } catch (error) {
      logger.error('[WorkflowTool] Error getting available tools:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate a workflow design before creation
   * @param {Object} workflowDesign - The workflow design to validate
   * @param {string} userId - User ID for context
   * @returns {Promise<Object>} Validation result
   */
  async validateWorkflowDesign(workflowDesign, userId) {
    try {
      logger.info(`[WorkflowTool] Validating workflow design for user ${userId}`);
      
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        toolValidation: {},
      };

      // Basic structure validation
      if (!workflowDesign.name) {
        validation.errors.push('Workflow name is required');
        validation.isValid = false;
      }

      if (!workflowDesign.trigger) {
        validation.errors.push('Workflow trigger is required');
        validation.isValid = false;
      }

      if (!workflowDesign.steps || !Array.isArray(workflowDesign.steps) || workflowDesign.steps.length === 0) {
        validation.errors.push('Workflow must have at least one step');
        validation.isValid = false;
      }

      // Step validation
      if (workflowDesign.steps) {
        const stepIds = new Set();
        
        for (let i = 0; i < workflowDesign.steps.length; i++) {
          const step = workflowDesign.steps[i];
          const stepIndex = i + 1;

          // Check for duplicate step IDs
          if (stepIds.has(step.id)) {
            validation.errors.push(`Step ${stepIndex}: Duplicate step ID '${step.id}'`);
            validation.isValid = false;
          } else {
            stepIds.add(step.id);
          }

          // Required fields
          if (!step.id) {
            validation.errors.push(`Step ${stepIndex}: Missing step ID`);
            validation.isValid = false;
          }

          if (!step.name) {
            validation.errors.push(`Step ${stepIndex}: Missing step name`);
            validation.isValid = false;
          }

          if (!step.type) {
            validation.errors.push(`Step ${stepIndex}: Missing step type`);
            validation.isValid = false;
          } else if (step.type !== 'mcp_agent_action') {
            validation.errors.push(`Step ${stepIndex}: Invalid step type '${step.type}'. Only 'mcp_agent_action' is supported.`);
            validation.isValid = false;
          }

          // Tool validation
          if (step.config?.toolName) {
            validation.toolValidation[step.id] = await this.validateStepTool(step, userId);
            
            if (!validation.toolValidation[step.id].exists) {
              validation.warnings.push(`Step ${stepIndex}: Tool '${step.config.toolName}' not found in available tools`);
            }
          }

          // Connection validation
          if (step.onSuccess && !stepIds.has(step.onSuccess)) {
            // Check if this references a step that comes later
            const referencedStep = workflowDesign.steps.find(s => s.id === step.onSuccess);
            if (!referencedStep) {
              validation.errors.push(`Step ${stepIndex}: onSuccess references non-existent step '${step.onSuccess}'`);
              validation.isValid = false;
            }
          }

          if (step.onFailure && !stepIds.has(step.onFailure)) {
            const referencedStep = workflowDesign.steps.find(s => s.id === step.onFailure);
            if (!referencedStep) {
              validation.errors.push(`Step ${stepIndex}: onFailure references non-existent step '${step.onFailure}'`);
              validation.isValid = false;
            }
          }
        }

        // Connection flow validation
        const flowValidation = this.validateWorkflowFlow(workflowDesign.steps);
        validation.warnings.push(...flowValidation.warnings);
        validation.suggestions.push(...flowValidation.suggestions);
      }

      // Schedule validation for schedule triggers
      if (workflowDesign.trigger?.type === 'schedule') {
        try {
          const { calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils');
          const scheduleConfig = workflowDesign.trigger.config?.schedule;
          
          if (!scheduleConfig) {
            validation.errors.push('Schedule trigger requires a schedule configuration');
            validation.isValid = false;
          } else {
            const nextRun = calculateNextRun(scheduleConfig);
            if (!nextRun) {
              validation.errors.push(`Invalid schedule configuration: ${scheduleConfig}`);
              validation.isValid = false;
            } else {
              validation.suggestions.push(`Schedule validated: Next run would be ${nextRun.toISOString()}`);
            }
          }
        } catch (error) {
          validation.warnings.push(`Could not validate schedule: ${error.message}`);
        }
      }

      // General suggestions
      if (validation.isValid) {
        validation.suggestions.push('Workflow design structure is valid');
        validation.suggestions.push('Consider testing each step individually before creating the workflow');
        
        if (workflowDesign.steps.some(step => step.config?.toolName?.includes('EMAIL'))) {
          validation.suggestions.push('Email steps detected: Ensure recipient addresses are correct and test email delivery');
        }
      }

      logger.info(`[WorkflowTool] Workflow validation completed: ${validation.isValid ? 'VALID' : 'INVALID'}, ${validation.errors.length} errors, ${validation.warnings.length} warnings`);

      return {
        success: true,
        validation,
        message: validation.isValid ? 
          'Workflow design is valid and ready for creation' : 
          `Workflow design has ${validation.errors.length} validation errors that must be fixed`
      };
    } catch (error) {
      logger.error('[WorkflowTool] Error validating workflow design:', error);
      return {
        success: false,
        error: error.message,
        validation: {
          isValid: false,
          errors: [`Validation error: ${error.message}`],
          warnings: [],
          suggestions: [],
        }
      };
    }
  }

  /**
   * Validate if a tool used in a step exists and is available
   * @param {Object} step - Workflow step
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Tool validation result
   */
  async validateStepTool(step, userId) {
    try {
      const toolName = step.config?.toolName;
      if (!toolName) {
        return { exists: false, reason: 'No toolName specified' };
      }

      // Get available tools
      const toolsResult = await this.getAvailableTools(userId);
      if (!toolsResult.success) {
        return { exists: false, reason: 'Could not retrieve available tools' };
      }

      // Check if tool exists in MCP tools
      const mcpTool = toolsResult.tools.mcpTools.find(tool => tool.name === toolName);
      if (mcpTool) {
        return { 
          exists: true, 
          type: 'mcp_tool', 
          tool: mcpTool,
          reason: `Found MCP tool '${toolName}' in server '${mcpTool.serverName}'`
        };
      }

      // Check if tool exists in Pipedream actions
      const pipedreamAction = toolsResult.tools.pipedreamActions.find(action => 
        action.name === toolName || action.slug === toolName
      );
      if (pipedreamAction) {
        return { 
          exists: true, 
          type: 'pipedream_action', 
          tool: pipedreamAction,
          reason: `Found Pipedream action '${toolName}'`
        };
      }

      return { 
        exists: false, 
        reason: `Tool '${toolName}' not found in available MCP tools or Pipedream actions` 
      };
    } catch (error) {
      return { 
        exists: false, 
        reason: `Error validating tool: ${error.message}` 
      };
    }
  }

  /**
   * Validate workflow execution flow
   * @param {Array} steps - Workflow steps
   * @returns {Object} Flow validation result
   */
  validateWorkflowFlow(steps) {
    const warnings = [];
    const suggestions = [];
    
    if (!steps || steps.length === 0) {
      return { warnings, suggestions };
    }

    // Find steps that are not referenced by other steps (potential entry points)
    const referencedSteps = new Set();
    steps.forEach(step => {
      if (step.onSuccess) referencedSteps.add(step.onSuccess);
      if (step.onFailure) referencedSteps.add(step.onFailure);
    });

    const entryPoints = steps.filter(step => !referencedSteps.has(step.id));
    const exitPoints = steps.filter(step => !step.onSuccess && !step.onFailure);

    if (entryPoints.length === 0) {
      warnings.push('No entry point found - all steps are referenced by other steps (circular flow?)');
    } else if (entryPoints.length > 1) {
      warnings.push(`Multiple entry points found: ${entryPoints.map(s => s.id).join(', ')} - workflow may have disconnected branches`);
    } else {
      suggestions.push(`Entry point: ${entryPoints[0].id} (${entryPoints[0].name})`);
    }

    if (exitPoints.length === 0) {
      warnings.push('No exit point found - workflow may run indefinitely');
    } else if (exitPoints.length > 1) {
      suggestions.push(`Multiple exit points: ${exitPoints.map(s => s.id).join(', ')}`);
    } else {
      suggestions.push(`Exit point: ${exitPoints[0].id} (${exitPoints[0].name})`);
    }

    return { warnings, suggestions };
  }

  /**
   * Auto-fix step connections to ensure all references point to existing steps
   * @param {Array} steps - Array of workflow steps
   * @returns {Array} Steps with fixed connections
   */
  autoFixStepConnections(steps) {
    if (!steps || steps.length === 0) return steps;

    const stepIds = new Set(steps.map(step => step.id));
    const fixedSteps = steps.map(step => {
      const fixedStep = { ...step };

      // Fix onSuccess references
      if (step.onSuccess && !stepIds.has(step.onSuccess)) {
        logger.warn(`[WorkflowTool] Fixing invalid onSuccess reference: ${step.onSuccess} -> removing reference`);
        delete fixedStep.onSuccess;
      }

      // Fix onFailure references  
      if (step.onFailure && !stepIds.has(step.onFailure)) {
        logger.warn(`[WorkflowTool] Fixing invalid onFailure reference: ${step.onFailure} -> removing reference`);
        delete fixedStep.onFailure;
      }

      return fixedStep;
    });

    // Auto-connect steps if they're not connected
    const connectedSteps = this.autoConnectSteps(fixedSteps);

    return this.fixStepValidation(connectedSteps);
  }

  /**
   * Fix common step validation issues
   * @param {Array} steps - Array of workflow steps
   * @returns {Array} Steps with validation fixes
   */
  fixStepValidation(steps) {
    if (!steps || steps.length === 0) return steps;

    return steps.map(step => {
      const fixedStep = { ...step };

      // Ensure config field exists (required by schema)
      if (!fixedStep.config) {
        fixedStep.config = {};
        logger.warn(`[WorkflowTool] Added missing config field to step: ${step.id}`);
      }

      // Ensure type field exists and is valid
      if (!fixedStep.type) {
        fixedStep.type = 'mcp_agent_action'; // Default to mcp_agent_action
        logger.warn(`[WorkflowTool] Added missing type field to step: ${step.id}, defaulting to 'mcp_agent_action'`);
      }

      const validTypes = ['mcp_agent_action'];
      if (!validTypes.includes(fixedStep.type)) {
        fixedStep.type = 'mcp_agent_action';
        logger.warn(`[WorkflowTool] Fixed invalid step type for step: ${step.id}, changed to 'mcp_agent_action'`);
      }

      // Fix common parameter structure issues
      if (fixedStep.config.parameters && typeof fixedStep.config.parameters === 'object') {
        fixedStep.config = this.fixParameterStructure(fixedStep.config, step.name);
      }

      // Ensure position exists
      if (!fixedStep.position || typeof fixedStep.position.x !== 'number' || typeof fixedStep.position.y !== 'number') {
        fixedStep.position = { x: 100, y: 100 }; // Default position
        logger.warn(`[WorkflowTool] Added missing/invalid position to step: ${step.id}`);
      }

      return fixedStep;
    });
  }

  /**
   * Fix parameter structure issues in step config
   * @param {Object} config - Step configuration
   * @param {string} stepName - Step name for context
   * @returns {Object} Fixed configuration
   */
  fixParameterStructure(config, stepName) {
    const fixedConfig = { ...config };

    // If instruction contains key=value pairs, try to parse them into parameters
    if (fixedConfig.parameters && fixedConfig.parameters.instruction) {
      try {
        const instructionValue = fixedConfig.parameters.instruction;
        
        // Check if instruction contains key=value patterns
        if (typeof instructionValue === 'string') {
          const keyValueMatches = instructionValue.match(/(\w+)=([^,\s]+)/g);
          
          if (keyValueMatches && keyValueMatches.length > 0) {
            logger.info(`[WorkflowTool] Found ${keyValueMatches.length} key=value pairs in instruction for step: ${stepName}`);
            
            // Parse key=value pairs and add to parameters
            keyValueMatches.forEach(match => {
              const [key, value] = match.split('=');
              if (key && value) {
                // Try to parse numbers
                const numValue = Number(value);
                fixedConfig.parameters[key] = isNaN(numValue) ? value : numValue;
                logger.debug(`[WorkflowTool] Extracted parameter ${key}=${fixedConfig.parameters[key]} from instruction`);
              }
            });
            
            // Clean up instruction to remove the extracted parameters
            let cleanInstruction = instructionValue;
            keyValueMatches.forEach(match => {
              cleanInstruction = cleanInstruction.replace(match, '').trim();
            });
            
            // Update instruction or remove if empty
            if (cleanInstruction.length > 0) {
              fixedConfig.parameters.instruction = cleanInstruction.replace(/^[,\s]+|[,\s]+$/g, '').trim();
            } else {
              // Remove empty instruction but keep extracted parameters
              delete fixedConfig.parameters.instruction;
            }
          }
          
          // Check if instruction is a JSON string
          else if (instructionValue.trim().startsWith('{') || instructionValue.trim().startsWith('[')) {
            const parsedInstruction = JSON.parse(instructionValue);
            
            // If it's an object, merge it into config
            if (typeof parsedInstruction === 'object' && parsedInstruction !== null) {
              // Move the parsed JSON to toolParameters
              if (!fixedConfig.toolParameters) {
                fixedConfig.toolParameters = parsedInstruction;
              }
              
              // Keep a simpler instruction
              fixedConfig.parameters.instruction = `Execute ${config.toolName || 'tool'} with the configured parameters`;
              
              logger.info(`[WorkflowTool] Fixed JSON instruction parameter for step: ${stepName}`);
            }
          }
        }
      } catch (error) {
        // If parsing fails, keep the original instruction
        logger.debug(`[WorkflowTool] Could not parse instruction for step: ${stepName}`, error.message);
      }
    }

    return fixedConfig;
  }

  /**
   * Validate step configurations for missing critical parameters
   * @param {Array} steps - Array of workflow steps
   * @returns {Array} Array of validation warnings
   */
  validateStepParameters(steps) {
    const warnings = [];
    
    steps.forEach((step, index) => {
      const stepWarnings = this.validateSingleStepParameters(step, index);
      warnings.push(...stepWarnings);
    });
    
    return warnings;
  }

  /**
   * Validate a single step's parameters for completeness
   * @param {Object} step - Workflow step
   * @param {number} index - Step index
   * @returns {Array} Array of warnings for this step
   */
  validateSingleStepParameters(step, index) {
    const warnings = [];
    
    // Helper function to check for a parameter - prioritize parameters object
    const findParameter = (paramName) => {
      // Primary location: parameters object
      if (step.config.parameters?.[paramName]) {
        return step.config.parameters[paramName];
      }
      
      // Fallback locations for backward compatibility
      const fallbackLocations = [
        step.config.toolParameters?.[paramName],
        step.config[paramName], // Direct in config
      ];
      
      return fallbackLocations.find(val => val !== undefined && val !== null && val !== '');
    };

    // Helper function to check if parameter exists in instruction text
    const hasParameterInInstruction = (paramNames) => {
      const instruction = step.config.parameters?.instruction || step.config.instruction || '';
      if (!instruction || typeof instruction !== 'string') return false;
      
      const instructionLower = instruction.toLowerCase();
      return paramNames.some(paramName => 
        instructionLower.includes(paramName.toLowerCase() + '=') ||
        instructionLower.includes(paramName.toLowerCase() + ':') ||
        instructionLower.includes(paramName.toLowerCase() + ' ')
      );
    };
    
    // Only check email steps for critical missing parameters
    if (step.config?.toolName && step.config.toolName.includes('EMAIL')) {
      // Check for recipient - this is critical for email steps
      const hasRecipient = findParameter('recipient') || 
                          findParameter('to') || 
                          findParameter('email') ||
                          hasParameterInInstruction(['recipient', 'to', 'email']);
                          
      if (!hasRecipient) {
        warnings.push({
          step: step.id || `step_${index}`,
          stepName: step.name,
          type: 'missing_recipient',
          message: 'Email step is missing recipient address. This will likely fail during execution.',
          suggestion: 'Add recipient parameter: {"parameters": {"recipient": "user@example.com"}}'
        });
      }
      
      // Only warn about subject if no recipient and no content (completely empty email config)
      const hasSubject = findParameter('subject') || 
                        findParameter('title') ||
                        hasParameterInInstruction(['subject', 'title']);
      const hasContent = findParameter('contentTemplate') || 
                        findParameter('content') || 
                        findParameter('message') || 
                        findParameter('body') ||
                        hasParameterInInstruction(['content', 'message', 'body']);
                        
      if (!hasRecipient && !hasSubject && !hasContent) {
        warnings.push({
          step: step.id || `step_${index}`,
          stepName: step.name,
          type: 'empty_email_config',
          message: 'Email step has no recipient, subject, or content configured.',
          suggestion: 'Configure at least recipient and content for the email step'
        });
      }
    }
    
    // Check for completely empty config objects - but only warn if no toolName either
    if ((!step.config || Object.keys(step.config).length === 0) && step.type === 'mcp_agent_action') {
      warnings.push({
        step: step.id || `step_${index}`,
        stepName: step.name,
        type: 'empty_config',
        message: 'Action step has empty configuration. Specify toolName or provide instruction.',
        suggestion: 'Add toolName and parameters or provide instruction for agent execution'
      });
    }
    
    return warnings;
  }

  /**
   * Create a new workflow with proper context capture
   * @param {Object} data - Workflow data
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   * @param {string} parentMessageId - Parent message ID
   * @param {string} endpoint - Endpoint name
   * @param {string} model - Model name
   * @returns {Promise<Object>} Created workflow result
   */
  async createWorkflow(data, userId, conversationId, parentMessageId, endpoint, model) {
    const { name, description, trigger, steps } = data;

    if (!name || !trigger || !steps || steps.length === 0) {
      throw new Error('Missing required fields: name, trigger, and steps are required');
    }

    // Get user's timezone for schedule processing
    let userTimezone = 'UTC'; // Default fallback
    try {
      const User = require('~/models/User');
      const user = await User.findById(userId).select('timezone');
      if (user && user.timezone) {
        userTimezone = user.timezone;
        logger.debug(`[WorkflowTool] Using user timezone: ${userTimezone}`);
      } else {
        logger.debug(`[WorkflowTool] No user timezone found, using UTC default`);
      }
    } catch (error) {
      logger.warn(`[WorkflowTool] Failed to get user timezone, using UTC:`, error);
    }

    // Process trigger configuration with user timezone
    const processedTrigger = this.processTriggerConfig(trigger, description, userTimezone);

    // Auto-fix step connections to prevent validation errors
    const fixedSteps = this.autoFixStepConnections(steps);

    // Validate step parameters and collect warnings
    const parameterWarnings = this.validateStepParameters(fixedSteps);
    
    const workflowId = `workflow_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    
    // Determine the correct endpoint, model, and agent_id to store
    let workflowEndpoint = endpoint || this.endpoint;
    let workflowModel = model || this.model;
    let workflowAgentId = null;

    // Debug logging to understand why fallback is triggered
    logger.debug(`[WorkflowTool] createWorkflow endpoint analysis:`, {
      parameterEndpoint: endpoint,
      thisEndpoint: this.endpoint,
      parameterModel: model,
      thisModel: this.model,
      finalEndpoint: workflowEndpoint,
      finalModel: workflowModel,
    });

    // Check if we're in an agent context
    if (workflowEndpoint === 'agents' && workflowModel) {
      // In agent context, the model is actually the agent_id
      workflowEndpoint = EModelEndpoint.agents;
      workflowAgentId = workflowModel;
      // For agents, we'll use the underlying model from the agent during execution
      workflowModel = null; // Will be determined during execution based on agent
      logger.info(`[WorkflowTool] Creating workflow with agent context: agent_id=${workflowAgentId}`);
    } else if (workflowEndpoint && workflowModel) {
      // Regular endpoint context
      logger.info(`[WorkflowTool] Creating workflow with endpoint context: endpoint=${workflowEndpoint}, model=${workflowModel}`);
    } else {
      // Fallback to configuration-based defaults
      logger.debug(`[WorkflowTool] Using configuration-based fallback for workflow creation`);
      try {
        const { getCustomConfig } = require('~/server/services/Config');
        const config = await getCustomConfig();
        workflowEndpoint = config?.workflows?.defaultEndpoint || EModelEndpoint.openAI;
        workflowModel = config?.workflows?.defaultModel || 'gpt-4o-mini';
        workflowAgentId = null;
        logger.info(`[WorkflowTool] Using config fallback for workflow: endpoint=${workflowEndpoint}, model=${workflowModel}`);
      } catch (configError) {
        logger.warn(`[WorkflowTool] Failed to load config, using hard fallback:`, configError);
        workflowEndpoint = EModelEndpoint.openAI;
        workflowModel = 'gpt-4o-mini';
        workflowAgentId = null;
        logger.warn(`[WorkflowTool] Using hard fallback for workflow: endpoint=${workflowEndpoint}, model=${workflowModel}`);
      }
    }
    
    const workflowData = {
      id: workflowId,
      name,
      description,
      trigger: processedTrigger,
      steps: fixedSteps,
      isDraft: true,
      isActive: false,
      user: userId,
      conversation_id: conversationId,
      parent_message_id: parentMessageId,
      // Store the current conversation's model/endpoint/agent context
      endpoint: workflowEndpoint,
      ai_model: workflowModel,
      agent_id: workflowAgentId,
      version: 1,
      created_from_agent: true,
    };

    logger.info(`[WorkflowTool] Creating workflow: ${workflowId} (${name}) - will use stored context: endpoint=${workflowEndpoint}, model=${workflowModel}, agent_id=${workflowAgentId}`);

    try {
      // Use WorkflowService for proper validation
      const workflowService = new WorkflowService();
      const workflow = await workflowService.createWorkflow(workflowData, userId);
      
      logger.info(`[WorkflowTool] Created workflow: ${workflowId} (${name}) for user ${userId}`);
      
      // Prepare response with warnings if any
      const response = {
        success: true,
        message: `Workflow "${name}" created successfully as draft. Will use ${workflowAgentId ? `agent ${workflowAgentId}` : `${workflowEndpoint}/${workflowModel}`} for execution.`,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: workflow.steps,
          isDraft: workflow.isDraft,
          isActive: workflow.isActive,
          conversation_id: workflow.conversation_id,
          parent_message_id: workflow.parent_message_id,
          endpoint: workflow.endpoint,
          ai_model: workflow.ai_model,
          agent_id: workflow.agent_id,
          version: workflow.version,
        }
      };

      // Add warnings if any critical parameters are missing
      if (parameterWarnings.length > 0) {
        response.warnings = parameterWarnings;
        
        // Only show warning message for critical issues (like completely empty configs)
        const criticalWarnings = parameterWarnings.filter(w => 
          w.type === 'missing_recipient' || w.type === 'empty_email_config' || w.type === 'empty_config'
        );
        
        if (criticalWarnings.length > 0) {
          response.message += ` ⚠️  ${criticalWarnings.length} configuration warning(s) detected`;
        }
        
        // Log all warnings for debugging but focus message on critical ones
        const warningSummary = parameterWarnings.map(w => `${w.stepName}: ${w.type}`).join(', ');
        logger.warn(`[WorkflowTool] Parameter warnings for workflow ${workflowId}: ${warningSummary}`);
        
        // Log full details at debug level
        logger.debug(`[WorkflowTool] Full parameter warnings for workflow ${workflowId}:`, parameterWarnings);
      }

      // Add info about auto-connections if they were applied
      const hasAutoConnections = fixedSteps.some((step, index) => 
        step.onSuccess && index < steps.length - 1 && !steps[index].onSuccess
      );
      
      if (hasAutoConnections) {
        response.message += ` 🔗 Steps automatically connected in sequence`;
        logger.info(`[WorkflowTool] Auto-connected workflow steps for ${workflowId}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`[WorkflowTool] Error creating workflow:`, error);
      throw new Error(`Failed to create workflow: ${error.message}`);
    }
  }

  /**
   * Process trigger configuration, especially for schedule triggers
   * @param {Object} trigger - Raw trigger object
   * @param {string} description - Workflow description for context
   * @param {string} userTimezone - User's timezone for conversion
   * @returns {Object} Processed trigger with proper config
   */
  processTriggerConfig(trigger, description, userTimezone = 'UTC') {
    const processedTrigger = { ...trigger };

    if (trigger.type === 'schedule') {
      // Ensure config object exists
      processedTrigger.config = processedTrigger.config || {};
        
      // Handle both 'schedule' and 'cron' fields - normalize to 'schedule'
      let scheduleInput = trigger.config?.schedule || trigger.config?.cron;
      let cronExpression = null;
      
      // If we have a schedule input, check if it's already a cron expression or natural language
      if (scheduleInput) {
        const { isCronExpression, parseScheduleToUTCCron } = require('~/server/services/Scheduler/utils/cronUtils');
        
        if (isCronExpression(scheduleInput)) {
          // It's already a valid cron expression
          cronExpression = scheduleInput;
          logger.debug(`[WorkflowTool] Using provided cron expression: ${cronExpression}`);
        } else {
          // It's natural language, parse it
          cronExpression = parseScheduleToUTCCron(scheduleInput, userTimezone);
          if (cronExpression) {
            logger.info(`[WorkflowTool] Converted "${scheduleInput}" to UTC cron (${userTimezone}): ${cronExpression}`);
          } else {
            logger.warn(`[WorkflowTool] Could not parse schedule "${scheduleInput}", will try description`);
          }
        }
      }
      
      // If no valid cron expression yet, try to extract from description or use default
      if (!cronExpression) {
        // Try to extract schedule from description with user timezone
        const scheduleFromDescription = this.extractScheduleFromDescription(description, userTimezone);
        if (scheduleFromDescription) {
          cronExpression = scheduleFromDescription;
          logger.info(`[WorkflowTool] Extracted schedule from description (${userTimezone}): ${cronExpression}`);
        } else {
          // Use the timezone-aware parsing for the default time
          const { parseScheduleToUTCCron } = require('~/server/services/Scheduler/utils/cronUtils');
          cronExpression = parseScheduleToUTCCron('daily at 9 AM', userTimezone) || '0 9 * * *';
          logger.info(`[WorkflowTool] No schedule found, using default for ${userTimezone}: ${cronExpression}`);
        }
      }
      
      // Validate the cron expression using the same validation as scheduler
      const { calculateNextRun } = require('~/server/services/Scheduler/utils/cronUtils');
      const nextRun = calculateNextRun(cronExpression);
      if (!nextRun) {
        throw new Error(`Invalid cron expression: ${cronExpression}. Please provide a valid cron schedule.`);
      }
      
      // Normalize to 'schedule' field and remove 'cron' field if it exists
      processedTrigger.config.schedule = cronExpression;
      if (processedTrigger.config.cron) {
        delete processedTrigger.config.cron;
        logger.debug(`[WorkflowTool] Normalized 'cron' field to 'schedule': ${cronExpression}`);
      }
      
      logger.debug(`[WorkflowTool] Processed schedule trigger: ${cronExpression}, next run: ${nextRun.toISOString()}`);
    }

    return processedTrigger;
  }

  /**
   * Extract cron schedule from workflow description
   * @param {string} description - Workflow description
   * @param {string} userTimezone - User's timezone for conversion
   * @returns {string|null} Cron expression or null if not found
   */
  extractScheduleFromDescription(description, userTimezone = 'UTC') {
    if (!description) return null;

    // Use the enhanced cronUtils parsing function
    const { parseScheduleToUTCCron } = require('~/server/services/Scheduler/utils/cronUtils');
    
    const cronExpr = parseScheduleToUTCCron(description, userTimezone);
    if (cronExpr) {
      logger.debug(`[WorkflowTool] Extracted schedule from description "${description}" (${userTimezone}): ${cronExpr}`);
      return cronExpr;
    }

    // Fallback to basic pattern matching for compatibility
    const desc = description.toLowerCase();
    
    // Common schedule patterns - all treated as UTC-based cron expressions
    const patterns = [
      // "daily at 9 AM" or "daily at 9" -> 9 AM UTC
      { regex: /daily.*?at\s+(\d{1,2})\s*(?:am|a\.m\.)?/i, handler: (match) => {
        const hour = parseInt(match[1]);
        return `0 ${hour} * * *`;
      }},
      // "daily at 2 PM" or "daily at 2 p.m." -> 14 UTC (2 PM)
      { regex: /daily.*?at\s+(\d{1,2})\s*(?:pm|p\.m\.)/i, handler: (match) => {
        const hour = parseInt(match[1]);
        const utcHour = hour === 12 ? 12 : hour + 12; // Convert PM to 24-hour
        return `0 ${utcHour} * * *`;
      }},
      // "every X minutes" -> */X * * * *
      { regex: /every\s+(\d+)\s+minutes?/i, handler: (match) => {
        const minutes = parseInt(match[1]);
        return `*/${minutes} * * * *`;
      }},
      // "every hour" -> 0 * * * *
      { regex: /every\s+hour/i, handler: () => '0 * * * *' },
      // "hourly" -> 0 * * * *
      { regex: /hourly/i, handler: () => '0 * * * *' },
      // "every morning" -> 9 AM UTC
      { regex: /every\s+morning/i, handler: () => '0 9 * * *' },
      // "every day" or "daily" -> 9 AM UTC
      { regex: /(?:every\s+day|daily)(?!\s+at)/i, handler: () => '0 9 * * *' },
      // "at 9" or "9 AM" (standalone) -> 9 AM UTC
      { regex: /(?:^|\s)(?:at\s+)?(\d{1,2})\s*am(?:\s|$)/i, handler: (match) => {
        const hour = parseInt(match[1]);
        return `0 ${hour} * * *`;
      }},
      // "at 2 PM" (standalone) -> 14 UTC
      { regex: /(?:^|\s)(?:at\s+)?(\d{1,2})\s*pm(?:\s|$)/i, handler: (match) => {
        const hour = parseInt(match[1]);
        const utcHour = hour === 12 ? 12 : hour + 12;
        return `0 ${utcHour} * * *`;
      }},
    ];

    for (const pattern of patterns) {
      const match = desc.match(pattern.regex);
      if (match) {
        const cronExpr = pattern.handler(match);
        logger.debug(`[WorkflowTool] Extracted schedule from description "${description}": ${cronExpr}`);
        return cronExpr;
      }
    }

    return null;
  }

  async listWorkflows(userId) {
    try {
      const workflowService = new WorkflowService();
      const workflows = await workflowService.getUserWorkflows(userId);
      
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
      const workflowService = new WorkflowService();
      const workflow = await workflowService.getWorkflowById(workflowId, userId);
      
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
      // Get the current workflow first
      const workflowService = new WorkflowService();
      const currentWorkflow = await workflowService.getWorkflowById(workflowId, userId);
      
      if (!currentWorkflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      // Process the update data to handle intelligent step merging
      const processedUpdateData = await this.processWorkflowUpdate(currentWorkflow, updateData);
      
      const updatedWorkflow = await workflowService.updateWorkflow(workflowId, userId, processedUpdateData);
      
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

  /**
   * Process workflow update data to handle intelligent step merging
   * @param {Object} currentWorkflow - Current workflow data
   * @param {Object} updateData - Update data from user
   * @returns {Object} Processed update data
   */
  async processWorkflowUpdate(currentWorkflow, updateData) {
    const processedData = { ...updateData };

    // Handle intelligent step updates
    if (updateData.steps && Array.isArray(updateData.steps)) {
      const currentSteps = currentWorkflow.steps || [];
      const updateMode = updateData.update_mode || 'merge'; // Default to merge mode
      
      if (updateMode === 'replace') {
        // Explicit replace mode - replace all steps
        logger.info(`[WorkflowTool] Performing explicit step replacement: ${updateData.steps.length} steps`);
        processedData.steps = this.fixStepValidation(updateData.steps);
      } else if (updateMode === 'merge' || updateData.steps.length < currentSteps.length) {
        // Merge mode or intelligent detection of partial update
        logger.info(`[WorkflowTool] Performing intelligent step merge: ${updateData.steps.length} new/updated steps, ${currentSteps.length} existing steps`);
        
        // Create a map of current steps by ID
        const currentStepsMap = new Map();
        currentSteps.forEach(step => {
          currentStepsMap.set(step.id, step);
        });
        
        // Update or add the provided steps
        updateData.steps.forEach(step => {
          if (step.id) {
            const existingStep = currentStepsMap.get(step.id);
            if (existingStep) {
              logger.info(`[WorkflowTool] Updated existing step: ${step.id} (${step.name})`);
            } else {
              logger.info(`[WorkflowTool] Added new step: ${step.id} (${step.name})`);
            }
            currentStepsMap.set(step.id, step);
          } else {
            logger.warn(`[WorkflowTool] Step missing ID, cannot merge: ${step.name || 'unnamed step'}`);
          }
        });
        
        // Convert back to array and fix any validation issues
        const mergedSteps = Array.from(currentStepsMap.values());
        processedData.steps = this.fixStepValidation(mergedSteps);
        
        logger.info(`[WorkflowTool] Step merge complete: ${processedData.steps.length} total steps`);
      } else {
        // Equal or more steps provided than existing - treat as full replacement
        logger.info(`[WorkflowTool] Performing full step replacement (detected): ${updateData.steps.length} steps`);
        processedData.steps = this.fixStepValidation(updateData.steps);
      }
      
      // Remove update_mode from the final data as it's not needed in the database
      delete processedData.update_mode;
    }

    // Process other update fields normally
    if (updateData.trigger) {
      processedData.trigger = this.processTriggerConfig(updateData.trigger, updateData.description || currentWorkflow.description);
    }

    return processedData;
  }

  async deleteWorkflow(workflowId, userId) {
    if (!workflowId) {
      throw new Error('Workflow ID is required');
    }

    try {
      const workflowService = new WorkflowService();
      const success = await workflowService.deleteWorkflow(workflowId, userId);
      
      if (!success) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      return {
        success: true,
        message: `Workflow with ID ${workflowId} deleted successfully`
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
      const workflowService = new WorkflowService();
      const workflow = await workflowService.toggleWorkflow(workflowId, userId, isActive);
      
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
      throw new Error('Workflow ID is required for testing');
    }

    try {
      const workflowService = new WorkflowService();
      const workflow = await workflowService.getWorkflowById(workflowId, userId);
      
      if (!workflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      const execution = await workflowService.executeWorkflow(workflowId, userId, {
        trigger: {
          type: 'manual',
          source: 'agent_test',
          data: { initiated_by: 'agent' }
        }
      }, true); // true indicates this is a test execution

      return {
        success: true,
        message: `Test execution completed for workflow "${workflow.name}"`,
        execution: execution
      };
    } catch (error) {
      logger.error(`[WorkflowTool] Error testing workflow:`, error);
      throw new Error(`Failed to test workflow: ${error.message}`);
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
        
        // case 'get_available_tools': // COMMENTED OUT: Not needed with current architecture
        //   return await this.getAvailableTools(userId);
        
        case 'validate_workflow_design':
          return await this.validateWorkflowDesign(data.workflow_design, userId);
        
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

  /**
   * Auto-connect workflow steps in sequence if they're not connected
   * @param {Array} steps - Array of workflow steps
   * @returns {Array} Steps with proper connections
   */
  autoConnectSteps(steps) {
    if (!steps || steps.length === 0) return steps;

    const connectedSteps = [...steps];

    // Check if any steps are already connected
    const hasConnections = steps.some(step => step.onSuccess || step.onFailure);

    // If no connections exist, auto-connect steps in sequence
    if (!hasConnections) {
      logger.info(`[WorkflowTool] No step connections found, auto-connecting ${steps.length} steps in sequence`);
      
      for (let i = 0; i < connectedSteps.length - 1; i++) {
        // Connect current step to next step
        connectedSteps[i].onSuccess = connectedSteps[i + 1].id;
        logger.debug(`[WorkflowTool] Connected step ${connectedSteps[i].id} -> ${connectedSteps[i + 1].id}`);
      }
      
      logger.info(`[WorkflowTool] Auto-connected workflow steps: ${connectedSteps.map(s => s.id).join(' -> ')}`);
    } else {
      // Check for orphaned steps (steps that are not connected and not referenced by other steps)
      const referencedSteps = new Set();
      steps.forEach(step => {
        if (step.onSuccess) referencedSteps.add(step.onSuccess);
        if (step.onFailure) referencedSteps.add(step.onFailure);
      });

      const orphanedSteps = steps.filter(step => 
        !step.onSuccess && !step.onFailure && !referencedSteps.has(step.id)
      );

      if (orphanedSteps.length > 0) {
        logger.warn(`[WorkflowTool] Found ${orphanedSteps.length} orphaned steps: ${orphanedSteps.map(s => s.id).join(', ')}`);
        
        // Try to connect orphaned steps to the workflow
        for (const orphan of orphanedSteps) {
          // Find a step that could connect to this orphan
          const potentialPredecessor = connectedSteps.find(step => 
            step.id !== orphan.id && !step.onSuccess && step !== orphan
          );
          
          if (potentialPredecessor) {
            potentialPredecessor.onSuccess = orphan.id;
            logger.info(`[WorkflowTool] Connected orphaned step: ${potentialPredecessor.id} -> ${orphan.id}`);
          }
        }
      }
    }

    return connectedSteps;
  }
}

module.exports = WorkflowTool;