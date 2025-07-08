const { AvailableIntegration } = require('~/models');
const PipedreamComponents = require('./PipedreamComponents');
const { logger } = require('~/config');

/**
 * Sync component counts for all integrations
 * This updates actionCount and triggerCount fields in the database
 * 
 * @returns {Promise<Object>} Summary of sync operation
 */
async function syncComponentCounts() {
  const startTime = Date.now();
  logger.info('syncComponentCounts: Starting component count sync for all integrations');

  try {
    // Get all integrations
    const integrations = await AvailableIntegration.find({ isActive: true }).lean();
    logger.info(`syncComponentCounts: Found ${integrations.length} active integrations to sync`);

    if (!integrations || integrations.length === 0) {
      logger.warn('syncComponentCounts: No integrations found to sync');
      return { 
        success: 0, 
        errors: 0, 
        total: 0, 
        duration: Date.now() - startTime 
      };
    }

    let successCount = 0;
    let errorCount = 0;

    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < integrations.length; i += batchSize) {
      const batch = integrations.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (integration) => {
          try {
            const counts = await PipedreamComponents.getComponentCounts(integration.appSlug);
            
            // Update the database with counts
            await AvailableIntegration.updateOne(
              { _id: integration._id },
              { 
                $set: { 
                  actionCount: counts.actionCount || 0,
                  triggerCount: counts.triggerCount || 0,
                  lastSyncedAt: new Date()
                }
              }
            );

            logger.debug(
              `syncComponentCounts: Updated ${integration.appSlug} - ` +
              `Actions: ${counts.actionCount}, Triggers: ${counts.triggerCount}`
            );
            successCount++;
          } catch (error) {
            logger.error(
              `syncComponentCounts: Failed to sync ${integration.appSlug}:`, 
              error.message
            );
            errorCount++;
          }
        })
      );

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < integrations.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: successCount,
      errors: errorCount,
      total: integrations.length,
      duration: duration,
      averageTimePerIntegration: Math.round(duration / integrations.length)
    };

    logger.info(
      `syncComponentCounts: Sync completed in ${duration}ms - ` +
      `Success: ${successCount}, Errors: ${errorCount}, Total: ${integrations.length}`
    );

    return summary;
  } catch (error) {
    logger.error('syncComponentCounts: Fatal error during sync:', error.message);
    throw error;
  }
}

/**
 * Sync component counts for a specific integration
 * 
 * @param {string} appSlug - The app slug to sync
 * @returns {Promise<Object>} Component counts
 */
async function syncComponentCountsForIntegration(appSlug) {
  logger.info(`syncComponentCounts: Syncing component counts for ${appSlug}`);

  try {
    // Get component counts
    const counts = await PipedreamComponents.getComponentCounts(appSlug);
    
    // Update the database
    const result = await AvailableIntegration.updateOne(
      { appSlug, isActive: true },
      { 
        $set: { 
          actionCount: counts.actionCount || 0,
          triggerCount: counts.triggerCount || 0,
          lastSyncedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      logger.warn(`syncComponentCounts: No active integration found for ${appSlug}`);
      return null;
    }

    logger.info(
      `syncComponentCounts: Updated ${appSlug} - ` +
      `Actions: ${counts.actionCount}, Triggers: ${counts.triggerCount}`
    );

    return counts;
  } catch (error) {
    logger.error(`syncComponentCounts: Failed to sync ${appSlug}:`, error.message);
    throw error;
  }
}

module.exports = {
  syncComponentCounts,
  syncComponentCountsForIntegration
};