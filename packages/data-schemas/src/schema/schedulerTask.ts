import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISchedulerTask extends Document {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  do_only_once: boolean;
  type: 'task' | 'workflow';
  last_run?: Date;
  next_run?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'disabled';
  user: Types.ObjectId;
  conversation_id?: string;
  parent_message_id?: string;
  endpoint?: string;
  ai_model?: string;
  agent_id?: string;
  metadata?: {
    type?: 'task' | 'workflow';
    workflowId?: string;
    workflowVersion?: number;
    trigger?: any;
    steps?: any[];
    description?: string;
    isDraft?: boolean;
    [key: string]: any;
  };
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
    prompt: {
      type: String,
      required: true,
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
    type: {
      type: String,
      required: true,
      enum: ['task', 'workflow'],
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
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    conversation_id: {
      type: String,
    },
    parent_message_id: {
      type: String,
    },
    endpoint: {
      type: String,
    },
    ai_model: {
      type: String,
    },
    agent_id: {
      type: String,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: function() {
        return { type: this.type || 'task' };
      },
    },
  },
  { 
    timestamps: true,
    versionKey: false
  },
);

// Indexes for performance
schedulerTaskSchema.index({ user: 1 });
schedulerTaskSchema.index({ enabled: 1, status: 1 });
schedulerTaskSchema.index({ next_run: 1 });
schedulerTaskSchema.index({ user: 1, enabled: 1 });
schedulerTaskSchema.index({ user: 1, agent_id: 1 });

export default schedulerTaskSchema; 