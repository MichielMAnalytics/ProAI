const { isAgentsEndpoint, Constants } = require('librechat-data-provider');
const { loadAgent } = require('~/models/Agent');
const { logger } = require('~/config');

const buildOptions = async (req, endpoint, parsedBody, endpointType) => {
  const { spec, iconURL, agent_id, instructions, maxContextTokens, ...model_parameters } =
    parsedBody;
  
  // Critical fix: For ephemeral agents, ensure MCP tools are loaded FIRST
  // This fixes the sequence issue where ephemeral agents are created before MCP tools are available
  const isEphemeral = !isAgentsEndpoint(endpoint) || agent_id === Constants.EPHEMERAL_AGENT_ID;
  
  if (isEphemeral && req.app.locals.addUserSpecificMcpFromDb && req.user?.id) {
    logger.debug(`[agents/buildOptions] Pre-loading MCP tools for ephemeral agent (user: ${req.user.id})`);
    
    try {
      // Initialize MCP tools before agent creation
      const MCPInitializer = require('~/server/services/MCPInitializer');
      const mcpInitializer = MCPInitializer.getInstance();
      const mcpResult = await mcpInitializer.ensureUserMCPReady(
        req.user.id, 
        'agents/buildOptions', 
        req.app.locals.availableTools
      );
      
      if (mcpResult.success) {
        logger.info(`[agents/buildOptions] MCP pre-loading successful: ${mcpResult.serverCount} servers, ${mcpResult.toolCount} tools in ${mcpResult.duration}ms`);
      } else {
        logger.warn(`[agents/buildOptions] MCP pre-loading failed: ${mcpResult.error}`);
      }
    } catch (error) {
      logger.warn(`[agents/buildOptions] Error pre-loading MCP tools:`, error.message);
      // Continue without MCP tools - not critical for endpoint building
    }
  }
  
  const agentPromise = loadAgent({
    req,
    agent_id: isAgentsEndpoint(endpoint) ? agent_id : Constants.EPHEMERAL_AGENT_ID,
    endpoint,
    model_parameters,
  }).catch((error) => {
    logger.error(`[/agents/:${agent_id}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  const endpointOption = {
    spec,
    iconURL,
    endpoint,
    agent_id,
    endpointType,
    instructions,
    maxContextTokens,
    model_parameters,
    agent: agentPromise,
  };

  return endpointOption;
};

module.exports = { buildOptions };
