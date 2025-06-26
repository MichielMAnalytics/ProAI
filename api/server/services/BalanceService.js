const { logger } = require('~/config');
const { updateBalance } = require('~/models/Transaction');
const { Balance, User, Transaction } = require('~/db/models');
const { getBalanceConfig } = require('~/server/services/Config');

/**
 * Secure Balance Service for handling credit top-ups
 * Implements proper validation, duplicate prevention, and security measures
 */
class BalanceService {
  
  /**
   * Get credit amount from Stripe price ID
   * @param {string} priceId - Stripe price ID
   * @returns {Promise<number>} Credit amount
   * @throws {Error} If config cannot be loaded or price ID is invalid
   */
  static async getCreditAmountFromPriceId(priceId) {
    const balanceConfig = await getBalanceConfig();
    
    if (!balanceConfig) {
      throw new Error('Critical: Cannot load balance configuration for payment processing');
    }
    
    const priceMapping = {
      [process.env.STRIPE_EVE_PRO]: balanceConfig.proTierTokens,
      [process.env.STRIPE_EVE_MAX]: balanceConfig.maxTierTokens,
    };

    const amount = priceMapping[priceId];
    if (!amount) {
      throw new Error(`Invalid price ID for payment: ${priceId}`);
    }
    
    return amount;
  }

  /**
   * Validate credit amount against expected values
   * @param {number} credits - Credit amount to validate
   * @returns {Promise<boolean>} True if valid
   * @throws {Error} If config cannot be loaded
   */
  static async isValidCreditAmount(credits) {
    const balanceConfig = await getBalanceConfig();
    
    if (!balanceConfig) {
      throw new Error('Critical: Cannot load balance configuration for payment validation');
    }
    
    const validAmounts = [
      balanceConfig.proTierTokens,
      balanceConfig.maxTierTokens
    ];
    
    return validAmounts.includes(Number(credits));
  }

