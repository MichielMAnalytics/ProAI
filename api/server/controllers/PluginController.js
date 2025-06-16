const { CacheKeys, AuthType } = require('librechat-data-provider');
const { getToolkitKey } = require('~/server/services/ToolService');
const { getCustomConfig } = require('~/server/services/Config');
const { availableTools } = require('~/app/clients/tools');
const { getMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');
const logger = require('~/utils/logger');

/**
 * Filters out duplicate plugins from the list of plugins.
 *
 * @param {TPlugin[]} plugins The list of plugins to filter.
 * @returns {TPlugin[]} The list of plugins with duplicates removed.
 */
const filterUniquePlugins = (plugins) => {
  const seen = new Set();
  return plugins.filter((plugin) => {
    const duplicate = seen.has(plugin.pluginKey);
    seen.add(plugin.pluginKey);
    return !duplicate;
  });
};

/**
 * Determines if a plugin is authenticated by checking if all required authentication fields have non-empty values.
 * Supports alternate authentication fields, allowing validation against multiple possible environment variables.
 *
 * @param {TPlugin} plugin The plugin object containing the authentication configuration.
 * @returns {boolean} True if the plugin is authenticated for all required fields, false otherwise.
 */
const checkPluginAuth = (plugin) => {
  if (!plugin.authConfig || plugin.authConfig.length === 0) {
    return false;
  }

  return plugin.authConfig.every((authFieldObj) => {
    const authFieldOptions = authFieldObj.authField.split('||');
    let isFieldAuthenticated = false;

    for (const fieldOption of authFieldOptions) {
      const envValue = process.env[fieldOption];
      if (envValue && envValue.trim() !== '' && envValue !== AuthType.USER_PROVIDED) {
        isFieldAuthenticated = true;
        break;
      }
    }

    return isFieldAuthenticated;
  });
};

const getAvailablePluginsController = async (req, res) => {
  try {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const cachedPlugins = await cache.get(CacheKeys.PLUGINS);
    if (cachedPlugins) {
      res.status(200).json(cachedPlugins);
      return;
    }

    /** @type {{ filteredTools: string[], includedTools: string[] }} */
    const { filteredTools = [], includedTools = [] } = req.app.locals;
    const pluginManifest = availableTools;

    const uniquePlugins = filterUniquePlugins(pluginManifest);
    let authenticatedPlugins = [];
    for (const plugin of uniquePlugins) {
      authenticatedPlugins.push(
        checkPluginAuth(plugin) ? { ...plugin, authenticated: true } : plugin,
      );
    }

    let plugins = authenticatedPlugins;

    if (includedTools.length > 0) {
      plugins = plugins.filter((plugin) => includedTools.includes(plugin.pluginKey));
    } else {
      plugins = plugins.filter((plugin) => !filteredTools.includes(plugin.pluginKey));
    }

    await cache.set(CacheKeys.PLUGINS, plugins);
    res.status(200).json(plugins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Retrieves and returns a list of available tools, either from a cache or by reading a plugin manifest file.
 *
 * This function first attempts to retrieve the list of tools from a cache. If the tools are not found in the cache,
 * it reads a plugin manifest file, filters for unique plugins, and determines if each plugin is authenticated.
 * Only plugins that are marked as available in the application's local state are included in the final list.
 * The resulting list of tools is then cached and returned to the client.
 *
 * @param {object} req - The request object, containing information about the HTTP request.
 * @param {object} res - The response object, used to send back the desired HTTP response.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const getAvailableTools = async (req, res) => {
  try {
    const { endpoint } = req.query;
    let { userId } = req.query;

    if (!userId && req.user?.id) {
      userId = req.user.id;
    }

    logger.info('=== getAvailableTools: Starting request ===');
    logger.info(`Endpoint: ${endpoint}, UserId: ${userId}, addUserSpecificMcpFromDb: ${req.app.locals.addUserSpecificMcpFromDb}`);

    // Check cache first for non-user-specific requests
    const shouldUseCache = !userId || !req.app.locals.addUserSpecificMcpFromDb;
    logger.info(`Should use cache: ${shouldUseCache} (userId: ${!!userId}, mcpFromDb: ${req.app.locals.addUserSpecificMcpFromDb})`);
    
    if (shouldUseCache) {
      const cache = getLogStores(CacheKeys.CONFIG_STORE);
      const cachedTools = await cache.get(CacheKeys.TOOLS);
      if (cachedTools) {
        logger.info(`Returning ${cachedTools.length} cached tools`);
        res.status(200).json(cachedTools);
        return;
      }
    }

    let pluginManifest = availableTools;
    logger.info(`Initial plugin manifest size: ${pluginManifest.length}`);
    
    const customConfig = await getCustomConfig();
    logger.info(`Custom config loaded, has mcpServers: ${!!customConfig?.mcpServers}`);
    
    // Initialize global MCP servers if configured
    if (customConfig?.mcpServers != null) {
      const mcpManager = getMCPManager();
      pluginManifest = await mcpManager.loadManifestTools(pluginManifest);
      logger.info(`After loading global MCP tools, manifest size: ${pluginManifest.length}`);
    }

    // Initialize user-specific MCP servers if enabled and userId is available
    if (userId && req.app.locals.addUserSpecificMcpFromDb) {
      logger.info('=== Processing user-specific MCP servers ===');
      logger.info(`Loading user MCP servers for endpoint: ${endpoint || 'default'}`);
      
      // Use standardized MCP initialization
      const MCPInitializer = require('~/server/services/MCPInitializer');
      const mcpInitializer = MCPInitializer.getInstance();
      const mcpResult = await mcpInitializer.ensureUserMCPReady(
        userId, 
        'PluginController', 
        req.app.locals.availableTools
      );
      
      logger.info(`After MCP initialization: availableTools count = ${Object.keys(req.app.locals.availableTools).length}`);
      
      if (mcpResult.success) {
        logger.info(`=== User MCP initialization successful ===`);
        logger.info(`Servers: ${mcpResult.serverCount}, Tools: ${mcpResult.toolCount}, Duration: ${mcpResult.duration}ms`);
        
        // Use cached manifest tools if available, otherwise load them
        if (mcpResult.manifestTools && mcpResult.manifestTools.length > 0) {
          logger.info(`Using ${mcpResult.manifestTools.length} cached manifest tools for user ${userId}`);
          pluginManifest = [...mcpResult.manifestTools, ...pluginManifest];
        } else if (mcpResult.mcpManager && mcpResult.serverCount > 0) {
          // Fallback to loading manifest tools if not cached (shouldn't happen in normal operation)
          try {
            logger.warn(`No cached manifest tools found, loading them fresh for user ${userId}`);
            const beforeSize = pluginManifest.length;
            pluginManifest = await mcpResult.mcpManager.loadUserManifestTools(pluginManifest, userId);
            const afterSize = pluginManifest.length;
            logger.info(`After loading user MCP tools, manifest size: ${beforeSize} -> ${afterSize} (added ${afterSize - beforeSize})`);
          } catch (manifestError) {
            logger.warn(`Failed to load user MCP tools into manifest:`, manifestError.message);
          }
        }
      } else {
        logger.warn(`=== User MCP initialization failed ===`);
        logger.warn(`Error: ${mcpResult.error}`);
        // Continue without user MCP servers if there's an error
      }
    } else {
      logger.info('User-specific MCP processing skipped:', {
        hasUserId: !!userId,
        mcpFromDbEnabled: req.app.locals.addUserSpecificMcpFromDb,
        endpoint: endpoint || 'undefined'
      });
    }

    /** @type {TPlugin[]} */
    const uniquePlugins = filterUniquePlugins(pluginManifest);
    logger.info(`After filtering unique plugins: ${uniquePlugins.length}`);

    const authenticatedPlugins = uniquePlugins.map((plugin) => {
      if (checkPluginAuth(plugin)) {
        return { ...plugin, authenticated: true };
      } else {
        return plugin;
      }
    });
    logger.info(`After authentication check: ${authenticatedPlugins.length}`);

    const toolDefinitions = req.app.locals.availableTools;
    logger.info(`Available tools count: ${Object.keys(toolDefinitions).length}`);
    logger.info(`Sample available tools:`, Object.keys(toolDefinitions).slice(0, 10));
    logger.info(`Sample plugin keys:`, authenticatedPlugins.slice(0, 5).map(p => p.pluginKey));
    
    const tools = authenticatedPlugins.filter(
      (plugin) =>
        toolDefinitions[plugin.pluginKey] !== undefined ||
        (plugin.toolkit === true &&
          Object.keys(toolDefinitions).some((key) => getToolkitKey(key) === plugin.pluginKey)),
    );
    logger.info(`After filtering by tool definitions: ${tools.length}`);

    // Note: User-specific MCP tools are now loaded directly by the MCP manager
    // via mcpManager.mapUserAvailableTools() and mcpManager.loadUserManifestTools()
    // No need for additional manual tool registration here

    // Count MCP tools in final result (check the MCP tool registry instead of pluginKey)
    const mcpTools = tools.filter(tool => 
      tool.pluginKey && req.app.locals.mcpToolRegistry && req.app.locals.mcpToolRegistry.has(tool.pluginKey)
    );
    //logger.info(`Final tools count: ${tools.length}, MCP tools count: ${mcpTools.length}`);
    // Filter out the CONFIGURE_COMPONENT tool from the final list sent to the client
    const finalTools = tools.filter((tool) => tool.name !== 'CONFIGURE_COMPONENT');
    //logger.info(`MCP tools:`, mcpTools.map(t => ({ pluginKey: t.pluginKey, name: t.name })));

    // Only cache if not user-specific
    if (shouldUseCache) {
      const cache = getLogStores(CacheKeys.CONFIG_STORE);
      await cache.set(CacheKeys.TOOLS, tools);
      logger.info(`Cached ${tools.length} tools`);
    }
    
    logger.info('=== getAvailableTools: Sending response ===');
    logger.info(`Response size: ${finalTools.length} tools`);
    res.status(200).json(finalTools);
  } catch (error) {
    logger.error('=== getAvailableTools: Error occurred ===');
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailableTools,
  getAvailablePluginsController,
};
