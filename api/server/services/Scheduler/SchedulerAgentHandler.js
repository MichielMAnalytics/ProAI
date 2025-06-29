const { logger } = require('~/config');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { loadAgent, getAgent } = require('~/models/Agent');
const { createMockRequest, updateRequestForEphemeralAgent } = require('./utils/mockUtils');

class SchedulerAgentHandler {
  constructor() {
    logger.debug('[SchedulerAgentHandler] Initialized');
  }

  /**
   * Load agent for a scheduler task
   * @param {Object} task - The scheduler task
   * @returns {Promise<Object|null>} Loaded agent or null if not found
   */
  async loadAgentForTask(task) {
    if (!task.agent_id || task.endpoint !== EModelEndpoint.agents) {
      return null;
    }

    const mockReq = createMockRequest(task);

    const agent = await loadAgent({
      req: mockReq,
      agent_id: task.agent_id,
      endpoint: task.endpoint,
      model_parameters: { model: task.ai_model },
    });

    if (!agent) {
      // Try to get agent details for error context
      const agentDetails = await getAgent({ id: task.agent_id });
      if (agentDetails) {
        logger.warn(
          `[SchedulerAgentHandler] Agent ${task.agent_id} found but not accessible for user ${task.user}`,
        );
        // Return agent details for fallback
        return { fallback: true, ...agentDetails };
      } else {
        logger.warn(`[SchedulerAgentHandler] Agent ${task.agent_id} not found`);
        return null;
      }
    } else {
      logger.info(`[SchedulerAgentHandler] Loaded agent ${task.agent_id} successfully`);
      return agent;
    }
  }

  /**
   * Create ephemeral agent configuration for MCP tools
   * @param {Object} task - The scheduler task
   * @param {Object} user - The user object
   * @returns {Promise<Object>} Ephemeral agent setup result
   */
  async createEphemeralAgentSetup(task, user) {
    logger.info(`[SchedulerAgentHandler] Creating ephemeral agent setup for task ${task.id}`);

    // Ensure user ID is properly formatted as string (convert from ObjectId if needed)
    const userId = user.toString();
    logger.debug(`[SchedulerAgentHandler] Converted user ID: ${userId} (type: ${typeof userId})`);

    // Create mock request structure for agent initialization
    const mockReq = createMockRequest(task);
    logger.debug(`[SchedulerAgentHandler] Created mock request for task ${task.id}`);
    logger.debug(
      `[SchedulerAgentHandler] Mock request user ID: ${mockReq.user.id} (type: ${typeof mockReq.user.id})`,
    );
    logger.debug(
      `[SchedulerAgentHandler] Initial availableTools count: ${Object.keys(mockReq.app.locals.availableTools).length}`,
    );

    // Initialize MCP tools and populate availableTools using the standardized initialization
    const MCPInitializer = require('~/server/services/MCPInitializer');
    const mcpInitializer = MCPInitializer.getInstance();

    logger.info(
      `[SchedulerAgentHandler] Calling ensureUserMCPReady for user ${userId} with availableTools reference`,
    );

    const mcpResult = await mcpInitializer.ensureUserMCPReady(
      userId, // Use the properly formatted string user ID
      'SchedulerAgentHandler.createEphemeralAgentSetup',
      mockReq.app.locals.availableTools,
    );

    logger.info(`[SchedulerAgentHandler] MCP initialization complete for task ${task.id}:`, {
      success: mcpResult.success,
      serverCount: mcpResult.serverCount,
      toolCount: mcpResult.toolCount,
      error: mcpResult.error,
      finalAvailableToolsCount: Object.keys(mockReq.app.locals.availableTools).length,
      cached: mcpResult.cached,
    });

    if (!mcpResult.success) {
      logger.warn(`[SchedulerAgentHandler] MCP initialization failed: ${mcpResult.error}`);
    } else {
      logger.info(
        `[SchedulerAgentHandler] MCP initialized: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools`,
      );
    }

    // Log the actual available tools
    const availableToolKeys = Object.keys(mockReq.app.locals.availableTools);
    logger.debug(
      `[SchedulerAgentHandler] Available tools after MCP init: ${availableToolKeys.join(', ')}`,
    );

    // Extract MCP server names from available tools
    const mcpServerNames = this.extractMCPServerNames(mockReq.app.locals.availableTools);

    logger.info(`[SchedulerAgentHandler] Extracted MCP server names: ${mcpServerNames.join(', ')}`);

    if (mcpServerNames.length === 0) {
      logger.warn(
        `[SchedulerAgentHandler] No MCP server names extracted despite ${Object.keys(mockReq.app.locals.availableTools).length} available tools`,
      );
      logger.warn(`[SchedulerAgentHandler] Available tool keys: ${availableToolKeys.join(', ')}`);

      // Check if MCP was supposed to be successful but we got no tools
      if (mcpResult.success && mcpResult.serverCount > 0) {
        logger.error(
          `[SchedulerAgentHandler] CRITICAL: MCP reported success with ${mcpResult.serverCount} servers but no tools extracted!`,
        );
      }
    }

    // Set up ephemeral agent configuration
    const underlyingEndpoint = task.endpoint || EModelEndpoint.openAI;
    const underlyingModel = task.ai_model || 'gpt-4o-mini';

    logger.info(
      `[SchedulerAgentHandler] Using underlying endpoint: ${underlyingEndpoint}, model: ${underlyingModel}`,
    );

    // Create ephemeral agent configuration
    const ephemeralAgent = {
      scheduler: true,
      workflow: true,
      execute_code: false,
      web_search: true,
      mcp: mcpServerNames,
    };

    // Update request body for agent loading
    updateRequestForEphemeralAgent(
      mockReq,
      { ...task, user },
      ephemeralAgent,
      underlyingEndpoint,
      underlyingModel,
    );

    logger.info(`[SchedulerAgentHandler] Ephemeral agent config:`, {
      scheduler: ephemeralAgent.scheduler,
      workflow: ephemeralAgent.workflow,
      execute_code: ephemeralAgent.execute_code,
      web_search: ephemeralAgent.web_search,
      mcpServers: ephemeralAgent.mcp,
      availableToolsCount: Object.keys(mockReq.app.locals.availableTools).length,
    });

    return {
      mockReq,
      ephemeralAgent,
      underlyingEndpoint,
      underlyingModel,
      mcpServerNames,
      availableToolsCount: Object.keys(mockReq.app.locals.availableTools).length,
    };
  }