  /**
   * Check if transaction has already been processed to prevent duplicates
   * @param {string} transactionId - Unique transaction identifier (Stripe payment intent, session, etc.)
   * @returns {Promise<boolean>} True if already processed
   */
  static async isDuplicateTransaction(transactionId) {
    try {
      // Use valueKey field to store Stripe transaction ID - this is what it's designed for
      const existingTransaction = await Transaction.findOne({
        context: 'stripe_payment',
        valueKey: transactionId // Use valueKey field for Stripe transaction ID
      }).lean();
      
      if (existingTransaction) {
        logger.info(`Duplicate transaction detected and blocked: ${transactionId}`, {
          existingTransactionId: existingTransaction._id,
          existingUserId: existingTransaction.user,
          createdAt: existingTransaction.createdAt
        });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking duplicate transaction:', error);
      return false; // Default to false to not block legitimate transactions
    }
  }

  /**
   * Validate user exists and is active
   * @param {string} userId - User ID from Stripe metadata
   * @returns {Promise<Object|null>} User object or null if invalid
   */
  static async validateUser(userId) {
    try {
      const user = await User.findById(userId).lean();
      
      if (!user) {
        logger.warn(`User not found for credit top-up: ${userId}`);
        return null;
      }

      // Check if user is suspended or banned
      if (user.suspended || user.banned) {
        logger.warn(`Blocked credit top-up for suspended/banned user: ${userId}`);
        return null;
      }

      return user;
    } catch (error) {
      logger.error('Error validating user:', error);
      return null;
    }
  }

  /**
   * Add credits to user balance securely
   * @param {Object} params - Parameters
   * @param {string} params.userId - User ID
   * @param {number} params.credits - Number of credits to add
   * @param {string} params.transactionId - Unique transaction ID (Stripe payment intent, session, etc.)
   * @param {Object} params.stripeData - Additional Stripe data for audit trail
   * @returns {Promise<Object>} Result object with success status and data
   */
  static async addCredits({ userId, credits, transactionId, stripeData = {} }) {
    try {
      // 1. Validate inputs
      if (!userId || !credits || !transactionId) {
        throw new Error('Missing required parameters: userId, credits, or transactionId');
      }

      const isValid = await this.isValidCreditAmount(credits);
      if (!isValid) {
        throw new Error(`Invalid credit amount: ${credits}`);
      }

      // 2. Check balance system is enabled
      const balanceConfig = await getBalanceConfig();
      if (!balanceConfig?.enabled) {
        logger.warn('Balance system is disabled, skipping credit top-up');
        return { success: false, reason: 'Balance system disabled' };
      }

      // 3. Prevent duplicate processing
      const isDuplicate = await this.isDuplicateTransaction(transactionId);
      if (isDuplicate) {
        logger.warn(`Duplicate transaction blocked: ${transactionId}`);
        return { success: false, reason: 'Duplicate transaction' };
      }

      // 4. Validate user
      const user = await this.validateUser(userId);
      if (!user) {
        return { success: false, reason: 'Invalid user' };
      }

      // 5. Extract tier information from Stripe data if available
      let tierInfo = null;
      const balanceUpdateFields = {};
      
      if (stripeData.priceId) {
        tierInfo = await this.getTierInfoFromPriceId(stripeData.priceId);
        if (tierInfo) {
          balanceUpdateFields.tier = tierInfo.tier;
          balanceUpdateFields.tierName = tierInfo.name;
          balanceUpdateFields.autoRefillEnabled = true;
          balanceUpdateFields.refillAmount = tierInfo.refillAmount;
          balanceUpdateFields.refillIntervalValue = tierInfo.refillIntervalValue;
          balanceUpdateFields.refillIntervalUnit = tierInfo.refillIntervalUnit;
          balanceUpdateFields.lastRefill = new Date(); // Update lastRefill to current time
          
          logger.info(`Updating user to ${tierInfo.name} (${tierInfo.tier})`, {
            userId,
            tier: tierInfo.tier,
            refillAmount: tierInfo.refillAmount,
            transactionId
          });
        }
      }

      // 6. Create transaction record for audit trail
      // NOTE: For credit purchases, we create transaction manually to avoid multipliers
      // that are designed for token usage, not credit additions
      const transaction = new Transaction({
        user: userId,
        tokenType: 'credits',
        rawAmount: credits, // Positive value for credit addition
        tokenValue: credits, // Set tokenValue equal to rawAmount (no multiplier)
        rate: 1, // Rate of 1 for credit purchases (no markup)
        context: 'stripe_payment',
        model: `stripe_credits_${credits}`,
        valueKey: transactionId,
        endpointTokenConfig: {},
      });

      // Save transaction manually without calling calculateTokenValue
      await transaction.save();

      // 7. Update balance with credits AND tier information
      const balanceResponse = await updateBalance({
        user: userId,
        incrementValue: credits, // Use exact credits, not tokenValue
        setValues: balanceUpdateFields // Include tier and refill settings
      });

      logger.info(`Credits added successfully: ${credits} credits for user ${userId}`, {
        transactionId,
        userId,
        credits,
        transactionDbId: transaction._id,
        newBalance: balanceResponse.tokenCredits,
        tier: balanceResponse.tier,
        tierName: balanceResponse.tierName
      });

      return {
        success: true,
        transaction: transaction._id,
        newBalance: balanceResponse.tokenCredits,
        creditsAdded: credits,
        tier: balanceResponse.tier,
        tierName: balanceResponse.tierName
      };

    } catch (error) {
      logger.error('Error adding credits:', error);
      throw error; // Re-throw to be handled by webhook caller
    }
  }

  /**
   * Handle subscription billing cycle renewal
   * @param {Object} params - Parameters
   * @param {string} params.userId - User ID  
   * @param {number} params.credits - Credits for the billing period
   * @param {string} params.subscriptionId - Stripe subscription ID
   * @param {string} params.invoiceId - Stripe invoice ID
   * @param {Object} params.stripeData - Additional Stripe data
   * @returns {Promise<Object>} Result object
   */
  static async handleSubscriptionRenewal({ userId, credits, subscriptionId, invoiceId, stripeData = {} }) {
    try {
      // Use invoice ID as transaction ID for renewals to prevent duplicates
      const transactionId = `invoice_${invoiceId}`;
      
      const result = await this.addCredits({
        userId,
        credits,
        transactionId,
        stripeData: {
          ...stripeData,
          subscriptionId,
          invoiceId,
          type: 'subscription_renewal'
        }
      });

      if (result.success) {
        logger.info(`Subscription renewal processed: ${credits} credits for user ${userId}`, {
          subscriptionId,
          invoiceId,
          userId
        });
      }

      return result;
    } catch (error) {
      logger.error('Error handling subscription renewal:', error);
      throw error;
    }
  }

  /**
   * Handle subscription cancellation/downgrade to free tier
   * @param {Object} params - Parameters
   * @param {string} params.userId - User ID
   * @param {string} params.reason - Reason for downgrade (cancellation, payment_failed, etc.)
   * @returns {Promise<Object>} Result object
   */
  static async downgradeToFreeTier({ userId, reason = 'subscription_ended' }) {
    try {
      // Validate user
      const user = await this.validateUser(userId);
      if (!user) {
        return { success: false, reason: 'Invalid user' };
      }

      // Get current balance config for free tier settings
      const balanceConfig = await getBalanceConfig();
      
      const freetierSettings = {
        tier: 'free',
        tierName: 'Free Tier',
        autoRefillEnabled: balanceConfig?.autoRefillEnabled || false,
        refillAmount: balanceConfig?.refillAmount || 0,
        refillIntervalValue: balanceConfig?.refillIntervalValue || 30,
        refillIntervalUnit: balanceConfig?.refillIntervalUnit || 'days'
      };

      // Update balance to free tier settings (don't change tokenCredits)
      const balanceResponse = await updateBalance({
        user: userId,
        incrementValue: 0, // Don't change credits, just tier settings
        setValues: freetierSettings
      });

      logger.info(`User downgraded to free tier`, {
        userId,
        reason,
        tier: balanceResponse.tier,
        tierName: balanceResponse.tierName,
        refillAmount: balanceResponse.refillAmount
      });

      return {
        success: true,
        tier: balanceResponse.tier,
        tierName: balanceResponse.tierName,
        refillAmount: balanceResponse.refillAmount
      };

    } catch (error) {
      logger.error('Error downgrading to free tier:', error);
      throw error;
    }
  }

  /**
   * Get user's current balance
   * @param {string} userId - User ID
   * @returns {Promise<number>} Current balance
   */
  static async getCurrentBalance(userId) {
    try {
      const balance = await Balance.findOne({ user: userId }).lean();
      return balance?.tokenCredits || 0;
    } catch (error) {
      logger.error('Error getting current balance:', error);
      return 0;
    }
  }

  /**
   * Get user's complete balance and tier information
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Complete balance information
   */
  static async getUserBalanceInfo(userId) {
    try {
      const balance = await Balance.findOne({ user: userId }).lean();
      
      if (!balance) {
        // Get actual free tier settings from configuration
        const balanceConfig = await getBalanceConfig();
        
        // Return default free tier info using actual config values
        return {
          tokenCredits: balanceConfig?.startBalance || 0,
          tier: 'free',
          tierName: 'Free Tier',
          autoRefillEnabled: balanceConfig?.autoRefillEnabled || false,
          refillAmount: balanceConfig?.refillAmount || 0,
          refillIntervalValue: balanceConfig?.refillIntervalValue || 30,
          refillIntervalUnit: balanceConfig?.refillIntervalUnit || 'days',
          lastRefill: null
        };
      }

      return {
        tokenCredits: balance.tokenCredits,
        tier: balance.tier || 'free',
        tierName: balance.tierName || 'Free Tier',
        autoRefillEnabled: balance.autoRefillEnabled,
        refillAmount: balance.refillAmount,
        refillIntervalValue: balance.refillIntervalValue,
        refillIntervalUnit: balance.refillIntervalUnit,
        lastRefill: balance.lastRefill
      };
    } catch (error) {
      logger.error('Error getting user balance info:', error);
      
      // Fallback with config values even on error
      try {
        const balanceConfig = await getBalanceConfig();
        return {
          tokenCredits: balanceConfig?.startBalance || 0,
          tier: 'free',
          tierName: 'Free Tier',
          autoRefillEnabled: balanceConfig?.autoRefillEnabled || false,
          refillAmount: balanceConfig?.refillAmount || 0,
          refillIntervalValue: balanceConfig?.refillIntervalValue || 30,
          refillIntervalUnit: balanceConfig?.refillIntervalUnit || 'days',
          lastRefill: null
        };
      } catch (configError) {
        logger.error('Error getting balance config:', configError);
        // Ultimate fallback with safe defaults
        return {
          tokenCredits: 0,
          tier: 'free',
          tierName: 'Free Tier',
          autoRefillEnabled: false,
          refillAmount: 0, // This should be the config default (5000), but we can't access config here safely
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          lastRefill: null
        };
      }
    }
  }

  /**
   * Map Stripe price IDs to subscription tier information
   * @param {string} priceId - Stripe price ID
   * @returns {Promise<Object>} Tier information
   * @throws {Error} If config cannot be loaded or price ID is invalid
   */
  static async getTierInfoFromPriceId(priceId) {
    const balanceConfig = await getBalanceConfig();
    
    if (!balanceConfig) {
      throw new Error('Critical: Cannot load balance configuration for tier mapping');
    }
    
    const tierMapping = {
      [process.env.STRIPE_EVE_PRO]: {
        tier: 'pro',
        name: 'Eve Pro',
        credits: balanceConfig.proTierTokens,
        refillAmount: balanceConfig.proTierTokens,
        refillIntervalValue: 1,
        refillIntervalUnit: 'months'
      },
      [process.env.STRIPE_EVE_MAX]: {
        tier: 'max',
        name: 'Eve Max',
        credits: balanceConfig.maxTierTokens,
        refillAmount: balanceConfig.maxTierTokens,
        refillIntervalValue: 1,
        refillIntervalUnit: 'months'
      }
    };

    const tierInfo = tierMapping[priceId];
    if (!tierInfo) {
      throw new Error(`Invalid price ID for tier mapping: ${priceId}`);
    }
    
    return tierInfo;
  }
}

module.exports = BalanceService; 