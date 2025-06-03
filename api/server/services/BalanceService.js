const { logger } = require('~/config');
const { Transaction } = require('~/models/Transaction');
const Balance = require('~/models/Balance');
const User = require('~/models/User');
const { getBalanceConfig } = require('~/server/services/Config');

/**
 * Secure Balance Service for handling credit top-ups
 * Implements proper validation, duplicate prevention, and security measures
 */
class BalanceService {
  
  /**
   * Get credit amount from Stripe price ID
   * @param {string} priceId - Stripe price ID
   * @returns {number|null} Credit amount or null if invalid
   */
  static getCreditAmountFromPriceId(priceId) {
    const priceMapping = {
      [process.env.STRIPE_PRICE_100K]: 100000,
      [process.env.STRIPE_PRICE_200K]: 200000,
      [process.env.STRIPE_PRICE_400K]: 400000,
      [process.env.STRIPE_PRICE_800K]: 800000,
      [process.env.STRIPE_PRICE_1200K]: 1200000,
      [process.env.STRIPE_PRICE_2000K]: 2000000,
      [process.env.STRIPE_PRICE_3000K]: 3000000,
      [process.env.STRIPE_PRICE_4000K]: 4000000,
    };

    return priceMapping[priceId] || null;
  }

  /**
   * Validate credit amount against expected values
   * @param {number} credits - Credit amount to validate
   * @returns {boolean} True if valid
   */
  static isValidCreditAmount(credits) {
    const validAmounts = [100000, 200000, 400000, 800000, 1200000, 2000000, 3000000, 4000000];
    return validAmounts.includes(Number(credits));
  }

  /**
   * Check if transaction has already been processed to prevent duplicates
   * @param {string} transactionId - Unique transaction identifier (Stripe payment intent, session, etc.)
   * @returns {Promise<boolean>} True if already processed
   */
  static async isDuplicateTransaction(transactionId) {
    try {
      const existingTransaction = await Transaction.findOne({
        'metadata.stripeTransactionId': transactionId,
        context: 'stripe_payment'
      }).lean();
      
      return !!existingTransaction;
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

      if (!this.isValidCreditAmount(credits)) {
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

      // 5. Create transaction record with metadata for audit trail
      const transaction = await Transaction.create({
        user: userId,
        tokenType: 'credit_topup',
        rawAmount: credits, // Positive value for credit addition
        context: 'stripe_payment',
        model: 'stripe_pro_subscription',
        endpointTokenConfig: {},
        metadata: {
          stripeTransactionId: transactionId,
          stripeCustomerId: stripeData.customerId,
          stripeSubscriptionId: stripeData.subscriptionId,
          stripePriceId: stripeData.priceId,
          paymentMethod: 'stripe',
          timestamp: new Date().toISOString(),
          userEmail: user.email,
        }
      });

      logger.info(`Credits added successfully: ${credits} credits for user ${userId}`, {
        transactionId,
        userId,
        credits,
        transactionDbId: transaction._id
      });

      return {
        success: true,
        transaction: transaction._id,
        newBalance: transaction.balance || credits, // Transaction.create should return balance
        creditsAdded: credits
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
}

module.exports = BalanceService; 