#!/usr/bin/env node

/**
 * Run OAuth Token Refresh Tests
 * 
 * This script runs the OAuth token refresh tests and provides a summary.
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Running OAuth Token Refresh Tests');
console.log('=====================================\n');

const testCommands = [
  {
    name: 'Jest Test Suite',
    command: 'npm test -- mcp-oauth-refresh.test.js',
    description: 'Unit tests for OAuth token refresh mechanism'
  },
  {
    name: 'Token Simulation Tests',
    command: 'node api/test/simulate-token-expiration.js',
    description: 'Integration tests simulating various token scenarios'
  }
];

let passedTests = 0;
let totalTests = testCommands.length;

for (const test of testCommands) {
  console.log(`\n📋 Running: ${test.name}`);
  console.log(`📝 Description: ${test.description}`);
  console.log(`💻 Command: ${test.command}\n`);
  
  try {
    const output = execSync(test.command, { 
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      stdio: 'inherit'
    });
    
    console.log(`✅ ${test.name} passed\n`);
    passedTests++;
    
  } catch (error) {
    console.error(`❌ ${test.name} failed:`);
    console.error(error.message);
    console.log('');
  }
}

console.log('\n📊 Test Summary');
console.log('===============');
console.log(`✅ Passed: ${passedTests}/${totalTests}`);
console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);

if (passedTests === totalTests) {
  console.log('\n🎉 All tests passed! OAuth token refresh mechanism is working correctly.');
  console.log('\n💡 What this means:');
  console.log('  - Tokens will be refreshed automatically when they expire');
  console.log('  - Authentication errors will trigger token refresh and reconnection');
  console.log('  - Network failures include retry logic with exponential backoff');
  console.log('  - Concurrent requests are handled safely with proper caching');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the issues above.');
  process.exit(1);
}