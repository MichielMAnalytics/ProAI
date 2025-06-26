#!/usr/bin/env node

// Delete user data script
// Usage:
//   cd api && node test/delete-user-data.js user@example.com
//   cd api && node test/delete-user-data.js 507f1f77bcf86cd799439011

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
const { User, Conversation, Message } = require('../db/models');

/**
 * Delete all conversations and messages for a specific user
 * @param {string} userIdentifier - User email address or user ID
 */
async function deleteUserData(userIdentifier) {
  try {
    // Connect to database
    await connectDb();
    
    // Find user by email or ID
    let user;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(userIdentifier);
    
    if (isObjectId) {
      // Search by user ID
      user = await User.findById(userIdentifier);
    } else {
      // Search by email
      user = await User.findOne({ email: userIdentifier.toLowerCase() });
    }
    
    if (!user) {
      throw new Error(`User not found with identifier: ${userIdentifier}`);
    }
    
    console.log(`📧 Found user: ${user.name || user.username || 'N/A'} (${user.email})`);
    console.log(`🆔 User ID: ${user._id}`);
    
    // Find all conversations for this user
    const conversations = await Conversation.find({ user: user._id }).select('conversationId');
    const conversationIds = conversations.map(c => c.conversationId);
    
    console.log(`📁 Found ${conversations.length} conversations for user`);
    
    if (conversationIds.length === 0) {
      console.log('✅ No conversations found for user - nothing to delete');
      return {
        conversations: { deletedCount: 0 },
        messages: { deletedCount: 0 }
      };
    }
    
    // Delete all messages for these conversations
    console.log('🗑️  Deleting messages...');
    const deleteMessagesResult = await Message.deleteMany({
      conversationId: { $in: conversationIds }
    });
    
    console.log(`✅ Deleted ${deleteMessagesResult.deletedCount} messages`);
    
    // Delete all conversations for this user
    console.log('🗑️  Deleting conversations...');
    const deleteConversationsResult = await Conversation.deleteMany({
      user: user._id
    });
    
    console.log(`✅ Deleted ${deleteConversationsResult.deletedCount} conversations`);
    
    const result = {
      conversations: deleteConversationsResult,
      messages: deleteMessagesResult
    };
    
    console.log(`🎉 Successfully deleted all data for user!`);
    console.log(`📊 Summary:`);
    console.log(`   - Conversations deleted: ${result.conversations.deletedCount}`);
    console.log(`   - Messages deleted: ${result.messages.deletedCount}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error deleting user data:', error.message);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.log('Usage: node delete-user-data.js <user-identifier>');
    console.log('');
    console.log('Arguments:');
    console.log('  user-identifier  - User email address or user ID');
    console.log('');
    console.log('Examples:');
    console.log('  node delete-user-data.js user@example.com');
    console.log('  node delete-user-data.js 507f1f77bcf86cd799439011');
    console.log('');
    console.log('⚠️  WARNING: This will permanently delete ALL conversations and messages for the specified user!');
    process.exit(1);
  }
  
  const userIdentifier = args[0];
  
  // Validate email format if it looks like an email
  if (userIdentifier.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userIdentifier)) {
      console.error('❌ Invalid email format:', userIdentifier);
      process.exit(1);
    }
  }
  
  // Confirmation prompt for safety
  console.log('⚠️  WARNING: This will permanently delete ALL conversations and messages for the user!');
  console.log(`🎯 Target user: ${userIdentifier}`);
  console.log('');
  console.log('This action cannot be undone. Make sure you have a backup if needed.');
  console.log('');
  
  deleteUserData(userIdentifier)
    .then(() => {
      console.log('🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error.message);
      process.exit(1);
    });
}

module.exports = { deleteUserData };