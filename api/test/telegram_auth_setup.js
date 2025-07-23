#!/usr/bin/env node

/**
 * Telegram Session Pool Setup Script
 *
 * This script creates authenticated Telegram sessions for the session pool.
 * It automatically detects existing sessions and creates the next available slot
 * (TELEGRAM_SESSION_STRING_1, _2, _3, etc.) and updates your .env file.
 *
 * Run multiple times to build a session pool for better concurrency:
 * node telegram_auth_setup.js  # Creates TELEGRAM_SESSION_STRING_1
 * node telegram_auth_setup.js  # Creates TELEGRAM_SESSION_STRING_2
 * node telegram_auth_setup.js  # Creates TELEGRAM_SESSION_STRING_3
 *
 * Recommended: 3-5 sessions for production environments
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify readline question
const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

// Function to detect existing session variables and find next available slot
function findNextSessionSlot() {
  const envPath = path.join(__dirname, '../../.env');
  let envContent = '';

  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.log('⚠️  Could not read .env file, will create session variable manually');
    return { slotName: 'TELEGRAM_SESSION_STRING_1', shouldUpdate: false };
  }

  // Check for existing session variables
  const existingSessions = [];

  // Check main session
  if (envContent.includes('TELEGRAM_SESSION_STRING=')) {
    existingSessions.push('TELEGRAM_SESSION_STRING');
  }

  // Check numbered sessions
  for (let i = 1; i <= 10; i++) {
    const sessionVar = `TELEGRAM_SESSION_STRING_${i}`;
    if (envContent.includes(`${sessionVar}=`)) {
      existingSessions.push(sessionVar);
    }
  }

  console.log(`🔍 Found ${existingSessions.length} existing session(s):`, existingSessions);

  // Find next available slot
  let nextSlot;
  if (existingSessions.length === 0) {
    nextSlot = 'TELEGRAM_SESSION_STRING_1';
  } else if (
    existingSessions.includes('TELEGRAM_SESSION_STRING') &&
    !existingSessions.includes('TELEGRAM_SESSION_STRING_1')
  ) {
    nextSlot = 'TELEGRAM_SESSION_STRING_1';
  } else {
    // Find next numbered slot
    for (let i = 1; i <= 10; i++) {
      const candidate = `TELEGRAM_SESSION_STRING_${i}`;
      if (!existingSessions.includes(candidate)) {
        nextSlot = candidate;
        break;
      }
    }
  }

  if (!nextSlot) {
    throw new Error('Maximum number of session slots (10) reached');
  }

  return {
    slotName: nextSlot,
    shouldUpdate: true,
    envPath,
    existingCount: existingSessions.length,
  };
}

// Function to update .env file with new session
function updateEnvFile(envPath, sessionVar, sessionString) {
  try {
    let envContent = fs.readFileSync(envPath, 'utf8');

    // Add the new session variable
    const newLine = `${sessionVar}=${sessionString}`;

    // Append to file with proper line ending
    if (!envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += `${newLine}\n`;

    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Successfully added ${sessionVar} to .env file`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to update .env file: ${error.message}`);
    return false;
  }
}

async function authenticateTelegram() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER;

  if (!apiId || !apiHash) {
    console.error('❌ Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env file');
    console.log('Please add your credentials from https://my.telegram.org to the .env file');
    process.exit(1);
  }

  console.log('🚀 Starting Telegram authentication setup...');
  console.log(`📱 Using API ID: ${apiId}`);

  if (phoneNumber) {
    console.log(`📞 Using phone number from .env: ${phoneNumber}`);
  } else {
    console.log(
      '💡 Tip: Add TELEGRAM_PHONE_NUMBER=+1234567890 to your .env file to skip phone entry',
    );
  }

  // Detect existing sessions and find next available slot
  const sessionInfo = findNextSessionSlot();
  console.log(`🎯 Will create session: ${sessionInfo.slotName}`);

  if (sessionInfo.existingCount > 0) {
    console.log(`📊 This will be session #${sessionInfo.existingCount + 1} in your pool`);
  }

  // Create session
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    console.log('🔗 Connecting to Telegram...');

    await client.start({
      phoneNumber: async () => {
        if (phoneNumber) {
          console.log(`📞 Using phone number from .env: ${phoneNumber}`);
          return phoneNumber;
        }
        const phone = await question(
          '📞 Enter your phone number (with country code, e.g., +1234567890): ',
        );
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
    console.log(
      `👤 Logged in as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'no username'})`,
    );

    // Get session string for .env file
    const sessionString = client.session.save();

    console.log('\n🔑 NEW SESSION CREATED:');
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );
    console.log(`${sessionInfo.slotName}=${sessionString}`);
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );

    // Attempt to automatically update .env file
    if (sessionInfo.shouldUpdate) {
      console.log('\n🔄 Attempting to update .env file automatically...');
      const success = updateEnvFile(sessionInfo.envPath, sessionInfo.slotName, sessionString);

      if (success) {
        console.log(
          `✅ Session ${sessionInfo.slotName} has been automatically added to your .env file!`,
        );
        console.log(
          `🏊 Your session pool now has ${sessionInfo.existingCount + 1} session(s) for better concurrency`,
        );
      } else {
        console.log('❌ Auto-update failed. Please manually add the above line to your .env file.');
      }
    } else {
      console.log('\n📋 Please manually add the above line to your .env file.');
    }

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

    console.log('\n🎉 Setup complete! New session added to your pool.');
    console.log(
      '🔧 The Telegram tool in LibreChat will now have better concurrency with multiple sessions.',
    );

    if (sessionInfo.existingCount + 1 >= 3) {
      console.log('🚀 Great! You now have 3+ sessions for optimal performance under high load.');
    } else {
      console.log(
        `💡 Tip: Run this script ${3 - (sessionInfo.existingCount + 1)} more time(s) to reach the recommended 3+ sessions for production.`,
      );
    }
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
