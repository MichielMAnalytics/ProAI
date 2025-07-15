const fs = require('fs').promises;
const { nanoid } = require('nanoid');
const {
  Tools,
  Constants,
  FileContext,
  FileSources,
  SystemRoles,
  EToolResources,
  actionDelimiter,
  AgentCapabilities,
  specialVariables,
} = require('librechat-data-provider');
const {
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
} = require('~/models/Agent');
const { uploadImageBuffer, filterFile } = require('~/server/services/Files/process');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { refreshS3Url } = require('~/server/services/Files/S3/crud');
const { updateAction, getActions } = require('~/models/Action');
const { updateAgentProjects } = require('~/models/Agent');
const { getProjectByName } = require('~/models/Project');
const { deleteFileByFilter } = require('~/models/File');
const { revertAgentVersion } = require('~/models/Agent');
const { logger } = require('~/config');
const { checkCapability } = require('~/server/services/Config/getEndpointsConfig');

const systemTools = {
  [Tools.execute_code]: true,
  [Tools.file_search]: true,
  [Tools.web_search]: true,
  [Tools.scheduler]: true,
  [Tools.workflows]: true,
};

/**
 * Automatically injects special variables into agent instructions
 * @param {string} instructions - The original instructions
 * @returns {string} Instructions with injected special variables
 */
const injectSpecialVariables = (instructions = '') => {
  const variableKeys = Object.keys(specialVariables);
  
  // Variable descriptions mapping
  const variableDescriptions = {
    current_date: 'Current Date',
    current_user: 'Current User',
    current_datetime: 'Current Date & Time',
    utc_iso_datetime: 'UTC ISO Datetime',
    tools: 'Tools'
  };
  
  // Check if sections already exist to avoid duplication
  const hasVariablesSection = instructions.includes('--- Available Variables ---') && instructions.includes('--- End Variables ---');
  const hasWorkflowSection = instructions.includes('--- Workflow Capabilities ---') && instructions.includes('--- End Workflow Capabilities ---');
  const hasConnectionSection = instructions.includes('--- App Connection Instructions ---') && instructions.includes('--- End App Connection Instructions ---');
  
  let result = instructions;
  
  // Check which special variables are missing
  const missingVariables = variableKeys.filter(key => !instructions.includes(`{{${key}}}`));
  
  // Only add variables section if it doesn't exist AND there are missing variables
  if (!hasVariablesSection && missingVariables.length > 0) {
    const variableList = missingVariables.map(key => `${variableDescriptions[key]}: {{${key}}}`).join('\n');
    
    // Check if any variables are already referenced in instructions above
    const referencedVariables = variableKeys.filter(key => instructions.includes(`{{${key}}}`));
    
    let variableSection;
    if (referencedVariables.length > 0) {
      // Some variables already referenced, clarify the additional ones
      variableSection = `\n\n--- Available Variables ---\nIn addition to the variables referenced above, you also have access to these special variables:\n${variableList}\n--- End Variables ---`;
    } else {
      // No variables referenced above, standard message
      variableSection = `\n\n--- Available Variables ---\nYou have access to these special variables:\n${variableList}\n--- End Variables ---`;
    }
    
    result += variableSection;
    logger.info(`[injectSpecialVariables] Added variables section with ${missingVariables.length} missing special variables: ${missingVariables.join(', ')}`);
  } else if (missingVariables.length === 0) {
    logger.info(`[injectSpecialVariables] All special variables already referenced in instructions, skipping variables section injection`);
  } else {
    logger.info(`[injectSpecialVariables] Variables section already exists, skipping injection`);
  }
  
  // Only add workflow capabilities section if it doesn't exist
  // TODO: Uncomment when workflow capabilities are ready
  /*
  if (!hasWorkflowSection) {
    const workflowCapabilities = `\n\n--- Workflow Capabilities ---\nYou can create, manage, and run multi-step workflows using the workflows tool.\n\nWorkflow Creation Process:\n- RESEARCH available tool\n- PLAN steps & data flow\n- VALIDATE via validate_workflow_design\n- CREATE only after validation\n\nStructure Rules:\n- Trigger: "manual" or "schedule" (UTC cron e.g. "0 9 * * *")\n- Steps: Only "mcp_agent_action" allowed\n- Connections: Use "onSuccess" to link step\n- Descriptions: Must state purpose & timing\n- Default: isDraft: true, isActive: false\n\nStep Format:\n{\n  "id": "step_1",\n  "type": "mcp_agent_action",\n  "config": {\n    "toolName": "TOOL",\n    "parameters": {...},\n    "instruction": "Do X"\n  },\n  "onSuccess": "step_2",\n  "position": {"x": 0, "y": 0}\n}\n\nExample:\n{\n  "action": "create_workflow",\n  "name": "Daily Report",\n  "description": "9 AM UTC: fetch Strava activity, email coach@example.com",\n  "trigger": {"type": "schedule", "config": {"schedule": "0 9 * * *"}},\n  "steps": [...]\n}\n\nNote: These workflow instructions are applicable only if 'workflows' is present in the {{tools}} special variable.\n--- End Workflow Capabilities ---`;
    result += workflowCapabilities;
    logger.info(`[injectSpecialVariables] Added workflow capabilities section`);
  } else {
    logger.info(`[injectSpecialVariables] Workflow capabilities section already exists, skipping injection`);
  }
  */
  
  // Only add app connection instructions section if it doesn't exist
  if (!hasConnectionSection) {
    const connectionInstructions = `\n\n--- App Connection Instructions ---\nIf you need to use a tool or integration that requires a connection to an external app (like Gmail, Google Drive, Slack, etc.) and you encounter authentication or connection errors, inform the user that they can:\n\n1. Click on the app icons shown at the bottom of the chat input field to connect the required app\n2. Go to 'Apps' in the top right corner of the interface to manage their app connections\n3. Connect the necessary integrations to enable the tool's functionality\n\nThis guidance applies when you receive errors about missing connections, authentication failures, or when tools require external app access.\n--- End App Connection Instructions ---`;
    result += connectionInstructions;
    logger.info(`[injectSpecialVariables] Added app connection instructions section`);
  } else {
    logger.info(`[injectSpecialVariables] App connection instructions section already exists, skipping injection`);
  }
  
  return result;
};


