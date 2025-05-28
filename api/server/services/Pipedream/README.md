# Pipedream Services

This directory contains the refactored Pipedream integration services, organized by functionality for better maintainability and separation of concerns.

## Architecture Overview

The original monolithic `PipedreamService.js` has been refactored into four focused services:

### 1. PipedreamConnect (`PipedreamConnect.js`)
**Core Connect functionality for user authentication and token management**

- Creating connect tokens for users
- Managing user account connections
- Handling OAuth flow callbacks
- User integration lifecycle management
- Account deletion and revocation

**Key Methods:**
- `createConnectToken(userId, options)` - Generate connect tokens
- `getUserAccounts(userId, options)` - Get user's connected accounts
- `createUserIntegration(userId, accountData)` - Save integration after connection
- `deleteUserIntegration(userId, integrationId)` - Remove integration
- `handleConnectionCallback(callbackData)` - Process OAuth callbacks

### 2. PipedreamApps (`PipedreamApps.js`)
**Available integrations and app discovery**

- Fetching available apps from Pipedream API
- Caching integrations in database
- Background refresh of integration data
- App details and metadata retrieval

**Key Methods:**
- `getAvailableIntegrations()` - Get all available apps with caching
- `getAppDetails(appIdentifier)` - Get specific app information
- `fetchFromAPI()` - Fetch fresh data from Pipedream API
- `cacheIntegrations(integrations)` - Cache apps in database

**Caching Strategy:**
- Fresh Cache (24h): Return immediately, no API calls
- Stale Cache (7d): Return immediately + background refresh
- Expired Cache (30d): Force refresh from API

### 3. PipedreamUserIntegrations (`PipedreamUserIntegrations.js`)
**User-specific integration management**

- User integration queries and management
- MCP server configuration generation
- Integration usage tracking
- User integration lifecycle

**Key Methods:**
- `getUserIntegrations(userId, options)` - Get user's connected integrations
- `generateMCPConfig(userId)` - Generate MCP server configuration
- `updateIntegrationUsage(userId, integrationId)` - Track usage
- `hasIntegration(userId, appSlug)` - Check if user has specific integration
- `getIntegrationStats(userId)` - Get integration statistics

### 4. PipedreamComponents (`PipedreamComponents.js`)
**Component management (actions and triggers)**

- Fetching app components (actions/triggers)
- Configuring component properties
- Running actions
- Component metadata and documentation

**Key Methods:**
- `getAppComponents(appIdentifier, type)` - Get actions/triggers for app
- `configureComponent(userId, options)` - Configure component properties
- `runAction(userId, options)` - Execute action components
- `getComponentDocumentation(componentId)` - Get component docs

**Note:** Triggers are intentionally not implemented as they're not needed for our MCP use case.

## Usage Examples

### Basic Usage

```javascript
const {
  PipedreamConnect,
  PipedreamApps,
  PipedreamUserIntegrations,
  PipedreamComponents,
} = require('~/server/services/Pipedream');

// Create a connect token
const tokenData = await PipedreamConnect.createConnectToken(userId, {
  app: 'slack',
  redirect_url: 'https://myapp.com/integrations'
});

// Get available integrations
const integrations = await PipedreamApps.getAvailableIntegrations();

// Get user's connected integrations
const userIntegrations = await PipedreamUserIntegrations.getUserIntegrations(userId);

// Get app components
const components = await PipedreamComponents.getAppComponents('slack', 'actions');
```

### Environment Variables

Required environment variables:

```env
PIPEDREAM_CLIENT_ID=your_client_id
PIPEDREAM_CLIENT_SECRET=your_client_secret
PIPEDREAM_PROJECT_ID=your_project_id
ENABLE_PIPEDREAM_INTEGRATION=true
PIPEDREAM_CONNECT_REDIRECT_URI=http://localhost:3080/d/integrations
```

Optional environment variables:

```env
PIPEDREAM_API_BASE_URL=https://api.pipedream.com/v1
PIPEDREAM_API_KEY=your_api_key
PIPEDREAM_CACHE_FRESH_DURATION=86400
PIPEDREAM_CACHE_STALE_DURATION=604800
PIPEDREAM_CACHE_MAX_AGE=2592000
PIPEDREAM_SCHEDULED_REFRESH_HOURS=12
```

## Development vs Production

The services automatically detect the environment:

- **Development**: Uses Pipedream's development environment (up to 10 external users)
- **Production**: Uses Pipedream's production environment

Set `NODE_ENV=production` for production deployment.

## Error Handling

All services include comprehensive error handling:

- Graceful fallback to cached data when API fails
- Mock data fallback for development/testing
- Detailed logging for debugging
- Proper error propagation with meaningful messages

## Testing

Run the end-to-end test to verify functionality:

```bash
# Run the E2E test
node api/test/run-pipedream-e2e.js

# Or with npm
npm test -- api/test/pipedream-e2e.test.js
```

## Migration from Old Service

The old monolithic `PipedreamService.js` has been replaced. Update imports:

```javascript
// Old
const PipedreamService = require('~/server/services/PipedreamService');

// New
const {
  PipedreamConnect,
  PipedreamApps,
  PipedreamUserIntegrations,
  PipedreamComponents,
} = require('~/server/services/Pipedream');
```

## Service Dependencies

- **PipedreamConnect**: Core service, no dependencies on other Pipedream services
- **PipedreamApps**: Independent service for app discovery
- **PipedreamUserIntegrations**: Uses database models, no Pipedream API dependencies
- **PipedreamComponents**: Depends on PipedreamConnect for client access

## Logging

All services use structured logging with service prefixes:

- `PipedreamConnect: ...`
- `PipedreamApps: ...`
- `PipedreamUserIntegrations: ...`
- `PipedreamComponents: ...`

This makes it easy to filter logs by service in production.

## Future Enhancements

Potential improvements:

1. **Component Search**: Implement cross-app component search
2. **Webhook Management**: Add webhook lifecycle management
3. **Usage Analytics**: Track integration usage patterns
4. **Rate Limiting**: Implement API rate limiting
5. **Caching Improvements**: Add Redis caching layer
6. **Health Monitoring**: Add service health checks 