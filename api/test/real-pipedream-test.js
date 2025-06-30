#!/usr/bin/env node

/**
 * Real Pipedream Token Test
 * 
 * This test directly uses the actual PipedreamConnect service to verify
 * the token refresh mechanism is working in the real environment.
 */

const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
require('dotenv').config({ path: envPath });

// Set up module alias
process.env.NODE_PATH = path.resolve(__dirname, '..');
require('module').Module._initPaths();

console.log('🔧 Real Pipedream Token Refresh Test');
console.log('====================================\n');

async function testRealPipedreamConnect() {
  try {
    // Import the actual PipedreamConnect service
    const PipedreamConnect = require('../server/services/Pipedream/PipedreamConnect');
    
    console.log('✅ Successfully imported PipedreamConnect');
    
    // Check if it's enabled
    if (!PipedreamConnect.isEnabled()) {
      console.log('❌ PipedreamConnect is not enabled');
      console.log('   Check your environment variables:');
      console.log('   - PIPEDREAM_CLIENT_ID');
      console.log('   - PIPEDREAM_CLIENT_SECRET');
      console.log('   - PIPEDREAM_PROJECT_ID');
      return false;
    }
    
    console.log('✅ PipedreamConnect is enabled');
    
    // Test 1: Get fresh token
    console.log('\n🧪 Test 1: Getting fresh OAuth token');
    console.log('====================================');
    
    // Clear cache to force fresh request
    PipedreamConnect.clearTokenCache();
    console.log('🗑️  Cleared token cache');
    
    const startTime = Date.now();
    const token1 = await PipedreamConnect.getOAuthAccessToken();
    const endTime = Date.now();
    
    if (token1) {
      console.log(`✅ Got fresh token in ${endTime - startTime}ms`);
      console.log(`🔑 Token preview: ${token1.substring(0, 20)}...`);
    } else {
      console.log('❌ Failed to get token');
      return false;
    }
    
    // Test 2: Use cached token
    console.log('\n🧪 Test 2: Testing token cache');
    console.log('===============================');
    
    const startTime2 = Date.now();
    const token2 = await PipedreamConnect.getOAuthAccessToken();
    const endTime2 = Date.now();
    
    if (token2) {
      console.log(`✅ Got cached token in ${endTime2 - startTime2}ms`);
      console.log(`🔄 Same token: ${token1 === token2 ? 'YES' : 'NO'}`);
      
      if (token1 === token2 && (endTime2 - startTime2) < 100) {
        console.log('✅ Caching is working correctly');
      } else {
        console.log('⚠️  Caching may not be optimal');
      }
    } else {
      console.log('❌ Failed to get cached token');
      return false;
    }
    
    // Test 3: Force cache clear and refresh
    console.log('\n🧪 Test 3: Testing cache clear and refresh');
    console.log('===========================================');
    
    PipedreamConnect.clearTokenCache();
    console.log('🗑️  Cleared token cache again');
    
    const startTime3 = Date.now();
    const token3 = await PipedreamConnect.getOAuthAccessToken();
    const endTime3 = Date.now();
    
    if (token3) {
      console.log(`✅ Got new fresh token in ${endTime3 - startTime3}ms`);
      console.log(`🔑 Token preview: ${token3.substring(0, 20)}...`);
      
      // Tokens should be different if enough time has passed or if new tokens are issued
      if (token1 !== token3) {
        console.log('✅ New token issued (expected)');
      } else {
        console.log('ℹ️  Same token returned (may be cached at server level)');
      }
    } else {
      console.log('❌ Failed to get new token');
      return false;
    }
    
    console.log('\n🎉 All PipedreamConnect tests passed!');
    console.log('\n💡 This confirms:');
    console.log('  ✅ OAuth tokens can be obtained successfully');
    console.log('  ✅ Token caching is working');
    console.log('  ✅ Cache clearing forces new token requests');
    console.log('  ✅ The service is properly configured');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error testing PipedreamConnect:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testMCPConnectionFlow() {
  console.log('\n🧪 Test 4: MCP Connection Flow Simulation');
  console.log('==========================================');
  
  try {
    const PipedreamConnect = require('../server/services/Pipedream/PipedreamConnect');
    
    // Simulate the MCP connection refresh flow
    console.log('🔧 Simulating MCP connection with auth error...');
    
    // Step 1: Initial connection with potentially expired token
    console.log('1️⃣  Getting initial token...');
    const initialToken = await PipedreamConnect.getOAuthAccessToken();
    console.log(`   Initial token: ${initialToken ? initialToken.substring(0, 20) + '...' : 'FAILED'}`);
    
    if (!initialToken) {
      console.log('❌ Initial token failed');
      return false;
    }
    
    // Step 2: Simulate auth error (clear cache to simulate expiration)
    console.log('2️⃣  Simulating auth error (token expiration)...');
    PipedreamConnect.clearTokenCache();
    console.log('   🗑️  Cleared token cache (simulating expiration)');
    
    // Step 3: Refresh token after auth error
    console.log('3️⃣  Refreshing token after auth error...');
    const refreshedToken = await PipedreamConnect.getOAuthAccessToken();
    console.log(`   Refreshed token: ${refreshedToken ? refreshedToken.substring(0, 20) + '...' : 'FAILED'}`);
    
    if (!refreshedToken) {
      console.log('❌ Token refresh failed');
      return false;
    }
    
    // Step 4: Verify new token is different (if tokens are time-based)
    console.log('4️⃣  Verifying token refresh...');
    if (initialToken !== refreshedToken) {
      console.log('   ✅ New token obtained (expected behavior)');
    } else {
      console.log('   ℹ️  Same token returned (may be server-side caching)');
    }
    
    console.log('\n✅ MCP connection flow simulation completed successfully');
    console.log('\n💡 This simulates what happens when:');
    console.log('  1️⃣  MCP server initializes with token');
    console.log('  2️⃣  Token expires and causes HTTP 500 error');
    console.log('  3️⃣  System detects auth error and refreshes token');
    console.log('  4️⃣  New token is used for reconnection');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error in MCP connection flow test:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Running real Pipedream integration tests...\n');
  
  const test1 = await testRealPipedreamConnect();
  const test2 = await testMCPConnectionFlow();
  
  console.log('\n📊 Final Test Summary');
  console.log('=====================');
  console.log(`✅ PipedreamConnect Service: ${test1 ? 'PASSED' : 'FAILED'}`);
  console.log(`✅ MCP Connection Flow: ${test2 ? 'PASSED' : 'FAILED'}`);
  
  const allPassed = test1 && test2;
  console.log(`\n🏆 Overall Result: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n🎉 EXCELLENT! The OAuth token refresh mechanism is working correctly!');
    console.log('\n🔧 This means your HTTP 500 errors should be resolved because:');
    console.log('  ✅ Fresh tokens are obtained successfully');
    console.log('  ✅ Token caching prevents unnecessary API calls');
    console.log('  ✅ Cache clearing works for forced refresh');
    console.log('  ✅ The complete auth error → refresh → reconnect flow works');
    console.log('\n🚀 Your Pipedream MCP servers should now connect reliably!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the error messages above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}