// Add this function to map tools to their corresponding capabilities
const getToolCapability = (tool) => {
  const toolCapabilityMap = {
    [Tools.execute_code]: AgentCapabilities.execute_code,
    [Tools.file_search]: AgentCapabilities.file_search,
    [Tools.web_search]: AgentCapabilities.web_search,
    [Tools.scheduler]: AgentCapabilities.scheduler,
    [Tools.workflows]: AgentCapabilities.workflows,
  };
  return toolCapabilityMap[tool];
};

/**
 * Transform tools array to include MCP tool objects with server metadata
 * @param {Array<string>} tools - Array of tool names from input
 * @param {Object} availableTools - Available tools registry with embedded metadata
 * @returns {Array<string | Object>} Array of tool names and MCP tool objects
 */
const enhanceToolsWithMCPMetadata = (tools, availableTools = {}) => {
  if (!Array.isArray(tools)) {
    return [];
  }

  // Import ToolMetadataUtils for enhanced tool operations
  const { ToolMetadataUtils } = require('librechat-data-provider');
  const enhancedTools = [];

  for (const tool of tools) {
    if (typeof tool === 'string') {
      // Check if this tool is an MCP tool by looking at embedded metadata
      const toolDef = availableTools[tool];
      if (toolDef && ToolMetadataUtils.isMCPTool(toolDef)) {
        const serverName = ToolMetadataUtils.getServerName(toolDef);
        const isGlobal = ToolMetadataUtils.isGlobalMCPTool(toolDef);
        
        // Create enhanced MCP tool object
        enhancedTools.push({
          tool: tool,
          server: serverName || 'unknown',
          type: isGlobal ? 'global' : 'user',
        });
      } else {
        // Regular tool (system tool or manifest tool)
        enhancedTools.push(tool);
      }
    }
  }

  return enhancedTools;
};

