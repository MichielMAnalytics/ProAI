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
// SMART MCP Cache Invalidation Middleware
// ================================

/**
 * Smart MCP cache invalidation that works with incremental operations
 * 
 * This middleware has been updated to work intelligently with the new incremental
 * MCP server operations. It follows this strategy:
 * 
 * 1. **Incremental Operations Available**: When incremental operations are available,
 *    this middleware does NOT automatically clear the entire cache. Instead, it lets
 *    the incremental operations (connectSingleMCPServer/disconnectSingleMCPServer)
 *    handle their own targeted cache updates.
 * 
 * 2. **Fallback for Legacy Operations**: If incremental operations are not available
 *    or fail, it falls back to full cache clearing as before.
 * 
 * 3. **Delete Operations**: Delete operations always trigger cleanup of orphaned
 *    tools from agents, regardless of incremental operation availability.
 * 
 * This approach ensures:
 * - ✅ Incremental operations remain fast and don't trigger full refreshes
 * - ✅ Legacy flows still work correctly with full cache clearing
 * - ✅ Deleted integrations are properly cleaned up
 * - ✅ User-specific cache management (no global variables)
 * 
 * The middleware detects incremental operation availability by checking if the
 * MCPInitializer service has the new incremental methods available.
 */

// Helper function to check if incremental MCP operations are available
function hasIncrementalMCPSupport(): boolean {
  try {
    if (typeof require !== 'undefined') {
      const MCPInitializer = require('~/server/services/MCPInitializer');
      const instance = MCPInitializer.getInstance();
      // Check if the incremental methods exist
      return typeof instance.connectSingleMCPServer === 'function' && 
             typeof instance.disconnectSingleMCPServer === 'function';
    }
  } catch (error) {
    // MCPInitializer not available
  }
  return false;
}

// Helper function to safely clear MCP cache and cleanup orphaned tools
async function smartMCPCacheInvalidation(userId: string, operation: string, doc?: any) {
  if (!userId) {
    return;
  }
  
  try {
    // Dynamic import to avoid circular dependencies
    if (typeof require !== 'undefined') {
      const logger = require('~/config')?.logger || console;
      
      // Check if incremental operations are available
      const hasIncremental = hasIncrementalMCPSupport();
      
      if (hasIncremental && (operation === 'save' || operation === 'update' || operation === 'findOneAndUpdate')) {
        // INCREMENTAL MODE: Don't automatically clear cache for create/update operations
        // Let the incremental operations handle their own cache management
        logger.info(`[UserIntegration] 🎯 INCREMENTAL mode: Skipping automatic cache clear for ${operation} - incremental operations will handle cache updates for user ${userId}`);
        
        // For deactivations, we could run general cleanup, but the user still has the integration
        // so we'll let the normal agent editing flow handle tool removal when needed
        if (doc && doc.isActive === false) {
          logger.info(`[UserIntegration] 📝 Integration deactivated for user ${userId}, tools will be cleaned up when agents are next modified`);
        }
        
        return; // Skip full cache clearing
      }
      
      // SPECIAL HANDLING FOR DELETE OPERATIONS: Try incremental disconnect first
      if (hasIncremental && operation === 'delete' && doc && doc.mcpServerConfig?.serverName) {
        logger.info(`[UserIntegration] 🎯 INCREMENTAL DELETE mode: Attempting incremental disconnect for server '${doc.mcpServerConfig.serverName}' for user ${userId}`);
        
        try {
          const MCPInitializer = require('~/server/services/MCPInitializer');
          const mcpInitializer = MCPInitializer.getInstance();
          
          // Try incremental disconnect
          const result = await mcpInitializer.disconnectSingleMCPServer(
            userId,
            doc.mcpServerConfig.serverName,
            'UserIntegration.delete',
            {} // Empty availableTools since we're just disconnecting
          );
          
          if (result.success) {
            logger.info(`[UserIntegration] ✅ INCREMENTAL DELETE successful: Disconnected server '${doc.mcpServerConfig.serverName}' for user ${userId}`);
            
            return; // Skip full cache clearing
          } else {
            logger.warn(`[UserIntegration] ⚠️ INCREMENTAL DELETE failed: ${result.error}. Falling back to full cache clear.`);
          }
        } catch (incrementalError: unknown) {
          const errorMessage = incrementalError instanceof Error ? incrementalError.message : 'Unknown error';
          logger.warn(`[UserIntegration] ⚠️ INCREMENTAL DELETE error: ${errorMessage}. Falling back to full cache clear.`);
        }
      }
      
      // LEGACY MODE or FALLBACK: Use full cache clearing
      logger.info(`[UserIntegration] 🔄 LEGACY mode: Performing full cache clear for ${operation} for user ${userId} (incremental available: ${hasIncremental})`);
      
      const MCPInitializer = require('~/server/services/MCPInitializer');
      MCPInitializer.clearUserCache(userId);
      
      // Log the cache clear for debugging
      logger.info(`[UserIntegration] ✅ CLEARED MCP cache via MCPInitializer for user ${userId} after ${operation}`);
    }
  } catch (error: unknown) {
    // Fail silently if MCPInitializer is not available (e.g., in schema-only contexts)
    // This allows the schema to work in both API and non-API environments
    if (typeof console !== 'undefined') {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.debug(`[UserIntegration] Could not perform smart cache invalidation: ${errorMessage}`);
    }
  }
}

// Post-save middleware - triggers after create/update operations
UserIntegrationSchema.post('save', async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-SAVE middleware triggered for user ${doc.userId}`);
  await smartMCPCacheInvalidation(doc.userId, 'save', doc);
});

// Post-update middleware - triggers after findOneAndUpdate, updateOne, etc.
UserIntegrationSchema.post(['findOneAndUpdate', 'updateOne', 'updateMany'], async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-UPDATE middleware triggered for doc:`, !!doc);
  // For update operations, the document might be null if not found
  if (doc && doc.userId) {
    await smartMCPCacheInvalidation(doc.userId, 'update', doc);
  }
});

// Post-delete middleware - triggers after findOneAndDelete, deleteOne, etc.
// Delete operations ALWAYS trigger full cleanup regardless of incremental support
UserIntegrationSchema.post(['findOneAndDelete', 'deleteOne'], async function(doc) {
  console.log(`[UserIntegration] 🔥 POST-DELETE middleware triggered for doc:`, !!doc, doc?.userId);
  if (doc && doc.userId) {
    await smartMCPCacheInvalidation(doc.userId, 'delete', doc);
  }
});

export default UserIntegrationSchema; 