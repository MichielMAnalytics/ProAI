#!/usr/bin/env node

/**
 * One-time Telegram Authentication Setup Script
 * 
 * This script will authenticate your Telegram client and output a session string
 * that you can add to your .env file for the Telegram tool to use.
 * 
 * Run this script once to set up authentication:
 * node telegram_auth_setup.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify readline question
const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function authenticateTelegram() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    console.error('❌ Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env file');
    console.log('Please add your credentials from https://my.telegram.org to the .env file');
    process.exit(1);
  }

  console.log('🚀 Starting Telegram authentication setup...');
  console.log(`📱 Using API ID: ${apiId}`);

  // Create session
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    console.log('🔗 Connecting to Telegram...');
    
    await client.start({
      phoneNumber: async () => {
        const phone = await question('📞 Enter your phone number (with country code, e.g., +1234567890): ');
        return phone.trim();
      },
      password: async () => {
        const password = await question('🔐 Enter your 2FA password (if enabled): ');
        return password.trim();
      },
      phoneCode: async () => {
        const code = await question('📱 Enter the verification code sent to your phone: ');
        return code.trim();
      },
      onError: (err) => {
        console.error('❌ Authentication error:', err.message);
      },
    });

    console.log('✅ Successfully authenticated with Telegram!');

    // Get user info to confirm authentication
    const me = await client.getMe();
    console.log(`👤 Logged in as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'no username'})`);

    // Get session string for .env file
    const sessionString = client.session.save();
    
    console.log('\n🔑 TELEGRAM SESSION STRING:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`TELEGRAM_SESSION_STRING=${sessionString}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 COPY THE ABOVE LINE TO YOUR .env FILE');

    // Test channel access
    console.log('\n🧪 Testing channel access...');
    try {
      // Test with a known public channel (Telegram's official channel)
      const testChannel = await client.getEntity('@telegram');
      console.log(`✅ Successfully accessed test channel: ${testChannel.title}`);
      
      // Get a few recent messages to test
      let messageCount = 0;
      for await (const message of client.iterMessages(testChannel, { limit: 3 })) {
        if (message.message) {
          messageCount++;
          console.log(`📄 Message ${messageCount}: ${message.message.substring(0, 50)}...`);
        }
      }
      
      console.log('✅ Message fetching test successful!');
    } catch (error) {
      console.log('⚠️  Channel access test failed (this is usually fine):', error.message);
    }

    console.log('\n🎉 Setup complete! The Telegram tool is now ready to use.');
    console.log('🔧 Add the session string above to your .env file, then you can use the Telegram tool in LibreChat to fetch messages from public channels.');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    
    if (error.message.includes('AUTH_KEY_UNREGISTERED')) {
      console.log('💡 This usually means the phone number is not registered with Telegram.');
    } else if (error.message.includes('PHONE_CODE_INVALID')) {
      console.log('💡 The verification code was incorrect. Please try again.');
    } else if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
      console.log('💡 Two-factor authentication is enabled. Please enter your password.');
    }
    
    process.exit(1);
  } finally {
    await client.disconnect();
    rl.close();
  }
}

// Handle script termination
process.on('SIGINT', async () => {
  console.log('\n⏹️  Authentication cancelled by user');
  rl.close();
  process.exit(0);
});

// Run authentication
authenticateTelegram().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});