import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkflowStepExecution {
  stepId: string;
  stepName: string;
  stepType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: Date;
  endTime?: Date;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  retryCount: number;
}

export interface IWorkflowExecution extends Document {
  id: string;
  workflowId: string;
  workflowName: string;
  trigger: {
    type: string;
    source: string;
    data?: Record<string, unknown>;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  stepExecutions: IWorkflowStepExecution[];
  currentStepId?: string;
  context: Record<string, unknown>; // Data passed between steps
  error?: string;
  user: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const WorkflowStepExecutionSchema = new Schema(
  {
    stepId: { type: String, required: true },
    stepName: { type: String, required: true },
    stepType: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const workflowExecutionSchema: Schema<IWorkflowExecution> = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    workflowId: {
      type: String,
      required: true,
    },
    workflowName: {
      type: String,
      required: true,
    },
    trigger: {
      type: {
        type: String,
        required: true,
      },
      source: {
        type: String,
        required: true,
      },
      data: {
        type: Schema.Types.Mixed,
      },
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
    },
    stepExecutions: {
      type: [WorkflowStepExecutionSchema],
      default: [],
    },
    currentStepId: {
      type: String,
    },
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { 
    timestamps: true,
    versionKey: false
  },
);

// Indexes for performance
workflowExecutionSchema.index({ workflowId: 1, startTime: -1 });
workflowExecutionSchema.index({ user: 1 });
workflowExecutionSchema.index({ user: 1, workflowId: 1 });
workflowExecutionSchema.index({ status: 1 });

export default workflowExecutionSchema; 