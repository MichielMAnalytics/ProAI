import { Schema, Document } from 'mongoose';

export interface IAppComponent extends Document {
  appSlug: string; // App identifier
  componentType: 'action' | 'trigger'; // Type of component
  componentId: string; // Pipedream component ID
  name: string; // Component name
  version: string; // Component version
  key: string; // Component key
  description?: string;
  configurable_props?: any[]; // Component props configuration
  metadata?: any; // Additional component metadata
  isActive: boolean; // Whether this component is active
  lastUpdated?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const AppComponentSchema = new Schema<IAppComponent>(
  {
    appSlug: {
      type: String,
      required: true,
      index: true,
    },
    componentType: {
      type: String,
      enum: ['action', 'trigger'],
      required: true,
    },
    componentId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    version: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    configurable_props: {
      type: Schema.Types.Mixed,
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Compound indexes for efficient queries
AppComponentSchema.index({ appSlug: 1, componentType: 1 });
AppComponentSchema.index({ appSlug: 1, isActive: 1 });
AppComponentSchema.index({ componentId: 1 }, { unique: true });
AppComponentSchema.index({ key: 1 });

export default AppComponentSchema;
