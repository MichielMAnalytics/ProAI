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
    - update_workflow: Update an existing workflow (supports intelligent step merging)
    - delete_workflow: Delete a workflow
    - activate_workflow: Activate a workflow for execution
    - deactivate_workflow: Deactivate a workflow
    - test_workflow: Execute a workflow once for testing
    - get_available_tools: Get available MCP tools and Pipedream actions for workflow creation

    CRITICAL: EXTRACT AND PRESERVE USER-SPECIFIC DETAILS
    
    When users provide specific information in their requests, you MUST extract and store these details in the workflow step configurations:
    
    ✅ EXTRACT THESE DETAILS:
    - Email addresses and recipients
    - Subject lines and content templates
    - Specific parameters and filters
    - Names, usernames, and identifiers
    - Time schedules and frequencies
    - File paths and locations
    - API endpoints and configurations
    
    ❌ DO NOT CREATE GENERIC PLACEHOLDERS:
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
             "type": "action",
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

    STEP CONFIGURATION PATTERNS WITH REAL USER DATA:
    
    1. EMAIL STEPS - Extract ALL email details from user request:
       {
         "id": "step_2",
         "name": "Send Email to Coach",
         "type": "action",
         "config": {
           "toolName": "MICROSOFT_OUTLOOK-SEND-EMAIL",
           "parameters": {
             "recipient": "coach.actual.email@domain.com",
             "subject": "Activity Update - [Date]",
             "contentTemplate": "Detailed activity information including duration, distance, and performance metrics",
             "recipientName": "Coach Name"
           },
           "instruction": "Send detailed activity update email to coach with specified recipient and content"
         },
         "position": {"x": 300, "y": 100}
       }
    
    2. DATA RETRIEVAL STEPS - Include specific filters and parameters:
       {
         "id": "step_1", 
         "name": "Get Recent Activity Data",
         "type": "action",
         "config": {
           "toolName": "DATA-GET-ACTIVITY-LIST",
           "parameters": {
             "limit": 1,
             "activityType": "all",
             "includeDetails": true
           },
           "instruction": "Retrieve the most recent activity with full details"
         },
         "position": {"x": 100, "y": 100}
       }
    
    3. CONTENT PROCESSING STEPS - Define specific output formats:
       {
         "id": "step_3",
         "name": "Format Activity Summary", 
         "type": "action",
         "config": {
           "outputFormat": "summary",
           "includeFields": ["duration", "distance", "activity_type"],
           "instruction": "Create concise summary with duration and distance only"
         },
         "position": {"x": 200, "y": 100}
       }

    EXAMPLE: Complete Email Workflow with User Details
    
    User request: "Send activity update to coach@training.com with detailed analysis and summary to me@personal.com"
    
    Correct workflow configuration:
    {
      "steps": [
        {
          "id": "step_1",
          "name": "Get Recent Activity",
          "type": "action", 
          "config": {
            "toolName": "ACTIVITY-GET-RECENT",
            "parameters": {"limit": 1, "includeMetrics": true},
            "instruction": "Fetch most recent activity with full metrics"
          }
        },
        {
          "id": "step_2",
          "name": "Send Detailed Email to Coach",
          "type": "action",
          "config": {
            "toolName": "MICROSOFT_OUTLOOK-SEND-EMAIL",
            "parameters": {
              "recipient": "coach@training.com",
              "subject": "Detailed Activity Analysis - {{activity.date}}",
              "contentTemplate": "Full analysis including pace, heart rate, elevation, and performance insights",
              "includeMetrics": ["pace", "heartrate", "elevation", "power"]
            },
            "instruction": "Send comprehensive activity analysis to coach"
          }
        },
        {
          "id": "step_3", 
          "name": "Send Summary to Personal Email",
          "type": "action",
          "config": {
            "toolName": "MICROSOFT_OUTLOOK-SEND-EMAIL", 
            "parameters": {
              "recipient": "me@personal.com",
              "subject": "Activity Summary - {{activity.date}}",
              "contentTemplate": "Quick summary: Duration {{activity.duration}}, Distance {{activity.distance}}",
              "summaryOnly": true
            },
            "instruction": "Send brief summary to personal email"
          }
        }
      ]
    }

    CRITICAL STEP CONFIGURATION REQUIREMENTS:
    
    1. ALL STEPS MUST HAVE:
       - id: unique identifier (required)
       - name: descriptive name (required)
       - type: "action", "condition", or "delay" (required)
       - config: configuration object (required, can be empty {})
       - position: {x: number, y: number} (required)
    
    2. ERROR/SUCCESS HANDLING STEPS:
       Even handler steps need proper config:
       {
         "id": "error_step",
         "name": "Error Handler", 
         "type": "action",
         "config": {
           "instruction": "Log error and optionally notify user",
           "notificationEnabled": false
         },
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
    ✅ Did you extract all email addresses mentioned by the user?
    ✅ Did you preserve all specific names and identifiers?
    ✅ Did you capture the intended content and formatting requirements?
    ✅ Did you include all filters, limits, and data requirements?
    ✅ Are the step configurations complete and executable?`;

    
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
        'get_available_tools'
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
        type: z.enum(['action', 'condition', 'delay']),
        config: z.record(z.unknown()),
        onSuccess: z.string().optional(),
        onFailure: z.string().optional(),
        position: z.object({
          x: z.number(),
          y: z.number(),
        }),
      })).optional()
        .describe('Array of workflow steps. For updates: provide only the steps you want to add/modify to preserve existing steps, or provide all steps to replace completely'),
      
      // Workflow management fields
      workflow_id: z.string().optional()
        .describe('Workflow ID for get, update, delete, activate, deactivate, test actions'),
      
      // Update-specific options
      update_mode: z.enum(['merge', 'replace']).optional()
        .describe('How to handle step updates: "merge" (default) preserves existing steps and updates provided ones, "replace" replaces all steps'),
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
      const mcpTools = [];
      if (mcpResult.success && availableTools) {
        const toolKeys = Object.keys(availableTools);
        for (const toolKey of toolKeys) {
          const tool = availableTools[toolKey];
          if (tool && typeof tool === 'object' && tool.function) {
            mcpTools.push({
              name: tool.function.name,
              description: tool.function.description || 'No description available',
              parameters: tool.function.parameters || {},
              type: 'mcp_tool',
              serverName: toolKey.includes('__') ? toolKey.split('__')[1] : 'unknown',
            });
          }
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

    return this.fixStepValidation(fixedSteps);
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
        fixedStep.type = 'action'; // Default to action
        logger.warn(`[WorkflowTool] Added missing type field to step: ${step.id}, defaulting to 'action'`);
      }

      const validTypes = ['action', 'condition', 'delay'];
      if (!validTypes.includes(fixedStep.type)) {
        fixedStep.type = 'action';
        logger.warn(`[WorkflowTool] Fixed invalid step type for step: ${step.id}, changed to 'action'`);
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

    // If instruction contains JSON, try to parse it and merge into parameters
    if (fixedConfig.parameters && fixedConfig.parameters.instruction) {
      try {
        const instructionValue = fixedConfig.parameters.instruction;
        
        // Check if instruction is a JSON string
        if (typeof instructionValue === 'string' && (instructionValue.trim().startsWith('{') || instructionValue.trim().startsWith('['))) {
          const parsedInstruction = JSON.parse(instructionValue);
          
          // If it's an object, merge it into config
          if (typeof parsedInstruction === 'object' && parsedInstruction !== null) {
            // Move the parsed JSON to a more appropriate place
            if (!fixedConfig.toolParameters) {
              fixedConfig.toolParameters = parsedInstruction;
            }
            
            // Keep a simpler instruction
            fixedConfig.parameters.instruction = `Execute ${config.toolName || 'tool'} with the configured parameters`;
            
            logger.info(`[WorkflowTool] Fixed JSON instruction parameter for step: ${stepName}`);
          }
        }
      } catch (error) {
        // If JSON parsing fails, keep the original instruction
        logger.debug(`[WorkflowTool] Could not parse instruction as JSON for step: ${stepName}`);
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
    
    // Check email steps for missing recipients
    if (step.config?.toolName && step.config.toolName.includes('EMAIL')) {
      if (!step.config.parameters?.recipient && !step.config.toolParameters?.recipient) {
        warnings.push({
          step: step.id || `step_${index}`,
          stepName: step.name,
          type: 'missing_recipient',
          message: 'Email step is missing recipient address. This will likely fail during execution.',
          suggestion: 'Add recipient parameter to step config: {"recipient": "user@example.com"}'
        });
      }
      
      if (!step.config.parameters?.subject && !step.config.toolParameters?.subject) {
        warnings.push({
          step: step.id || `step_${index}`,
          stepName: step.name,
          type: 'missing_subject',
          message: 'Email step is missing subject line. A generic subject will be generated.',
          suggestion: 'Add subject parameter to step config: {"subject": "Your Subject Here"}'
        });
      }
      
      if (!step.config.parameters?.contentTemplate && !step.config.parameters?.content && !step.config.toolParameters?.message) {
        warnings.push({
          step: step.id || `step_${index}`,
          stepName: step.name,
          type: 'missing_content',
          message: 'Email step is missing content template. Content will be generated from step context.',
          suggestion: 'Add contentTemplate parameter: {"contentTemplate": "Your email content here"}'
        });
      }
    }
    
    // Check data retrieval steps for missing filters
    if (step.type === 'action' && step.name.toLowerCase().includes('get')) {
      if (!step.config.parameters?.limit && !step.config.toolParameters?.limit) {
        warnings.push({
          step: step.id || `step_${index}`,
          stepName: step.name,
          type: 'missing_limit',
          message: 'Data retrieval step missing limit parameter. May return too much data.',
          suggestion: 'Add limit parameter: {"limit": 1} for recent items'
        });
      }
    }
    
    // Check for empty config objects
    if (!step.config || Object.keys(step.config).length === 0) {
      warnings.push({
        step: step.id || `step_${index}`,
        stepName: step.name,
        type: 'empty_config',
        message: 'Step has empty configuration. This may result in incomplete execution.',
        suggestion: 'Add appropriate configuration parameters for this step type'
      });
    }
    
    return warnings;
  }

  async createWorkflow(data, userId, conversationId, parentMessageId, endpoint, model) {
    const { name, description, trigger, steps } = data;

    if (!name || !trigger || !steps || steps.length === 0) {
      throw new Error('Missing required fields: name, trigger, and steps are required');
    }

    // Process trigger configuration
    const processedTrigger = this.processTriggerConfig(trigger, description);

    // Auto-fix step connections to prevent validation errors
    const fixedSteps = this.autoFixStepConnections(steps);

    // Validate step parameters and collect warnings
    const parameterWarnings = this.validateStepParameters(fixedSteps);
    
    const workflowId = `workflow_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    
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
      // Use WorkflowService for proper validation
      const workflowService = new WorkflowService();
      const workflow = await workflowService.createWorkflow(workflowData, userId);
      
      logger.info(`[WorkflowTool] Created workflow: ${workflowId} (${name}) for user ${userId}`);
      
      // Prepare response with warnings if any
      const response = {
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

      // Add warnings if any critical parameters are missing
      if (parameterWarnings.length > 0) {
        response.warnings = parameterWarnings;
        response.message += ` ⚠️  ${parameterWarnings.length} parameter warning(s) detected`;
        
        // Log warnings for debugging
        logger.warn(`[WorkflowTool] Parameter warnings for workflow ${workflowId}:`, parameterWarnings);
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
   * @returns {Object} Processed trigger with proper config
   */
  processTriggerConfig(trigger, description) {
    const processedTrigger = { ...trigger };

    if (trigger.type === 'schedule') {
      // If no config provided, try to parse from description or set default
      if (!trigger.config?.schedule) {
        processedTrigger.config = processedTrigger.config || {};
        
        // Try to extract schedule from description
        const scheduleFromDescription = this.extractScheduleFromDescription(description);
        if (scheduleFromDescription) {
          processedTrigger.config.schedule = scheduleFromDescription;
          logger.info(`[WorkflowTool] Extracted schedule from description: ${scheduleFromDescription}`);
        } else {
          // Default to daily at 9 AM UTC if no schedule specified
          processedTrigger.config.schedule = '0 9 * * *';
          logger.info(`[WorkflowTool] No schedule found, using default: 0 9 * * *`);
        }
      }
    }

    return processedTrigger;
  }

  /**
   * Extract cron schedule from workflow description
   * @param {string} description - Workflow description
   * @returns {string|null} Cron expression or null if not found
   */
  extractScheduleFromDescription(description) {
    if (!description) return null;

    const desc = description.toLowerCase();
    
    // Common schedule patterns
    const patterns = [
      // "9 AM (UTC+2)" -> 7 AM UTC
      { regex: /(\d{1,2})\s*am.*utc\+(\d{1,2})/, handler: (match) => {
        const hour = parseInt(match[1]);
        const offset = parseInt(match[2]);
        const utcHour = (hour - offset + 24) % 24;
        return `0 ${utcHour} * * *`;
      }},
      // "9 AM" -> 9 AM UTC
      { regex: /(\d{1,2})\s*am/, handler: (match) => {
        const hour = parseInt(match[1]);
        return `0 ${hour} * * *`;
      }},
      // "daily at 9" -> 9 AM UTC
      { regex: /daily.*?(\d{1,2})/, handler: (match) => {
        const hour = parseInt(match[1]);
        return `0 ${hour} * * *`;
      }},
      // "every morning" -> 9 AM UTC
      { regex: /every morning/, handler: () => '0 9 * * *' },
      // "every day" -> 9 AM UTC
      { regex: /every day/, handler: () => '0 9 * * *' },
    ];

    for (const pattern of patterns) {
      const match = desc.match(pattern.regex);
      if (match) {
        return pattern.handler(match);
      }
    }

    return null;
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
      // Get the current workflow first
      const currentWorkflow = await getUserWorkflowById(workflowId, userId);
      
      if (!currentWorkflow) {
        return {
          success: false,
          message: `Workflow with ID ${workflowId} not found`
        };
      }

      // Process the update data to handle intelligent step merging
      const processedUpdateData = await this.processWorkflowUpdate(currentWorkflow, updateData);
      
      const updatedWorkflow = await updateUserWorkflow(workflowId, userId, processedUpdateData);
      
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
      throw new Error('Workflow ID is required for testing');
    }

    try {
      const workflowService = new WorkflowService();
      const workflow = await getUserWorkflowById(workflowId, userId);
      
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
        
        case 'get_available_tools':
          return await this.getAvailableTools(userId);
        
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