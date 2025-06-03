const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const stripeService = require('~/server/services/StripeService');
const BalanceService = require('~/server/services/BalanceService');
const { logger } = require('~/config');
const mongoose = require('mongoose');
const { Transaction } = require('~/models/Transaction');

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

    // Log the request for debugging
    logger.info(`Checkout session requested by user ${user._id}`, {
      userId: user._id,
      userEmail: user.email,
      credits,
      timestamp: new Date().toISOString()
    });

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

    // Check for existing active checkout sessions for this user/credit combination
    // to prevent duplicate sessions (idempotency)
    try {
      const stripe = stripeService.stripe;
      const existingSessions = await stripe.checkout.sessions.list({
        limit: 10,
        created: {
          gte: Math.floor((Date.now() - 30 * 60 * 1000) / 1000), // Last 30 minutes
        },
      });

      // Find recent session for this user with same credit amount
      const recentSession = existingSessions.data.find(session => 
        session.metadata?.userId === user._id.toString() &&
        session.metadata?.credits === credits.toString() &&
        session.status === 'open' // Only consider open sessions
      );

      if (recentSession) {
        logger.info(`Returning existing checkout session for user ${user._id}`, {
          sessionId: recentSession.id,
          credits,
          createdAt: new Date(recentSession.created * 1000)
        });
        
        return res.json({
          sessionId: recentSession.id,
          url: recentSession.url,
        });
      }
    } catch (error) {
      logger.warn('Error checking for existing sessions, creating new one:', error);
      // Continue to create new session if check fails
    }

    // Create new session with idempotency key
    const idempotencyKey = `checkout_${user._id}_${credits}_${Date.now()}`;
    
    const session = await stripeService.createCheckoutSession({
      priceId,
      userEmail: user.email,
      userId: user._id.toString(),
      credits: credits.toString(),
      idempotencyKey
    });

    logger.info(`New checkout session created for user ${user._id}`, {
      sessionId: session.id,
      credits,
      idempotencyKey
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
 * Raw body parsing is handled in index.js middleware
 */
router.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    const event = stripeService.verifyWebhookSignature(req.body, signature);
    
    // Check event age - ignore very old events (more than 2 hours)
    const eventAge = Date.now() - (event.created * 1000);
    
    logger.info(`Webhook event received: ${event.type}`, { 
      eventId: event.id,
      created: new Date(event.created * 1000),
      ageMinutes: Math.round(eventAge / 60000),
      livemode: event.livemode
    });

    if (eventAge > 7200000) { // 2 hours
      logger.warn(`Ignoring old webhook event`, {
        eventId: event.id,
        eventType: event.type,
        ageHours: Math.round(eventAge / 3600000)
      });
      return res.json({ received: true, status: 'old_event_ignored' });
    }

    // CRITICAL: Check if we've already processed this exact event
    const eventTransactionId = `stripe_event_${event.id}`;
    const isDuplicateEvent = await BalanceService.isDuplicateTransaction(eventTransactionId);
    
    if (isDuplicateEvent) {
      logger.warn(`Duplicate Stripe event blocked: ${event.id}`, {
        eventType: event.type,
        eventId: event.id
      });
      return res.json({ received: true, status: 'duplicate_event_ignored' });
    }

    // Extract user ID from event context for proper data relationships
    let eventUserId = null;
    try {
      if (event.type === 'checkout.session.completed') {
        eventUserId = event.data.object.metadata?.userId || event.data.object.client_reference_id;
      } else if (event.type.startsWith('customer.subscription.')) {
        eventUserId = event.data.object.metadata?.userId;
      } else if (event.type.startsWith('invoice.')) {
        // For invoice events, get user from subscription metadata
        const invoice = event.data.object;
        if (invoice.subscription) {
          try {
            const stripe = stripeService.stripe;
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            eventUserId = subscription.metadata?.userId;
            
            logger.debug(`Extracted user ID from subscription for invoice event`, {
              eventId: event.id,
              invoiceId: invoice.id,
              subscriptionId: invoice.subscription,
              userId: eventUserId
            });
          } catch (error) {
            logger.warn('Could not retrieve subscription for invoice event:', error, {
              eventId: event.id,
              subscriptionId: invoice.subscription
            });
          }
        } else {
          logger.warn('Invoice event has no subscription ID', {
            eventId: event.id,
            invoiceId: invoice.id
          });
        }
      }
    } catch (error) {
      logger.warn('Error extracting user ID from event:', error, {
        eventId: event.id,
        eventType: event.type
      });
    }

    // Create a marker transaction to track that we've processed this event
    // NOTE: Use direct save to avoid triggering balance updates for event tracking
    try {
      const eventTracker = new Transaction({
        user: eventUserId ? new mongoose.Types.ObjectId(eventUserId) : new mongoose.Types.ObjectId('000000000000000000000000'),
        tokenType: 'credits',
        rawAmount: 0,
        tokenValue: 0, // Explicitly set to 0
        rate: 0, // No rate for tracking
        context: 'stripe_event_tracking',
        model: `event_${event.type}`,
        valueKey: eventTransactionId,
        endpointTokenConfig: {},
      });
      
      // Save directly without triggering Transaction.create() balance logic
      await eventTracker.save();
      
      logger.debug(`Event tracking transaction created`, {
        eventId: event.id,
        eventType: event.type,
        userId: eventUserId || 'none',
        transactionId: eventTracker._id
      });
    } catch (error) {
      // If marker creation fails, log but continue processing
      logger.warn('Failed to create event tracking marker:', error);
    }

    // Respond to Stripe immediately to prevent retries
    res.json({ received: true });

    // Process webhook asynchronously to prevent Stripe retries
    setImmediate(async () => {
      try {
        switch (event.type) {
          case 'checkout.session.completed':
            await handleCheckoutCompleted(event.data.object, event.id);
            break;
          
          case 'customer.subscription.created':
            await handleSubscriptionCreated(event.data.object, event.id);
            break;
          
          case 'customer.subscription.updated':
            await handleSubscriptionUpdated(event.data.object, event.id);
            break;
          
          case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object, event.id);
            break;
          
          case 'invoice.payment_succeeded':
            await handlePaymentSucceeded(event.data.object, event.id);
            break;
          
          case 'invoice.payment_failed':
            await handlePaymentFailed(event.data.object, event.id);
            break;
          
          default:
            logger.info(`Unhandled event type: ${event.type}`, { eventId: event.id });
        }
      } catch (processingError) {
        logger.error('Error processing webhook asynchronously:', processingError, {
          eventId: event.id,
          eventType: event.type
        });
      }
    });

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
async function handleCheckoutCompleted(session, eventId) {
  try {
    const { customer, client_reference_id, metadata, payment_status } = session;
    
    // Log session details for debugging
    logger.info(`Processing checkout session`, {
      sessionId: session.id,
      eventId,
      paymentStatus: payment_status,
      customerId: customer,
      clientRefId: client_reference_id,
      metadata: metadata,
      created: new Date(session.created * 1000)
    });
    
    // CRITICAL: Only process if payment was actually successful
    if (payment_status !== 'paid') {
      logger.info(`Checkout session not yet paid, skipping credit addition`, {
        sessionId: session.id,
        eventId,
        paymentStatus: payment_status
      });
      return;
    }
    
    const userId = metadata?.userId || client_reference_id;
    
    if (!userId) {
      logger.error('No userId found in checkout session metadata - this might be an old session from before metadata fix', { 
        sessionId: session.id,
        eventId,
        metadata: metadata,
        clientRefId: client_reference_id,
        created: new Date(session.created * 1000)
      });
      
      // For very old sessions (more than 1 hour), just ignore them
      const sessionAge = Date.now() - (session.created * 1000);
      if (sessionAge > 3600000) { // 1 hour
        logger.info(`Ignoring old checkout session without proper metadata`, {
          sessionId: session.id,
          ageMinutes: Math.round(sessionAge / 60000)
        });
        return;
      }
      
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
      eventId,
      customerId: customer,
      priceId,
      paymentStatus: payment_status
    });
    
    // Use BOTH session ID AND event ID for transaction ID to prevent duplicates
    const transactionId = `checkout_${session.id}_event_${eventId}`;
    
    // Add credits to user balance
    const result = await BalanceService.addCredits({
      userId,
      credits,
      transactionId,
      stripeData: {
        customerId: customer,
        priceId,
        sessionId: session.id,
        eventId,
        type: 'initial_subscription'
      }
    });

    if (result.success) {
      logger.info(`Checkout completion processed successfully`, {
        userId,
        credits,
        sessionId: session.id,
        eventId,
        transactionId: result.transaction,
        newBalance: result.newBalance,
        tier: result.tier,
        tierName: result.tierName
      });
    } else {
      logger.warn(`Failed to add credits: ${result.reason}`, {
        userId,
        credits,
        sessionId: session.id,
        eventId,
        transactionId
      });
    }
    
  } catch (error) {
    logger.error('Error handling checkout completion:', error, { 
      sessionId: session.id,
      eventId 
    });
  }
}

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(subscription, eventId) {
  try {
    const { customer, metadata, items } = subscription;
    let userId = metadata?.userId;
    
    // If userId not in subscription metadata, try to get it from recent checkout sessions
    if (!userId) {
      try {
        const stripe = stripeService.stripe;
        const sessions = await stripe.checkout.sessions.list({
          customer: customer,
          limit: 10,
        });
        
        // Find recent session with userId in metadata
        const recentSession = sessions.data.find(session => 
          session.metadata?.userId && 
          Date.now() - new Date(session.created * 1000).getTime() < 600000 // Within last 10 minutes
        );
        
        if (recentSession) {
          userId = recentSession.metadata.userId;
          logger.info(`Retrieved userId from recent checkout session: ${userId}`, {
            subscriptionId: subscription.id,
            sessionId: recentSession.id
          });
        }
      } catch (error) {
        logger.error('Error retrieving userId from checkout sessions:', error);
      }
    }
    
    if (!userId) {
      logger.error('No userId found in subscription metadata or recent checkout sessions', {
        subscriptionId: subscription.id,
        customerId: customer
      });
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
      priceId,
      eventId
    });
    
    // NOTE: Credits are added via checkout.session.completed for initial subscription
    // This handler only logs subscription creation for audit purposes
    // Future recurring billing will be handled by invoice.payment_succeeded
    
  } catch (error) {
    logger.error('Error handling subscription creation:', error, {
      subscriptionId: subscription.id,
      eventId
    });
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdated(subscription, eventId) {
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
async function handleSubscriptionDeleted(subscription, eventId) {
  try {
    const userId = subscription.metadata?.userId;
    
    if (!userId) {
      logger.error('No userId found in subscription metadata for deletion', {
        subscriptionId: subscription.id,
        eventId,
        customerId: subscription.customer
      });
      return;
    }
    
    logger.info(`Subscription deleted for user ${userId}`, {
      subscriptionId: subscription.id,
      eventId,
      status: subscription.status,
      canceledAt: subscription.canceled_at
    });
    
    // Downgrade user to free tier
    const result = await BalanceService.downgradeToFreeTier({
      userId,
      reason: 'subscription_cancelled'
    });

    if (result.success) {
      logger.info(`User downgraded to free tier after subscription cancellation`, {
        userId,
        subscriptionId: subscription.id,
        eventId,
        newTier: result.tier,
        newTierName: result.tierName,
        newRefillAmount: result.refillAmount
      });
    } else {
      logger.error(`Failed to downgrade user to free tier: ${result.reason}`, {
        userId,
        subscriptionId: subscription.id,
        eventId
      });
    }
    
  } catch (error) {
    logger.error('Error handling subscription deletion:', error, {
      subscriptionId: subscription.id,
      eventId
    });
  }
}

/**
 * Handle successful payment (recurring billing)
 */
async function handlePaymentSucceeded(invoice, eventId) {
  try {
    const { customer, subscription: subscriptionId, id: invoiceId } = invoice;
    
    logger.debug(`Processing invoice payment`, {
      eventId,
      invoiceId,
      customerId: customer,
      subscriptionId,
      hasSubscription: !!subscriptionId,
      billingReason: invoice.billing_reason,
      invoiceStatus: invoice.status,
      paymentIntent: invoice.payment_intent,
      invoiceCreated: new Date(invoice.created * 1000)
    });
    
    if (!subscriptionId) {
      logger.warn('Invoice event has no subscription ID', {
        eventId,
        invoiceId,
        customerId: customer,
        billingReason: invoice.billing_reason,
        invoiceStatus: invoice.status,
        paymentIntent: invoice.payment_intent,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        lines: invoice.lines?.data?.map(line => ({
          priceId: line.price?.id,
          amount: line.amount,
          description: line.description
        }))
      });
      
      // Try to find subscription through payment intent or recent subscriptions for this customer
      if (invoice.payment_intent && invoice.billing_reason === 'subscription_create') {
        try {
          const stripe = stripeService.stripe;
          const subscriptions = await stripe.subscriptions.list({
            customer: customer,
            limit: 5,
            created: {
              gte: Math.floor((Date.now() - 600000) / 1000), // Last 10 minutes
            },
          });
          
          if (subscriptions.data.length > 0) {
            const recentSub = subscriptions.data[0];
            logger.info(`Found recent subscription for invoice without subscription ID`, {
              eventId,
              invoiceId,
              foundSubscriptionId: recentSub.id,
              subscriptionStatus: recentSub.status,
              subscriptionCreated: new Date(recentSub.created * 1000)
            });
            
            // Note: We still skip processing this invoice since checkout.session.completed handles initial credits
            // This log helps us understand the relationship
          }
        } catch (error) {
          logger.warn('Error trying to find subscription for invoice:', error, {
            eventId,
            invoiceId
          });
        }
      }
      
      logger.info('Payment succeeded for non-subscription invoice, skipping credit top-up', {
        eventId,
        invoiceId,
        customerId: customer,
        billingReason: invoice.billing_reason
      });
      return;
    }

    // CRITICAL SECURITY: Prevent double crediting for initial subscription payment
    // Initial subscription credits are handled by checkout.session.completed
    // Only process recurring billing cycles here
    if (invoice.billing_reason === 'subscription_create') {
      logger.info('Skipping initial subscription invoice - credits already added via checkout completion', {
        eventId,
        invoiceId,
        subscriptionId,
        billingReason: invoice.billing_reason
      });
      return;
    }

    // Only process recurring subscription invoices
    if (invoice.billing_reason !== 'subscription_cycle') {
      logger.info('Skipping non-recurring invoice payment', {
        eventId,
        invoiceId,
        subscriptionId,
        billingReason: invoice.billing_reason,
        supportedReasons: ['subscription_cycle']
      });
      return;
    }

    // Get subscription details to extract metadata and line items
    let subscription;
    try {
      const stripe = stripeService.stripe;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      logger.debug(`Retrieved subscription for invoice`, {
        eventId,
        subscriptionId,
        subscriptionStatus: subscription.status,
        hasMetadata: !!subscription.metadata,
        userId: subscription.metadata?.userId
      });
    } catch (error) {
      logger.error('Error retrieving subscription for payment:', error, {
        eventId,
        subscriptionId,
        invoiceId
      });
      return;
    }
    
    const userId = subscription.metadata?.userId;
    
    if (!userId) {
      logger.error('No userId found in subscription metadata for payment', {
        subscriptionId,
        invoiceId,
        customerId: customer,
        eventId,
        metadata: subscription.metadata
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
        userId,
        eventId,
        priceId
      });
      return;
    }
    
    logger.info(`Payment succeeded for user ${userId}, adding ${credits} credits`, {
      subscriptionId,
      invoiceId,
      customerId: customer,
      priceId,
      eventId,
      billingReason: invoice.billing_reason
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
        type: 'recurring_payment',
        billingReason: invoice.billing_reason
      }
    });

    if (result.success) {
      logger.info(`Recurring payment processed: ${credits} credits added for user ${userId}`, {
        transactionId: result.transaction,
        newBalance: result.newBalance,
        subscriptionId,
        invoiceId,
        eventId,
        tier: result.tier,
        tierName: result.tierName
      });
    } else {
      logger.error(`Failed to process recurring payment: ${result.reason}`, {
        userId,
        credits,
        subscriptionId,
        invoiceId,
        eventId
      });
    }
    
  } catch (error) {
    logger.error('Error handling payment success:', error, {
      eventId,
      invoiceId: invoice.id
    });
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice, eventId) {
  try {
    const { customer, subscription: subscriptionId, id: invoiceId } = invoice;
    
    if (!subscriptionId) {
      logger.info('Payment failed for non-subscription invoice', {
        eventId,
        invoiceId,
        customerId: customer
      });
      return;
    }

    // Get subscription details to extract user info
    let subscription;
    try {
      const stripe = stripeService.stripe;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error('Error retrieving subscription for failed payment:', error, {
        eventId,
        subscriptionId,
        invoiceId
      });
      return;
    }
    
    const userId = subscription.metadata?.userId;
    
    if (!userId) {
      logger.error('No userId found in subscription metadata for failed payment', {
        subscriptionId,
        invoiceId,
        customerId: customer,
        eventId
      });
      return;
    }
    
    logger.warn(`Payment failed for user ${userId}`, {
      subscriptionId,
      invoiceId,
      customerId: customer,
      attemptCount: invoice.attempt_count,
      nextPaymentAttempt: invoice.next_payment_attempt,
      eventId
    });
    
    // If this is the final failed attempt (Stripe typically tries 4 times)
    // and subscription is incomplete/past_due, consider downgrading
    if (invoice.attempt_count >= 4 && 
        (subscription.status === 'incomplete' || subscription.status === 'past_due')) {
      
      logger.warn(`Final payment attempt failed, considering downgrade for user ${userId}`, {
        subscriptionId,
        invoiceId,
        subscriptionStatus: subscription.status,
        attemptCount: invoice.attempt_count,
        eventId
      });
      
      // Downgrade user to free tier after multiple failures
      const result = await BalanceService.downgradeToFreeTier({
        userId,
        reason: 'payment_failed_final'
      });

      if (result.success) {
        logger.info(`User downgraded to free tier after payment failures`, {
          userId,
          subscriptionId,
          invoiceId,
          eventId,
          newTier: result.tier,
          newTierName: result.tierName,
          newRefillAmount: result.refillAmount
        });
      } else {
        logger.error(`Failed to downgrade user after payment failures: ${result.reason}`, {
          userId,
          subscriptionId,
          invoiceId,
          eventId
        });
      }
    }
    
    // Note: You might want to implement additional logic here:
    // - Send notification to user about failed payment
    // - Update subscription status in your database
    
  } catch (error) {
    logger.error('Error handling payment failure:', error, {
      eventId,
      invoiceId: invoice.id
    });
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