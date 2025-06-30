# OAuth Token Refresh Tests

This directory contains comprehensive tests for the MCP OAuth token refresh mechanism.

## Test Files

### 1. `mcp-oauth-refresh.test.js`
Jest unit tests that verify:
- Token caching and expiration handling
- Retry logic for failed token requests
- Concurrent request management
- Integration with UserMCPService
- Authentication error detection
- Full token refresh cycle simulation

### 2. `simulate-token-expiration.js`
Integration test script that simulates real-world scenarios:
- Expired token cache scenarios
- Authentication errors
- Network failures and retries
- Concurrent token requests
- MCP connection authentication

### 3. `run-oauth-tests.js`
Test runner that executes both test suites and provides a summary.

## Running the Tests

### Run All Tests
```bash
# From the project root
node api/test/run-oauth-tests.js
```

### Run Individual Test Scenarios
```bash
# Run Jest unit tests only
npm test -- mcp-oauth-refresh.test.js

# Run specific simulation scenarios
node api/test/simulate-token-expiration.js expired-cache
node api/test/simulate-token-expiration.js auth-error
node api/test/simulate-token-expiration.js network-error
node api/test/simulate-token-expiration.js concurrent
node api/test/simulate-token-expiration.js mcp-connection

# Run all simulation tests
node api/test/simulate-token-expiration.js
```

## What These Tests Verify

### Token Management
- ✅ Tokens are properly cached with expiration
- ✅ Cache is cleared when tokens expire
- ✅ Fresh tokens are requested proactively
- ✅ Retry logic works for failed requests

### MCP Integration
- ✅ UserMCPService proactively refreshes tokens
- ✅ Authorization headers are properly set
- ✅ Servers continue without auth if token fails

### Connection Recovery
- ✅ Authentication errors are detected correctly
- ✅ Token refresh is triggered on auth errors
- ✅ Transport is recreated after token refresh
- ✅ Connections recover after failures

### Edge Cases
- ✅ Concurrent requests don't cause duplicate refreshes
- ✅ Network failures are handled with retries
- ✅ Pipedream-specific error patterns are detected
- ✅ Non-Pipedream servers are not affected

## Expected Results

If all tests pass, the OAuth refresh mechanism should handle:

1. **Automatic Token Refresh**: Tokens are refreshed before they expire
2. **Error Recovery**: Authentication failures trigger token refresh and reconnection
3. **Retry Logic**: Network failures are handled with exponential backoff
4. **Concurrency Safety**: Multiple simultaneous requests are handled correctly
5. **Transport Recreation**: New tokens are properly applied to connections

## Environment Requirements

The tests require these environment variables:
- `PIPEDREAM_CLIENT_ID`
- `PIPEDREAM_CLIENT_SECRET`
- `PIPEDREAM_PROJECT_ID`

## Test Coverage

The test suite covers the main components involved in OAuth token refresh:

1. **PipedreamConnect.js**: Token acquisition, caching, and refresh
2. **UserMCPService.js**: Proactive token refresh during server setup
3. **connection.ts**: Authentication error detection and token refresh
4. **Integration**: End-to-end token refresh cycles

These tests ensure that the HTTP 500 errors from expired tokens should no longer occur.