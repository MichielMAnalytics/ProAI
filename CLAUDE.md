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
The application heavily uses MCP for tool integration. MCP servers are initialized in `api/services/initializeMCP.js` and managed through the MCPInitializer service.

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