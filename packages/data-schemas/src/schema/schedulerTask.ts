import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISchedulerTask extends Document {
  id: string;
  name: string;
  schedule: string;
  type: 'shell_command' | 'api_call' | 'ai' | 'reminder';
  command?: string;
  api_url?: string;
  api_method?: string;
  api_headers?: Record<string, string>;
  api_body?: Record<string, unknown>;
  prompt?: string;
  description?: string;
  enabled: boolean;
  do_only_once: boolean;
  last_run?: Date;
  next_run?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'disabled';
  reminder_title?: string;
  reminder_message?: string;
  user: Types.ObjectId;
  conversation_id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const schedulerTaskSchema: Schema<ISchedulerTask> = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    schedule: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['shell_command', 'api_call', 'ai', 'reminder'],
    },
    command: {
      type: String,
    },
    api_url: {
      type: String,
    },
    api_method: {
      type: String,
      default: 'GET',
    },
    api_headers: {
      type: mongoose.Schema.Types.Mixed,
    },
    api_body: {
      type: mongoose.Schema.Types.Mixed,
    },
    prompt: {
      type: String,
    },
    description: {
      type: String,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    do_only_once: {
      type: Boolean,
      required: true,
      default: true,
    },
    last_run: {
      type: Date,
    },
    next_run: {
      type: Date,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed', 'disabled'],
      default: 'pending',
    },
    reminder_title: {
      type: String,
    },
    reminder_message: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    conversation_id: {
      type: String,
    },
  },
  { timestamps: true },
);

// Indexes for performance (removed duplicate id index since it's already unique in field definition)
schedulerTaskSchema.index({ user: 1 });
schedulerTaskSchema.index({ enabled: 1, status: 1 });
schedulerTaskSchema.index({ next_run: 1 });
schedulerTaskSchema.index({ user: 1, enabled: 1 });

export default schedulerTaskSchema; 