  /**
   * Load ephemeral agent with MCP tools
   * @param {Object} setupResult - Result from createEphemeralAgentSetup
   * @returns {Promise<Object>} Loaded ephemeral agent
   */
  async loadEphemeralAgent(setupResult) {
    const { mockReq, underlyingEndpoint, underlyingModel } = setupResult;

    logger.info(`[SchedulerAgentHandler] Loading ephemeral agent with parameters:`, {
      underlyingEndpoint,
      underlyingModel,
      expectedMcpServers: setupResult.mcpServerNames,
      availableToolsInReq: Object.keys(mockReq.app.locals.availableTools).length,
    });

    // Load ephemeral agent using the loadAgent function
    const agent = await loadAgent({
      req: mockReq,
      agent_id: Constants.EPHEMERAL_AGENT_ID,
      endpoint: underlyingEndpoint,
      model_parameters: { model: underlyingModel },
    });

    if (!agent) {
      throw new Error('Failed to load ephemeral agent');
    }

    logger.info(`[SchedulerAgentHandler] Loaded ephemeral agent successfully:`, {
      agentId: agent.id,
      model: agent.model,
      provider: agent.provider,
      toolsCount: agent.tools?.length || 0,
      allTools: agent.tools || [],
    });

    // Log MCP tools specifically
    const mcpTools =
      agent.tools?.filter((tool) => {
        // Handle enhanced tool format (objects with MCP metadata)
        if (typeof tool === 'object' && tool.tool) {
          return tool.tool.includes(Constants.mcp_delimiter);
        }
        // Handle regular tool format (strings)
        return typeof tool === 'string' && tool.includes(Constants.mcp_delimiter);
      }) || [];
    logger.info(`[SchedulerAgentHandler] Ephemeral agent MCP tools analysis:`, {
      mcpToolsCount: mcpTools.length,
      mcpTools: mcpTools,
      mcpDelimiter: Constants.mcp_delimiter,
      expectedMcpServers: setupResult.mcpServerNames,
    });

    if (mcpTools.length === 0 && setupResult.mcpServerNames.length > 0) {
      logger.error(`[SchedulerAgentHandler] CRITICAL: Expected MCP tools but agent has none!`, {
        expectedServers: setupResult.mcpServerNames,
        availableToolsCount: setupResult.availableToolsCount,
        allAgentTools: agent.tools,
        availableToolsKeys: Object.keys(mockReq.app.locals.availableTools),
      });
    } else if (mcpTools.length > 0) {
      logger.info(
        `[SchedulerAgentHandler] SUCCESS: Ephemeral agent has ${mcpTools.length} MCP tools: ${mcpTools.join(', ')}`,
      );
    }

    return agent;
  }

  /**
   * Extract MCP server names from available tools
   * @param {Object} availableTools - Available tools registry
   * @returns {string[]} Array of MCP server names
   */
  extractMCPServerNames(availableTools) {
    const mcpServerNames = [];
    const availableToolKeys = Object.keys(availableTools);

    logger.debug(`[SchedulerAgentHandler] Available tool keys: ${availableToolKeys.join(', ')}`);

    for (const toolKey of availableToolKeys) {
      if (toolKey.includes(Constants.mcp_delimiter)) {
        const serverName = toolKey.split(Constants.mcp_delimiter)[1];
        if (serverName && !mcpServerNames.includes(serverName)) {
          mcpServerNames.push(serverName);
          logger.debug(
            `[SchedulerAgentHandler] Extracted MCP server name: ${serverName} from tool: ${toolKey}`,
          );
        }
      }
    }

    logger.info(`[SchedulerAgentHandler] Found MCP server names: ${mcpServerNames.join(', ')}`);

    return mcpServerNames;
  }

  /**
   * Determine fallback endpoint and model for agent loading failure
   * @param {Object} task - The scheduler task
   * @param {Object} agentDetails - Agent details if available
   * @returns {Object} Fallback configuration
   */
  determineFallbackConfiguration(task, agentDetails) {
    let endpoint = task.endpoint || EModelEndpoint.openAI;
    let model = task.ai_model;

    if (agentDetails && agentDetails.model) {
      endpoint = agentDetails.provider || EModelEndpoint.openAI;
      model = agentDetails.model;
      logger.info(
        `[SchedulerAgentHandler] Using agent fallback: endpoint=${endpoint}, model=${model}`,
      );
    } else {
      // Last resort fallback
      endpoint = EModelEndpoint.openAI;
      model = 'gpt-4o-mini';
      logger.info(
        `[SchedulerAgentHandler] Using default fallback: endpoint=${endpoint}, model=${model}`,
      );
    }

    return { endpoint, model };
  }
}

module.exports = SchedulerAgentHandler;
