// test/pipedream.test.js
const pipedreamService = require('../server/services/PipedreamService');
const AvailableIntegration = require('../models/AvailableIntegration');
const UserIntegration = require('../models/UserIntegration');

// Mock the Pipedream SDK
jest.mock('@pipedream/sdk', () => ({
  PipedreamApi: jest.fn().mockImplementation(() => ({
    getApps: jest.fn(),
    getAccounts: jest.fn(),
    createConnectToken: jest.fn(),
    deleteAccount: jest.fn(),
  })),
}));

// Mock the models
jest.mock('../models/AvailableIntegration');
jest.mock('../models/UserIntegration');

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock the logger module
jest.mock('../utils/logger', () => mockLogger);

describe('PipedreamService', () => {
  let mockClient;

  beforeAll(() => {
    // Set up environment variables for testing
    process.env.PIPEDREAM_ENABLED = 'true';
    process.env.PIPEDREAM_CLIENT_ID = 'test-client-id';
    process.env.PIPEDREAM_CLIENT_SECRET = 'test-client-secret';
    process.env.PIPEDREAM_PROJECT_ID = 'test-project-id';
    process.env.NODE_ENV = 'development';
  });

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Get the mocked client
    mockClient = pipedreamService.client;
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.PIPEDREAM_ENABLED;
    delete process.env.PIPEDREAM_CLIENT_ID;
    delete process.env.PIPEDREAM_CLIENT_SECRET;
    delete process.env.PIPEDREAM_PROJECT_ID;
  });

  describe('Service Initialization', () => {
    test('should be enabled with valid credentials', () => {
      expect(pipedreamService.isEnabled()).toBe(true);
      expect(mockClient).toBeDefined();
    });
  });

  describe('getAvailableIntegrations', () => {
    test('should return cached integrations when cache is fresh', async () => {
      const mockCachedIntegrations = [
        {
          appSlug: 'slack',
          appName: 'Slack',
          isActive: true,
          lastUpdated: new Date(),
        },
      ];

      AvailableIntegration.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockCachedIntegrations),
        }),
      });

      const result = await pipedreamService.getAvailableIntegrations();

      expect(result).toEqual(mockCachedIntegrations);
      expect(mockClient.getApps).not.toHaveBeenCalled();
    });

    test('should fetch from API when cache is stale', async () => {
      const mockOldCachedIntegrations = [
        {
          appSlug: 'slack',
          appName: 'Slack',
          isActive: true,
          lastUpdated: new Date(Date.now() - 7200000), // 2 hours ago
        },
      ];

      const mockApiResponse = [
        {
          id: 'slack',
          slug: 'slack',
          name: 'Slack',
          description: 'Team communication platform',
          icon_url: 'https://example.com/slack.png',
          categories: ['Communication'],
          url: 'https://slack.com',
          auth_type: 'oauth',
          popularity: 100,
        },
        {
          id: 'github',
          slug: 'github',
          name: 'GitHub',
          description: 'Code hosting platform',
          icon_url: 'https://example.com/github.png',
          categories: ['Developer Tools'],
          url: 'https://github.com',
          auth_type: 'oauth',
          popularity: 95,
        },
      ];

      const mockUpdatedIntegrations = [
        {
          appSlug: 'slack',
          appName: 'Slack',
          isActive: true,
          lastUpdated: new Date(),
        },
        {
          appSlug: 'github',
          appName: 'GitHub',
          isActive: true,
          lastUpdated: new Date(),
        },
      ];

      // Mock first call returns stale cache
      AvailableIntegration.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockOldCachedIntegrations),
        }),
      });

      // Mock second call returns updated cache
      AvailableIntegration.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockUpdatedIntegrations),
        }),
      });

      // Mock API response
      mockClient.getApps.mockResolvedValue(mockApiResponse);

      // Mock bulkWrite
      AvailableIntegration.bulkWrite.mockResolvedValue({});

      const result = await pipedreamService.getAvailableIntegrations();

      expect(mockClient.getApps).toHaveBeenCalled();
      expect(AvailableIntegration.bulkWrite).toHaveBeenCalled();
      expect(result).toEqual(mockUpdatedIntegrations);
    });

    test('should handle API response in different formats', async () => {
      const mockApps = [
        {
          id: 'slack',
          slug: 'slack',
          name: 'Slack',
          description: 'Team communication platform',
        },
      ];

      // Test different response formats
      const testCases = [
        mockApps, // Direct array
        { data: mockApps }, // Wrapped in data property
        { apps: mockApps }, // Wrapped in apps property
      ];

      for (const responseFormat of testCases) {
        // Reset mocks
        jest.clearAllMocks();

        // Mock stale cache
        AvailableIntegration.find.mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        });

        mockClient.getApps.mockResolvedValue(responseFormat);
        AvailableIntegration.bulkWrite.mockResolvedValue({});

        await pipedreamService.getAvailableIntegrations();

        expect(AvailableIntegration.bulkWrite).toHaveBeenCalled();
      }
    });

    test('should handle API errors gracefully', async () => {
      // Mock empty cache
      AvailableIntegration.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      // Mock API error
      mockClient.getApps.mockRejectedValue(new Error('API Error'));

      const result = await pipedreamService.getAvailableIntegrations();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch apps from Pipedream API:',
        expect.any(Error),
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Using mock integration data for development');
      expect(result).toEqual([]);
    });

    test('should use mock data in development when API fails', async () => {
      // Mock empty cache
      AvailableIntegration.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      // Mock API error
      mockClient.getApps.mockRejectedValue(new Error('API Error'));
      AvailableIntegration.bulkWrite.mockResolvedValue({});

      const result = await pipedreamService.getAvailableIntegrations();

      expect(mockLogger.info).toHaveBeenCalledWith('Using mock integration data for development');
      expect(AvailableIntegration.bulkWrite).toHaveBeenCalled();
    });

    test('should handle unexpected API response format', async () => {
      // Mock empty cache
      AvailableIntegration.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      // Mock unexpected response format
      mockClient.getApps.mockResolvedValue('unexpected string response');

      const result = await pipedreamService.getAvailableIntegrations();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Pipedream API returned unexpected format:',
        'string',
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateAvailableIntegrations', () => {
    test('should update integrations with valid app data', async () => {
      const mockApps = [
        {
          id: 'slack',
          slug: 'slack',
          name: 'Slack',
          description: 'Team communication platform',
          icon_url: 'https://example.com/slack.png',
          categories: ['Communication'],
          url: 'https://slack.com',
          auth_type: 'oauth',
          popularity: 100,
        },
      ];

      AvailableIntegration.bulkWrite.mockResolvedValue({});

      await pipedreamService.updateAvailableIntegrations(mockApps);

      expect(AvailableIntegration.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { appSlug: 'slack' },
            update: {
              appSlug: 'slack',
              appName: 'Slack',
              appDescription: 'Team communication platform',
              appIcon: 'https://example.com/slack.png',
              appCategories: ['Communication'],
              appUrl: 'https://slack.com',
              pipedreamAppId: 'slack',
              authType: 'oauth',
              isActive: true,
              popularity: 100,
              lastUpdated: expect.any(Date),
            },
            upsert: true,
          },
        },
      ]);
    });

    test('should handle non-array input gracefully', async () => {
      await pipedreamService.updateAvailableIntegrations('not an array');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'updateAvailableIntegrations called with non-array:',
        'string',
      );
      expect(AvailableIntegration.bulkWrite).not.toHaveBeenCalled();
    });

    test('should handle empty array input', async () => {
      await pipedreamService.updateAvailableIntegrations([]);

      expect(mockLogger.info).toHaveBeenCalledWith('No apps to update');
      expect(AvailableIntegration.bulkWrite).not.toHaveBeenCalled();
    });

    test('should handle database errors', async () => {
      const mockApps = [
        {
          id: 'slack',
          slug: 'slack',
          name: 'Slack',
        },
      ];

      AvailableIntegration.bulkWrite.mockRejectedValue(new Error('Database error'));

      await expect(pipedreamService.updateAvailableIntegrations(mockApps)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('createConnectToken', () => {
    test('should create connect token successfully', async () => {
      const mockResponse = {
        token: 'test-token',
        expires_at: '2024-01-01T00:00:00Z',
        connect_link_url: 'https://connect.pipedream.com/test',
      };

      mockClient.createConnectToken.mockResolvedValue(mockResponse);

      const result = await pipedreamService.createConnectToken('user123', {
        app: 'slack',
      });

      expect(mockClient.createConnectToken).toHaveBeenCalledWith({
        external_user_id: 'user123',
        app: 'slack',
      });
      expect(result).toEqual(mockResponse);
    });

    test('should handle API errors', async () => {
      mockClient.createConnectToken.mockRejectedValue(new Error('API Error'));

      await expect(pipedreamService.createConnectToken('user123')).rejects.toThrow(
        'Failed to create connect token',
      );
    });
  });

  describe('getUserIntegrations', () => {
    test('should return user integrations successfully', async () => {
      const mockIntegrations = [
        {
          userId: 'user123',
          appSlug: 'slack',
          appName: 'Slack',
          isActive: true,
        },
      ];

      UserIntegration.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockIntegrations),
        }),
      });

      const result = await pipedreamService.getUserIntegrations('user123');

      expect(UserIntegration.find).toHaveBeenCalledWith({
        userId: 'user123',
        isActive: true,
      });
      expect(result).toEqual(mockIntegrations);
    });

    test('should handle database errors', async () => {
      UserIntegration.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      await expect(pipedreamService.getUserIntegrations('user123')).rejects.toThrow(
        'Failed to retrieve user integrations',
      );
    });
  });

  describe('Mock Data Generation', () => {
    test('should return valid mock integrations', () => {
      const mockIntegrations = pipedreamService.getMockIntegrations();

      expect(Array.isArray(mockIntegrations)).toBe(true);
      expect(mockIntegrations.length).toBeGreaterThan(0);

      // Check structure of first mock integration
      const firstIntegration = mockIntegrations[0];
      expect(firstIntegration).toHaveProperty('id');
      expect(firstIntegration).toHaveProperty('slug');
      expect(firstIntegration).toHaveProperty('name');
      expect(firstIntegration).toHaveProperty('description');
      expect(firstIntegration).toHaveProperty('icon_url');
      expect(firstIntegration).toHaveProperty('categories');
      expect(firstIntegration).toHaveProperty('url');
      expect(firstIntegration).toHaveProperty('auth_type');
      expect(firstIntegration).toHaveProperty('popularity');

      // Verify categories is an array
      expect(Array.isArray(firstIntegration.categories)).toBe(true);
    });
  });

  describe('Service Status', () => {
    test('should return correct status when enabled', () => {
      expect(pipedreamService.isEnabled()).toBe(true);
    });
  });
});
