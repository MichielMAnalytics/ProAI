# 🔒 Secure Balance Top-Up System

## Overview

This document outlines the secure balance top-up system integrated with Stripe payments for Eve (LibreChat). The system automatically adds credits to user balances when Stripe payments succeed, with comprehensive security measures and audit trails.

## 🛡️ Security Features

### 1. Duplicate Prevention
- **Transaction ID Tracking**: Each Stripe event (checkout session, invoice) is tracked to prevent duplicate processing
- **Unique Identifiers**: Uses Stripe's unique IDs as transaction identifiers
- **Database Validation**: Checks existing transactions before processing

### 2. Input Validation
- **Tier Validation**: Only accepts predefined tiers (Pro and Max)
- **User Validation**: Verifies user exists and is not suspended/banned
- **Price ID Mapping**: Securely maps Stripe price IDs to tier configurations

### 3. Audit Trail
- **Transaction Logging**: Every credit addition is logged with metadata
- **Stripe Integration**: Stores Stripe session/subscription/invoice IDs
- **User Context**: Includes user email and ID for audit purposes

### 4. Error Handling
- **Graceful Degradation**: System continues functioning if balance updates fail
- **Comprehensive Logging**: All errors and events are logged with context
- **Retry Logic**: Built-in retry logic for database operations

## 🏗️ Architecture

### Components

#### 1. BalanceService (`api/server/services/BalanceService.js`)
- **Purpose**: Core service for secure credit management
- **Key Methods**:
  - `addCredits()`: Add credits with security validation
  - `handleSubscriptionRenewal()`: Handle recurring billing
  - `getCreditAmountFromPriceId()`: Map price IDs to credits
  - `isDuplicateTransaction()`: Prevent duplicate processing

#### 2. Stripe Webhook Handlers (`api/server/routes/stripe.js`)
- **checkout.session.completed**: Initial subscription credit addition
- **invoice.payment_succeeded**: Recurring billing credit addition
- **invoice.payment_failed**: Failed payment logging
- **customer.subscription.***: Subscription lifecycle management

#### 3. LibreChat Integration
- **Transaction Model**: Uses LibreChat's Transaction.create() method
- **Balance Model**: Integrates with existing balance system
- **Config Respect**: Honors LibreChat's balance configuration

## 💳 Simplified Tier Mapping

| Tier | Monthly Price | Environment Variable | Configurable Credits |
|------|---------------|---------------------|---------------------|
| Pro  | $29           | STRIPE_EVE_PRO      | librechat.yaml: proTierTokens (default: 200K) |
| Max  | $99           | STRIPE_EVE_MAX      | librechat.yaml: maxTierTokens (default: 800K) |

## 🔄 Payment Flow

### Initial Subscription
1. User clicks "Upgrade to Pro" in pricing page
2. Stripe Checkout session created with user metadata
3. User completes payment in Stripe Checkout
4. `checkout.session.completed` webhook fired
5. System validates user and extracts credit amount
6. Credits added to user balance via Transaction.create()

### Recurring Billing
1. Stripe automatically charges subscription
2. `invoice.payment_succeeded` webhook fired
3. System retrieves subscription metadata
4. Credits added for new billing period
5. User balance updated with audit trail

### Failed Payments
1. Stripe payment fails
2. `invoice.payment_failed` webhook fired
3. System logs failure with retry information
4. No credits deducted (payment failure handling)

## 🛠️ Configuration

### Environment Variables Required
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_webhook_secret

# Simplified Price IDs
STRIPE_EVE_PRO=price_xxxxx   # $29/month Pro tier
STRIPE_EVE_MAX=price_xxxxx   # $99/month Max tier

# Application URL
DOMAIN_SERVER=https://your-domain.com
```

### LibreChat Configuration
Ensure balance is enabled in `librechat.yaml`:
```yaml
balance:
  enabled: true
  startBalance: 10000          # Free tier monthly credits
  autoRefillEnabled: true
  refillIntervalValue: 1
  refillIntervalUnit: "months"
  refillAmount: 10000          # Free tier refill amount
  proTierTokens: 200000        # Pro tier monthly credits ($29)
  maxTierTokens: 800000        # Max tier monthly credits ($99)
