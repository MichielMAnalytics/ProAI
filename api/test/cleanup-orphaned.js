#!/usr/bin/env node

/**
 * Clean up orphaned trigger deployment records
 */

const path = require('path');
const mongoose = require('mongoose');

// Set up proper paths
process.chdir(path.join(__dirname, '..', '..'));
require('dotenv').config();

async function cleanupOrphanedRecords() {
  console.log('🧹 CLEANING UP ORPHANED TRIGGER RECORDS');
  console.log('=======================================');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat');
    console.log('✅ Connected to MongoDB');
    
    // Define the TriggerDeployment schema
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
    
    const userId = '68627669a4d589b864fbaabc';
    
    // Find all deployment records for this user
    const allRecords = await TriggerDeployment.find({ userId });
    console.log(`🔍 Found ${allRecords.length} deployment records for user ${userId}`);
    
    for (const record of allRecords) {
      console.log(`📋 Record: ${record.workflowId} - ${record.deploymentId} (${record.status})`);
    }
    
    // Delete all records for clean slate
    const deleteResult = await TriggerDeployment.deleteMany({ userId });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} orphaned records`);
    
    console.log('✅ Cleanup completed successfully');
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

cleanupOrphanedRecords();