#!/usr/bin/env node

/**
 * Pipedream E2E Test Runner
 *
 * This script runs the Pipedream end-to-end integration test with proper environment setup.
 *
 * Usage:
 *   node api/test/run-pipedream-e2e.js
 *   npm run test -- api/test/pipedream-e2e.test.js
 */

const { spawn } = require('child_process');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

console.log('=== Pipedream E2E Test Runner ===');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Working directory:', process.cwd());

// Check required environment variables
const requiredEnvVars = ['PIPEDREAM_CLIENT_ID', 'PIPEDREAM_CLIENT_SECRET', 'PIPEDREAM_PROJECT_ID'];

console.log('\n=== Environment Variables Check ===');
let missingVars = [];

requiredEnvVars.forEach((envVar) => {
  const isSet = !!process.env[envVar];
  console.log(`${envVar}: ${isSet ? '✓ Set' : '❌ Missing'}`);
  if (!isSet) {
    missingVars.push(envVar);
  }
});

if (missingVars.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  missingVars.forEach((envVar) => {
    console.error(`  - ${envVar}`);
  });
  console.error('\nPlease add these to your .env file and try again.');
  process.exit(1);
}

console.log('\n=== Additional Configuration ===');
console.log(
  'ENABLE_PIPEDREAM_INTEGRATION:',
  process.env.ENABLE_PIPEDREAM_INTEGRATION || 'not set (will default to enabled)',
);
console.log(
  'PIPEDREAM_API_BASE_URL:',
  process.env.PIPEDREAM_API_BASE_URL || 'not set (will use default)',
);
console.log(
  'PIPEDREAM_CONNECT_REDIRECT_URI:',
  process.env.PIPEDREAM_CONNECT_REDIRECT_URI || 'not set (will use default)',
);

console.log('\n=== Running Pipedream E2E Test ===');

// Run the test using Jest
const testFile = path.join(__dirname, 'pipedream-e2e.test.js');
const jestArgs = [
  '--testPathPattern=pipedream-e2e.test.js',
  '--verbose',
  '--detectOpenHandles',
  '--forceExit',
  '--runInBand', // Run tests serially to avoid conflicts
];

const jest = spawn('npx', ['jest', ...jestArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    FORCE_COLOR: '1', // Enable colored output
  },
});

jest.on('close', (code) => {
  console.log(`\n=== Test completed with exit code: ${code} ===`);

  if (code === 0) {
    console.log('✅ All tests passed!');
    console.log('\nNext steps:');
    console.log('1. Start your LibreChat application');
    console.log('2. Navigate to /d/integrations');
    console.log('3. Test the integration flow manually');
  } else {
    console.log('❌ Some tests failed. Check the output above for details.');
  }

  process.exit(code);
});

jest.on('error', (error) => {
  console.error('❌ Failed to run test:', error);
  process.exit(1);
});
