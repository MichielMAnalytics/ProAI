#!/usr/bin/env node

// Delete all users script
// Usage:
//   cd api && node test/delete-all-users.js --confirm

const path = require('path');

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

const { connectDb } = require('../db/connect');
const { User, Transaction, Balance } = require('../db/models');

// Import individual functions directly since the script runs standalone
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Delete all user data for a single user using direct database operations
 * @param {Object} user - User object
 */
async function deleteUserData(user) {
  console.log(`🗑️  Deleting data for user: ${user.email} (ID: ${user._id})`);

  try {
    // Delete from all collections that reference the user
    // Using direct mongoose operations to avoid import issues

    console.log('   🔄 Deleting messages...');
    await mongoose.connection.db.collection('messages').deleteMany({ user: user._id });

    console.log('   🔄 Deleting conversations...');
    await mongoose.connection.db.collection('conversations').deleteMany({ user: user._id });

    console.log('   🔄 Deleting transactions...');
    await Transaction.deleteMany({ user: user._id });

    console.log('   🔄 Deleting balances...');
    await Balance.deleteMany({ user: user._id });

    console.log('   🔄 Deleting presets...');
    await mongoose.connection.db.collection('presets').deleteMany({ user: user._id });

    console.log('   🔄 Deleting sessions...');
    await mongoose.connection.db
      .collection('sessions')
      .deleteMany({ session: new RegExp(`"user":"${user._id}"`, 'i') });

    console.log('   🔄 Deleting files...');
    await mongoose.connection.db.collection('files').deleteMany({ user: user._id });

    console.log('   🔄 Deleting keys...');
    await mongoose.connection.db.collection('keys').deleteMany({ userId: user._id });

    console.log('   🔄 Deleting shared links...');
    await mongoose.connection.db.collection('shares').deleteMany({ userId: user._id });

    console.log('   🔄 Deleting tool calls...');
    await mongoose.connection.db.collection('toolcalls').deleteMany({ user: user._id });

    console.log('   🔄 Deleting plugin auth...');
    await mongoose.connection.db.collection('pluginauths').deleteMany({ userId: user._id });

    // Delete additional collections
    console.log('   🔄 Deleting user integrations...');
    await mongoose.connection.db
      .collection('userintegrations')
      .deleteMany({ userId: user._id.toString() });

    console.log('   🔄 Deleting scheduler tasks...');
    await mongoose.connection.db.collection('schedulertasks').deleteMany({ user: user._id });

    console.log('   🔄 Deleting scheduler executions...');
    await mongoose.connection.db.collection('schedulerexecutions').deleteMany({ user: user._id });

    console.log('   🔄 Deleting memory entries...');
    await mongoose.connection.db.collection('memoryentries').deleteMany({ userId: user._id });

    console.log('   🔄 Deleting user record...');
    // Finally delete the user record itself
    await User.findByIdAndDelete(user._id);

    console.log(`✅ Successfully deleted user: ${user.email}`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting user ${user.email}:`, error.message);
    return false;
  }
}

/**
 * Delete all users from the database
 */
async function deleteAllUsers() {
  try {
    // Connect to database
    await connectDb();
    console.log('📡 Connected to database');

    // Get all users
    const users = await User.find({});
    console.log(`👥 Found ${users.length} users to delete`);

    if (users.length === 0) {
      console.log('✨ No users found in database');
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    // Delete each user and their data
    for (const user of users) {
      const success = await deleteUserData(user);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
      console.log(''); // Add spacing between users
    }

    console.log('📊 Deletion Summary:');
    console.log(`✅ Successfully deleted: ${successCount} users`);
    console.log(`❌ Failed to delete: ${failureCount} users`);
    console.log(`📈 Total processed: ${users.length} users`);

    if (successCount > 0) {
      logger.info(`[delete-all-users] Deleted ${successCount} users from database`);
    }
  } catch (error) {
    console.error('💥 Error in deleteAllUsers:', error.message);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (!args.includes('--confirm')) {
    console.log('⚠️  WARNING: This script will delete ALL users from the database!');
    console.log('');
    console.log('This action is IRREVERSIBLE and will permanently delete:');
    console.log('  • All user accounts');
    console.log('  • All conversations and messages');
    console.log('  • All user files and uploads');
    console.log('  • All user presets and settings');
    console.log('  • All user sessions and authentication data');
    console.log('  • All user transactions and balances');
    console.log('  • All shared links and plugin data');
    console.log('  • All user integrations (Pipedream, MCP servers)');
    console.log('  • All scheduler tasks and executions');
    console.log('  • All memory entries');
    console.log('');
    console.log('Usage: node delete-all-users.js --confirm');
    console.log('');
    console.log('Please add the --confirm flag to proceed with the deletion.');
    process.exit(1);
  }

  console.log('🚨 DANGER ZONE: Deleting all users from database...');
  console.log('⏳ This may take a while for large databases...');
  console.log('');

  deleteAllUsers()
    .then(() => {
      console.log('🎉 All users deleted successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to delete all users:', error.message);
      process.exit(1);
    });
}

module.exports = { deleteAllUsers, deleteUserData };
