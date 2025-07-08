#!/usr/bin/env node

// Basic usage:
//   cd api && node test/sync-component-counts.js
//
//   To sync specific app:
//   cd api && node test/sync-component-counts.js gmail

const path = require('path');

// Set up module alias FIRST
require('module-alias')({ base: path.resolve(__dirname, '..') });

// Disable MeiliSearch BEFORE loading dotenv to avoid connection errors in script
process.env.SEARCH = 'false';
process.env.MEILI_NO_SYNC = 'true';
delete process.env.MEILI_HOST;
delete process.env.MEILI_MASTER_KEY;

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Re-disable after dotenv loads
process.env.SEARCH = 'false';
process.env.MEILI_NO_SYNC = 'true';
delete process.env.MEILI_HOST;
delete process.env.MEILI_MASTER_KEY;

const { connectDb } = require('~/db/connect');
const { logger } = require('~/config');
const { syncComponentCounts, syncComponentCountsForIntegration } = require('~/server/services/Pipedream/syncComponentCounts');

async function main() {
  const args = process.argv.slice(2);
  const appSlug = args[0];

  try {
    logger.info('🚀 Starting component count sync...');
    
    // Connect to database
    await connectDb();
    logger.info('✅ Connected to database');
    
    if (appSlug) {
      // Sync specific app
      logger.info(`📦 Syncing component counts for: ${appSlug}`);
      const result = await syncComponentCountsForIntegration(appSlug);
      
      if (result) {
        logger.info(`✅ ${appSlug} synced successfully:`, result);
      } else {
        logger.warn(`⚠️  ${appSlug} not found or inactive`);
      }
    } else {
      // Sync all apps
      logger.info('📦 Syncing component counts for all integrations...');
      const result = await syncComponentCounts();
      
      logger.info('✅ Component count sync completed!');
      logger.info(`📊 Summary:`);
      logger.info(`   - Total integrations: ${result.total}`);
      logger.info(`   - Successfully synced: ${result.success}`);
      logger.info(`   - Errors: ${result.errors}`);
      logger.info(`   - Duration: ${result.duration}ms`);
      logger.info(`   - Average time per integration: ${result.averageTimePerIntegration}ms`);
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Failed to sync component counts:', error);
    process.exit(1);
  }
}

// CLI interface
if (require.main === module) {
  main();
}

module.exports = { main };