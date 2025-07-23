import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkflowExecutionStep {
  id: string;
  name: string;
  type: string;
  instruction?: string;
  agent_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  output?: string;
  error?: string;
  retryCount?: number;
  toolsUsed?: string[];
  mcpToolsCount?: number;
  modelUsed?: string;
  endpointUsed?: string;
  conversationId?: string;
  responseMessageId?: string;
  metadata?: {
    [key: string]: any;
  };
}

export interface IWorkflowExecutionContext {
  isTest?: boolean;
  trigger?: {
    type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event' | 'test' | 'app';
    source?: string;
    scheduledTime?: Date;
    parameters?: Record<string, any>;
  };
  workflow?: {
    id: string;
    name: string;
    version?: number;
    description?: string;
    totalSteps?: number;
  };
  execution?: {
    totalDuration?: number;
    successfulSteps?: number;
    failedSteps?: number;
    skippedSteps?: number;
  };
  mcp?: {
    available?: boolean;
    toolCount?: number;
    serverCount?: number;
    initializationTime?: number;
  };
  environment?: {
    timezone?: string;
    locale?: string;
    platform?: string;
  };
  performance?: {
    memoryUsed?: number;
    cpuTime?: number;
    networkRequests?: number;
  };
}

export interface ISchedulerExecution extends Document {
  id: string;
  task_id: string;
  start_time: Date;
  end_time?: Date;
  duration?: number; // in milliseconds
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  output?: string;
  error?: string;
  user: Types.ObjectId;
  currentStepId?: string;
  currentStepIndex?: number;
  progress?: {
    completedSteps: number;
    totalSteps: number;
    percentage: number;
  };
  steps: IWorkflowExecutionStep[];
  context: IWorkflowExecutionContext;
  logs?: Array<{
    timestamp: Date;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    stepId?: string;
    agentId?: string;
    metadata?: Record<string, any>;
  }>;
  notifications?: Array<{
    timestamp: Date;
    type: string;
    message: string;
    sent: boolean;
    details?: Record<string, any>;
  }>;
  version?: number; // For optimistic locking
  createdAt?: Date;
  updatedAt?: Date;
}

const workflowExecutionStepSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    instruction: { type: String },
    agent_id: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    startTime: { type: Date },
    endTime: { type: Date },
    duration: { type: Number }, // in milliseconds
    output: { type: String },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    toolsUsed: [{ type: String }],
    mcpToolsCount: { type: Number, default: 0 },
    modelUsed: { type: String },
    endpointUsed: { type: String },
    conversationId: { type: String },
    responseMessageId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const workflowExecutionContextSchema = new Schema(
  {
    isTest: { type: Boolean, default: false },
    trigger: {
      type: {
        type: String,
        enum: ['manual', 'schedule', 'webhook', 'email', 'event', 'test', 'app'],
      },
      source: { type: String },
      scheduledTime: { type: Date },
      parameters: { type: mongoose.Schema.Types.Mixed },
    },
    workflow: {
      id: { type: String },
      name: { type: String },
      version: { type: Number },
      description: { type: String },
      totalSteps: { type: Number },
    },
    execution: {
      totalDuration: { type: Number },
      successfulSteps: { type: Number },
      failedSteps: { type: Number },
      skippedSteps: { type: Number },
    },
    mcp: {
      available: { type: Boolean },
      toolCount: { type: Number },
      serverCount: { type: Number },
      initializationTime: { type: Number },
    },
    environment: {
      timezone: { type: String },
      locale: { type: String },
      platform: { type: String },
    },
    performance: {
      memoryUsed: { type: Number },
      cpuTime: { type: Number },
      networkRequests: { type: Number },
    },
  },
  { _id: false },
);

const schedulerExecutionSchema: Schema<ISchedulerExecution> = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    task_id: {
      type: String,
      required: true,
    },
    start_time: {
      type: Date,
      required: true,
    },
    end_time: {
      type: Date,
    },
    duration: {
      type: Number, // in milliseconds
    },
    status: {
      type: String,
      required: true,
      enum: ['running', 'completed', 'failed', 'cancelled'],
      default: 'running',
    },
    output: {
      type: String,
    },
    error: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    currentStepId: {
      type: String,
    },
    currentStepIndex: {
      type: Number,
    },
    progress: {
      completedSteps: { type: Number, default: 0 },
      totalSteps: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
    steps: {
      type: [workflowExecutionStepSchema],
      default: [],
    },
    context: {
      type: workflowExecutionContextSchema,
      required: true,
    },
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        level: {
          type: String,
          enum: ['debug', 'info', 'warn', 'error'],
          required: true,
        },
        message: { type: String, required: true },
        stepId: { type: String },
        agentId: { type: String },
        metadata: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    notifications: [
      {
        timestamp: { type: Date, default: Date.now },
        type: { type: String, required: true },
        message: { type: String, required: true },
        sent: { type: Boolean, default: false },
        details: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Indexes for performance and queries
schedulerExecutionSchema.index({ task_id: 1, start_time: -1 });
schedulerExecutionSchema.index({ user: 1 });
schedulerExecutionSchema.index({ user: 1, task_id: 1 });
schedulerExecutionSchema.index({ user: 1, status: 1 });
schedulerExecutionSchema.index({ user: 1, 'context.isTest': 1 });
schedulerExecutionSchema.index({ currentStepId: 1 });
schedulerExecutionSchema.index({ 'steps.id': 1 });
schedulerExecutionSchema.index({ 'steps.agent_id': 1 });

// Methods for calculating progress
schedulerExecutionSchema.methods.updateProgress = function () {
  if (this.steps && this.steps.length > 0) {
    const completedSteps = this.steps.filter(
      (step: IWorkflowExecutionStep) => step.status === 'completed',
    ).length;
    const totalSteps = this.steps.length;
    const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    this.progress = {
      completedSteps,
      totalSteps,
      percentage,
    };
  }
  return this;
};

schedulerExecutionSchema.methods.updateDuration = function () {
  if (this.start_time && this.end_time) {
    this.duration = this.end_time.getTime() - this.start_time.getTime();
  }
  return this;
};

schedulerExecutionSchema.methods.addLog = function (
  level: string,
  message: string,
  stepId?: string,
  agentId?: string,
  metadata?: Record<string, any>,
) {
  if (!this.logs) {
    this.logs = [];
  }
  this.logs.push({
    timestamp: new Date(),
    level,
    message,
    stepId,
    agentId,
    metadata,
  });
  return this;
};

schedulerExecutionSchema.methods.addNotification = function (
  type: string,
  message: string,
  details?: Record<string, any>,
) {
  if (!this.notifications) {
    this.notifications = [];
  }
  this.notifications.push({
    timestamp: new Date(),
    type,
    message,
    sent: false,
    details,
  });
  return this;
};

export default schedulerExecutionSchema;