```

## 🔍 Monitoring & Logging

### Key Log Events
- **Credit Addition**: `Credits added successfully: X credits for user Y`
- **Duplicate Prevention**: `Duplicate transaction blocked: transaction_id`
- **Validation Failures**: `Invalid credit amount: X` / `User not found: Y`
- **Stripe Webhooks**: `Webhook event received: event.type`

### Transaction Metadata
Each transaction includes:
```javascript
{
  stripeTransactionId: "checkout_session_id",
  stripeCustomerId: "cus_xxxxx",
  stripeSubscriptionId: "sub_xxxxx",
  stripePriceId: "price_xxxxx",
  paymentMethod: "stripe",
  timestamp: "2023-12-07T10:30:00.000Z",
  userEmail: "user@example.com"
}
```

## 🚨 Error Scenarios

### Handled Gracefully
- **Duplicate transactions**: Blocked silently
- **Invalid users**: Logged and skipped
- **Invalid credit amounts**: Validated and rejected
- **Stripe API errors**: Logged with retry logic
- **Balance system disabled**: Skipped with warning

### Manual Intervention Required
- **Missing price mappings**: Update environment variables
- **Webhook signature failures**: Check webhook secret
- **Database connection issues**: Monitor infrastructure

## 🧪 Testing

### Test Scenarios
1. **Normal Flow**: Complete payment → verify credits added
2. **Duplicate Prevention**: Process same webhook twice → verify single credit addition
3. **Invalid User**: Webhook with fake user ID → verify graceful handling
4. **Balance Disabled**: Turn off balance system → verify skip behavior
5. **Failed Payment**: Simulate payment failure → verify logging only

### Test Commands
```bash
# Test webhook locally with Stripe CLI
stripe listen --forward-to localhost:3080/api/stripe/webhook

# Send test webhook
stripe trigger checkout.session.completed
```

## 🔐 Security Best Practices

### Implemented
✅ **Webhook Signature Verification**: All webhooks verified against Stripe signature  
✅ **Duplicate Transaction Prevention**: Unique transaction ID tracking  
✅ **Input Validation**: Credit amounts and user validation  
✅ **Secure Metadata**: Comprehensive audit trail  
✅ **Error Handling**: Graceful failure without data corruption  
✅ **User Validation**: Check user status before credit addition  

### Monitoring Recommendations
- **Set up alerts** for webhook failures
- **Monitor duplicate transaction** attempts
- **Track credit addition** patterns for anomalies
- **Log analysis** for security incidents

## 📊 Database Schema

### Transaction Document
```javascript
{
  _id: ObjectId,
  user: ObjectId,
  tokenType: "credit_topup",
  rawAmount: 100000, // Credits added
  context: "stripe_payment",
  model: "stripe_pro_subscription",
  metadata: {
    stripeTransactionId: "checkout_cs_xxxx",
    stripeCustomerId: "cus_xxxx",
    // ... additional Stripe data
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Balance Document
```javascript
{
  _id: ObjectId,
  user: ObjectId,
  tokenCredits: 150000, // Updated balance
  lastRefill: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## 🚀 Future Enhancements

### Planned Features
- **Credit Usage Analytics**: Track credit consumption patterns
- **Automated Alerts**: Notify users of low balances
- **Credit Expiration**: Implement credit expiry policies
- **Refund Handling**: Automatic credit deduction for refunds
- **Usage Limits**: Per-user credit consumption limits

### Integration Opportunities
- **Email Notifications**: Payment confirmations and failures
- **Admin Dashboard**: Credit management interface
- **Usage Reports**: Detailed consumption analytics
- **Billing History**: Complete payment and credit history

This system provides a robust, secure foundation for managing user credits with Stripe payments while maintaining full audit trails and preventing common security vulnerabilities. 