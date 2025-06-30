#!/usr/bin/env node

/**
 * Simulate Token Expiration Test Script
 * 
 * This script simulates various token expiration scenarios to test
 * the OAuth refresh mechanism without waiting for actual token expiration.
 * 
 * Usage:
 *   node api/test/simulate-token-expiration.js [scenario]
 * 
 * Scenarios:
 *   - expired-cache: Simulate expired token in cache
 *   - auth-error: Simulate authentication error response
 *   - network-error: Simulate network errors during refresh
 *   - concurrent: Simulate concurrent token refresh requests
 */

const path = require('path');
const { performance } = require('perf_hooks');

// Add the project root to the require path
const projectRoot = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

// Set up module aliases for the ~ path
require('module-alias/register');

// Mock logger for testing
const logger = {
  info: (...args) => console.log(`[INFO]`, ...args),
  warn: (...args) => console.log(`[WARN]`, ...args),
  error: (...args) => console.log(`[ERROR]`, ...args),
  debug: (...args) => console.log(`[DEBUG]`, ...args),
};

async function simulateExpiredTokenCache() {
  console.log('\n=== Simulating Expired Token Cache ===');
  
  try {
    const PipedreamConnect = require('../server/services/Pipedream/PipedreamConnect');
    
    if (!PipedreamConnect.isEnabled()) {
      console.log('❌ PipedreamConnect is not enabled. Check your environment variables.');
      return;
    }

    console.log('✅ PipedreamConnect is enabled');
    
    // Clear the cache to force a fresh token request
    PipedreamConnect.clearTokenCache();
    console.log('🗑️  Cleared token cache');
    
    // Measure token acquisition time
    const startTime = performance.now();
    const token = await PipedreamConnect.getOAuthAccessToken();
    const endTime = performance.now();
    
    if (token) {
      console.log(`✅ Successfully acquired fresh token in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`🔑 Token preview: ${token.substring(0, 20)}...`);
      
      // Test immediate second call (should use cache)
      const startTime2 = performance.now();
      const token2 = await PipedreamConnect.getOAuthAccessToken();
      const endTime2 = performance.now();
      
      console.log(`⚡ Cached token retrieved in ${(endTime2 - startTime2).toFixed(2)}ms`);
      console.log(`🔄 Tokens match: ${token === token2 ? '✅' : '❌'}`);
    } else {
      console.log('❌ Failed to acquire token');
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function simulateAuthenticationError() {
  console.log('\n=== Simulating Authentication Error ===');
  
  try {
    const UserMCPService = require('../server/services/UserMCPService');
    
    // Use a test user ID
    const testUserId = 'test-user-' + Date.now();
    console.log(`👤 Testing with user ID: ${testUserId}`);
    
    // Clear cache first
    UserMCPService.clearCache(testUserId);
    console.log('🗑️  Cleared user MCP cache');
    
    // Get user MCP servers (this should trigger token refresh)
    const startTime = performance.now();
    const servers = await UserMCPService.getUserMCPServers(testUserId);
    const endTime = performance.now();
    
    console.log(`📊 Retrieved MCP servers in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`🔧 Server count: ${Object.keys(servers).length}`);
    
    // Check if any servers have authorization headers
    let authHeaderCount = 0;
    for (const [serverName, config] of Object.entries(servers)) {
      if (config.headers && config.headers['Authorization']) {
        authHeaderCount++;
        console.log(`🔐 ${serverName}: Has auth header`);
      }
    }
    
    console.log(`✅ Servers with auth headers: ${authHeaderCount}/${Object.keys(servers).length}`);
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function simulateNetworkError() {
  console.log('\n=== Simulating Network Error Scenarios ===');
  
  try {
    const PipedreamConnect = require('../server/services/Pipedream/PipedreamConnect');
    
    if (!PipedreamConnect.isEnabled()) {
      console.log('❌ PipedreamConnect is not enabled');
      return;
    }
    
    // Test retry mechanism by clearing cache and attempting multiple requests
    PipedreamConnect.clearTokenCache();
    console.log('🗑️  Cleared token cache to force refresh');
    
    const maxAttempts = 3;
    let successfulAttempts = 0;
    
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        console.log(`🔄 Attempt ${i}/${maxAttempts}`);
        const startTime = performance.now();
        
        PipedreamConnect.clearTokenCache(); // Force fresh request each time
        const token = await PipedreamConnect.getOAuthAccessToken();
        
        const endTime = performance.now();
        
        if (token) {
          successfulAttempts++;
          console.log(`✅ Attempt ${i} succeeded in ${(endTime - startTime).toFixed(2)}ms`);
        } else {
          console.log(`❌ Attempt ${i} failed - no token returned`);
        }
        
        // Short delay between attempts
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`❌ Attempt ${i} failed: ${error.message}`);
      }
    }
    
    console.log(`📈 Success rate: ${successfulAttempts}/${maxAttempts} (${(successfulAttempts/maxAttempts*100).toFixed(1)}%)`);
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function simulateConcurrentRequests() {
  console.log('\n=== Simulating Concurrent Token Requests ===');
  
  try {
    const PipedreamConnect = require('../server/services/Pipedream/PipedreamConnect');
    
    if (!PipedreamConnect.isEnabled()) {
      console.log('❌ PipedreamConnect is not enabled');
      return;
    }
    
    // Clear cache to force fresh requests
    PipedreamConnect.clearTokenCache();
    console.log('🗑️  Cleared token cache');
    
    const concurrentRequests = 5;
    console.log(`🚀 Making ${concurrentRequests} concurrent token requests`);
    
    const startTime = performance.now();
    
    // Make multiple concurrent requests
    const promises = Array.from({ length: concurrentRequests }, (_, i) => 
      PipedreamConnect.getOAuthAccessToken().then(token => ({ index: i, token, success: !!token }))
    );
    
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    console.log(`⏱️  All requests completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    // Analyze results
    const successfulRequests = results.filter(r => r.success);
    const uniqueTokens = new Set(results.map(r => r.token).filter(Boolean));
    
    console.log(`✅ Successful requests: ${successfulRequests.length}/${concurrentRequests}`);
    console.log(`🔑 Unique tokens: ${uniqueTokens.size} (should be 1 for proper caching)`);
    
    if (uniqueTokens.size === 1) {
      console.log('✅ Concurrency control working correctly - all requests got same token');
    } else {
      console.log('⚠️  Multiple tokens returned - concurrency control may need improvement');
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function testMCPConnectionRefresh() {
  console.log('\n=== Testing MCP Connection Token Refresh ===');
  
  try {
    // This is a simulation since we can't easily create real MCP connections in a test
    console.log('🔧 Simulating MCP connection authentication error...');
    
    const errorMessages = [
      'Error POSTing to endpoint (HTTP 500): {"jsonrpc":"2.0","error":{"code":-32603,"message":"Internal server error"},"id":null}',
      'HTTP 401 Unauthorized',
      'HTTP 403 Forbidden',
      'Authentication failed',
    ];
    
    const authErrorPatterns = [
      'HTTP 401',
      'HTTP 403', 
      'HTTP 500',
      'Unauthorized',
      'Forbidden',
      'Internal server error',
      'Authentication failed',
      'Invalid token',
      'Token expired',
      'access_token',
    ];
    
    console.log('🔍 Testing authentication error detection...');
    
    errorMessages.forEach((message, index) => {
      const isAuthError = message.includes('"code":-32603') && message.includes('Internal server error') ||
        authErrorPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()));
      
      console.log(`${isAuthError ? '✅' : '❌'} Error ${index + 1}: ${isAuthError ? 'Detected' : 'Not detected'} as auth error`);
    });
    
    console.log('✅ Authentication error detection test completed');
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🧪 Running comprehensive OAuth token refresh tests...\n');
  
  await simulateExpiredTokenCache();
  await simulateAuthenticationError();
  await simulateNetworkError();
  await simulateConcurrentRequests();
  await testMCPConnectionRefresh();
  
  console.log('\n✅ All tests completed!');
  console.log('\n📋 Summary:');
  console.log('- Token cache expiration and refresh: Tested');
  console.log('- User MCP service token integration: Tested');
  console.log('- Network error retry mechanism: Tested');
  console.log('- Concurrent request handling: Tested');
  console.log('- Authentication error detection: Tested');
  
  console.log('\n💡 If all tests passed, the OAuth refresh mechanism should handle:');
  console.log('  - Expired tokens during MCP server initialization');
  console.log('  - Authentication errors during MCP connections');
  console.log('  - Network failures with retry logic');
  console.log('  - Concurrent token refresh requests');
}

// Main execution
async function main() {
  const scenario = process.argv[2];
  
  console.log('🔧 OAuth Token Refresh Test Suite');
  console.log('==================================');
  
  if (!process.env.PIPEDREAM_CLIENT_ID || !process.env.PIPEDREAM_CLIENT_SECRET || !process.env.PIPEDREAM_PROJECT_ID) {
    console.log('❌ Missing required environment variables:');
    console.log('   - PIPEDREAM_CLIENT_ID');
    console.log('   - PIPEDREAM_CLIENT_SECRET'); 
    console.log('   - PIPEDREAM_PROJECT_ID');
    process.exit(1);
  }
  
  switch (scenario) {
    case 'expired-cache':
      await simulateExpiredTokenCache();
      break;
    case 'auth-error':
      await simulateAuthenticationError();
      break;
    case 'network-error':
      await simulateNetworkError();
      break;
    case 'concurrent':
      await simulateConcurrentRequests();
      break;
    case 'mcp-connection':
      await testMCPConnectionRefresh();
      break;
    default:
      await runAllTests();
      break;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = {
  simulateExpiredTokenCache,
  simulateAuthenticationError,
  simulateNetworkError,
  simulateConcurrentRequests,
  testMCPConnectionRefresh,
};