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

# Stripe Price IDs (create these in your Stripe dashboard)
STRIPE_PRICE_100K=price_your_100k_price_id
STRIPE_PRICE_200K=price_your_200k_price_id
STRIPE_PRICE_400K=price_your_400k_price_id
STRIPE_PRICE_800K=price_your_800k_price_id
STRIPE_PRICE_1200K=price_your_1200k_price_id
STRIPE_PRICE_2000K=price_your_2000k_price_id
STRIPE_PRICE_3000K=price_your_3000k_price_id
STRIPE_PRICE_4000K=price_your_4000k_price_id
```

## How URLs are Generated

The system automatically generates Stripe redirect URLs based on `DOMAIN_SERVER`:

- **Success URL**: `${DOMAIN_SERVER}/pricing?success=true`
- **Cancel URL**: `${DOMAIN_SERVER}/pricing?canceled=true`
- **Billing Portal Return URL**: `${DOMAIN_SERVER}/pricing`

This ensures your Stripe integration works across different environments (development, staging, production) without hardcoding URLs.

## Credit Tiers and Pricing

Your 8 pricing tiers map to these credits and prices:

| Credits | Monthly Price | Environment Variable |
|---------|---------------|---------------------|
| 100K    | $20          | STRIPE_PRICE_100K   |
| 200K    | $35          | STRIPE_PRICE_200K   |
| 400K    | $60          | STRIPE_PRICE_400K   |
| 800K    | $100         | STRIPE_PRICE_800K   |
| 1.2M    | $140         | STRIPE_PRICE_1200K  |
| 2M      | $200         | STRIPE_PRICE_2000K  |
| 3M      | $280         | STRIPE_PRICE_3000K  |
| 4M      | $350         | STRIPE_PRICE_4000K  |

## Step 3: Create Stripe Products

You need to create products in Stripe Dashboard for each Pro tier:

### Products to Create:

1. **Pro 100K** - $20/month - 100,000 credits
2. **Pro 200K** - $35/month - 200,000 credits  
3. **Pro 400K** - $60/month - 400,000 credits
4. **Pro 800K** - $100/month - 800,000 credits
5. **Pro 1.2M** - $140/month - 1,200,000 credits
6. **Pro 2M** - $200/month - 2,000,000 credits
7. **Pro 3M** - $280/month - 3,000,000 credits
8. **Pro 4M** - $350/month - 4,000,000 credits

### How to Create Products:

1. Go to [Stripe Products](https://dashboard.stripe.com/products)
2. Click **+ Add product**
3. For each product:
   - **Name**: "Eve Pro - 100K Credits" (adjust for each tier)
   - **Description**: "Monthly subscription with 100,000 credits, request custom apps and tools, priority support"
   - **Pricing**: Set as recurring, monthly, with the appropriate price
   - **Save the Price ID** (starts with `price_`) - you'll need these

### Copy Price IDs:
After creating each product, copy the **Price ID** and add it to your `.env` file:
- Pro 100K → `STRIPE_PRICE_100K=price_xxxxx`
- Pro 200K → `STRIPE_PRICE_200K=price_xxxxx`
- etc.

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