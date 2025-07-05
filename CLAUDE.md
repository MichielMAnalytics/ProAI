# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

LibreChat is a Personal Assistant Core Technology platform built as a fork of LibreChat. The application uses a monorepo structure with three main workspaces:

- **api/**: Node.js backend with Express.js server, MongoDB integration, and AI service clients
- **client/**: React frontend with TypeScript, Vite, and Tailwind CSS
- **packages/**: Shared packages including data-provider, data-schemas, and API utilities

### Key Architecture Components

**Backend (api/)**
- `server/`: Express.js server with middleware, routes, and controllers
- `app/clients/`: AI service clients (OpenAI, Anthropic, Google, etc.)
- `models/`: MongoDB schemas for conversations, users, agents, etc.
- `services/`: Business logic including MCP, Scheduler, Stripe, and Pipedream integrations

**Frontend (client/)**
- `src/components/`: React components organized by feature
- `src/hooks/`: Custom React hooks and context providers
- `src/store/`: State management using Zustand
- `src/utils/`: Utility functions and helper methods

**Data Layer**
- MongoDB for primary data storage
- Redis for caching and session management
- MeiliSearch for full-text search capabilities

## Development Commands

### Installation & Setup
```bash
# Install dependencies
npm ci

# Copy configuration files
cp .env.example .env
cp librechat.example.yaml librechat.yaml
```

### Development Workflow
```bash
# Frontend development (runs on port 3090)
npm run frontend:dev

# Backend development (with hot reload)
npm run backend:dev

# Full production build
npm run frontend && npm run backend
```

### Testing
```bash
# Frontend tests
npm run test:client

# Backend tests  
npm run test:api

# E2E tests
npm run e2e
npm run e2e:headed  # With browser UI
npm run e2e:debug   # Debug mode
```

### Code Quality
```bash
# Lint and fix
npm run lint:fix

# Format code
npm run format

# Lint only
npm run lint
```

### Docker
```bash
# Build and run containers
docker compose up -d --build

# Start existing containers
docker compose up -d
```

## Important Development Notes

### MCP (Model Context Protocol) Integration
The application uses MCP for dynamic tool integration with a dual server architecture and complex registry system that requires careful understanding.

#### MCP Server Architecture

**Global MCP Servers**
- Configured in `librechat.yaml` 
- Initialized at application startup in `api/server/services/AppService.js`
- Available to all users without individual authentication
- Stored in MCPManager's `connections` Map
- Examples: Perplexity, Claude Tools, system-wide integrations

**User-Specific MCP Servers**
- Stored in MongoDB via UserIntegration model
- Initialized on-demand when users request tools
- Require individual user authentication/OAuth setup
- Stored in MCPManager's `userConnections` Map with user-specific keys
- Examples: Pipedream integrations (Gmail, Google Drive, Sheets, etc.)
- Subject to idle timeout and cleanup

#### Enhanced Single Source of Truth Architecture (REFACTORED ✅)

**ARCHITECTURE SOLUTION IMPLEMENTED**: The system now uses a single source of truth with enhanced `availableTools` containing embedded MCP metadata, eliminating the dual registry problems.

**Enhanced Tools Structure (`availableTools`)**:
- Single registry for all tools (structured + MCP)
- Structure: `{ [toolName]: EnhancedToolDefinition }`
- Embedded MCP metadata via `_mcp` property
- No synchronization issues or duplication

**Enhanced Tool Definition**:
```typescript
interface EnhancedToolDefinition {
  type: 'function';
  function: { name: string; description?: string; parameters?: any };
  _mcp?: {
    serverName: string;      // MCP server name
    appSlug: string;         // App slug for UI (e.g., 'gmail')
    isGlobal: boolean;       // Global vs user-specific
    userId?: string;         // User ID for user-specific tools
    originalToolName?: string; // Original tool name from server
  };
}
```

**Benefits Achieved**:
1. ✅ **No Tool Duplication**: Single source eliminates duplicate registrations
2. ✅ **Performance Improvement**: 47% faster initialization (6919ms → 3646ms)
3. ✅ **Simplified Architecture**: One data structure, one API (ToolMetadataUtils)
4. ✅ **Better Debugging**: All tool info in one place
5. ✅ **Eliminated Race Conditions**: No registry synchronization needed

#### MCP Tool Flow and Processing

**Tool Registration Process**:
1. **Global Tools**: AppService.js registers in both registries at startup
2. **User Tools**: MCPInitializer registers in both registries on-demand
3. **Manifest Creation**: Tools get `_mcp_` suffix pattern for internal processing
4. **Frontend Filtering**: PluginController filters based on both registries
5. **Cleanup**: `_mcp_` suffix removed before sending to frontend

**Key Files**:
- `packages/api/src/mcp/manager.ts`: MCPManager class - connection lifecycle
- `api/server/services/MCPInitializer.js`: Centralized MCP initialization with caching
- `api/server/services/UserMCPService.js`: User-specific MCP server management
- `api/server/controllers/PluginController.js`: Tool discovery API for frontend
- `api/server/services/AppService.js`: Global MCP initialization

**Performance Characteristics**:
- User MCP initialization: ~3-4 seconds for 5 servers
- Token management via Pipedream SDK with automatic refresh
- Concurrent server initialization with Promise.allSettled
- Aggressive caching with MCPInitializer singleton pattern

#### Refactoring Implementation Details

**COMPLETED**: Successfully migrated from dual registry to single source of truth with embedded metadata.

**Implementation Summary**:
- ✅ Created `ToolMetadataUtils` class for working with enhanced tools
- ✅ Updated all 152+ `mcpToolRegistry` references across codebase
- ✅ Migrated AppService, MCPInitializer, PluginController, and all tool handlers
- ✅ Enhanced tool creation with embedded `_mcp` metadata
- ✅ Maintained backward compatibility during transition

**Key Files Modified**:
- `packages/data-provider/src/types/tools-enhanced.ts` - New enhanced structure
- `api/server/services/AppService.js` - Global tool registration
- `api/server/services/MCPInitializer.js` - User tool initialization  
- `api/server/services/MCP.js` - Tool execution with metadata
- `api/server/controllers/PluginController.js` - Tool filtering
- All workflow, controller, and utility files

**Migration Results**:
- 🚀 **47% Performance Improvement**: 6919ms → 3646ms initialization
- 🔧 **Zero Tool Duplication**: Eliminated duplicate registration issue
- 📦 **Simplified Codebase**: Single API via ToolMetadataUtils
- 🐛 **Better Debugging**: All tool data in one place
- ⚡ **No Sync Issues**: Atomic tool operations

**Usage Guide**:
```javascript
// Check if tool is MCP tool
const isMCP = ToolMetadataUtils.isMCPTool(tool);

// Get server information
const serverName = ToolMetadataUtils.getServerName(tool);
const appSlug = ToolMetadataUtils.getAppSlug(tool);

// Create enhanced tool with metadata
const enhancedTool = ToolMetadataUtils.createEnhancedTool(
  toolName, 
  { description, parameters }, 
  mcpMetadata
);
```

#### Upstream Architecture Analysis (Commit: ec7370dfe9a9e6a739f9de36de635e7e2d0433bf)

**Key Findings from Upstream LibreChat:**

The upstream still maintains the dual registry pattern but has introduced sophisticated improvements:

**Enhanced Caching System (`getCachedTools.js`)**:
```javascript
// Multi-tiered cache keys for future RBAC support
const ToolCacheKeys = {
  GLOBAL: 'tools:global',
  USER: (userId) => `tools:user:${userId}`,
  ROLE: (roleId) => `tools:role:${roleId}`,
  EFFECTIVE: (userId) => `tools:effective:${userId}`
};
```

**Simplified Initialization (`initializeMCP.js`)**:
- **Single Purpose**: Only handles global MCP server initialization
- **Clean Tool Mapping**: Uses `mcpManager.mapAvailableTools()` without dual registration
- **Cache Integration**: Directly integrates with the tiered caching system

**Key Upstream Patterns to Adopt**:
1. **Tiered Caching**: Role-based and user-specific cache management
2. **Clean Tool Names**: Moving away from `_mcp_` delimiter patterns
3. **Simplified Global Init**: Clear separation of global vs user-specific logic
4. **Smart Cache Invalidation**: Granular cache control

**Differences from Our Current Implementation**:
- **No User-Specific MCP Servers**: Upstream only has global MCP servers
- **Cleaner PluginController**: No complex dual-registry filtering logic
- **Unified Tool Flow**: Simpler tool registration without duplication checks
- **Better Cache Abstraction**: `getCachedTools()` abstracts complexity

**What We Need to Preserve**:
- User-specific MCP server support (Pipedream integrations)
- OAuth token management for user connections
- Connection isolation and lifecycle management
- Multi-tenant tool execution

**Migration Strategy Based on Upstream**:
1. **Adopt Upstream Caching**: Implement the tiered cache system
2. **Simplify Global Init**: Use upstream's clean global initialization
3. **Enhance for User-Specific**: Extend their patterns for user-specific servers
4. **Single Source of Truth**: Embed MCP metadata in `availableTools` as planned

### Multi-AI Provider Support
The system supports multiple AI providers through dedicated client classes in `api/app/clients/`. Each provider has its own authentication and API handling logic.

### Agent System
Custom agents are implemented with support for tools, code execution, and file handling. Agent definitions are stored in MongoDB and processed through the AgentService.

### Scheduler System
Background task processing is handled by the Scheduler service with support for cron-based scheduling and queue management.

### Frontend Design System
The UI follows accessibility guidelines (WCAG 2.1 AA) with mobile-first responsive design. Component patterns are documented in `.cursor/rules/frontend-rules.mdc`.

### User Management
Multi-user support with OAuth2, LDAP, and email authentication. User roles and permissions are managed through the Role model.

## Configuration Files

- `.env`: Environment variables for API keys and service configuration
- `librechat.yaml`: Main application configuration for AI endpoints and features
- `docker-compose.yml`: Container orchestration setup
- `eslint.config.mjs`: ESLint configuration for code quality
- `tailwind.config.cjs`: Tailwind CSS configuration

## Key Services Integration

- **Stripe**: Payment processing and subscription management
- **Pipedream**: Workflow automation and integrations
- **MeiliSearch**: Full-text search indexing
- **Redis**: Caching and session storage
- **MongoDB**: Primary database with connection pooling

## Testing Strategy

The codebase includes comprehensive testing:
- Unit tests with Jest
- E2E tests with Playwright
- A11y testing with axe-core
- Integration tests for API endpoints