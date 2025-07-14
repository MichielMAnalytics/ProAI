import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISchedulerTask extends Document {
  id: string;
  name: string;
  schedule?: string; // Optional for backward compatibility
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
  version?: number;
  deleted: boolean;
  deleted_at?: Date;
  deleted_by?: Types.ObjectId;
  trigger?: {
    type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event';
    config: {
      schedule?: string;
      webhookUrl?: string;
      emailAddress?: string;
      eventType?: string;
      parameters?: Record<string, unknown>;
    };
  };
  metadata?: {
    workflowId?: string;
    steps?: Array<{
      id: string;
      name: string;
      type: 'mcp_agent_action';
      agentId: string;
      task: string;
      config: {
        instruction: string;
        agent_id: string;
      };
      onSuccess?: string;
      onFailure?: string;
    }>;
    isDraft?: boolean;
    created_from_agent?: boolean;
    dedicatedConversationId?: string;
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
      required: false, // Optional for backward compatibility
    },
    trigger: {
      type: {
        type: String,
        enum: ['manual', 'schedule', 'webhook', 'email', 'event'],
        required: true,
      },
      config: {
        type: Schema.Types.Mixed,
        default: {},
      },
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
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    version: {
      type: Number,
      default: 1,
    },
    deleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    deleted_at: {
      type: Date,
    },
    deleted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Indexes for performance
schedulerTaskSchema.index({ user: 1 });
schedulerTaskSchema.index({ enabled: 1, status: 1 });
schedulerTaskSchema.index({ next_run: 1 });
schedulerTaskSchema.index({ user: 1, enabled: 1 });
schedulerTaskSchema.index({ user: 1, endpoint: 1 });
schedulerTaskSchema.index({ user: 1, agent_id: 1 });
schedulerTaskSchema.index({ user: 1, deleted: 1 }); // For efficient soft delete queries

export default schedulerTaskSchema;
