#!/usr/bin/env node

// Update user tier script
// Usage:
//   cd api && node test/update-user-tier.js user@example.com free
//   cd api && node test/update-user-tier.js user@example.com pro
//   cd api && node test/update-user-tier.js user@example.com max

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

const yaml = require('yaml');
const fs = require('fs');

const { connectDb } = require('../db/connect');
const { User, Balance } = require('../db/models');

/**
 * Simple function to read balance config from librechat.yaml
 */
async function getBalanceConfig() {
  try {
    const configPath = path.join(__dirname, '../../librechat.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.parse(configContent);
    return config.balance || {};
  } catch (error) {
    console.error('Error reading librechat.yaml:', error.message);
    // Return default values
    return {
      enabled: true,
      startBalance: 100000,
      proTierTokens: 2000000,
      maxTierTokens: 9000000,
      refillAmount: 100000,
      refillIntervalValue: 1,
      refillIntervalUnit: 'months',
      autoRefillEnabled: true,
    };
  }
}

/**
 * Get tier configuration based on tier type
 * @param {string} tier - Tier type: 'free', 'pro', or 'max'
 * @param {Object} balanceConfig - Balance configuration from librechat.yaml
 * @returns {Object} Tier configuration
 */
function getTierConfig(tier, balanceConfig) {
  const currentTime = new Date();

  switch (tier) {
    case 'free':
      return {
        tier: 'free',
        tierName: 'Free Tier',
        tokenCredits: balanceConfig?.startBalance || 100000,
        refillAmount: balanceConfig?.refillAmount || 100000,
        refillIntervalValue: balanceConfig?.refillIntervalValue || 1,
        refillIntervalUnit: balanceConfig?.refillIntervalUnit || 'months',
        autoRefillEnabled: balanceConfig?.autoRefillEnabled || true,
        lastRefill: currentTime,
      };

    case 'pro':
      return {
        tier: 'pro',
        tierName: 'Eve Pro',
        tokenCredits: balanceConfig?.proTierTokens || 2000000,
        refillAmount: balanceConfig?.proTierTokens || 2000000,
        refillIntervalValue: 1,
        refillIntervalUnit: 'months',
        autoRefillEnabled: true,
        lastRefill: currentTime,
      };

    case 'max':
      return {
        tier: 'max',
        tierName: 'Eve Max',
        tokenCredits: balanceConfig?.maxTierTokens || 9000000,
        refillAmount: balanceConfig?.maxTierTokens || 9000000,
        refillIntervalValue: 1,
        refillIntervalUnit: 'months',
        autoRefillEnabled: true,
        lastRefill: currentTime,
      };

    default:
      throw new Error(`Invalid tier: ${tier}. Must be 'free', 'pro', or 'max'`);
  }
}

/**
 * Update user tier and balance information
 * @param {string} email - User email address
 * @param {string} tier - Tier type: 'free', 'pro', or 'max'
 */
async function updateUserTier(email, tier) {
  try {
    // Connect to database
    await connectDb();

    // Validate tier
    const validTiers = ['free', 'pro', 'max'];
    if (!validTiers.includes(tier)) {
      throw new Error(`Invalid tier: ${tier}. Must be one of: ${validTiers.join(', ')}`);
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new Error(`User not found with email: ${email}`);
    }

    console.log(`📧 Found user: ${user.name || user.username || 'N/A'} (${user.email})`);
    console.log(`🆔 User ID: ${user._id}`);

    // Get balance configuration
    const balanceConfig = await getBalanceConfig();
    if (!balanceConfig?.enabled) {
      throw new Error('Balance system is disabled in configuration');
    }

    // Get tier configuration
    const tierConfig = getTierConfig(tier, balanceConfig);

    console.log(`🎯 Updating to tier: ${tierConfig.tier} (${tierConfig.tierName})`);
    console.log(`💰 Token credits: ${tierConfig.tokenCredits.toLocaleString()}`);
    console.log(`🔄 Refill amount: ${tierConfig.refillAmount.toLocaleString()}`);
    console.log(
      `📅 Refill interval: ${tierConfig.refillIntervalValue} ${tierConfig.refillIntervalUnit}`,
    );

    // Update or create balance record
    const balanceUpdate = {
      user: user._id,
      tier: tierConfig.tier,
      tierName: tierConfig.tierName,
      tokenCredits: tierConfig.tokenCredits,
      refillAmount: tierConfig.refillAmount,
      refillIntervalValue: tierConfig.refillIntervalValue,
      refillIntervalUnit: tierConfig.refillIntervalUnit,
      autoRefillEnabled: tierConfig.autoRefillEnabled,
      lastRefill: tierConfig.lastRefill,
      updatedAt: new Date(),
    };

    const result = await Balance.findOneAndUpdate({ user: user._id }, balanceUpdate, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    console.log(`✅ Successfully updated user tier!`);
    console.log(`📊 Balance record ID: ${result._id}`);
    console.log(`🕒 Last updated: ${result.updatedAt}`);

    return result;
  } catch (error) {
    console.error('❌ Error updating user tier:', error.message);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log('Usage: node update-user-tier.js <email> <tier>');
    console.log('');
    console.log('Arguments:');
    console.log('  email  - User email address');
    console.log('  tier   - Tier type: free, pro, or max');
    console.log('');
    console.log('Examples:');
    console.log('  node update-user-tier.js user@example.com free');
    console.log('  node update-user-tier.js user@example.com pro');
    console.log('  node update-user-tier.js user@example.com max');
    console.log('');
    console.log('Tier Details:');
    console.log('  free - Free Tier (100K tokens/month)');
    console.log('  pro  - Eve Pro ($29/month, 2M tokens/month)');
    console.log('  max  - Eve Max ($99/month, 9M tokens/month)');
    process.exit(1);
  }

  const email = args[0];
  const tier = args[1].toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('❌ Invalid email format:', email);
    process.exit(1);
  }

  updateUserTier(email, tier)
    .then(() => {
      console.log('🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error.message);
      process.exit(1);
    });
}

module.exports = { updateUserTier, getTierConfig };
