const Stripe = require('stripe');
const { logger } = require('~/config');

class StripeService {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      logger.warn('Stripe secret key not found. Payment features will be disabled.');
      this.stripe = null;
      return;
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    logger.info('Stripe service initialized successfully');
  }

  /**
   * Get the base URL for the application based on environment
   * @returns {string} Base URL
   */
  getBaseUrl() {
    return process.env.DOMAIN_SERVER || 'http://localhost:3080';
  }

  /**
   * Create a Stripe checkout session for subscription
   * @param {Object} params - Checkout session parameters
   * @param {string} params.priceId - Stripe price ID
   * @param {string} params.userEmail - User's email
   * @param {string} params.userId - User's ID
   * @param {number} params.credits - Credit amount for reference
   * @param {string} [params.idempotencyKey] - Optional idempotency key
   * @returns {Promise<Object>} Checkout session
   */
  async createCheckoutSession({ priceId, userEmail, userId, credits, idempotencyKey }) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    try {
      const baseUrl = this.getBaseUrl();
      const successUrl = `${baseUrl}/pricing?success=true`;
      const cancelUrl = `${baseUrl}/pricing?canceled=true`;

      // Debug logging
      logger.info('Stripe checkout session URLs:', {
        baseUrl,
        successUrl,
        cancelUrl,
        priceId,
        userEmail,
        userId,
        credits,
        idempotencyKey,
      });

      const sessionOptions = {
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: userEmail,
        client_reference_id: userId, // Backup way to identify user
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId,
          credits: credits.toString(),
          userEmail: userEmail,
        },
        subscription_data: {
          metadata: {
            userId: userId,
            credits: credits.toString(),
            userEmail: userEmail,
          },
        },
        billing_address_collection: 'required',
        automatic_tax: {
          enabled: true,
        },
      };

      // Add idempotency key if provided
      const requestOptions = idempotencyKey
        ? {
            idempotencyKey,
          }
        : {};

      const session = await this.stripe.checkout.sessions.create(sessionOptions, requestOptions);

      return session;
    } catch (error) {
      logger.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Retrieve a customer by email
   * @param {string} email - Customer email
   * @returns {Promise<Object|null>} Customer object or null
   */
  async getCustomerByEmail(email) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    try {
      const customers = await this.stripe.customers.list({
        email,
        limit: 1,
      });

      return customers.data.length > 0 ? customers.data[0] : null;
    } catch (error) {
      logger.error('Error retrieving customer:', error);
      throw error;
    }
  }

  /**
   * Get customer's active subscriptions
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Array>} Array of active subscriptions
   */
  async getActiveSubscriptions(customerId) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
      });

      return subscriptions.data;
    } catch (error) {
      logger.error('Error retrieving subscriptions:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   * @param {string} subscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} Canceled subscription
   */
  async cancelSubscription(subscriptionId) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    try {
      const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      logger.info(`Subscription canceled: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session for subscription management
   * @param {string} customerId - Stripe customer ID
   * @param {string} returnUrl - URL to return to after managing billing
   * @returns {Promise<Object>} Billing portal session
   */
  async createBillingPortalSession(customerId, returnUrl) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    try {
      const baseUrl = this.getBaseUrl();

      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || `${baseUrl}/pricing`,
      });

      return session;
    } catch (error) {
      logger.error('Error creating billing portal session:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Webhook signature
   * @returns {Object} Verified webhook event
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe webhook secret not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();
