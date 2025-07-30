#!/usr/bin/env node

/**
 * Test specific trigger by ID to diagnose the missing trigger issue
 */

const path = require('path');

// Set up proper paths for LibreChat
process.chdir(path.join(__dirname, '..', '..'));
require('dotenv').config();

const { createBackendClient } = require('@pipedream/sdk/server');

// Initialize Pipedream client
const client = createBackendClient({
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  projectId: process.env.PIPEDREAM_PROJECT_ID,
  credentials: {
    clientId: process.env.PIPEDREAM_CLIENT_ID,
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
  },
});

async function testSpecificTrigger() {
  console.log('🔍 TESTING SPECIFIC TRIGGER');
  console.log('============================');
  
  const userId = '68627669a4d589b864fbaabc';
  const deploymentId = 'dc_Ajuvkm0'; // New deployment ID from latest deploy
  
  console.log(`User ID: ${userId}`);
  console.log(`Deployment ID: ${deploymentId}`);
  
  // Test 1: Try to get the specific trigger by ID
  console.log('\n📋 Test 1: Get trigger by ID');
  try {
    const triggerResult = await client.getTrigger({
      id: deploymentId,
      externalUserId: userId,
    });
    console.log('✅ Trigger found:', JSON.stringify(triggerResult, null, 2));
  } catch (error) {
    console.log('❌ Error getting trigger by ID:', error.message);
    if (error.response) {
      console.log('   Response status:', error.response.status);
      console.log('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test 2: Try to update the trigger
  console.log('\n⚙️  Test 2: Update trigger (test if it exists)');
  try {
    const updateResult = await client.updateTrigger({
      id: deploymentId,
      externalUserId: userId,
      active: true,
    });
    console.log('✅ Update successful:', JSON.stringify(updateResult, null, 2));
  } catch (error) {
    console.log('❌ Error updating trigger:', error.message);
    if (error.response) {
      console.log('   Response status:', error.response.status);
      console.log('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test 3: Try to delete the trigger (to clean up if it exists)
  console.log('\n🗑️  Test 3: Delete trigger (cleanup test)');
  try {
    const deleteResult = await client.deleteTrigger({
      id: deploymentId,
      externalUserId: userId,
    });
    console.log('✅ Delete successful:', JSON.stringify(deleteResult, null, 2));
  } catch (error) {
    console.log('❌ Error deleting trigger:', error.message);
    if (error.response) {
      console.log('   Response status:', error.response.status);
      console.log('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test 4: List all triggers for user (different approach)
  console.log('\n📋 Test 4: List all triggers for user');
  try {
    const triggersResult = await client.getTriggers({
      externalUserId: userId,
      limit: 50,
    });
    console.log('✅ Triggers list:', JSON.stringify(triggersResult, null, 2));
  } catch (error) {
    console.log('❌ Error listing triggers:', error.message);
    if (error.response) {
      console.log('   Response status:', error.response.status);
      console.log('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
if (require.main === module) {
  testSpecificTrigger().catch(console.error);
}

module.exports = { testSpecificTrigger };