/**
 * Filter out MCP tools from enhanced tools array for agent duplication security
 * @param {Array<string | Object>} tools - Enhanced tools array
 * @returns {Array<string>} Array of non-MCP tools only
 */
const filterOutMCPTools = (tools) => {
  if (!Array.isArray(tools)) {
    return [];
  }

  const nonMCPTools = [];

  for (const tool of tools) {
    if (typeof tool === 'string') {
      // Keep regular/system tools
      nonMCPTools.push(tool);
    }
    // Skip MCP tool objects (they have tool/server/type properties)
  }

  return nonMCPTools;
};

/**
 * Creates an Agent.
 * @route POST /Agents
 * @param {ServerRequest} req - The request object.
 * @param {AgentCreateParams} req.body - The request body.
 * @param {ServerResponse} res - The response object.
 * @returns {Agent} 201 - success response - application/json
 */
const createAgentHandler = async (req, res) => {
  try {
    const { tools = [], provider, name, description, instructions, model, ...agentData } = req.body;
    const { id: userId } = req.user;

    // Handle tools - preserve MCP tool objects and validate strings
    const validTools = [];
    for (const tool of tools) {
      if (typeof tool === 'string') {
        // Check if tool is available in manifest tools
        if (req.app.locals.availableTools[tool]) {
          validTools.push(tool);
        }
        // For system tools, also check if the capability is enabled
        else if (systemTools[tool]) {
          const capability = getToolCapability(tool);
          if (capability) {
            const isCapabilityEnabled = await checkCapability(req, capability);
            if (isCapabilityEnabled) {
              validTools.push(tool);
            }
          } else {
            // Tool doesn't require a capability check (shouldn't happen with current system tools)
            validTools.push(tool);
          }
        }
      } else if (typeof tool === 'object' && tool.tool && tool.server && tool.type) {
        // Preserve MCP tool objects as they come from the frontend
        validTools.push(tool);
      }
    }

    // Store the validated tools directly (MCP objects are already enhanced)
    agentData.tools = validTools;

    Object.assign(agentData, {
      author: userId,
      name,
      description,
      instructions: injectSpecialVariables(instructions),
      provider,
      model,
    });

    agentData.id = `agent_${nanoid()}`;
    const agent = await createAgent(agentData);
    res.status(201).json(agent);
  } catch (error) {
    logger.error('[/Agents] Error creating agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieves an Agent by ID.
 * @route GET /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @param {object} req.user - Authenticated user information
 * @param {string} req.user.id - User ID
 * @returns {Promise<Agent>} 200 - success response - application/json
 * @returns {Error} 404 - Agent not found
 */
const getAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const author = req.user.id;

    let query = { id, author };

    const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, ['agentIds']);
    if (globalProject && (globalProject.agentIds?.length ?? 0) > 0) {
      query = {
        $or: [{ id, $in: globalProject.agentIds }, query],
      };
    }

    const agent = await getAgent(query);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    agent.version = agent.versions ? agent.versions.length : 0;

    if (agent.avatar && agent.avatar?.source === FileSources.s3) {
      const originalUrl = agent.avatar.filepath;
      agent.avatar.filepath = await refreshS3Url(agent.avatar);
      if (originalUrl !== agent.avatar.filepath) {
        await updateAgent({ id }, { avatar: agent.avatar }, req.user.id);
      }
    }

    agent.author = agent.author.toString();
    agent.isCollaborative = !!agent.isCollaborative;

    if (agent.author !== author) {
      delete agent.author;
    }

    if (!agent.isCollaborative && agent.author !== author && req.user.role !== SystemRoles.ADMIN) {
      return res.status(200).json({
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        author: agent.author,
        projectIds: agent.projectIds,
        isCollaborative: agent.isCollaborative,
        version: agent.version,
        default_prompts: agent.default_prompts,
        tools: agent.tools,
      });
    }
    return res.status(200).json(agent);
  } catch (error) {
    logger.error('[/Agents/:id] Error retrieving agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Updates an Agent.
 * @route PATCH /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @param {AgentUpdateParams} req.body - The Agent update parameters.
 * @returns {Agent} 200 - success response - application/json
 */
const updateAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const { projectIds, removeProjectIds, ...updateData } = req.body;

    // Inject special variables into instructions if being updated
    if (updateData.instructions !== undefined) {
      updateData.instructions = injectSpecialVariables(updateData.instructions);
    }

    // Handle tools update - preserve MCP tool objects and validate strings
    if (updateData.tools) {
      const validTools = [];
      for (const tool of updateData.tools) {
        if (typeof tool === 'string') {
          // Check if tool is available in manifest tools
          if (req.app.locals.availableTools[tool]) {
            validTools.push(tool);
          }
          // For system tools, also check if the capability is enabled
          else if (systemTools[tool]) {
            const capability = getToolCapability(tool);
            if (capability) {
              const isCapabilityEnabled = await checkCapability(req, capability);
              if (isCapabilityEnabled) {
                validTools.push(tool);
              }
            } else {
              // Tool doesn't require a capability check (shouldn't happen with current system tools)
              validTools.push(tool);
            }
          }
        } else if (typeof tool === 'object' && tool.tool && tool.server && tool.type) {
          // Preserve MCP tool objects as they come from the frontend
          validTools.push(tool);
        }
      }

      // Store the validated tools directly (MCP objects are already enhanced)
      updateData.tools = validTools;
    }

    const isAdmin = req.user.role === SystemRoles.ADMIN;
    const existingAgent = await getAgent({ id });
    const isAuthor = existingAgent.author.toString() === req.user.id;

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if this is a global agent that should be cloned instead of modified
    const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, 'agentIds');
    const isGlobalAgent = globalProject && (globalProject.agentIds?.includes(id) ?? false);
    const shouldCloneInsteadOfUpdate =
      isGlobalAgent && existingAgent.isCollaborative && !isAuthor && !isAdmin;

    if (shouldCloneInsteadOfUpdate) {
      // Instead of updating the global agent, create a duplicate for the user
      const {
        id: _id,
        _id: __id,
        author: _author,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        tool_resources: _tool_resources = {},
        ...cloneData
      } = existingAgent;

      // Apply the updates to the clone data
      Object.assign(cloneData, updateData);

      // Remove MCP tools from duplicated agents so users need to connect their own integrations
      if (cloneData.tools && Array.isArray(cloneData.tools)) {
        const originalToolCount = cloneData.tools.length;
        const { ToolMetadataUtils } = require('librechat-data-provider');
        const availableTools = req.app.locals.availableTools || {};
        
        const mcpTools = cloneData.tools.filter((tool) => {
          if (typeof tool === 'string') {
            const toolDef = availableTools[tool];
            return toolDef && ToolMetadataUtils.isMCPTool(toolDef);
          }
          return false;
        });

        cloneData.tools = cloneData.tools.filter((tool) => {
          if (typeof tool === 'string') {
            // Check if this is an MCP tool using embedded metadata
            const toolDef = availableTools[tool];
            return !(toolDef && ToolMetadataUtils.isMCPTool(toolDef));
          }
          return true;
        });

        if (mcpTools.length > 0) {
          logger.info(
            `[/agents/:id] Removed ${mcpTools.length} MCP tools during auto-duplication for user ${req.user.id}. User can add their own integrations. Tools removed: ${mcpTools.join(', ')}`,
          );
        }

        logger.info(
          `[/agents/:id] Tool count: ${originalToolCount} -> ${cloneData.tools.length} (removed ${originalToolCount - cloneData.tools.length} MCP tools)`,
        );
      }

      if (_tool_resources?.[EToolResources.ocr]) {
        cloneData.tool_resources = {
          [EToolResources.ocr]: _tool_resources[EToolResources.ocr],
        };
      }

      const newAgentId = `agent_${nanoid()}`;
      const newAgentData = Object.assign(cloneData, {
        id: newAgentId,
        author: req.user.id,
        originalAgentId: id,
        projectIds: [], // Clear project associations - duplicated agents should be private
        isCollaborative: false, // Make the private copy non-collaborative
        tools: filterOutMCPTools(originalAgent.tools), // Clear MCP tools for duplicated agents - users need to connect their own integrations
      });

      // Handle actions duplication if the original agent has actions
      const newActionsList = [];
      const originalActions = (await getActions({ agent_id: id }, true)) ?? [];
      const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];
      const promises = [];

      /**
       * Duplicates an action and returns the new action ID.
       * @param {Action} action
       * @returns {Promise<string>}
       */
      const duplicateAction = async (action) => {
        const newActionId = nanoid();
        const [domain] = action.action_id.split(actionDelimiter);
        const fullActionId = `${domain}${actionDelimiter}${newActionId}`;

        const newAction = await updateAction(
          { action_id: newActionId },
          {
            metadata: action.metadata,
            agent_id: newAgentId,
            user: req.user.id,
          },
        );

        const filteredMetadata = { ...newAction.metadata };
        for (const field of sensitiveFields) {
          delete filteredMetadata[field];
        }

        newAction.metadata = filteredMetadata;
        newActionsList.push(newAction);
        return fullActionId;
      };

      for (const action of originalActions) {
        promises.push(
          duplicateAction(action).catch((error) => {
            logger.error('[/agents/:id] Error duplicating Action during auto-duplication:', error);
          }),
        );
      }

      const agentActions = await Promise.all(promises);
      newAgentData.actions = agentActions;

      const newAgent = await createAgent(newAgentData);

      logger.info(
        `[/agents/:id] Auto-duplicated global agent ${id} to ${newAgentId} for user ${req.user.id} due to modification attempt`,
      );

      return res.status(201).json({
        ...newAgent,
        actions: newActionsList,
        message: 'Global agent duplicated as your private copy with modifications',
        duplicated: true,
        originalAgentId: id,
      });
    }

    const hasEditPermission = existingAgent.isCollaborative || isAdmin || isAuthor;

    if (!hasEditPermission) {
      return res.status(403).json({
        error: 'You do not have permission to modify this non-collaborative agent',
      });
    }

    let updatedAgent =
      Object.keys(updateData).length > 0
        ? await updateAgent({ id }, updateData, req.user.id)
        : existingAgent;

    if (projectIds || removeProjectIds) {
      updatedAgent = await updateAgentProjects({
        user: req.user,
        agentId: id,
        projectIds,
        removeProjectIds,
      });
    }

    if (updatedAgent.author) {
      updatedAgent.author = updatedAgent.author.toString();
    }

    if (updatedAgent.author !== req.user.id) {
      delete updatedAgent.author;
    }

    return res.json(updatedAgent);
  } catch (error) {
    logger.error('[/Agents/:id] Error updating Agent', error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        error: error.message,
        details: error.details,
      });
    }

    res.status(500).json({ error: error.message });
  }
};

