import { Schema, Document } from 'mongoose';

export interface IUserIntegration extends Document {
  userId: string;
  pipedreamAccountId: string; // Pipedream's account ID
  pipedreamProjectId: string; // Pipedream's project ID (required for Connect API)
  appSlug: string; // e.g., 'slack', 'github', 'notion'
  appName: string; // Display name
  appDescription?: string;
  appIcon?: string;
  appCategories?: string[];
  isActive: boolean;
  credentials?: {
    authProvisionId: string; // Pipedream's auth provision ID
    // Other auth details will be fetched from Pipedream
  };
  mcpServerConfig?: {
    serverName: string;
    type: 'sse' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    timeout?: number;
    iconPath?: string;
  };
  lastConnectedAt?: Date;
  lastUsedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// MCP Server Config sub-schema
const MCPServerConfigSchema = new Schema(
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

// Credentials sub-schema
const CredentialsSchema = new Schema(
  {
    authProvisionId: { type: String, required: true },
  },
  { _id: false },
);

const UserIntegrationSchema = new Schema<IUserIntegration>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    pipedreamAccountId: {
      type: String,
      required: true,
      unique: true,
    },
    pipedreamProjectId: {
      type: String,
      required: true,
    },
    appSlug: {
      type: String,
      required: true,
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
    isActive: {
      type: Boolean,
      default: true,
    },
    credentials: {
      type: CredentialsSchema,
    },
    mcpServerConfig: {
      type: MCPServerConfigSchema,
    },
    lastConnectedAt: {
      type: Date,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Compound index for efficient queries
UserIntegrationSchema.index({ userId: 1, appSlug: 1 });
UserIntegrationSchema.index({ userId: 1, isActive: 1 });

export default UserIntegrationSchema; 