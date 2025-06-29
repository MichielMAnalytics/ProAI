import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISchedulerExecution extends Document {
  id: string;
  task_id: string;
  start_time: Date;
  end_time?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  output?: string;
  error?: string;
  user: Types.ObjectId;
  metadata?: {
    isTest?: boolean;
    workflowName?: string;
    steps?: Array<{
      id: string;
      name: string;
      type: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
      startTime?: Date;
      endTime?: Date;
      output?: string;
      error?: string;
    }>;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

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
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Indexes for performance (removed duplicate id index since it's already unique in field definition)
schedulerExecutionSchema.index({ task_id: 1, start_time: -1 });
schedulerExecutionSchema.index({ user: 1 });
schedulerExecutionSchema.index({ user: 1, task_id: 1 });

export default schedulerExecutionSchema;
