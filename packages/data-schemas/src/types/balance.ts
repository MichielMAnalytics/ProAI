import { Document, Types } from 'mongoose';

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
