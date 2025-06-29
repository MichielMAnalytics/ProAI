/**
 * Pipedream Connect End-to-End Integration Test
 *
 * This test follows the official Pipedream Connect quickstart guide:
 * https://pipedream.com/docs/connect/managed-auth/quickstart/
 *
 * Test Flow:
 * 1. Generate a connect token from server (backend)
 * 2. Simulate frontend account connection flow
 * 3. Handle successful connection callback
 * 4. Verify integration is saved and accessible
 * 5. Test MCP configuration generation
 * 6. Test integration management (disconnect)
 */

// Load environment variables from .env file
require('dotenv').config({ path: '../.env' });

const { createBackendClient } = require('@pipedream/sdk/server');
const {
  PipedreamConnect,
  PipedreamApps,
  PipedreamUserIntegrations,
  PipedreamComponents,
} = require('../server/services/Pipedream');
const { UserIntegration, AvailableIntegration } = require('../models');
const { nanoid } = require('nanoid');

// Test configuration
const TEST_CONFIG = {
  // Use a unique test user ID for each test run
  testUserId: `test-user-${nanoid()}`,
  testApp: 'google_sheets', // Popular app for testing
  testTimeout: 60000, // 60 seconds for API calls
};

describe('Pipedream Connect End-to-End Integration', () => {
  let testClient;
  let connectToken;
  let connectLinkUrl;
  let testUserIntegration;

  beforeAll(async () => {
    console.log('=== Pipedream E2E Test Setup ===');
    console.log('Test User ID:', TEST_CONFIG.testUserId);
    console.log('Test App:', TEST_CONFIG.testApp);
    console.log('Environment:', process.env.NODE_ENV || 'development');

    // Verify environment variables
    const requiredEnvVars = [
      'PIPEDREAM_CLIENT_ID',
      'PIPEDREAM_CLIENT_SECRET',
      'PIPEDREAM_PROJECT_ID',
    ];

    console.log('\n=== Environment Variables Check ===');
    requiredEnvVars.forEach((envVar) => {
      const isSet = !!process.env[envVar];
      console.log(`${envVar}: ${isSet ? '✓ Set' : '❌ Missing'}`);
      if (!isSet) {
        throw new Error(`Required environment variable ${envVar} is not set`);
      }
    });

    console.log('ENABLE_PIPEDREAM_INTEGRATION:', process.env.ENABLE_PIPEDREAM_INTEGRATION);
    console.log(
      'PIPEDREAM_API_BASE_URL:',
      process.env.PIPEDREAM_API_BASE_URL || 'Not set (will use default)',
    );

    // Initialize test client directly using Pipedream SDK
    try {
      testClient = createBackendClient({
        environment: 'development', // Always use development for testing
        credentials: {
          clientId: process.env.PIPEDREAM_CLIENT_ID,
          clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
        },
        projectId: process.env.PIPEDREAM_PROJECT_ID,
      });

      console.log('\n✓ Test client initialized successfully');
      console.log('Client type:', typeof testClient);
      console.log(
        'Available methods:',
        Object.getOwnPropertyNames(testClient).filter(
          (name) => typeof testClient[name] === 'function',
        ),
      );
    } catch (error) {
      console.error('❌ Failed to initialize test client:', error);
      throw error;
    }
  }, TEST_CONFIG.testTimeout);

  afterAll(async () => {
    console.log('\n=== Test Cleanup ===');

    // Clean up test user integrations
    try {
      if (testUserIntegration) {
        await UserIntegration.deleteMany({ userId: TEST_CONFIG.testUserId });
        console.log('✓ Cleaned up test user integrations');
      }
    } catch (error) {
      console.warn('⚠ Failed to clean up test data:', error.message);
    }
  });

  describe('Step 1: Generate Connect Token (Backend)', () => {
    test(
      'should create a connect token using PipedreamConnect service',
      async () => {
        console.log('\n=== Step 1: Creating Connect Token ===');

        try {
          // Test the service method
          const tokenData = await PipedreamConnect.createConnectToken(TEST_CONFIG.testUserId, {
            app: TEST_CONFIG.testApp,
            redirect_url: `${process.env.DOMAIN_SERVER || 'http://localhost:3080'}/d/integrations`,
          });

          console.log('Token creation response:', {
            hasToken: !!tokenData.token,
            hasConnectUrl: !!tokenData.connect_link_url,
            expiresAt: tokenData.expires_at,
            tokenLength: tokenData.token?.length || 0,
          });

          expect(tokenData).toBeDefined();
          expect(tokenData.token).toBeDefined();
          expect(tokenData.connect_link_url).toBeDefined();
          expect(tokenData.expires_at).toBeDefined();

          // Store for next tests
          connectToken = tokenData.token;
          connectLinkUrl = tokenData.connect_link_url;

          console.log('✓ Connect token created successfully');
          console.log('Connect URL:', connectLinkUrl);
        } catch (error) {
          console.error('❌ Failed to create connect token:', error);
          throw error;
        }
      },
      TEST_CONFIG.testTimeout,
    );

    test(
      'should create connect token directly using SDK client',
      async () => {
        console.log('\n=== Step 1b: Direct SDK Token Creation ===');

        try {
          const { token, expires_at, connect_link_url } = await testClient.createConnectToken({
            external_user_id: TEST_CONFIG.testUserId,
            app: TEST_CONFIG.testApp,
          });

          console.log('Direct SDK token response:', {
            hasToken: !!token,
            hasConnectUrl: !!connect_link_url,
            expiresAt: expires_at,
            tokenLength: token?.length || 0,
          });

          expect(token).toBeDefined();
          expect(connect_link_url).toBeDefined();
          expect(expires_at).toBeDefined();

          // Verify token format (should be a JWT-like string)
          expect(token).toMatch(/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/);

          console.log('✓ Direct SDK token creation successful');
        } catch (error) {
          console.error('❌ Direct SDK token creation failed:', error);
          console.error('Error details:', {
            message: error.message,
            status: error.status,
            response: error.response?.data,
          });
          throw error;
        }
      },
      TEST_CONFIG.testTimeout,
    );
  });

  describe('Step 2: Simulate Frontend Account Connection', () => {
    test('should validate connect token and URL format', () => {
      console.log('\n=== Step 2: Validating Connect Token ===');

      expect(connectToken).toBeDefined();
      expect(connectLinkUrl).toBeDefined();

      // Validate token format (JWT-like)
      expect(connectToken).toMatch(/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/);

      // Validate connect URL format
      expect(connectLinkUrl).toMatch(/^https:\/\/connect\.pipedream\.com/);

      console.log('Token format validation:', {
        tokenParts: connectToken.split('.').length,
        urlDomain: new URL(connectLinkUrl).hostname,
        urlPath: new URL(connectLinkUrl).pathname,
      });

      console.log('✓ Token and URL format validation passed');
    });

    test(
      'should simulate successful account connection',
      async () => {
        console.log('\n=== Step 2b: Simulating Account Connection ===');

        // In a real scenario, the user would:
        // 1. Click the connect button in frontend
        // 2. Be redirected to Pipedream Connect URL
        // 3. Authorize the app connection
        // 4. Be redirected back with success

        // For testing, we'll simulate the successful connection by:
        // 1. Creating a mock account response
        // 2. Testing our callback handler

        const mockAccountData = {
          id: `acc_${nanoid()}`,
          app: TEST_CONFIG.testApp,
          app_name: 'Google Sheets',
          app_description: 'Create, edit, and share spreadsheets',
          app_icon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlesheets.svg',
          auth_provision_id: `auth_${nanoid()}`,
          external_user_id: TEST_CONFIG.testUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log('Mock account data:', {
          accountId: mockAccountData.id,
          app: mockAccountData.app,
          appName: mockAccountData.app_name,
          userId: mockAccountData.external_user_id,
        });

        // Test creating user integration
        const integration = await PipedreamConnect.createUserIntegration(
          TEST_CONFIG.testUserId,
          mockAccountData,
        );

        expect(integration).toBeDefined();
        expect(integration.userId).toBe(TEST_CONFIG.testUserId);
        expect(integration.appSlug).toBe(TEST_CONFIG.testApp);
        expect(integration.pipedreamAccountId).toBe(mockAccountData.id);
        expect(integration.isActive).toBe(true);

        testUserIntegration = integration;

        console.log('✓ Account connection simulation successful');
        console.log('Integration created:', {
          id: integration._id,
          appSlug: integration.appSlug,
          appName: integration.appName,
          isActive: integration.isActive,
        });
      },
      TEST_CONFIG.testTimeout,
    );
  });

  describe('Step 3: Verify Integration Management', () => {
    test(
      'should retrieve user integrations',
      async () => {
        console.log('\n=== Step 3: Retrieving User Integrations ===');

        const integrations = await PipedreamUserIntegrations.getUserIntegrations(
          TEST_CONFIG.testUserId,
        );

        expect(integrations).toBeDefined();
        expect(Array.isArray(integrations)).toBe(true);
        expect(integrations.length).toBeGreaterThan(0);

        const testIntegration = integrations.find((int) => int.appSlug === TEST_CONFIG.testApp);
        expect(testIntegration).toBeDefined();
        expect(testIntegration.isActive).toBe(true);

        console.log('✓ User integrations retrieved successfully');
        console.log('Integration count:', integrations.length);
        console.log('Test integration found:', !!testIntegration);
      },
      TEST_CONFIG.testTimeout,
    );

    test(
      'should generate MCP configuration',
      async () => {
        console.log('\n=== Step 3b: Generating MCP Configuration ===');

        const mcpConfig = await PipedreamUserIntegrations.generateMCPConfig(TEST_CONFIG.testUserId);

        expect(mcpConfig).toBeDefined();
        expect(typeof mcpConfig).toBe('object');

        console.log('MCP config generated:', {
          serverCount: Object.keys(mcpConfig).length,
          servers: Object.keys(mcpConfig),
        });

        console.log('✓ MCP configuration generated successfully');
      },
      TEST_CONFIG.testTimeout,
    );
  });

  describe('Step 4: Test App Details and Components', () => {
    test(
      'should get app details',
      async () => {
        console.log('\n=== Step 4: Getting App Details ===');

        const appDetails = await PipedreamApps.getAppDetails(TEST_CONFIG.testApp);

        expect(appDetails).toBeDefined();
        expect(appDetails.name_slug || appDetails.appSlug).toBe(TEST_CONFIG.testApp);
        expect(appDetails.name || appDetails.appName).toBeDefined();

        console.log('App details:', {
          id: appDetails.id,
          slug: appDetails.name_slug || appDetails.appSlug,
          name: appDetails.name || appDetails.appName,
          authType: appDetails.auth_type || appDetails.authType,
          hasIcon: !!(appDetails.img_src || appDetails.appIcon),
        });

        console.log('✓ App details retrieved successfully');
      },
      TEST_CONFIG.testTimeout,
    );

    test(
      'should get app components (actions)',
      async () => {
        console.log('\n=== Step 4b: Getting App Components ===');

        const components = await PipedreamComponents.getAppComponents(
          TEST_CONFIG.testApp,
          'actions',
        );

        expect(components).toBeDefined();
        expect(components.actions).toBeDefined();
        expect(Array.isArray(components.actions)).toBe(true);

        console.log('App components:', {
          actionsCount: components.actions.length,
          triggersCount: components.triggers?.length || 0,
          sampleAction: components.actions[0]
            ? {
                name: components.actions[0].name,
                key: components.actions[0].key,
                hasProps: !!components.actions[0].configurable_props?.length,
              }
            : null,
        });

        console.log('✓ App components retrieved successfully');
      },
      TEST_CONFIG.testTimeout,
    );
  });

  describe('Step 5: Test Available Integrations', () => {
    test(
      'should get available integrations',
      async () => {
        console.log('\n=== Step 5: Getting Available Integrations ===');

        const integrations = await PipedreamApps.getAvailableIntegrations();

        expect(integrations).toBeDefined();
        expect(Array.isArray(integrations)).toBe(true);
        expect(integrations.length).toBeGreaterThan(0);

        // Find our test app in available integrations
        const testAppIntegration = integrations.find(
          (int) =>
            int.appSlug === TEST_CONFIG.testApp ||
            int.pipedreamAppId?.includes(TEST_CONFIG.testApp),
        );

        console.log('Available integrations:', {
          totalCount: integrations.length,
          testAppFound: !!testAppIntegration,
          sampleIntegrations: integrations.slice(0, 5).map((int) => ({
            slug: int.appSlug,
            name: int.appName,
            categories: int.appCategories?.slice(0, 2),
          })),
        });

        console.log('✓ Available integrations retrieved successfully');
      },
      TEST_CONFIG.testTimeout,
    );
  });

  describe('Step 6: Test Integration Cleanup', () => {
    test(
      'should disconnect integration',
      async () => {
        console.log('\n=== Step 6: Disconnecting Integration ===');

        expect(testUserIntegration).toBeDefined();

        const deletedIntegration = await PipedreamConnect.deleteUserIntegration(
          TEST_CONFIG.testUserId,
          testUserIntegration._id,
        );

        expect(deletedIntegration).toBeDefined();
        expect(deletedIntegration.appSlug).toBe(TEST_CONFIG.testApp);
        expect(deletedIntegration._id.toString()).toBe(testUserIntegration._id.toString());

        // Verify integration is completely removed from database
        const remainingIntegrations = await PipedreamUserIntegrations.getUserIntegrations(
          TEST_CONFIG.testUserId,
        );
        const testIntegrationStillExists = remainingIntegrations.find(
          (int) => int._id.toString() === testUserIntegration._id.toString(),
        );

        expect(testIntegrationStillExists).toBeUndefined();

        console.log('✓ Integration deleted completely from database');
        console.log('Remaining integrations:', remainingIntegrations.length);
      },
      TEST_CONFIG.testTimeout,
    );
  });

  describe('Step 7: Service Health Check', () => {
    test('should verify service is enabled and configured', () => {
      console.log('\n=== Step 7: Service Health Check ===');

      const isEnabled = PipedreamConnect.isEnabled();
      const isConfigured = PipedreamConnect.isClientConfigured();

      expect(isEnabled).toBe(true);
      expect(isConfigured).toBe(true);

      console.log('Service health:', {
        enabled: isEnabled,
        configured: isConfigured,
        hasClient: !!PipedreamConnect.getClient(),
        environment: process.env.NODE_ENV || 'development',
      });

      console.log('✓ Service health check passed');
    });

    test('should validate environment configuration', () => {
      console.log('\n=== Step 7b: Environment Validation ===');

      const config = {
        clientId: !!process.env.PIPEDREAM_CLIENT_ID,
        clientSecret: !!process.env.PIPEDREAM_CLIENT_SECRET,
        projectId: !!process.env.PIPEDREAM_PROJECT_ID,
        integrationEnabled: process.env.ENABLE_PIPEDREAM_INTEGRATION !== 'false',
        environment: process.env.NODE_ENV || 'development',
      };

      console.log('Environment configuration:', config);

      expect(config.clientId).toBe(true);
      expect(config.clientSecret).toBe(true);
      expect(config.projectId).toBe(true);
      expect(config.integrationEnabled).toBe(true);

      console.log('✓ Environment configuration validated');
    });
  });
});

/**
 * Manual Testing Instructions:
 *
 * To test the complete flow manually:
 *
 * 1. Run this test to verify backend functionality
 * 2. Start your LibreChat application
 * 3. Navigate to /d/integrations
 * 4. Click "Connect" on Google Sheets (or your test app)
 * 5. Complete the OAuth flow in the popup
 * 6. Verify the integration appears as connected
 * 7. Test disconnecting the integration
 *
 * Environment Setup:
 * Make sure your .env file contains:
 *
 * PIPEDREAM_CLIENT_ID=your_client_id
 * PIPEDREAM_CLIENT_SECRET=your_client_secret
 * PIPEDREAM_PROJECT_ID=your_project_id
 * ENABLE_PIPEDREAM_INTEGRATION=true
 * DOMAIN_SERVER=http://localhost:3080
 *
 * Development Mode:
 * The service automatically uses 'development' environment when NODE_ENV !== 'production'
 * This allows testing with up to 10 external users as per Pipedream documentation.
 */
