const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { normalizeServerName } = require('@librechat/api');
const { Constants: AgentConstants, Providers } = require('@librechat/agents');
const {
  Constants,
  ContentTypes,
  isAssistantsEndpoint,
  convertJsonSchemaToZod,
} = require('librechat-data-provider');
const { logger, getMCPManager } = require('~/config');

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {ServerRequest} params.req - The Express request object, containing user/request info.
 * @param {string} params.toolKey - The toolKey for the tool.
 * @param {import('@librechat/agents').Providers | EModelEndpoint} params.provider - The provider for the tool.
 * @param {string} params.model - The model for the tool.
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createMCPTool({ req, toolKey, provider: _provider }) {
  logger.info(`[MCP] createMCPTool called for toolKey: ${toolKey}`);
  logger.info(`[MCP] Provider: ${_provider}`);
  logger.info(`[MCP] Available tools count: ${Object.keys(req.app.locals.availableTools || {}).length}`);
  logger.info(`[MCP] Looking for tool definition for key: ${toolKey}`);
  
  const toolDefinition = req.app.locals.availableTools[toolKey]?.function;
  if (!toolDefinition) {
    logger.error(`[MCP] Tool ${toolKey} not found in available tools`);
    logger.error(`[MCP] Available tools keys: ${Object.keys(req.app.locals.availableTools || {}).join(', ')}`);
    return null;
  }
  /** @type {LCTool} */
  const { description, parameters } = toolDefinition;
  const isGoogle = _provider === Providers.VERTEXAI || _provider === Providers.GOOGLE;
  let schema = convertJsonSchemaToZod(parameters, {
    allowEmptyObject: !isGoogle,
    transformOneOfAnyOf: true,
  });

  if (!schema) {
    schema = z.object({ input: z.string().optional() });
  }

  // Get server information from the MCP tool registry
  const mcpToolRegistry = req.app.locals.mcpToolRegistry;
  logger.info(`[MCP] mcpToolRegistry exists: ${!!mcpToolRegistry}`);
  logger.info(`[MCP] mcpToolRegistry size: ${mcpToolRegistry?.size || 0}`);
  logger.info(`[MCP] mcpToolRegistry has toolKey ${toolKey}: ${mcpToolRegistry?.has(toolKey) || false}`);
  
  if (mcpToolRegistry && mcpToolRegistry.size > 0) {
    logger.info(`[MCP] mcpToolRegistry contents: ${Array.from(mcpToolRegistry.keys()).join(', ')}`);
  }
  
  if (!mcpToolRegistry || !mcpToolRegistry.has(toolKey)) {
    logger.error(`[MCP] Tool ${toolKey} not found in MCP tool registry`);
    // logger.error(`[MCP] Registry keys: ${mcpToolRegistry ? Array.from(mcpToolRegistry.keys()).join(', ') : 'No registry'}`);
    return null;
  }

  const mcpInfo = mcpToolRegistry.get(toolKey);
  const serverName = mcpInfo?.serverName;
  const toolName = mcpInfo?.toolName || toolKey; // Fallback to toolKey if toolName not available
  const isGlobalTool = mcpInfo?.isGlobal || false;
  
  logger.info(`[MCP] Tool info for ${toolKey}: serverName=${serverName}, toolName=${toolName}, isGlobal=${isGlobalTool}`);
  logger.info(`[MCP] Full mcpInfo: ${JSON.stringify(mcpInfo)}`);
  
  if (!serverName) {
    logger.error(`[MCP] Could not determine server name for MCP tool: ${toolKey}`);
    return null;
  }
  
  // Use only the original tool name for the function name to avoid exceeding OpenAI's 64-character limit
  const functionName = toolName;

  if (!req.user?.id) {
    logger.error(
      `[MCP][${serverName}][${toolName}] User ID not found on request. Cannot create tool.`,
    );
    throw new Error(`User ID not found on request. Cannot create tool for ${toolKey}.`);
  }

  /** @type {(toolArguments: Object | string, config?: GraphRunnableConfig) => Promise<unknown>} */
  const _call = async (toolArguments, config) => {
    try {
      const derivedSignal = config?.signal ? AbortSignal.any([config.signal]) : undefined;
      
      // SECURITY FIX: Always use the current user's ID from config, never fallback to req.user.id
      // req.user.id is from when the tool was created (could be different user for duplicated agents)
      const currentUserId = config?.configurable?.user_id;
      
      if (!currentUserId) {
        logger.error(`[MCP][${serverName}][${toolName}] No current user ID found in config. Cannot execute MCP tool.`);
        throw new Error(`Current user ID required for MCP tool execution: ${toolKey}`);
      }
      
      logger.debug(`[MCP] Tool execution context:`, {
        toolKey,
        currentUserId,
        originalReqUserId: req.user?.id,
        serverName,
        toolName
      });
      
      // SECURITY FIX: Handle global vs user-specific MCP tools differently
      const mcpManager = getMCPManager(currentUserId);
      
      // For global tools, use the global connection; for user tools, verify user access
      if (isGlobalTool) {
        logger.info(`[MCP][${serverName}][${toolName}] Using global MCP tool for user ${currentUserId}`);
        
        // For global tools, check if the global connection exists and is available
        const globalConnection = mcpManager.getConnection(serverName);
        if (!globalConnection || !(await globalConnection.isConnected())) {
          logger.error(`[MCP][${serverName}][${toolName}] Global MCP server ${serverName} is not connected`);
          throw new Error(`Global MCP service ${serverName} is currently unavailable. Please contact support.`);
        }
      } else {
        logger.info(`[MCP][${serverName}][${toolName}] Using user-specific MCP tool for user ${currentUserId}`);
        
        // Check if the current user has their own integration for this server
        try {
          const userConnection = await mcpManager.getUserConnection(currentUserId, serverName);
          if (!userConnection || !(await userConnection.isConnected())) {
            logger.warn(`[MCP][${serverName}][${toolName}] User ${currentUserId} does not have access to MCP server ${serverName}. This may be a shared agent tool that requires user's own integration.`);
            throw new Error(`You need to connect your own ${serverName.replace('pipedream-', '')} integration to use this tool. Shared agent MCP tools require your personal account connections.`);
          }
        } catch (error) {
          if (error.message.includes('You need to connect your own')) {
            throw error; // Re-throw our custom error message
          }
          logger.error(`[MCP][${serverName}][${toolName}] Failed to verify user access for ${currentUserId}:`, error.message);
          throw new Error(`Unable to access ${serverName.replace('pipedream-', '')} integration. Please ensure you have connected your account.`);
        }
      }
      
      const provider = (config?.metadata?.provider || _provider)?.toLowerCase();
      
      // Pass tool arguments directly to MCP server without modification
      // MCP servers expect specific argument structures and adding extra fields can break parsing
      const result = await mcpManager.callTool({
        serverName,
        toolName,
        provider,
        toolArguments,
        options: {
          userId: isGlobalTool ? null : currentUserId, // For global tools, don't pass userId to use global connection
          signal: derivedSignal,
        },
      });
      
      logger.info(`[MCP][${serverName}][${toolName}] Tool call successful for user ${currentUserId} (isGlobal=${isGlobalTool})`);
      logger.debug(`[MCP][${serverName}][${toolName}] Tool result:`, result);

      if (isAssistantsEndpoint(provider) && Array.isArray(result)) {
        return result[0];
      }
      if (isGoogle && Array.isArray(result[0]) && result[0][0]?.type === ContentTypes.TEXT) {
        return [result[0][0].text, result[1]];
      }
      return result;
    } catch (error) {
      logger.error(
        `[MCP][User: ${config?.configurable?.user_id}][${serverName}] Error calling "${toolName}" MCP tool:`,
        error,
      );
      throw new Error(
        `"${toolKey}" tool call failed${error?.message ? `: ${error?.message}` : '.'}`,
      );
    }
  };

  const toolInstance = tool(_call, {
    schema,
    name: functionName,
    description: description || '',
    responseFormat: AgentConstants.CONTENT_AND_ARTIFACT,
  });
  toolInstance.mcp = true;
  
  // logger.info(`[MCP] Successfully created MCP tool: ${functionName} (toolKey: ${toolKey}, server: ${serverName})`);
  return toolInstance;
}

module.exports = {
  createMCPTool,
};
