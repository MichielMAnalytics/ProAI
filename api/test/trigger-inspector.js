#!/usr/bin/env node

/**
 * Trigger Inspector - Test script to fetch and analyze deployed Pipedream triggers
 * 
 * This script inspects deployed triggers from LibreChat's trigger deployment system
 * and provides detailed information about their status, configuration, and events.
 * 
 * Usage: node api/test/trigger-inspector.js [userId]
 */

const path = require('path');
const mongoose = require('mongoose');

// Set up proper paths for LibreChat
process.chdir(path.join(__dirname, '..', '..'));
require('dotenv').config();

const { createBackendClient } = require('@pipedream/sdk/server');

// Initialize MongoDB connection
async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat');
  }
}

// Import TriggerDeployment model directly
const TriggerDeploymentSchema = new mongoose.Schema({
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
}, { timestamps: true });

const TriggerDeployment = mongoose.model('TriggerDeployment', TriggerDeploymentSchema);

// Initialize Pipedream client
const client = createBackendClient({
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  projectId: process.env.PIPEDREAM_PROJECT_ID,
  credentials: {
    clientId: process.env.PIPEDREAM_CLIENT_ID,
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
  },
});

/**
 * Fetch all deployed triggers for a user
 */
async function fetchUserTriggers(userId) {
  console.log(`\n=== FETCHING DEPLOYED TRIGGERS FOR USER ${userId} ===`);
  
  try {
    const triggersResponse = await client.getTriggers({
      externalUserId: userId,
      limit: 50
    });
    
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
      externalUserId: userId
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
      limit: 10
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
      externalUserId: userId
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
async function compareDatabaseWithPipedream(userId) {
  console.log(`\n=== COMPARING DATABASE WITH PIPEDREAM ===`);
  
  try {
    // Get triggers from database
    const dbTriggers = await TriggerDeployment.find({ userId }).lean();
    console.log(`📁 Database: Found ${dbTriggers.length} trigger deployment records`);
    
    // Get triggers from Pipedream
    const pipedreamTriggers = await fetchUserTriggers(userId);
    console.log(`☁️  Pipedream: Found ${pipedreamTriggers.length} deployed triggers`);
    
    console.log('\n🔍 Cross-Reference Analysis:');
    
    // Check database triggers against Pipedream
    for (const dbTrigger of dbTriggers) {
      const pipedreamTrigger = pipedreamTriggers.find(pt => pt.id === dbTrigger.deploymentId);
      
      console.log(`\n📋 DB Record: ${dbTrigger.workflowId} (${dbTrigger.triggerKey})`);
      console.log(`   Deployment ID: ${dbTrigger.deploymentId}`);
      console.log(`   Status: ${dbTrigger.status}`);
      console.log(`   Webhook URL: ${dbTrigger.webhookUrl}`);
      
      if (pipedreamTrigger) {
        console.log(`   ✅ Found in Pipedream - Active: ${pipedreamTrigger.active}`);
        
        // Check for status mismatch
        const dbActive = dbTrigger.status === 'deployed';
        if (dbActive !== pipedreamTrigger.active) {
          console.log(`   ⚠️  STATUS MISMATCH: DB says ${dbTrigger.status}, Pipedream says ${pipedreamTrigger.active ? 'active' : 'inactive'}`);
        }
      } else {
        console.log(`   ❌ NOT FOUND in Pipedream - may have been deleted`);
      }
    }
    
    // Check for orphaned Pipedream triggers
    const orphanedTriggers = pipedreamTriggers.filter(pt => 
      !dbTriggers.some(dt => dt.deploymentId === pt.id)
    );
    
    if (orphanedTriggers.length > 0) {
      console.log(`\n⚠️  Found ${orphanedTriggers.length} orphaned triggers in Pipedream (not in database):`);
      orphanedTriggers.forEach(trigger => {
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
      externalUserId: userId
    });
    
    const events = await client.getTriggerEvents({
      id: triggerId,
      externalUserId: userId,
      limit: 10
    });
    
    const now = Date.now();
    const last24h = events.data.filter(event => (now - event.ts) < 24 * 60 * 60 * 1000);
    const lastHour = events.data.filter(event => (now - event.ts) < 60 * 60 * 1000);
    
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
    unknown: '❓'
  };
  return emojis[health] || '❓';
}

/**
 * Main inspection function
 */
async function inspectAllTriggers() {
  console.log('🔍 PIPEDREAM TRIGGER INSPECTOR');
  console.log('===============================');
  
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('❌ Please provide a user ID: node trigger-inspector.js <userId>');
    process.exit(1);
  }
  
  if (!client) {
    console.error('❌ Failed to initialize Pipedream client. Check environment variables.');
    process.exit(1);
  }
  
  try {
    // Connect to database
    console.log('📁 Connecting to MongoDB...');
    await connectDB();
    console.log('✓ Connected to database');
    // 1. Compare database with Pipedream
    await compareDatabaseWithPipedream(userId);
    
    // 2. Fetch and inspect all triggers
    const triggers = await fetchUserTriggers(userId);
    
    // 3. Detailed inspection of each trigger
    for (const trigger of triggers) {
      await inspectTrigger(trigger.id, userId);
      await testTriggerHealth(trigger.id, userId);
    }
    
    // 4. Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total Triggers: ${triggers.length}`);
    
    const activeTriggers = triggers.filter(t => t.active);
    console.log(`Active: ${activeTriggers.length}`);
    console.log(`Inactive: ${triggers.length - activeTriggers.length}`);
    
    if (triggers.length === 0) {
      console.log('\n💡 No triggers found. Try:');
      console.log('   1. Deploy a workflow with an app trigger');
      console.log('   2. Check if the user ID is correct');
      console.log('   3. Verify Pipedream credentials');
    }
    
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
  fetchUserTriggers
};