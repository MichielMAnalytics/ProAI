const axios = require('axios');
const { AvailableIntegration } = require('~/models');
const { logger } = require('~/config');

/**
 * PipedreamApps - Manages available integrations and app discovery
 *
 * This service handles:
 * - Fetching available apps from Pipedream API
 * - Caching integrations in database
 * - Background refresh of integration data
 * - App details and metadata retrieval
 *
 * CACHING STRATEGY:
 * - Fresh Cache (24h default): Return immediately, no API calls
 * - Stale Cache (7d default): Return immediately + background refresh
 * - Expired Cache (30d default): Force refresh from API
 */
class PipedreamApps {
  constructor() {
    this.baseURL = process.env.PIPEDREAM_API_BASE_URL || 'https://api.pipedream.com/v1';
    this.initializeScheduledRefresh();
  }

  /**
   * Check if the service is enabled
   */
  isEnabled() {
    return process.env.ENABLE_PIPEDREAM_INTEGRATION !== 'false';
  }

  /**
   * Get authentication token for API requests
   */
  async getAuthToken() {
    let authToken = process.env.PIPEDREAM_API_KEY;

    // If no API key, try OAuth with client credentials
    if (!authToken && process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET) {
      try {
        const tokenResponse = await axios.post(
          `${this.baseURL}/oauth/token`,
          {
            grant_type: 'client_credentials',
            client_id: process.env.PIPEDREAM_CLIENT_ID,
            client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
          },
          {
            headers: { 'Content-Type': 'application/json' },
          },
        );

        authToken = tokenResponse.data.access_token;
        logger.info('PipedreamApps: OAuth token obtained successfully');
      } catch (error) {
        logger.error('PipedreamApps: Failed to obtain OAuth token:', error.message);
        throw new Error('Failed to authenticate with Pipedream API');
      }
    }

    if (!authToken) {
      throw new Error('No authentication credentials available for Pipedream API');
    }

    return authToken;
  }

  /**
   * Get all available integrations with caching
   */
  async getAvailableIntegrations() {
    const startTime = Date.now();
    logger.info('PipedreamApps: Getting available integrations');

    if (!this.isEnabled()) {
      logger.warn('PipedreamApps: Service is disabled');
      return this.getMockIntegrations();
    }

    try {
      // Check cache first
      const cached = await AvailableIntegration.find({ isActive: true }).lean();

      if (cached && cached.length > 0) {
        const cacheAge =
          Date.now() - new Date(cached[0].updatedAt || cached[0].createdAt).getTime();
        const cacheAgeSeconds = Math.floor(cacheAge / 1000);

        // Cache duration settings (in seconds)
        const CACHE_FRESH_DURATION = parseInt(process.env.PIPEDREAM_CACHE_FRESH_DURATION) || 86400; // 24h
        const CACHE_STALE_DURATION = parseInt(process.env.PIPEDREAM_CACHE_STALE_DURATION) || 604800; // 7d
        const CACHE_MAX_AGE = parseInt(process.env.PIPEDREAM_CACHE_MAX_AGE) || 2592000; // 30d

        const isFresh = cacheAgeSeconds < CACHE_FRESH_DURATION;
        const isStale = cacheAgeSeconds > CACHE_STALE_DURATION;
        const isExpired = cacheAgeSeconds > CACHE_MAX_AGE;

        logger.info('PipedreamApps: Cache analysis', {
          ageHours: Math.floor(cacheAgeSeconds / 3600),
          isFresh,
          isStale,
          isExpired,
        });

        // If cache is fresh, return immediately
        if (isFresh) {
          logger.info(`PipedreamApps: Returning ${cached.length} fresh cached integrations`);
          return cached;
        }

        // If cache is expired, force refresh
        if (isExpired) {
          logger.info('PipedreamApps: Cache expired, forcing refresh');
        } else if (isStale) {
          // For stale cache, return cached data and refresh in background
          logger.info(
            'PipedreamApps: Cache stale, returning cached data and refreshing in background',
          );
          setImmediate(() => this.refreshCacheInBackground());
          return cached;
        }
      }

      // Fetch fresh data from API
      const integrations = await this.fetchFromAPI();

      if (integrations.length > 0) {
        await this.cacheIntegrations(integrations);
        logger.info(
          `PipedreamApps: Fetched and cached ${integrations.length} integrations in ${Date.now() - startTime}ms`,
        );
        return integrations;
      }

      // Fallback to cached data if API fails
      if (cached && cached.length > 0) {
        logger.warn('PipedreamApps: API failed, returning stale cached data');
        return cached;
      }

      // Final fallback to mock data
      logger.warn('PipedreamApps: No data available, returning mock integrations');
      return this.getMockIntegrations();
    } catch (error) {
      logger.error('PipedreamApps: Error getting available integrations:', error.message);

      // Try to return cached data as fallback
      try {
        const cached = await AvailableIntegration.find({ isActive: true }).lean();
        if (cached && cached.length > 0) {
          logger.info('PipedreamApps: Returning cached data as error fallback');
          return cached;
        }
      } catch (cacheError) {
        logger.error('PipedreamApps: Failed to retrieve cached data:', cacheError.message);
      }

      return this.getMockIntegrations();
    }
  }