/**
 * Duplicates an Agent based on the provided ID.
 * @route POST /Agents/:id/duplicate
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 201 - success response - application/json
 */
const duplicateAgentHandler = async (req, res) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];

  try {
    const agent = await getAgent({ id });
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
        status: 'error',
      });
    }

    const {
      id: _id,
      _id: __id,
      author: _author,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      tool_resources: _tool_resources = {},
      ...cloneData
    } = agent;
    cloneData.name = `${agent.name} (${new Date().toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false,
    })})`;

    if (_tool_resources?.[EToolResources.ocr]) {
      cloneData.tool_resources = {
        [EToolResources.ocr]: _tool_resources[EToolResources.ocr],
      };
    }

    const newAgentId = `agent_${nanoid()}`;

    // Remove MCP tools from duplicated agents so users need to connect their own integrations
    // MCP tools are personal and should not be inherited during duplication
    if (cloneData.tools && Array.isArray(cloneData.tools)) {
      const originalToolCount = cloneData.tools.length;
      const { ToolMetadataUtils } = require('librechat-data-provider');
      const availableTools = req.app.locals.availableTools || {};
      
      const mcpTools = cloneData.tools.filter((tool) => {
        if (typeof tool === 'string') {
          const toolDef = availableTools[tool];
          return toolDef && ToolMetadataUtils.isMCPTool(toolDef);
        }
        return false;
      });

      cloneData.tools = cloneData.tools.filter((tool) => {
        if (typeof tool === 'string') {
          // Check if this is an MCP tool using embedded metadata
          const toolDef = availableTools[tool];
          return !(toolDef && ToolMetadataUtils.isMCPTool(toolDef));
        }
        return true;
      });

      if (mcpTools.length > 0) {
        logger.info(
          `[/agents/:id/duplicate] Removed ${mcpTools.length} MCP tools during duplication for user ${userId}. User can add their own integrations. Tools removed: ${mcpTools.join(', ')}`,
        );
      }

      logger.info(
        `[/agents/:id/duplicate] Tool count: ${originalToolCount} -> ${cloneData.tools.length} (removed ${originalToolCount - cloneData.tools.length} MCP tools)`,
      );
    }

    const newAgentData = Object.assign(cloneData, {
      id: newAgentId,
      author: userId,
      originalAgentId: id,
      projectIds: [], // Clear project associations - duplicated agents should be private
      tools: filterOutMCPTools(cloneData.tools), // Clear MCP tools for duplicated agents - users need to connect their own integrations
    });

    const newActionsList = [];
    const originalActions = (await getActions({ agent_id: id }, true)) ?? [];
    const promises = [];

    /**
     * Duplicates an action and returns the new action ID.
     * @param {Action} action
     * @returns {Promise<string>}
     */
    const duplicateAction = async (action) => {
      const newActionId = nanoid();
      const [domain] = action.action_id.split(actionDelimiter);
      const fullActionId = `${domain}${actionDelimiter}${newActionId}`;

      const newAction = await updateAction(
        { action_id: newActionId },
        {
          metadata: action.metadata,
          agent_id: newAgentId,
          user: userId,
        },
      );

      const filteredMetadata = { ...newAction.metadata };
      for (const field of sensitiveFields) {
        delete filteredMetadata[field];
      }

      newAction.metadata = filteredMetadata;
      newActionsList.push(newAction);
      return fullActionId;
    };

    for (const action of originalActions) {
      promises.push(
        duplicateAction(action).catch((error) => {
          logger.error('[/agents/:id/duplicate] Error duplicating Action:', error);
        }),
      );
    }

    const agentActions = await Promise.all(promises);
    newAgentData.actions = agentActions;
    const newAgent = await createAgent(newAgentData);

    // Extract MCP servers from the enhanced tools for frontend compatibility
    const mcpServersNeeded = [];
    if (Array.isArray(newAgentData.tools)) {
      for (const tool of newAgentData.tools) {
        if (typeof tool === 'object' && tool.server && tool.type) {
          const appSlug = tool.server.startsWith('pipedream-')
            ? tool.server.replace('pipedream-', '')
            : tool.server;
          if (!mcpServersNeeded.includes(appSlug)) {
            mcpServersNeeded.push(appSlug);
          }
        }
      }
    }

    return res.status(201).json({
      agent: newAgent,
      actions: newActionsList,
      mcp_servers_needed: mcpServersNeeded,
    });
  } catch (error) {
    logger.error('[/Agents/:id/duplicate] Error duplicating Agent:', error);

    res.status(500).json({ error: error.message });
  }
};

