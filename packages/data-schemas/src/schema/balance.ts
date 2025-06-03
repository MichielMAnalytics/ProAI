import { Schema, Document, Types } from 'mongoose';

export interface IBalance extends Document {
  user: Types.ObjectId;
  tokenCredits: number;
  // Subscription tier information
  tier?: string; // e.g., 'free', 'pro_1', 'pro_2', etc.
  tierName?: string; // e.g., 'Free Tier', 'Pro Tier 1', etc.
  // Automatic refill settings
  autoRefillEnabled: boolean;
  refillIntervalValue: number;
  refillIntervalUnit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  lastRefill: Date;
  refillAmount: number;
}

const balanceSchema = new Schema<IBalance>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  // 1000 tokenCredits = 1 mill ($0.001 USD)
  tokenCredits: {
    type: Number,
    default: 0,
  },
  // Subscription tier information
  tier: {
    type: String,
    default: 'free',
    enum: ['free', 'pro_1', 'pro_2', 'pro_3', 'pro_4', 'pro_5', 'pro_6', 'pro_7', 'pro_8'],
  },
  tierName: {
    type: String,
    default: 'Free Tier',
  },
  // Automatic refill settings
  autoRefillEnabled: {
    type: Boolean,
    default: false,
  },
  refillIntervalValue: {
    type: Number,
    default: 30,
  },
  refillIntervalUnit: {
    type: String,
    enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'],
    default: 'days',
  },
  lastRefill: {
    type: Date,
    default: Date.now,
  },
  // amount to add on each refill
  refillAmount: {
    type: Number,
    default: 0,
  },
});

export default balanceSchema;
