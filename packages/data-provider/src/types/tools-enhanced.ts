/**
 * Enhanced Tool Definition with Embedded MCP Metadata
 * This replaces the dual registry approach (availableTools + mcpToolRegistry)
 * with a single source of truth containing both tool definitions and metadata.
 */

export interface MCPMetadata {
  /** MCP server name that provides this tool */
  serverName: string;
  /** App slug for frontend display (e.g., 'gmail' from 'pipedream-gmail') */
  appSlug: string;
  /** Whether this is a global MCP tool (available to all users) */
  isGlobal: boolean;
  /** User ID for user-specific tools (undefined for global tools) */
  userId?: string;
  /** Integration ID for tracking user integrations */
  integrationId?: string;
  /** Original tool name from MCP server */
  originalToolName?: string;
}

export interface EnhancedToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
  /** MCP-specific metadata (undefined for structured tools) */
  _mcp?: MCPMetadata;
  /** Other tool properties */
  [key: string]: any;
}

export interface EnhancedAvailableTools {
  [toolName: string]: EnhancedToolDefinition;
}

/**
 * Utility functions for working with enhanced tools
 */
export class ToolMetadataUtils {
  /**
   * Check if a tool is an MCP tool
   */
  static isMCPTool(tool: EnhancedToolDefinition): boolean {
    return tool._mcp !== undefined;
  }

  /**
   * Check if a tool is a global MCP tool
   */
  static isGlobalMCPTool(tool: EnhancedToolDefinition): boolean {
    return tool._mcp?.isGlobal === true;
  }

  /**
   * Check if a tool is a user-specific MCP tool
   */
  static isUserMCPTool(tool: EnhancedToolDefinition, userId?: string): boolean {
    if (!tool._mcp || tool._mcp.isGlobal) {
      return false;
    }
    return userId ? tool._mcp.userId === userId : tool._mcp.userId !== undefined;
  }

  /**
   * Get MCP server name for a tool
   */
  static getServerName(tool: EnhancedToolDefinition): string | undefined {
    return tool._mcp?.serverName;
  }

  /**
   * Get app slug for a tool
   */
  static getAppSlug(tool: EnhancedToolDefinition): string | undefined {
    return tool._mcp?.appSlug;
  }

  /**
   * Create MCP metadata object
   */
  static createMCPMetadata(options: {
    serverName: string;
    appSlug?: string;
    isGlobal: boolean;
    userId?: string;
    integrationId?: string;
    originalToolName?: string;
  }): MCPMetadata {
    const { serverName, isGlobal, userId, integrationId, originalToolName } = options;
    let { appSlug } = options;

    // Auto-generate appSlug if not provided
    if (!appSlug) {
      appSlug = serverName.startsWith('pipedream-')
        ? serverName.replace('pipedream-', '')
        : serverName;
    }

    return {
      serverName,
      appSlug,
      isGlobal,
      userId,
      integrationId,
      originalToolName,
    };
  }

  /**
   * Create enhanced tool definition
   */
  static createEnhancedTool(
    toolName: string,
    toolDefinition: { description?: string; parameters?: any },
    mcpMetadata?: MCPMetadata,
  ): EnhancedToolDefinition {
    return {
      type: 'function',
      function: {
        name: toolName,
        description: toolDefinition.description,
        parameters: toolDefinition.parameters,
      },
      _mcp: mcpMetadata,
    };
  }

  /**
   * Filter tools by criteria
   */
  static filterTools(
    tools: EnhancedAvailableTools,
    criteria: {
      isMCP?: boolean;
      isGlobal?: boolean;
      userId?: string;
      serverName?: string;
    },
  ): EnhancedAvailableTools {
    const filtered: EnhancedAvailableTools = {};

    for (const [toolName, tool] of Object.entries(tools)) {
      let matches = true;

      if (criteria.isMCP !== undefined) {
        matches = matches && this.isMCPTool(tool) === criteria.isMCP;
      }

      if (criteria.isGlobal !== undefined && tool._mcp) {
        matches = matches && tool._mcp.isGlobal === criteria.isGlobal;
      }

      if (criteria.userId !== undefined && tool._mcp) {
        matches = matches && tool._mcp.userId === criteria.userId;
      }

      if (criteria.serverName !== undefined && tool._mcp) {
        matches = matches && tool._mcp.serverName === criteria.serverName;
      }

      if (matches) {
        filtered[toolName] = tool;
      }
    }

    return filtered;
  }

  /**
   * Convert legacy tool definition to enhanced tool (migration utility)
   * @deprecated This method was used during migration from dual registry system
   */
  static fromLegacy(
    toolName: string,
    toolDefinition: any,
    mcpInfo?: {
      serverName: string;
      appSlug: string;
      toolName: string;
      isGlobal?: boolean;
      userId?: string;
    },
  ): EnhancedToolDefinition {
    const enhanced: EnhancedToolDefinition = {
      type: 'function',
      function: {
        name: toolName,
        description: toolDefinition.function?.description || toolDefinition.description,
        parameters: toolDefinition.function?.parameters || toolDefinition.parameters,
      },
    };

    if (mcpInfo) {
      enhanced._mcp = this.createMCPMetadata({
        serverName: mcpInfo.serverName,
        appSlug: mcpInfo.appSlug,
        isGlobal: mcpInfo.isGlobal ?? false,
        userId: mcpInfo.userId,
        originalToolName: mcpInfo.toolName,
      });
    }

    return enhanced;
  }
}
