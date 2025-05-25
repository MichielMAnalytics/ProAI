import { Schema, Document } from 'mongoose';

export interface IAvailableIntegration extends Document {
  appSlug: string; // Unique identifier from Pipedream
  appName: string; // Display name
  appDescription?: string;
  appIcon?: string;
  appCategories?: string[];
  appUrl?: string; // Official app website
  pipedreamAppId?: string; // Pipedream's internal app ID
  authType?: 'oauth' | 'api_key' | 'basic' | 'none';
  isActive: boolean; // Whether this integration is currently available
  mcpServerTemplate?: {
    serverName: string;
    type: 'sse' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    timeout?: number;
    iconPath?: string;
  };
  popularity?: number; // For sorting/ranking
  lastUpdated?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// MCP Server Template sub-schema
const MCPServerTemplateSchema = new Schema(
  {
    serverName: { type: String, required: true },
    type: { type: String, enum: ['sse', 'stdio'], required: true },
    url: { type: String },
    command: { type: String },
    args: [{ type: String }],
    timeout: { type: Number, default: 60000 },
    iconPath: { type: String },
  },
  { _id: false },
);

const AvailableIntegrationSchema = new Schema<IAvailableIntegration>(
  {
    appSlug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    appName: {
      type: String,
      required: true,
    },
    appDescription: {
      type: String,
    },
    appIcon: {
      type: String,
    },
    appCategories: [{ type: String }],
    appUrl: {
      type: String,
    },
    pipedreamAppId: {
      type: String,
    },
    authType: {
      type: String,
      enum: ['oauth', 'api_key', 'basic', 'none'],
      default: 'oauth',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    mcpServerTemplate: {
      type: MCPServerTemplateSchema,
    },
    popularity: {
      type: Number,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Indexes for efficient queries
AvailableIntegrationSchema.index({ isActive: 1, popularity: -1 });
AvailableIntegrationSchema.index({ appCategories: 1 });
AvailableIntegrationSchema.index({ appName: 'text', appDescription: 'text' });

export default AvailableIntegrationSchema; 