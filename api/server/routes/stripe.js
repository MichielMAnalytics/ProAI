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
    // Enhanced subscription ID extraction following Stripe best practices
    let subscriptionId = invoice.subscription;
    const { customer, id: invoiceId } = invoice;
    
    // If subscription ID is not directly available, try alternative extraction methods
    if (!subscriptionId) {
      // For subscription invoices, try to extract from invoice lines
      if (invoice.lines?.data?.length > 0) {
        // Look for subscription line items (type: 'subscription')
        const subscriptionLine = invoice.lines.data.find(line => 
          line.type === 'subscription' && line.subscription
        );
        if (subscriptionLine) {
          subscriptionId = subscriptionLine.subscription;
          logger.debug(`Extracted subscription ID from subscription line item`, {
            eventId,
            invoiceId,
            subscriptionId,
            lineType: subscriptionLine.type,
            lineId: subscriptionLine.id
          });
        } else {
          // Also check if any line items have subscription references (for recurring billing)
          const lineWithSubscription = invoice.lines.data.find(line => line.subscription);
          if (lineWithSubscription) {
            subscriptionId = lineWithSubscription.subscription;
            logger.debug(`Extracted subscription ID from line item with subscription reference`, {
              eventId,
              invoiceId,
              subscriptionId,
              lineType: lineWithSubscription.type,
              lineId: lineWithSubscription.id
            });
          }
        }
      }
      
      // If still no subscription ID, try to correlate with recent subscriptions for this customer
      if (!subscriptionId && invoice.billing_reason === 'subscription_create') {
        try {
          const stripe = stripeService.stripe;
          const recentSubscriptions = await stripe.subscriptions.list({
            customer: customer,
            limit: 5,
            created: {
              gte: Math.floor((Date.now() - 300000) / 1000), // Last 5 minutes
            },
          });
          
          if (recentSubscriptions.data.length > 0) {
            // Find subscription created around the same time as this invoice
            const matchingSubscription = recentSubscriptions.data.find(sub => 
              Math.abs(sub.created - invoice.created) < 60 // Within 60 seconds
            );
            
            if (matchingSubscription) {
              subscriptionId = matchingSubscription.id;
              logger.debug(`Correlated subscription ID from recent customer subscriptions`, {
                eventId,
                invoiceId,
                subscriptionId,
                subscriptionCreated: new Date(matchingSubscription.created * 1000),
                invoiceCreated: new Date(invoice.created * 1000),
                timeDiff: Math.abs(matchingSubscription.created - invoice.created)
              });
            }
          }
        } catch (error) {
          logger.warn('Error correlating subscription from recent subscriptions:', error, {
            eventId,
            invoiceId,
            customerId: customer
          });
        }
      }
    }
    
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

/**
 * Cancel subscription and downgrade to free tier
 */
router.post('/cancel-subscription', requireJwtAuth, async (req, res) => {
  try {
    const { user } = req;
    
    logger.info(`Subscription cancellation requested by user ${user._id}`, {
      userId: user._id,
      userEmail: user.email,
      timestamp: new Date().toISOString()
    });
    
    // Get customer from Stripe
    const customer = await stripeService.getCustomerByEmail(user.email);
    if (!customer) {
      return res.status(404).json({
        error: 'No Stripe customer found',
      });
    }

    // Get active subscriptions
    const subscriptions = await stripeService.getActiveSubscriptions(customer.id);
    if (subscriptions.length === 0) {
      // User has no active subscription, just downgrade in database
      logger.info(`No active subscription found, downgrading database only for user ${user._id}`);
      
      const result = await BalanceService.downgradeToFreeTier({
        userId: user._id.toString(),
        reason: 'user_requested_downgrade'
      });

      if (result.success) {
        return res.json({
          success: true,
          message: 'Successfully downgraded to free tier',
          tier: result.tier,
          tierName: result.tierName
        });
      } else {
        return res.status(500).json({
          error: 'Failed to downgrade user tier',
          reason: result.reason
        });
      }
    }

    // Cancel all active subscriptions
    const canceledSubscriptions = [];
    for (const subscription of subscriptions) {
      try {
        const canceled = await stripeService.cancelSubscription(subscription.id);
        canceledSubscriptions.push({
          id: canceled.id,
          status: canceled.status,
          canceledAt: canceled.canceled_at
        });
        
        logger.info(`Subscription canceled: ${subscription.id} for user ${user._id}`, {
          subscriptionId: subscription.id,
          canceledAt: canceled.canceled_at
        });
      } catch (error) {
        logger.error(`Error canceling subscription ${subscription.id}:`, error);
        return res.status(500).json({
          error: `Failed to cancel subscription: ${subscription.id}`,
        });
      }
    }

    // Downgrade user to free tier in database
    const result = await BalanceService.downgradeToFreeTier({
      userId: user._id.toString(),
      reason: 'user_requested_downgrade'
    });

    if (result.success) {
      logger.info(`User successfully downgraded to free tier`, {
        userId: user._id,
        canceledSubscriptions: canceledSubscriptions.length,
        newTier: result.tier,
        newTierName: result.tierName
      });

      res.json({
        success: true,
        message: 'Successfully canceled subscription and downgraded to free tier',
        canceledSubscriptions,
        tier: result.tier,
        tierName: result.tierName
      });
    } else {
      logger.error(`Failed to downgrade user after subscription cancellation: ${result.reason}`, {
        userId: user._id,
        canceledSubscriptions
      });
      
      res.status(500).json({
        error: 'Subscription canceled but failed to update user tier',
        reason: result.reason,
        canceledSubscriptions
      });
    }
    
  } catch (error) {
    logger.error('Error canceling subscription:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
    });
  }
});

