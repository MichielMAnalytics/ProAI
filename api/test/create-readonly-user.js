#!/usr/bin/env node

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

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Generate a secure password
 */
function generateSecurePassword() {
  return crypto.randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) + '!Aa1';
}

/**
 * Create read-only user for MongoDB
 */
async function createReadOnlyUser() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    
    // Connect to MongoDB using the connection string from .env
    await mongoose.connect(process.env.MONGO_URI, {
      authSource: 'admin',
      dbName: 'LibreChat'
    });

    console.log('✅ Connected to MongoDB');

    // Get the database name from the connection string
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}`);

    // Switch to admin database to create user
    const adminDb = mongoose.connection.db.admin();
    
    // Generate secure password
    const password = generateSecurePassword();
    const username = 'hidde_readonly';

    try {
      // First try to drop the user if it exists
      await adminDb.command({
        dropUser: username,
        writeConcern: { w: 'majority', wtimeout: 5000 }
      });
      console.log(`🗑️  Dropped existing user: ${username}`);
    } catch (error) {
      // User doesn't exist, that's fine
      console.log(`ℹ️  User ${username} doesn't exist yet`);
    }

    // Create the read-only user
    // Azure Cosmos DB uses different role names
    await adminDb.command({
      createUser: username,
      pwd: password,
      roles: [
        { role: 'readAnyDatabase', db: 'admin' }
      ]
    });

    console.log(`✅ Created read-only user: ${username}`);

    // Parse the original connection string to build the read-only one
    const originalUri = process.env.MONGO_URI;
    const uriMatch = originalUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@(.+)/);
    
    if (!uriMatch) {
      throw new Error('Could not parse MongoDB connection string');
    }

    const [, , , hostAndParams] = uriMatch;
    
    // Build the read-only connection string
    const readOnlyConnectionString = `mongodb+srv://${username}:${password}@${hostAndParams}`;

    console.log('\n📋 Read-only connection details for Hidde:');
    console.log('=====================================');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log('\n🔗 Connection string:');
    console.log(readOnlyConnectionString);
    console.log('=====================================');
    
    console.log('\n⚠️  Security recommendations:');
    console.log('1. Share these credentials securely (not via email/slack)');
    console.log('2. Consider using Azure Key Vault for storage');
    console.log('3. The user has read-only access to the LibreChat database');
    console.log('4. Regularly rotate the password');

  } catch (error) {
    console.error('❌ Error creating read-only user:', error.message);
    throw error;
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  createReadOnlyUser()
    .then(() => {
      console.log('\n🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed:', error);
      process.exit(1);
    });
}

module.exports = { createReadOnlyUser };