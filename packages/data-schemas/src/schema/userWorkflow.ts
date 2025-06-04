import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'delay' | 'mcp_tool';
  config: {
    toolName?: string;
    parameters?: Record<string, unknown>;
    condition?: string;
    delayMs?: number;
    pipedreamAction?: {
      componentId: string;
      appSlug: string;
      config: Record<string, unknown>;
    };
  };
  onSuccess?: string; // Next step ID
  onFailure?: string; // Next step ID
  position: { x: number; y: number };
}

export interface IWorkflowTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event';
  config: {
    schedule?: string; // Cron expression
    webhookUrl?: string;
    emailAddress?: string;
    eventType?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface IUserWorkflow extends Document {
  id: string;
  name: string;
  description?: string;
  trigger: IWorkflowTrigger;
  steps: IWorkflowStep[];
  isActive: boolean;
  isDraft: boolean;
  user: Types.ObjectId;
  conversation_id?: string;
  parent_message_id?: string;
  endpoint?: string;
  ai_model?: string;
  agent_id?: string;
  // Execution tracking
  last_run?: Date;
  next_run?: Date;
  run_count?: number;
  success_count?: number;
  failure_count?: number;
  // Version control
  version: number;
  created_from_agent?: boolean;
  // UI state
  artifact_identifier?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const WorkflowStepSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['action', 'condition', 'delay', 'mcp_tool'], 
      required: true 
    },
    config: {
      toolName: { type: String },
      parameters: { type: Schema.Types.Mixed },
      condition: { type: String },
      delayMs: { type: Number },
      pipedreamAction: {
        componentId: { type: String },
        appSlug: { type: String },
        config: { type: Schema.Types.Mixed },
      },
    },
    onSuccess: { type: String },
    onFailure: { type: String },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
  },
  { _id: false }
);

const WorkflowTriggerSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['manual', 'schedule', 'webhook', 'email', 'event'],
      required: true,
    },
    config: {
      schedule: { type: String },
      webhookUrl: { type: String },
      emailAddress: { type: String },
      eventType: { type: String },
      parameters: { type: Schema.Types.Mixed },
    },
  },
  { _id: false }
);

const userWorkflowSchema: Schema<IUserWorkflow> = new Schema(
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
    description: {
      type: String,
    },
    trigger: {
      type: WorkflowTriggerSchema,
      required: true,
    },
    steps: {
      type: [WorkflowStepSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      required: true,
      default: false,
    },
    isDraft: {
      type: Boolean,
      required: true,
      default: true,
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
    // Execution tracking
    last_run: {
      type: Date,
    },
    next_run: {
      type: Date,
    },
    run_count: {
      type: Number,
      default: 0,
    },
    success_count: {
      type: Number,
      default: 0,
    },
    failure_count: {
      type: Number,
      default: 0,
    },
    // Version control
    version: {
      type: Number,
      default: 1,
    },
    created_from_agent: {
      type: Boolean,
      default: false,
    },
    // UI state
    artifact_identifier: {
      type: String,
    },
  },
  { 
    timestamps: true,
    versionKey: false
  },
);

// Indexes for performance
userWorkflowSchema.index({ user: 1 });
userWorkflowSchema.index({ isActive: 1 });
userWorkflowSchema.index({ user: 1, isActive: 1 });
userWorkflowSchema.index({ next_run: 1 });
userWorkflowSchema.index({ user: 1, agent_id: 1 });

export default userWorkflowSchema; 