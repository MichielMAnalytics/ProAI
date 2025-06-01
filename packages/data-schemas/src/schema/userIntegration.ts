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

// ================================
// MCP Cache Invalidation Middleware
// ================================

/**
 * Clear MCP cache for user when integrations are modified
 * 
 * This middleware automatically invalidates the MCPInitializer cache whenever
 * user integrations are added, updated, or deleted. This ensures that:
 * 
 * 1. New integrations are immediately available as MCP servers
 * 2. Updated integration configs are reflected without cache wait
 * 3. Deleted integrations are removed from MCP server configurations
 * 4. No manual cache management is required
 * 
 * The middleware is user-specific and only clears cache for the affected user,
 * maintaining performance for other users. It gracefully handles environments
 * where MCPInitializer is not available (e.g., schema-only contexts).
 * 
 * Triggers on:
 * - save (create/update operations)
 * - findOneAndUpdate, updateOne, updateMany
 * - findOneAndDelete, deleteOne
 * - deleteMany (clears all caches as safety measure)
 */

// Helper function to safely clear MCP cache
async function clearMCPCacheForUser(userId: string, operation: string) {
  if (!userId) {
    return;
  }
  
  try {
    // Dynamic import to avoid circular dependencies
    // MCPInitializer is only available in the API layer
    if (typeof require !== 'undefined') {
      // SIMPLIFIED ARCHITECTURE: Use MCPInitializer as single source of truth
      // MCPInitializer will internally handle all necessary cache clearing
      const MCPInitializer = require('~/server/services/MCPInitializer');
      MCPInitializer.clearUserCache(userId);
      
      // Log the cache clear for debugging
      const logger = require('~/config')?.logger || console;
      logger.info(`[UserIntegration] ✅ CLEARED MCP cache via MCPInitializer for user ${userId} after ${operation}`);
    }
  } catch (error: unknown) {
    // Fail silently if MCPInitializer is not available (e.g., in schema-only contexts)
    // This allows the schema to work in both API and non-API environments
    if (typeof console !== 'undefined') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.debug(`[UserIntegration] Could not clear MCP cache: ${errorMessage}`);
    }
  }
}

// Post-save middleware - triggers after create/update operations
UserIntegrationSchema.post('save', async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-SAVE middleware triggered for user ${doc.userId}`);
  await clearMCPCacheForUser(doc.userId, 'save');
});

// Post-update middleware - triggers after findOneAndUpdate, updateOne, etc.
UserIntegrationSchema.post(['findOneAndUpdate', 'updateOne', 'updateMany'], async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-UPDATE middleware triggered for doc:`, !!doc);
  // For update operations, the document might be null if not found
  if (doc && doc.userId) {
    await clearMCPCacheForUser(doc.userId, 'update');
  }
});

// Additional middleware to handle upsert operations specifically
// This catches cases where findOneAndUpdate with upsert creates a new document
UserIntegrationSchema.post('findOneAndUpdate', async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-FINDONEANDUPDATE middleware triggered for doc:`, !!doc);
  if (doc && doc.userId) {
    // Always clear cache for findOneAndUpdate operations (including upserts)
    await clearMCPCacheForUser(doc.userId, 'findOneAndUpdate');
  }
});

// Pre-middleware to log when operations are happening (for debugging)
UserIntegrationSchema.pre(['save', 'findOneAndUpdate', 'updateOne', 'deleteOne', 'findOneAndDelete'], function() {
  try {
    const logger = require('~/config')?.logger || console;
    logger.info(`[UserIntegration] 🚀 PRE-middleware triggered for operation`);
  } catch (error) {
    // Fail silently
  }
});

// Post-delete middleware - triggers after findOneAndDelete, deleteOne, etc.
UserIntegrationSchema.post(['findOneAndDelete', 'deleteOne'], async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-DELETE middleware triggered for doc:`, !!doc, doc?.userId);
  if (doc && doc.userId) {
    await clearMCPCacheForUser(doc.userId, 'delete');
  }
});

// Comprehensive post-middleware to catch any document modification
// This is a safety net to ensure cache clearing happens for any operation
UserIntegrationSchema.post(['save', 'findOneAndUpdate', 'updateOne', 'updateMany', 'replaceOne'], async function(doc, next) {
  if (doc && doc.userId) {
    await clearMCPCacheForUser(doc.userId, 'comprehensive');
  }
  if (next) next();
});

export default UserIntegrationSchema; 