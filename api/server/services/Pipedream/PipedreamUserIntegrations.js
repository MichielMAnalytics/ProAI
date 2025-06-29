const { UserIntegration } = require('~/models');
const { logger } = require('~/config');

/**
 * PipedreamUserIntegrations - Manages user-specific integrations
 *
 * This service handles:
 * - User integration queries and management
 * - MCP server configuration generation
 * - Integration usage tracking
 * - User integration lifecycle
 */
class PipedreamUserIntegrations {
  constructor() {
    // Service is ready to use
  }

  /**
   * Get user's connected integrations
   *
   * @param {string} userId - The user ID
   * @param {Object} options - Query options
   * @param {boolean} options.includeInactive - Include inactive integrations (default: false)
   * @param {string} options.appSlug - Filter by specific app slug
   * @returns {Promise<Array>} Array of user integrations
   */
  async getUserIntegrations(userId, options = {}) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const { includeInactive = false, appSlug } = options;

    try {
      logger.info(`PipedreamUserIntegrations: Getting integrations for user ${userId}`, {
        includeInactive,
        appSlug,
      });

      const query = { userId };

      if (!includeInactive) {
        query.isActive = true;
      }

      if (appSlug) {
        query.appSlug = appSlug;
      }

      const integrations = await UserIntegration.find(query)
        .sort({ lastUsedAt: -1, lastConnectedAt: -1 })
        .lean();

      logger.info(
        `PipedreamUserIntegrations: Found ${integrations.length} integrations for user ${userId}`,
      );

      return integrations;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to get integrations for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to retrieve user integrations: ${error.message}`);
    }
  }

  /**
   * Get a specific user integration
   *
   * @param {string} userId - The user ID
   * @param {string} integrationId - The integration ID
   * @returns {Promise<Object|null>} Integration or null if not found
   */
  async getUserIntegration(userId, integrationId) {
    if (!userId || !integrationId) {
      throw new Error('User ID and integration ID are required');
    }

    try {
      logger.info(
        `PipedreamUserIntegrations: Getting integration ${integrationId} for user ${userId}`,
      );

      const integration = await UserIntegration.findOne({
        _id: integrationId,
        userId,
        isActive: true,
      }).lean();

      if (integration) {
        logger.info(
          `PipedreamUserIntegrations: Found integration ${integrationId} for user ${userId}`,
        );
      } else {
        logger.warn(
          `PipedreamUserIntegrations: Integration ${integrationId} not found for user ${userId}`,
        );
      }

      return integration;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to get integration ${integrationId} for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to retrieve integration: ${error.message}`);
    }
  }

  /**
   * Update integration usage timestamp
   *
   * @param {string} userId - The user ID
   * @param {string} integrationId - The integration ID
   * @returns {Promise<Object>} Updated integration
   */
  async updateIntegrationUsage(userId, integrationId) {
    if (!userId || !integrationId) {
      throw new Error('User ID and integration ID are required');
    }

    try {
      logger.info(
        `PipedreamUserIntegrations: Updating usage for integration ${integrationId}, user ${userId}`,
      );

      const integration = await UserIntegration.findOneAndUpdate(
        { _id: integrationId, userId, isActive: true },
        { lastUsedAt: new Date() },
        { new: true },
      );

      if (!integration) {
        throw new Error('Integration not found or does not belong to user');
      }

      logger.info(`PipedreamUserIntegrations: Updated usage for integration ${integrationId}`);
      return integration;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to update usage for integration ${integrationId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Check if user has a specific integration connected
   *
   * @param {string} userId - The user ID
   * @param {string} appSlug - The app slug to check
   * @returns {Promise<boolean>} True if user has the integration connected
   */
  async hasIntegration(userId, appSlug) {
    if (!userId || !appSlug) {
      throw new Error('User ID and app slug are required');
    }

    try {
      const integration = await UserIntegration.findOne({
        userId,
        appSlug,
        isActive: true,
      }).lean();

      const hasIntegration = !!integration;
      logger.info(
        `PipedreamUserIntegrations: User ${userId} ${hasIntegration ? 'has' : 'does not have'} ${appSlug} integration`,
      );

      return hasIntegration;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to check integration ${appSlug} for user ${userId}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Get integration statistics for a user
   *
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Integration statistics
   */
  async getIntegrationStats(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      logger.info(`PipedreamUserIntegrations: Getting integration stats for user ${userId}`);

      const [activeCount, totalCount, recentlyUsed] = await Promise.all([
        UserIntegration.countDocuments({ userId, isActive: true }),
        UserIntegration.countDocuments({ userId }),
        UserIntegration.find({
          userId,
          isActive: true,
          lastUsedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        }).countDocuments(),
      ]);

      const stats = {
        activeIntegrations: activeCount,
        totalIntegrations: totalCount,
        recentlyUsedIntegrations: recentlyUsed,
        inactiveIntegrations: totalCount - activeCount,
      };

      logger.info(`PipedreamUserIntegrations: Stats for user ${userId}:`, stats);
      return stats;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to get stats for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to retrieve integration statistics: ${error.message}`);
    }
  }

  /**
   * Generate MCP server configuration for user's integrations
   *
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} MCP server configuration
   */
  async generateMCPConfig(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      logger.info(`PipedreamUserIntegrations: Generating MCP config for user ${userId}`);

      const integrations = await this.getUserIntegrations(userId);
      const mcpServers = {};

      // Get base URL using the same pattern as the rest of the application
      const baseUrl = process.env.DOMAIN_SERVER || 'http://localhost:3080';

      for (const integration of integrations) {
        if (integration.mcpServerConfig) {
          const serverName = integration.mcpServerConfig.serverName;
          mcpServers[serverName] = {
            type: integration.mcpServerConfig.type,
            url: integration.mcpServerConfig.url,
            command: integration.mcpServerConfig.command,
            args: integration.mcpServerConfig.args,
            timeout: integration.mcpServerConfig.timeout || 60000,
            iconPath: integration.mcpServerConfig.iconPath,
          };
        } else {
          // Generate default MCP server config for integrations without one
          const serverName = `pipedream-${integration.appSlug}`;
          mcpServers[serverName] = {
            type: 'sse',
            url: `${baseUrl}/api/integrations/mcp/${integration._id}`,
            timeout: 60000,
            iconPath: integration.appIcon,
          };
        }
      }

      logger.info(
        `PipedreamUserIntegrations: Generated MCP config with ${Object.keys(mcpServers).length} servers for user ${userId}`,
      );
      return mcpServers;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to generate MCP config for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to generate MCP configuration: ${error.message}`);
    }
  }

  /**
   * Update integration MCP configuration
   *
   * @param {string} userId - The user ID
   * @param {string} integrationId - The integration ID
   * @param {Object} mcpConfig - MCP server configuration
   * @returns {Promise<Object>} Updated integration
   */
  async updateMCPConfig(userId, integrationId, mcpConfig) {
    if (!userId || !integrationId || !mcpConfig) {
      throw new Error('User ID, integration ID, and MCP config are required');
    }

    try {
      logger.info(
        `PipedreamUserIntegrations: Updating MCP config for integration ${integrationId}, user ${userId}`,
      );

      const integration = await UserIntegration.findOneAndUpdate(
        { _id: integrationId, userId, isActive: true },
        { mcpServerConfig: mcpConfig },
        { new: true },
      );

      if (!integration) {
        throw new Error('Integration not found or does not belong to user');
      }

      logger.info(`PipedreamUserIntegrations: Updated MCP config for integration ${integrationId}`);
      return integration;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to update MCP config for integration ${integrationId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get integrations by category
   *
   * @param {string} userId - The user ID
   * @param {string} category - The category to filter by
   * @returns {Promise<Array>} Array of integrations in the category
   */
  async getIntegrationsByCategory(userId, category) {
    if (!userId || !category) {
      throw new Error('User ID and category are required');
    }

    try {
      logger.info(`PipedreamUserIntegrations: Getting ${category} integrations for user ${userId}`);

      const integrations = await UserIntegration.find({
        userId,
        isActive: true,
        appCategories: { $in: [category] },
      })
        .sort({ lastUsedAt: -1 })
        .lean();

      logger.info(
        `PipedreamUserIntegrations: Found ${integrations.length} ${category} integrations for user ${userId}`,
      );
      return integrations;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to get ${category} integrations for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to retrieve integrations by category: ${error.message}`);
    }
  }

  /**
   * Search user integrations
   *
   * @param {string} userId - The user ID
   * @param {string} searchTerm - The search term
   * @returns {Promise<Array>} Array of matching integrations
   */
  async searchIntegrations(userId, searchTerm) {
    if (!userId || !searchTerm) {
      throw new Error('User ID and search term are required');
    }

    try {
      logger.info(
        `PipedreamUserIntegrations: Searching integrations for user ${userId} with term: ${searchTerm}`,
      );

      const integrations = await UserIntegration.find({
        userId,
        isActive: true,
        $or: [
          { appName: { $regex: searchTerm, $options: 'i' } },
          { appDescription: { $regex: searchTerm, $options: 'i' } },
          { appSlug: { $regex: searchTerm, $options: 'i' } },
          { appCategories: { $in: [new RegExp(searchTerm, 'i')] } },
        ],
      })
        .sort({ lastUsedAt: -1 })
        .lean();

      logger.info(
        `PipedreamUserIntegrations: Found ${integrations.length} integrations matching "${searchTerm}" for user ${userId}`,
      );
      return integrations;
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to search integrations for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to search integrations: ${error.message}`);
    }
  }

  /**
   * Bulk update integrations
   *
   * @param {string} userId - The user ID
   * @param {Array} updates - Array of update operations
   * @returns {Promise<Object>} Update results
   */
  async bulkUpdateIntegrations(userId, updates) {
    if (!userId || !Array.isArray(updates)) {
      throw new Error('User ID and updates array are required');
    }

    try {
      logger.info(
        `PipedreamUserIntegrations: Bulk updating ${updates.length} integrations for user ${userId}`,
      );

      const results = await Promise.allSettled(
        updates.map(async (update) => {
          const { integrationId, data } = update;
          return await UserIntegration.findOneAndUpdate({ _id: integrationId, userId }, data, {
            new: true,
          });
        }),
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      logger.info(
        `PipedreamUserIntegrations: Bulk update completed for user ${userId}: ${successful} successful, ${failed} failed`,
      );

      return {
        successful,
        failed,
        results,
      };
    } catch (error) {
      logger.error(
        `PipedreamUserIntegrations: Failed to bulk update integrations for user ${userId}:`,
        error.message,
      );
      throw new Error(`Failed to bulk update integrations: ${error.message}`);
    }
  }

  /**
   * Clean up inactive integrations older than specified days
   *
   * @param {number} daysOld - Number of days to consider for cleanup (default: 90)
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupInactiveIntegrations(daysOld = 90) {
    try {
      logger.info(
        `PipedreamUserIntegrations: Cleaning up inactive integrations older than ${daysOld} days`,
      );

      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const result = await UserIntegration.deleteMany({
        isActive: false,
        updatedAt: { $lt: cutoffDate },
      });

      logger.info(
        `PipedreamUserIntegrations: Cleaned up ${result.deletedCount} inactive integrations`,
      );

      return {
        deletedCount: result.deletedCount,
        cutoffDate,
      };
    } catch (error) {
      logger.error(
        'PipedreamUserIntegrations: Failed to cleanup inactive integrations:',
        error.message,
      );
      throw new Error(`Failed to cleanup inactive integrations: ${error.message}`);
    }
  }
}

module.exports = new PipedreamUserIntegrations();
