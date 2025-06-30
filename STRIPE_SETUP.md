# Stripe Payment Integration Setup Guide

## Step 1: Get Your Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Copy your **Publishable key** (starts with `pk_test_`)
3. Copy your **Secret key** (starts with `sk_test_`)

## Step 2: Add Environment Variables

Add these to your `.env` file:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Base Application URL (used for Stripe redirects)
DOMAIN_SERVER=http://164.92.145.114:3080  # Your production URL
# DOMAIN_SERVER=http://localhost:3080      # For local development

# Simplified Stripe Price IDs
STRIPE_EVE_PRO=price_your_pro_price_id          # $29/month Pro tier
STRIPE_EVE_MAX=price_your_max_price_id          # $99/month Max tier
STRIPE_EVE_PRO_YEARLY=price_your_pro_yearly_id  # Pro tier yearly (17% discount)
STRIPE_EVE_MAX_YEARLY=price_your_max_yearly_id  # Max tier yearly (17% discount)
```

## How URLs are Generated

The system automatically generates Stripe redirect URLs based on `DOMAIN_SERVER`:

- **Success URL**: `${DOMAIN_SERVER}/pricing?success=true`
- **Cancel URL**: `${DOMAIN_SERVER}/pricing?canceled=true`
- **Billing Portal Return URL**: `${DOMAIN_SERVER}/pricing`

This ensures your Stripe integration works across different environments (development, staging, production) without hardcoding URLs.

## Simplified Pricing Tiers

Simplified to 2 pricing tiers with monthly and yearly options:

| Tier | Monthly Price | Yearly Price | Monthly Variable | Yearly Variable | Credits |
|------|---------------|--------------|------------------|-----------------|---------|
| Pro  | $29           | $290 (17% off) | STRIPE_EVE_PRO  | STRIPE_EVE_PRO_YEARLY | Configurable in librechat.yaml (default: 15M) |
| Max  | $99           | $990 (17% off) | STRIPE_EVE_MAX  | STRIPE_EVE_MAX_YEARLY | Configurable in librechat.yaml (default: 60M) |

## Step 3: Create Stripe Products

You need to create products in Stripe Dashboard for the simplified tiers:

### Products to Create:

1. **Eve Pro Monthly** - $29/month - Configurable credits (default: 15,000,000)
2. **Eve Pro Yearly** - $290/year - Configurable credits (default: 15,000,000) - 17% discount
3. **Eve Max Monthly** - $99/month - Configurable credits (default: 60,000,000)
4. **Eve Max Yearly** - $990/year - Configurable credits (default: 60,000,000) - 17% discount

### How to Create Products:

1. Go to [Stripe Products](https://dashboard.stripe.com/products)
2. Click **+ Add product**
3. For each product:
   - **Eve Pro Monthly**: Name: "Eve Pro", Description: "Monthly subscription with configurable credits, request custom apps and tools, priority support", Price: $29/month
   - **Eve Pro Yearly**: Name: "Eve Pro", Description: "Yearly subscription with configurable credits, request custom apps and tools, priority support", Price: $290/year
   - **Eve Max Monthly**: Name: "Eve Max", Description: "Monthly subscription with configurable credits, request custom apps and tools, priority support", Price: $99/month
   - **Eve Max Yearly**: Name: "Eve Max", Description: "Yearly subscription with configurable credits, request custom apps and tools, priority support", Price: $990/year
   - **Save the Price ID** (starts with `price_`) - you'll need these

### Copy Price IDs:
After creating each product, copy the **Price ID** and add it to your `.env` file:
- Eve Pro Monthly → `STRIPE_EVE_PRO=price_xxxxx`
- Eve Pro Yearly → `STRIPE_EVE_PRO_YEARLY=price_xxxxx`
- Eve Max Monthly → `STRIPE_EVE_MAX=price_xxxxx`
- Eve Max Yearly → `STRIPE_EVE_MAX_YEARLY=price_xxxxx`

## Step 4: Set Up Webhooks

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **+ Add endpoint**
3. Set endpoint URL: `http://localhost:3080/api/stripe/webhook`
4. Select events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** and add to `.env` as `STRIPE_WEBHOOK_SECRET`

## Step 5: Implementation Status

✅ **Completed:**
- Stripe service created
- Checkout routes implemented
- Webhook handlers set up
- Pricing page integration
- Environment configuration

## Step 6: Testing

1. **Test Mode**: Make sure you're using test keys (`sk_test_` and `pk_test_`)
2. **Test Cards**: Use [Stripe test cards](https://stripe.com/docs/testing#cards)
   - Success: `4242424242424242`
   - Decline: `4000000000000002`
3. **Webhook Testing**: Use [Stripe CLI](https://stripe.com/docs/stripe-cli) for local webhook testing

## Next Steps

1. ✅ Complete Stripe product setup in dashboard
2. ✅ Get your API keys and add to `.env`
3. ✅ Set up webhooks
4. ✅ Test the payment flow
5. 🔄 **Ready to test!** - The integration is complete

## Important Notes

- Use **test mode** for development (keys start with `sk_test_` and `pk_test_`)
- **Webhooks** are crucial for handling subscription events
- Store **subscription data** in your database to track user plans
- Implement **proper error handling** for failed payments
- **Security**: Never expose secret keys in frontend code 