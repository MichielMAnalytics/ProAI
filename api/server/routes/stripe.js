const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const stripeService = require('~/server/services/StripeService');
const BalanceService = require('~/server/services/BalanceService');
const { logger } = require('~/config');

const router = express.Router();

// Price ID mapping for different credit tiers
const PRICE_IDS = {
  100000: process.env.STRIPE_PRICE_100K,   // $20/month - 100K credits
  200000: process.env.STRIPE_PRICE_200K,   // $35/month - 200K credits
  400000: process.env.STRIPE_PRICE_400K,   // $60/month - 400K credits
  800000: process.env.STRIPE_PRICE_800K,   // $100/month - 800K credits
  1200000: process.env.STRIPE_PRICE_1200K, // $140/month - 1.2M credits
  2000000: process.env.STRIPE_PRICE_2000K, // $200/month - 2M credits
  3000000: process.env.STRIPE_PRICE_3000K, // $280/month - 3M credits
  4000000: process.env.STRIPE_PRICE_4000K, // $350/month - 4M credits
};

/**
 * Create checkout session for Pro subscription
 */
router.post('/create-checkout-session', requireJwtAuth, async (req, res) => {
  try {
    const { credits } = req.body;
    const { user } = req;

    if (!credits || !PRICE_IDS[credits]) {
      return res.status(400).json({
        error: 'Invalid credit amount',
        validCredits: Object.keys(PRICE_IDS).map(Number),
      });
    }

    const priceId = PRICE_IDS[credits];
    if (!priceId) {
      return res.status(400).json({
        error: `Price ID not configured for ${credits} credits`,
      });
    }

    const session = await stripeService.createCheckoutSession({
      priceId,
      userEmail: user.email,
      userId: user._id.toString(),
      credits: credits.toString(),
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
    });
  }
});

/**
 * Get user's subscription status
 */
router.get('/subscription-status', requireJwtAuth, async (req, res) => {
  try {
    const { user } = req;
    
    const customer = await stripeService.getCustomerByEmail(user.email);
    if (!customer) {
      return res.json({
        hasSubscription: false,
        subscriptions: [],
      });
    }

    const subscriptions = await stripeService.getActiveSubscriptions(customer.id);
    
    res.json({
      hasSubscription: subscriptions.length > 0,
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        status: sub.status,
        credits: sub.metadata.credits,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      })),
    });
  } catch (error) {
    logger.error('Error getting subscription status:', error);
    res.status(500).json({
      error: 'Failed to get subscription status',
    });
  }
});

/**
 * Create billing portal session for subscription management
 */
router.post('/create-portal-session', requireJwtAuth, async (req, res) => {
  try {
    const { user } = req;
    
    const customer = await stripeService.getCustomerByEmail(user.email);
    if (!customer) {
      return res.status(404).json({
        error: 'No customer found',
      });
    }

    const baseUrl = process.env.DOMAIN_SERVER || 'http://localhost:3080';
    const session = await stripeService.createBillingPortalSession(
      customer.id,
      `${baseUrl}/pricing`
    );

    res.json({
      url: session.url,
    });
  } catch (error) {
    logger.error('Error creating billing portal session:', error);
    res.status(500).json({
      error: 'Failed to create billing portal session',
    });
  }
});

/**
 * Stripe webhook handler
 * This endpoint should NOT require authentication as it's called by Stripe
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    const event = stripeService.verifyWebhookSignature(req.body, signature);
    
    logger.info(`Webhook event received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).json({
      error: 'Webhook signature verification failed',
    });
  }
});

/**
 * Handle successful checkout session
 */