/**
 * Modify existing subscription (upgrade/downgrade between pro tiers)
 */
router.post('/modify-subscription', requireJwtAuth, async (req, res) => {
  try {
    const { credits } = req.body;
    const { user } = req;

    logger.info(`Subscription modification requested by user ${user._id}`, {
      userId: user._id,
      userEmail: user.email,
      newCredits: credits,
      timestamp: new Date().toISOString()
    });

    if (!credits || !PRICE_IDS[credits]) {
      return res.status(400).json({
        error: 'Invalid credit amount',
        validCredits: Object.keys(PRICE_IDS).map(Number),
      });
    }

    const newPriceId = PRICE_IDS[credits];

    // Get customer from Stripe
    const customer = await stripeService.getCustomerByEmail(user.email);
    if (!customer) {
      return res.status(404).json({
        error: 'No Stripe customer found',
      });
    }

    // Get active subscriptions
    const subscriptions = await stripeService.getActiveSubscriptions(customer.id);
    if (subscriptions.length === 0) {
      return res.status(404).json({
        error: 'No active subscription found to modify',
        suggestion: 'Please create a new subscription instead'
      });
    }

    if (subscriptions.length > 1) {
      logger.warn(`User has multiple active subscriptions: ${subscriptions.length}`, {
        userId: user._id,
        subscriptions: subscriptions.map(s => ({ id: s.id, status: s.status }))
      });
    }

    // Modify the first active subscription
    const subscription = subscriptions[0];
    const currentItemId = subscription.items.data[0].id;

    try {
      const stripe = stripeService.stripe;
      
      // Update the subscription item to the new price
      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        items: [{
          id: currentItemId,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations', // Handle prorating automatically
        metadata: {
          userId: user._id.toString(),
          credits: credits.toString(),
          userEmail: user.email,
          modifiedAt: new Date().toISOString()
        }
      });

      logger.info(`Subscription modified successfully`, {
        userId: user._id,
        subscriptionId: subscription.id,
        oldPriceId: subscription.items.data[0].price.id,
        newPriceId,
        newCredits: credits,
        status: updatedSubscription.status
      });

      // Update user's tier in database immediately
      const tierInfo = BalanceService.getTierInfoFromPriceId(newPriceId);
      if (tierInfo) {
        try {
          const { updateBalance } = require('~/models/Transaction');
          
          // Calculate credit difference for immediate adjustment
          let creditDifference = 0;
          const oldPriceId = subscription.items.data[0].price.id;
          const oldTierCredits = BalanceService.getCreditAmountFromPriceId(oldPriceId);
          const newTierCredits = BalanceService.getCreditAmountFromPriceId(newPriceId);
          
          if (oldTierCredits && newTierCredits) {
            creditDifference = newTierCredits - oldTierCredits;
            
            logger.info(`Calculating credit adjustment for subscription modification`, {
              userId: user._id,
              oldTierCredits,
              newTierCredits,
              creditDifference,
              subscriptionId: subscription.id
            });
          }
          
          await updateBalance({
            user: user._id,
            incrementValue: creditDifference, // Add the credit difference immediately
            setValues: {
              tier: tierInfo.tier,
              tierName: tierInfo.name,
              refillAmount: tierInfo.refillAmount,
              refillIntervalValue: tierInfo.refillIntervalValue,
              refillIntervalUnit: tierInfo.refillIntervalUnit
            }
          });

          // Create transaction record for credit adjustment if credits were added
          if (creditDifference > 0) {
            try {
              const { Transaction } = require('~/models/Transaction');
              const transaction = new Transaction({
                user: user._id,
                tokenType: 'credits',
                rawAmount: creditDifference,
                tokenValue: creditDifference,
                rate: 1,
                context: 'subscription_upgrade',
                model: `tier_upgrade_${tierInfo.tier}`,
                valueKey: `upgrade_${subscription.id}_${Date.now()}`,
                endpointTokenConfig: {},
              });
              await transaction.save();
              
              logger.info(`Transaction record created for subscription upgrade credit adjustment`, {
                userId: user._id,
                transactionId: transaction._id,
                creditsAdded: creditDifference,
                subscriptionId: subscription.id
              });
            } catch (transactionError) {
              logger.warn('Failed to create transaction record for credit adjustment:', transactionError, {
                userId: user._id,
                creditDifference,
                subscriptionId: subscription.id
              });
              // Don't fail the request if transaction recording fails
            }
          }

          logger.info(`User tier and credits updated in database`, {
            userId: user._id,
            newTier: tierInfo.tier,
            newTierName: tierInfo.name,
            newRefillAmount: tierInfo.refillAmount,
            creditsAdded: creditDifference
          });
        } catch (dbError) {
          logger.error('Failed to update user tier in database:', dbError, {
            userId: user._id,
            subscriptionId: subscription.id
          });
          // Don't fail the request if DB update fails, as Stripe subscription was successful
        }
      }

      res.json({
        success: true,
        message: 'Subscription modified successfully',
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          currentPeriodEnd: updatedSubscription.current_period_end,
          credits: credits,
          priceId: newPriceId
        },
        tier: tierInfo
      });

    } catch (stripeError) {
      logger.error('Error modifying Stripe subscription:', stripeError, {
        userId: user._id,
        subscriptionId: subscription.id,
        newPriceId
      });
      
      res.status(500).json({
        error: 'Failed to modify subscription in Stripe',
        details: stripeError.message
      });
    }

  } catch (error) {
    logger.error('Error in subscription modification:', error);
    res.status(500).json({
      error: 'Failed to modify subscription',
    });
  }
});

module.exports = router; 