/**
 * Deletes an Agent based on the provided ID.
 * @route DELETE /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 */
const deleteAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const agent = await getAgent({ id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    await deleteAgent({ id, author: req.user.id });
    return res.json({ message: 'Agent deleted' });
  } catch (error) {
    logger.error('[/Agents/:id] Error deleting Agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 *
 * @route GET /Agents
 * @param {object} req - Express Request
 * @param {object} req.query - Request query
 * @param {string} [req.query.user] - The user ID of the agent's author.
 * @returns {Promise<AgentListResponse>} 200 - success response - application/json
 */
const getListAgentsHandler = async (req, res) => {
  try {
    const data = await getListAgents({
      author: req.user.id,
    });
    return res.json(data);
  } catch (error) {
    logger.error('[/Agents] Error listing Agents', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Uploads and updates an avatar for a specific agent.
 * @route POST /:agent_id/avatar
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {object} req.body - Request body
 * @param {string} [req.body.avatar] - Optional avatar for the agent's avatar.
 * @returns {Object} 200 - success response - application/json
 */
const uploadAgentAvatarHandler = async (req, res) => {
  try {
    filterFile({ req, file: req.file, image: true, isAvatar: true });
    const { agent_id } = req.params;
    if (!agent_id) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }

    const buffer = await fs.readFile(req.file.path);
    const image = await uploadImageBuffer({
      req,
      context: FileContext.avatar,
      metadata: { buffer },
    });

    let _avatar;
    try {
      const agent = await getAgent({ id: agent_id });
      _avatar = agent.avatar;
    } catch (error) {
      logger.error('[/:agent_id/avatar] Error fetching agent', error);
      _avatar = {};
    }

    if (_avatar && _avatar.source) {
      const { deleteFile } = getStrategyFunctions(_avatar.source);
      try {
        await deleteFile(req, { filepath: _avatar.filepath });
        await deleteFileByFilter({ user: req.user.id, filepath: _avatar.filepath });
      } catch (error) {
        logger.error('[/:agent_id/avatar] Error deleting old avatar', error);
      }
    }

    const promises = [];

    const data = {
      avatar: {
        filepath: image.filepath,
        source: req.app.locals.fileStrategy,
      },
    };

    promises.push(await updateAgent({ id: agent_id, author: req.user.id }, data, req.user.id));

    const resolved = await Promise.all(promises);
    res.status(201).json(resolved[0]);
  } catch (error) {
    const message = 'An error occurred while updating the Agent Avatar';
    logger.error(message, error);
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/:agent_id/avatar] Temp. image upload file deleted');
    } catch (error) {
      logger.debug('[/:agent_id/avatar] Temp. image upload file already deleted');
    }
  }
};

/**
 * Reverts an agent to a previous version from its version history.
 * @route PATCH /agents/:id/revert
 * @param {object} req - Express Request object
 * @param {object} req.params - Request parameters
 * @param {string} req.params.id - The ID of the agent to revert
 * @param {object} req.body - Request body
 * @param {number} req.body.version_index - The index of the version to revert to
 * @param {object} req.user - Authenticated user information
 * @param {string} req.user.id - User ID
 * @param {string} req.user.role - User role
 * @param {ServerResponse} res - Express Response object
 * @returns {Promise<Agent>} 200 - The updated agent after reverting to the specified version
 * @throws {Error} 400 - If version_index is missing
 * @throws {Error} 403 - If user doesn't have permission to modify the agent
 * @throws {Error} 404 - If agent not found
 * @throws {Error} 500 - If there's an internal server error during the reversion process
 */
const revertAgentVersionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { version_index } = req.body;

    if (version_index === undefined) {
      return res.status(400).json({ error: 'version_index is required' });
    }

    const isAdmin = req.user.role === SystemRoles.ADMIN;
    const existingAgent = await getAgent({ id });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const isAuthor = existingAgent.author.toString() === req.user.id;
    const hasEditPermission = existingAgent.isCollaborative || isAdmin || isAuthor;

    if (!hasEditPermission) {
      return res.status(403).json({
        error: 'You do not have permission to modify this non-collaborative agent',
      });
    }

    const updatedAgent = await revertAgentVersion({ id }, version_index);

    if (updatedAgent.author) {
      updatedAgent.author = updatedAgent.author.toString();
    }

    if (updatedAgent.author !== req.user.id) {
      delete updatedAgent.author;
    }

    return res.json(updatedAgent);
  } catch (error) {
    logger.error('[/agents/:id/revert] Error reverting Agent version', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAgent: createAgentHandler,
  getAgent: getAgentHandler,
  updateAgent: updateAgentHandler,
  duplicateAgent: duplicateAgentHandler,
  deleteAgent: deleteAgentHandler,
  getListAgents: getListAgentsHandler,
  uploadAgentAvatar: uploadAgentAvatarHandler,
  revertAgentVersion: revertAgentVersionHandler,
};
