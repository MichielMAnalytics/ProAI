const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { normalizeServerName } = require('librechat-mcp');
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
  const toolDefinition = req.app.locals.availableTools[toolKey]?.function;
  if (!toolDefinition) {
    logger.error(`Tool ${toolKey} not found in available tools`);
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

  const [toolName, serverName] = toolKey.split(Constants.mcp_delimiter);
  
  // Use only the original tool name for the function name to avoid exceeding OpenAI's 64-character limit
  // The toolKey includes server information but the tool name should be just the tool itself
  const functionName = toolName;

  let normalizedToolKey = `${toolName}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`;
  
  // Don't modify the tool key - keep original names to avoid breaking existing tool calls
  // OpenAI's function name limits are more flexible in practice than the strict 64-character documentation
  normalizedToolKey = toolKey;

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
      
      // SECURITY FIX: Verify that the current user has access to this MCP server
      // This prevents users from using admin's MCP tools via shared agents
      const mcpManager = getMCPManager(currentUserId);
      
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
      
      const provider = (config?.metadata?.provider || _provider)?.toLowerCase();
      
      // Add user and conversation context to tool arguments for MCP tools
      const enhancedArguments = {
        ...toolArguments,
        librechat_context: {
          user_id: currentUserId,
          conversation_id: config?.configurable?.thread_id,
        }
      };
      
      const result = await mcpManager.callTool({
        serverName,
        toolName,
        provider,
        toolArguments: enhancedArguments,
        options: {
          userId: currentUserId,
          signal: derivedSignal,
        },
      });

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
  return toolInstance;
}

module.exports = {
  createMCPTool,
};
