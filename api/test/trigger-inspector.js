#!/usr/bin/env node

/**
 * Trigger Inspector - Test script to fetch and analyze deployed Pipedream triggers
 *
 * This script inspects deployed triggers from LibreChat's trigger deployment system
 * and provides detailed information about their status, configuration, and events.
 *
 * Usage: node api/test/trigger-inspector.js [userId] [--delete-all]
 */

//RUN INSPECTOR LIKE THIS
//node api/test/trigger-inspector.js 68627669a4d589b864fbaabc --inspect production 

const path = require('path');

// Disable MeiliSearch and other services BEFORE loading anything
process.env.SEARCH = 'false';
process.env.MEILI_NO_SYNC = 'true';
process.env.DISABLE_MEILI = 'true';
process.env.NODE_ENV = 'test';

// Remove MeiliSearch environment variables completely
delete process.env.MEILI_HOST;
delete process.env.MEILI_MASTER_KEY;
delete process.env.MEILI_HTTP_ADDR;

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Force disable after dotenv loads (in case .env sets them)
process.env.SEARCH = 'false';
process.env.MEILI_NO_SYNC = 'true';
process.env.DISABLE_MEILI = 'true';
process.env.NODE_ENV = 'test';
delete process.env.MEILI_HOST;
delete process.env.MEILI_MASTER_KEY;
delete process.env.MEILI_HTTP_ADDR;

// Suppress uncaught promise rejections from MeiliSearch
process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason === 'object' && 
      (reason.name === 'MeiliSearchCommunicationError' || 
       reason.message?.includes('MeiliSearch') ||
       reason.message?.includes('fetch failed'))) {
    // Suppress MeiliSearch errors silently
    return;
  }
  // Re-throw other unhandled rejections
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const { connectDb } = require('../db/connect');
const mongoose = require('mongoose');

const { createBackendClient } = require('@pipedream/sdk/server');

// Define TriggerDeployment schema directly (since it's not in @librechat/data-schemas)
const TriggerDeploymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    workflowId: { type: String, required: true },
    componentId: { type: String, required: true },
    triggerKey: { type: String, required: true },
    appSlug: { type: String, required: true },
    webhookUrl: { type: String, required: true },
    deploymentId: { type: String, required: true },
    configuredProps: { type: Object, default: {} },
    status: { type: String, enum: ['deployed', 'paused', 'failed'], default: 'deployed' },
    deployedAt: { type: Date, default: Date.now },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

const TriggerDeployment = mongoose.model('TriggerDeployment', TriggerDeploymentSchema);

// Initialize Pipedream client (match PipedreamConnect.js exactly)
const client = createBackendClient({
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  credentials: {
    clientId: process.env.PIPEDREAM_CLIENT_ID,
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
  },
  projectId: process.env.PIPEDREAM_PROJECT_ID,
});

// Debug client configuration (silent)

/**
 * Fetch all deployed triggers for a user using direct HTTP API call
 */