async function handleCheckoutCompleted(session) {
  try {
    const { customer, client_reference_id, metadata } = session;
    const userId = metadata?.userId || client_reference_id;
    
    if (!userId) {
      logger.error('No userId found in checkout session metadata');
      return;
    }

    // Extract credits from line items
    let lineItems;
    try {
      const stripe = stripeService.stripe;
      lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    } catch (error) {
      logger.error('Error retrieving line items from checkout session:', error);
      return;
    }
    
    if (!lineItems.data || lineItems.data.length === 0) {
      logger.error('No line items found in checkout session');
      return;
    }

    const priceId = lineItems.data[0].price.id;
    const credits = BalanceService.getCreditAmountFromPriceId(priceId);
    
    if (!credits) {
      logger.error(`Unable to determine credit amount for price ID: ${priceId}`);
      return;
    }

    logger.info(`Checkout completed for user ${userId}, credits: ${credits}`, {
      sessionId: session.id,
      customerId: customer,
      priceId
    });
    
    // Add credits to user balance
    const result = await BalanceService.addCredits({
      userId,
      credits,
      transactionId: `checkout_${session.id}`,
      stripeData: {
        customerId: customer,
        priceId,
        sessionId: session.id,
        type: 'initial_subscription'
      }
    });

    if (result.success) {
      logger.info(`Credits successfully added: ${credits} credits for user ${userId}`, {
        transactionId: result.transaction,
        newBalance: result.newBalance
      });
    } else {
      logger.warn(`Failed to add credits: ${result.reason}`, {
        userId,
        credits,
        sessionId: session.id
      });
    }
    
  } catch (error) {
    logger.error('Error handling checkout completion:', error);
  }
}

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(subscription) {
  try {
    const { customer, metadata, items } = subscription;
    const userId = metadata?.userId;
    
    if (!userId) {
      logger.error('No userId found in subscription metadata');
      return;
    }

    // Get credits from price ID
    const priceId = items.data[0]?.price?.id;
    const credits = BalanceService.getCreditAmountFromPriceId(priceId);
    
    if (!credits) {
      logger.error(`Unable to determine credit amount for subscription price ID: ${priceId}`);
      return;
    }
    
    logger.info(`Subscription created for user ${userId}, credits: ${credits}`, {
      subscriptionId: subscription.id,
      customerId: customer,
      priceId
    });
    
    // Note: For subscriptions, credits are typically added on invoice.payment_succeeded
    // This handler mainly logs the subscription creation
    
  } catch (error) {
    logger.error('Error handling subscription creation:', error);
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdated(subscription) {
  try {
    const { userId } = subscription.metadata;
    
    logger.info(`Subscription updated for user ${userId}, status: ${subscription.status}`);
    
    // TODO: Update user's subscription status in database
    
  } catch (error) {
    logger.error('Error handling subscription update:', error);
  }
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription) {
  try {
    const { userId } = subscription.metadata;
    
    logger.info(`Subscription deleted for user ${userId}`);
    
    // TODO: Update user to free plan in database
    
  } catch (error) {
    logger.error('Error handling subscription deletion:', error);
  }
}

/**
 * Handle successful payment (recurring billing)
 */
async function handlePaymentSucceeded(invoice) {
  try {
    const { customer, subscription: subscriptionId, id: invoiceId } = invoice;
    
    if (!subscriptionId) {
      logger.info('Payment succeeded for non-subscription invoice, skipping credit top-up');
      return;
    }

    // Get subscription details to extract metadata and line items
    let subscription;
    try {
      const stripe = stripeService.stripe;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error('Error retrieving subscription for payment:', error);
      return;
    }
    
    const userId = subscription.metadata?.userId;
    
    if (!userId) {
      logger.error('No userId found in subscription metadata for payment', {
        subscriptionId,
        invoiceId,
        customerId: customer
      });
      return;
    }

    // Get credits from subscription price ID
    const priceId = subscription.items.data[0]?.price?.id;
    const credits = BalanceService.getCreditAmountFromPriceId(priceId);
    
    if (!credits) {
      logger.error(`Unable to determine credit amount for payment price ID: ${priceId}`, {
        subscriptionId,
        invoiceId,
        userId
      });
      return;
    }
    
    logger.info(`Payment succeeded for user ${userId}, adding ${credits} credits`, {
      subscriptionId,
      invoiceId,
      customerId: customer,
      priceId
    });
    
    // Add credits to user balance for successful billing cycle
    const result = await BalanceService.handleSubscriptionRenewal({
      userId,
      credits,
      subscriptionId,
      invoiceId,
      stripeData: {
        customerId: customer,
        priceId,
        subscriptionStatus: subscription.status,
        type: 'recurring_payment'
      }
    });

    if (result.success) {
      logger.info(`Recurring payment processed: ${credits} credits added for user ${userId}`, {
        transactionId: result.transaction,
        newBalance: result.newBalance,
        subscriptionId,
        invoiceId
      });
    } else {
      logger.error(`Failed to process recurring payment: ${result.reason}`, {
        userId,
        credits,
        subscriptionId,
        invoiceId
      });
    }
    
  } catch (error) {
    logger.error('Error handling payment success:', error);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  try {
    const { customer, subscription: subscriptionId, id: invoiceId } = invoice;
    
    if (!subscriptionId) {
      logger.info('Payment failed for non-subscription invoice');
      return;
    }

    // Get subscription details to extract user info
    let subscription;
    try {
      const stripe = stripeService.stripe;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error('Error retrieving subscription for failed payment:', error);
      return;
    }
    
    const userId = subscription.metadata?.userId;
    
    logger.warn(`Payment failed for user ${userId}`, {
      subscriptionId,
      invoiceId,
      customerId: customer,
      attemptCount: invoice.attempt_count,
      nextPaymentAttempt: invoice.next_payment_attempt
    });
    
    // Note: You might want to implement additional logic here:
    // - Send notification to user about failed payment
    // - Potentially reduce credits or suspend account after multiple failures
    // - Update subscription status in your database
    
  } catch (error) {
    logger.error('Error handling payment failure:', error);
  }
}

/**
 * Debug endpoint to check configuration
 */
router.get('/debug-config', (req, res) => {
  const baseUrl = process.env.DOMAIN_SERVER || 'http://localhost:3080';
  res.json({
    baseUrl,
    domainServer: process.env.DOMAIN_SERVER,
    nodeEnv: process.env.NODE_ENV,
    successUrl: `${baseUrl}/pricing?success=true`,
    cancelUrl: `${baseUrl}/pricing?canceled=true`
  });
});

module.exports = router; 