  /**
   * Fetch integrations from Pipedream API with pagination
   */
  async fetchFromAPI() {
    logger.info('PipedreamApps: Fetching integrations from Pipedream API');

    try {
      const authToken = await this.getAuthToken();
      let allApps = [];
      let cursor = null;
      let page = 1;
      const limit = 100;
      const seenAppIds = new Set();

      while (true) {
        logger.info(`PipedreamApps: Fetching page ${page} (limit: ${limit})`);

        const params = { limit };
        if (cursor) params.after = cursor;

        const response = await axios.get(`${this.baseURL}/apps`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          params,
        });

        const { data, page_info } = response.data;

        if (data && Array.isArray(data)) {
          // Filter out duplicates
          const pageApps = data.filter((app) => {
            if (seenAppIds.has(app.id)) {
              return false;
            }
            seenAppIds.add(app.id);
            return true;
          });

          allApps = allApps.concat(pageApps);

          logger.info(
            `PipedreamApps: Page ${page} processed: ${pageApps.length} unique apps (${allApps.length} total)`,
          );

          // Check pagination
          if (!page_info?.end_cursor || data.length === 0 || pageApps.length === 0) {
            break;
          }

          cursor = page_info.end_cursor;
          page++;

          if (page > 100) break; // Safety limit
        } else {
          logger.warn(`PipedreamApps: Invalid response on page ${page}`);
          break;
        }
      }

      logger.info(`PipedreamApps: Fetched ${allApps.length} unique apps from ${page} pages`);

      // Transform to our integration format
      const integrations = allApps.map((app) => ({
        appSlug: app.name_slug || app.slug || app.id,
        appName: app.name,
        appDescription: app.description || `Connect with ${app.name}`,
        appIcon: app.img_src,
        appCategories: app.categories || [],
        appUrl: app.url || null,
        pipedreamAppId: app.id,
        authType: this.normalizeAuthType(app.auth_type),
        isActive: true,
        popularity: app.featured_weight || 0,
        lastUpdated: new Date(),
      }));

      return integrations;
    } catch (error) {
      logger.error('PipedreamApps: Failed to fetch from API:', error.message);
      throw error;
    }
  }

  /**
   * Normalize auth type from Pipedream to our format
   */
  normalizeAuthType(authType) {
    switch (authType) {
      case 'oauth':
        return 'oauth';
      case 'keys':
        return 'api_key';
      case 'basic':
        return 'basic';
      default:
        return 'oauth';
    }
  }

  /**
   * Cache integrations in database
   */
  async cacheIntegrations(integrations) {
    try {
      logger.info(`PipedreamApps: Caching ${integrations.length} integrations`);

      // Clear existing cache
      await AvailableIntegration.deleteMany({});

      // Insert new integrations in batches
      const batchSize = 50;
      for (let i = 0; i < integrations.length; i += batchSize) {
        const batch = integrations.slice(i, i + batchSize);
        await AvailableIntegration.insertMany(batch, { ordered: false });
      }

      logger.info(`PipedreamApps: Successfully cached ${integrations.length} integrations`);
    } catch (error) {
      logger.error('PipedreamApps: Failed to cache integrations:', error.message);
    }
  }

  /**
   * Refresh cache in background
   */
  async refreshCacheInBackground() {
    try {
      logger.info('PipedreamApps: Starting background cache refresh');
      const integrations = await this.fetchFromAPI();

      if (integrations.length > 0) {
        await this.cacheIntegrations(integrations);
        logger.info(
          `PipedreamApps: Background refresh completed: ${integrations.length} integrations`,
        );
      }
    } catch (error) {
      logger.error('PipedreamApps: Background refresh failed:', error.message);
    }
  }

  /**
   * Initialize scheduled cache refresh
   */
  initializeScheduledRefresh() {
    const REFRESH_INTERVAL = parseInt(process.env.PIPEDREAM_SCHEDULED_REFRESH_HOURS) || 12; // 12 hours
    const intervalMs = REFRESH_INTERVAL * 60 * 60 * 1000;

    logger.info(`PipedreamApps: Initializing scheduled refresh every ${REFRESH_INTERVAL} hours`);

    // Periodic refresh
    setInterval(() => {
      logger.info('PipedreamApps: Starting scheduled cache refresh');
      this.refreshCacheInBackground();
    }, intervalMs);

    // Initial refresh if cache is empty
    setTimeout(async () => {
      try {
        const cached = await AvailableIntegration.find({ isActive: true }).lean();
        if (!cached || cached.length === 0) {
          logger.info('PipedreamApps: No cache found, performing initial refresh');
          await this.refreshCacheInBackground();
        }
      } catch (error) {
        logger.error('PipedreamApps: Initial refresh failed:', error.message);
      }
    }, 30000); // 30 seconds delay
  }

  /**
   * Get app details by identifier
   */
  async getAppDetails(appIdentifier) {
    logger.info(`PipedreamApps: Getting app details for ${appIdentifier}`);

    try {
      // Check cache first
      const query = appIdentifier.startsWith('app_')
        ? { pipedreamAppId: appIdentifier, isActive: true }
        : { appSlug: appIdentifier, isActive: true };

      const cachedApp = await AvailableIntegration.findOne(query).lean();

      if (cachedApp) {
        logger.info(`PipedreamApps: Found cached app details for ${appIdentifier}`);
        return {
          id: cachedApp.pipedreamAppId,
          name_slug: cachedApp.appSlug,
          name: cachedApp.appName,
          auth_type: cachedApp.authType,
          description: cachedApp.appDescription,
          img_src: cachedApp.appIcon,
          categories: cachedApp.appCategories || [],
          isConnectable: true,
          hasActions: true,
          hasTriggers: false,
        };
      }

      // If not in cache, try API
      if (this.isEnabled()) {
        try {
          const authToken = await this.getAuthToken();
          const response = await axios.get(`${this.baseURL}/apps/${appIdentifier}`, {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.data?.data) {
            const appData = response.data.data;
            logger.info(`PipedreamApps: Fetched app details from API for ${appIdentifier}`);
            return {
              id: appData.id,
              name_slug: appData.name_slug,
              name: appData.name,
              auth_type: appData.auth_type,
              description: appData.description,
              img_src: appData.img_src,
              categories: appData.categories || [],
              isConnectable: true,
              hasActions: true,
              hasTriggers: false,
            };
          }
        } catch (apiError) {
          logger.warn(`PipedreamApps: API error for app ${appIdentifier}:`, apiError.message);
        }
      }

      // Fallback to mock data
      return this.getMockAppDetails(appIdentifier);
    } catch (error) {
      logger.error(`PipedreamApps: Error getting app details for ${appIdentifier}:`, error.message);
      return this.getMockAppDetails(appIdentifier);
    }
  }

  /**
   * Get mock integrations for development/testing
   */
  getMockIntegrations() {
    return [
      {
        appSlug: 'slack',
        appName: 'Slack',
        appDescription: 'Team communication and collaboration platform',
        appIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg',
        appCategories: ['Communication', 'Productivity'],
        appUrl: 'https://slack.com',
        pipedreamAppId: 'app_slack',
        authType: 'oauth',
        isActive: true,
        popularity: 100,
      },
      {
        appSlug: 'github',
        appName: 'GitHub',
        appDescription: 'Code hosting and version control platform',
        appIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg',
        appCategories: ['Developer Tools', 'Code Management'],
        appUrl: 'https://github.com',
        pipedreamAppId: 'app_github',
        authType: 'oauth',
        isActive: true,
        popularity: 95,
      },
      {
        appSlug: 'google_sheets',
        appName: 'Google Sheets',
        appDescription: 'Create, edit, and share spreadsheets',
        appIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlesheets.svg',
        appCategories: ['Productivity', 'Spreadsheets'],
        appUrl: 'https://sheets.google.com',
        pipedreamAppId: 'app_google_sheets',
        authType: 'oauth',
        isActive: true,
        popularity: 90,
      },
      {
        appSlug: 'notion',
        appName: 'Notion',
        appDescription: 'All-in-one workspace for notes, docs, and collaboration',
        appIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/notion.svg',
        appCategories: ['Productivity', 'Documentation'],
        appUrl: 'https://notion.so',
        pipedreamAppId: 'app_notion',
        authType: 'oauth',
        isActive: true,
        popularity: 85,
      },
    ];
  }

  /**
   * Get mock app details
   */
  getMockAppDetails(appSlug) {
    const mockApps = this.getMockIntegrations();
    const app = mockApps.find((a) => a.appSlug === appSlug || a.pipedreamAppId === appSlug);

    if (app) {
      return {
        id: app.pipedreamAppId,
        name_slug: app.appSlug,
        name: app.appName,
        auth_type: app.authType,
        description: app.appDescription,
        img_src: app.appIcon,
        categories: app.appCategories,
        isConnectable: true,
        hasActions: true,
        hasTriggers: false,
      };
    }

    return {
      id: `app_mock_${appSlug}`,
      name_slug: appSlug,
      name: appSlug.charAt(0).toUpperCase() + appSlug.slice(1).replace(/_/g, ' '),
      auth_type: 'oauth',
      description: `Mock integration for ${appSlug}`,
      img_src: `https://via.placeholder.com/64x64?text=${appSlug.charAt(0).toUpperCase()}`,
      categories: ['Development', 'Mock'],
      isConnectable: true,
      hasActions: true,
      hasTriggers: false,
    };
  }
}

module.exports = new PipedreamApps();