async function fetchUserTriggers(userId, environment = 'development') {
  console.log(`\n=== FETCHING DEPLOYED TRIGGERS FOR USER ${userId} ===`);

  try {
    // Get OAuth token for API access
    const axios = require('axios');
    const baseURL = process.env.PIPEDREAM_API_BASE_URL || 'https://api.pipedream.com/v1';
    
    // Get OAuth token using client credentials
    const tokenResponse = await axios.post(
      `${baseURL}/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: process.env.PIPEDREAM_CLIENT_ID,
        client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Make the deployed-triggers API call
    const triggersResponse = await axios.get(
      `${baseURL}/connect/${process.env.PIPEDREAM_PROJECT_ID}/deployed-triggers`,
      {
        params: {
          external_user_id: userId,
          limit: 50,
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-pd-environment': environment,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const triggers = triggersResponse.data.data || [];
    console.log(`✓ Found ${triggers.length} deployed triggers in Pipedream`);

    return triggers;
  } catch (error) {
    console.error('✗ Error fetching triggers from Pipedream:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error('Response status:', error.response.status);
    }
    return [];
  }
}

/**
 * Fetch ALL deployed triggers (across all users)
 */
async function fetchAllTriggers() {
  console.log(`\n=== FETCHING ALL DEPLOYED TRIGGERS (NO USER FILTER) ===`);

  try {
    console.log('Making API call with params:', { limit: 50 });
    
    const triggersResponse = await client.getTriggers({
      limit: 50,
      // No externalUserId filter - fetch all triggers
    });

    console.log('Full API response:', JSON.stringify(triggersResponse, null, 2));
    console.log(`✓ Found ${triggersResponse.data.length} deployed triggers in Pipedream`);

    if (triggersResponse.page_info) {
      console.log('Pagination Info:', triggersResponse.page_info);
    }

    return triggersResponse.data;
  } catch (error) {
    console.error('✗ Error fetching triggers from Pipedream:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    return [];
  }
}

/**
 * Get detailed information for a specific trigger
 */
async function inspectTrigger(triggerId, userId) {
  console.log(`\n--- INSPECTING TRIGGER ${triggerId} ---`);

  try {
    // Get basic trigger info
    const triggerResponse = await client.getTrigger({
      id: triggerId,
      externalUserId: userId,
    });

    const trigger = triggerResponse.data;

    console.log('📋 Basic Information:');
    console.log(`  Name: ${trigger.name}`);
    console.log(`  ID: ${trigger.id}`);
    console.log(`  Component ID: ${trigger.component_id}`);
    console.log(`  Active: ${trigger.active ? '✅ YES' : '❌ NO'}`);
    console.log(`  Created: ${new Date(trigger.created_at * 1000).toISOString()}`);
    console.log(`  Updated: ${new Date(trigger.updated_at * 1000).toISOString()}`);

    if (trigger.endpoint_url) {
      console.log(`  Endpoint URL: ${trigger.endpoint_url}`);
    }

    // Configuration details
    console.log('\n⚙️  Configuration:');
    console.log('  Configured Props:', JSON.stringify(trigger.configured_props, null, 4));

    // Get recent events
    await inspectTriggerEvents(triggerId, userId);

    // Get connected webhooks
    await inspectTriggerWebhooks(triggerId, userId);

    return trigger;
  } catch (error) {
    console.error(`✗ Error inspecting trigger ${triggerId}:`, error.message);
    return null;
  }
}

/**
 * Inspect recent events from a trigger
 */
async function inspectTriggerEvents(triggerId, userId) {
  console.log('\n📊 Recent Events:');

  try {
    const eventsResponse = await client.getTriggerEvents({
      id: triggerId,
      externalUserId: userId,
      limit: 10,
    });

    const events = eventsResponse.data;

    if (events.length === 0) {
      console.log('  ⚠️  No events found - trigger may not be receiving data');
      return;
    }

    console.log(`  ✓ Found ${events.length} recent events`);

    events.forEach((event, idx) => {
      const eventTime = new Date(event.ts);
      const timeAgo = Math.round((Date.now() - event.ts) / 1000 / 60); // minutes ago

      console.log(`\n  📨 Event ${idx + 1}:`);
      console.log(`    ID: ${event.id}`);
      console.log(`    Time: ${eventTime.toISOString()} (${timeAgo} minutes ago)`);
      console.log(`    Type: ${event.k}`);
      console.log(`    Payload keys: [${Object.keys(event.e).join(', ')}]`);

      // Show sample of payload for Gmail events
      if (event.e.message || event.e.email || event.e.subject) {
        console.log('    📧 Email Event Data:');
        if (event.e.message?.subject) console.log(`      Subject: ${event.e.message.subject}`);
        if (event.e.message?.from) console.log(`      From: ${event.e.message.from}`);
        if (event.e.message?.date) console.log(`      Date: ${event.e.message.date}`);
      }

      // Truncated payload preview
      const payloadPreview = JSON.stringify(event.e, null, 2);
      if (payloadPreview.length > 300) {
        console.log(`    Preview: ${payloadPreview.substring(0, 300)}...`);
      } else {
        console.log(`    Payload: ${payloadPreview}`);
      }
    });
  } catch (error) {
    console.log(`  ✗ Error fetching events: ${error.message}`);
  }
}

/**
 * Inspect webhook connections
 */
async function inspectTriggerWebhooks(triggerId, userId) {
  console.log('\n🔗 Connected Webhooks:');

  try {
    const webhooksResponse = await client.getTriggerWebhooks({
      id: triggerId,
      externalUserId: userId,
    });

    if (webhooksResponse.webhook_urls && webhooksResponse.webhook_urls.length > 0) {
      webhooksResponse.webhook_urls.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
    } else {
      console.log('  ⚠️  No webhook URLs configured');
    }
  } catch (error) {
    console.log(`  ✗ Error fetching webhooks: ${error.message}`);
  }
}

/**
 * Compare database records with Pipedream deployment
 */
async function compareDatabaseWithPipedream(userId, environment = 'development') {
  console.log(`\n=== COMPARING DATABASE WITH PIPEDREAM ===`);

  try {
    // Get triggers from database
    const dbTriggers = await TriggerDeployment.find({ userId }).lean();
    console.log(`📁 Database: Found ${dbTriggers.length} trigger deployment records`);

    // Get triggers from Pipedream
    const pipedreamTriggers = await fetchUserTriggers(userId, environment);
    console.log(`☁️  Pipedream: Found ${pipedreamTriggers.length} deployed triggers`);

    console.log('\n🔍 Cross-Reference Analysis:');

    // Check database triggers against Pipedream
    for (const dbTrigger of dbTriggers) {
      const pipedreamTrigger = pipedreamTriggers.find((pt) => pt.id === dbTrigger.deploymentId);

      console.log(`\n📋 DB Record: ${dbTrigger.workflowId} (${dbTrigger.triggerKey})`);
      console.log(`   Deployment ID: ${dbTrigger.deploymentId}`);
      console.log(`   Status: ${dbTrigger.status}`);
      console.log(`   Webhook URL: ${dbTrigger.webhookUrl}`);

      if (pipedreamTrigger) {
        console.log(`   ✅ Found in Pipedream - Active: ${pipedreamTrigger.active}`);

        // Check for status mismatch
        const dbActive = dbTrigger.status === 'deployed';
        if (dbActive !== pipedreamTrigger.active) {
          console.log(
            `   ⚠️  STATUS MISMATCH: DB says ${dbTrigger.status}, Pipedream says ${pipedreamTrigger.active ? 'active' : 'inactive'}`,
          );
        }
      } else {
        console.log(`   ❌ NOT FOUND in Pipedream - may have been deleted`);
      }
    }

    // Check for orphaned Pipedream triggers
    const orphanedTriggers = pipedreamTriggers.filter(
      (pt) => !dbTriggers.some((dt) => dt.deploymentId === pt.id),
    );

    if (orphanedTriggers.length > 0) {
      console.log(
        `\n⚠️  Found ${orphanedTriggers.length} orphaned triggers in Pipedream (not in database):`,
      );
      orphanedTriggers.forEach((trigger) => {
        console.log(`   - ${trigger.name} (${trigger.id})`);
      });
    }
  } catch (error) {
    console.error('✗ Error comparing database with Pipedream:', error.message);
  }
}

/**
 * Test trigger health and responsiveness
 */
async function testTriggerHealth(triggerId, userId) {
  console.log(`\n=== TESTING TRIGGER HEALTH ${triggerId} ===`);

  try {
    const trigger = await client.getTrigger({
      id: triggerId,
      externalUserId: userId,
    });

    const events = await client.getTriggerEvents({
      id: triggerId,
      externalUserId: userId,
      limit: 10,
    });

    const now = Date.now();
    const last24h = events.data.filter((event) => now - event.ts < 24 * 60 * 60 * 1000);
    const lastHour = events.data.filter((event) => now - event.ts < 60 * 60 * 1000);

    console.log('🏥 Health Status:');
    console.log(`   Active: ${trigger.data.active ? '✅' : '❌'}`);
    console.log(`   Total Events: ${events.data.length}`);
    console.log(`   Events (24h): ${last24h.length}`);
    console.log(`   Events (1h): ${lastHour.length}`);

    if (events.data.length > 0) {
      const lastEvent = events.data[0];
      const timeSinceLastEvent = Math.round((now - lastEvent.ts) / 1000 / 60);
      console.log(`   Last Event: ${timeSinceLastEvent} minutes ago`);
    } else {
      console.log(`   Last Event: Never`);
    }

    // Health assessment
    let health = 'unknown';
    if (!trigger.data.active) {
      health = 'paused';
    } else if (lastHour.length > 0) {
      health = 'healthy';
    } else if (last24h.length > 0) {
      health = 'quiet';
    } else if (events.data.length > 0) {
      health = 'stale';
    } else {
      health = 'no-events';
    }

    console.log(`   Overall Health: ${health} ${getHealthEmoji(health)}`);

    return { trigger: trigger.data, events: events.data, health };
  } catch (error) {
    console.error(`✗ Error testing trigger health:`, error.message);
    return { health: 'error', error: error.message };
  }
}

/**
 * Get emoji for health status
 */
function getHealthEmoji(health) {
  const emojis = {
    healthy: '💚',
    quiet: '💛',
    stale: '🟠',
    paused: '⏸️',
    'no-events': '⚪',
    error: '❌',
    unknown: '❓',
  };
  return emojis[health] || '❓';
}

/**
 * Delete all triggers for a user using direct HTTP API calls
 */
async function deleteAllTriggers(userId, environment = 'production') {
  console.log('🗑️ DELETING ALL TRIGGERS');
  console.log('========================');

  try {
    // Get all triggers from Pipedream
    const triggers = await fetchUserTriggers(userId, environment);

    if (triggers.length === 0) {
      console.log('✓ No triggers found to delete');
      return;
    }

    console.log(`⚠️  Found ${triggers.length} triggers to delete`);

    // Get OAuth token for API access
    const axios = require('axios');
    const baseURL = process.env.PIPEDREAM_API_BASE_URL || 'https://api.pipedream.com/v1';
    
    // Get OAuth token using client credentials
    const tokenResponse = await axios.post(
      `${baseURL}/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: process.env.PIPEDREAM_CLIENT_ID,
        client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Delete each trigger
    const deleteResults = [];
    for (const trigger of triggers) {
      try {
        await axios.delete(
          `${baseURL}/connect/${process.env.PIPEDREAM_PROJECT_ID}/deployed-triggers/${trigger.id}`,
          {
            params: {
              external_user_id: userId,
            },
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'x-pd-environment': environment,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        deleteResults.push({ id: trigger.id, name: trigger.name, success: true });
      } catch (error) {
        deleteResults.push({ id: trigger.id, name: trigger.name, success: false, error: error.message });
      }
    }

    // Clean up database records
    const dbDeleteResult = await TriggerDeployment.deleteMany({ userId });

    // Summary
    const successful = deleteResults.filter((r) => r.success).length;
    const failed = deleteResults.filter((r) => !r.success).length;

    console.log('\n=== DELETE SUMMARY ===');
    console.log(`✅ Pipedream triggers deleted: ${successful}`);
    console.log(`❌ Failed deletions: ${failed}`);
    console.log(`🧹 Database records deleted: ${dbDeleteResult.deletedCount}`);

    if (failed > 0) {
      console.log('\n❌ Failed deletions:');
      deleteResults
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`   - ${r.name} (${r.id}): ${r.error}`);
        });
    }
  } catch (error) {
    console.error('❌ Fatal error during deletion:', error.message);
    throw error;
  }
}

/**
 * Main inspection function
 */
async function inspectAllTriggers() {
  console.log('🔍 PIPEDREAM TRIGGER INSPECTOR');
  console.log('===============================');

  const userId = process.argv[2];
  let flag = process.argv[3];
  let environment = process.argv[4] || 'development'; // Default to development

  // Handle case where second argument is environment for --all
  if (userId === '--all') {
    flag = null;
    environment = process.argv[3] || 'development';
  }

  if (!userId || (!flag && userId !== '--all')) {
    console.error('❌ Please provide a user ID with a flag, or --all');
    console.error('Usage:');
    console.error('  node trigger-inspector.js <userId> --inspect [environment]   # Inspect triggers for specific user');
    console.error('  node trigger-inspector.js <userId> --delete-all [environment] # Delete all triggers for user');
    console.error('  node trigger-inspector.js --all [environment]                 # Inspect ALL triggers');
    console.error('');
    console.error('Environment options: development, production (default: development)');
    console.error('');
    console.error('Examples:');
    console.error('  node trigger-inspector.js 68627669a4d589b864fbaabc --inspect production');
    console.error('  node trigger-inspector.js 68627669a4d589b864fbaabc --delete-all production');
    console.error('  node trigger-inspector.js --all production');
    process.exit(1);
  }

  console.log(`🌍 Environment: ${environment}`);

  if (!client) {
    console.error('❌ Failed to initialize Pipedream client. Check environment variables.');
    process.exit(1);
  }

  try {
    // Connect to database
    console.log('📁 Connecting to MongoDB...');
    await connectDb();
    console.log('✓ Connected to database');

    // Check if fetching all triggers
    if (userId === '--all') {
      const allTriggers = await fetchAllTriggers();
      
      console.log('\n=== ALL TRIGGERS IN PIPEDREAM ===');
      if (allTriggers.length === 0) {
        console.log('No triggers found in Pipedream');
      } else {
        for (const trigger of allTriggers) {
          console.log(`\n📋 Trigger: ${trigger.name || trigger.id}`);
          console.log(`   ID: ${trigger.id}`);
          console.log(`   Active: ${trigger.active ? '✅' : '❌'}`);
          console.log(`   External User ID: ${trigger.external_user_id || 'N/A'}`);
          console.log(`   Component: ${trigger.component_id}`);
          if (trigger.endpoint_url) {
            console.log(`   Endpoint: ${trigger.endpoint_url}`);
          }
        }
      }
      return;
    }

    // Check if delete-all flag is provided
    if (flag === '--delete-all') {
      await deleteAllTriggers(userId, environment);
      return;
    }

    // Check if inspect flag is provided (or default behavior)
    if (flag === '--inspect' || !flag) {
      // 1. Compare database with Pipedream
      await compareDatabaseWithPipedream(userId, environment);

      // 2. Fetch and inspect all triggers
      const triggers = await fetchUserTriggers(userId, environment);

      // 3. Count active/inactive triggers
      const activeTriggers = triggers.filter((t) => t.active);
      const inactiveTriggers = triggers.filter((t) => !t.active);

      // 4. Summary
      console.log('\n=== SUMMARY ===');
      console.log(`Total Triggers: ${triggers.length}`);
      console.log(`Active: ${activeTriggers.length}`);
      console.log(`Inactive: ${inactiveTriggers.length}`);

      if (triggers.length === 0) {
        console.log('\n💡 No triggers found. Try:');
        console.log('   1. Deploy a workflow with an app trigger');
        console.log('   2. Check if the user ID is correct');
        console.log('   3. Verify Pipedream credentials');
      }
      return;
    }

    console.error(`❌ Unknown flag: ${flag}`);
    process.exit(1);
  } catch (error) {
    console.error('❌ Fatal error during inspection:', error.message);
    process.exit(1);
  }
}

// Run the inspector
if (require.main === module) {
  inspectAllTriggers().catch(console.error);
}

module.exports = {
  inspectAllTriggers,
  inspectTrigger,
  testTriggerHealth,
  fetchUserTriggers,
  deleteAllTriggers,
};
