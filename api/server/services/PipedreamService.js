const { createBackendClient } = require('@pipedream/sdk/server');
const { UserIntegration, AvailableIntegration } = require('~/models');
const { logger } = require('~/config');

/**
 * PipedreamService - Manages integration with Pipedream Connect API
 * 
 * CACHING STRATEGY & BEST PRACTICES:
 * 
 * 1. MULTI-TIER CACHE SYSTEM:
 *    - Fresh Cache (24h default): Return immediately, no API calls
 *    - Stale Cache (7d default): Return immediately + background refresh
 *    - Expired Cache (30d default): Force refresh from API
 * 
 * 2. FETCH TRIGGERS:
 *    - Initial server startup (if no cache exists)
 *    - Scheduled background refresh (every 12h default)
 *    - Cache expiration (forced refresh)
 *    - Manual admin refresh (future feature)
 * 
 * 3. PERFORMANCE OPTIMIZATIONS:
 *    - Pagination to fetch ALL integrations (not limited to 1000)
 *    - Background refresh for stale cache (non-blocking)
 *    - Graceful fallback to cached data on API failures
 *    - Mock data fallback for development/testing
 * 
 * 4. ENVIRONMENT VARIABLES:
 *    - PIPEDREAM_CACHE_FRESH_DURATION: Fresh cache duration in seconds (default: 86400 = 24h)
 *    - PIPEDREAM_CACHE_STALE_DURATION: Stale threshold in seconds (default: 604800 = 7d)
 *    - PIPEDREAM_CACHE_MAX_AGE: Maximum cache age in seconds (default: 2592000 = 30d)
 *    - PIPEDREAM_SCHEDULED_REFRESH_HOURS: Scheduled refresh interval in hours (default: 12h)
 * 
 * 5. RATIONALE:
 *    - Available integrations change infrequently (new apps added monthly/quarterly)
 *    - User experience prioritized with immediate responses
 *    - API rate limiting considerations
 *    - Resilience against API downtime
 *    - Development environment support with mock data
 */
class PipedreamService {
  constructor() {
    this.client = null;
    this.initializeClient();
    
    // Initialize scheduled refresh system
    this.initializeScheduledRefresh();
  }

  initializeClient() {
    if (!this.isClientConfigured()) {
      logger.info('Pipedream client configuration incomplete');
      return;
    }

    try {
      // Use the correct Pipedream SDK initialization based on official documentation
      const { createBackendClient } = require('@pipedream/sdk/server');
      
      this.client = createBackendClient({
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        credentials: {
          clientId: process.env.PIPEDREAM_CLIENT_ID,
          clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
        },
        projectId: process.env.PIPEDREAM_PROJECT_ID,
      });

      logger.info('Pipedream client initialized successfully');
      logger.info('Client type:', typeof this.client);
      logger.info('Client methods available:', Object.keys(this.client || {}));
    } catch (error) {
      logger.error('Failed to initialize Pipedream client:', error.message);
      logger.error('Error stack:', error.stack);
      this.client = null;
    }
  }

  isClientConfigured() {
    const hasRequiredEnvVars = !!(
      process.env.PIPEDREAM_CLIENT_ID && 
      process.env.PIPEDREAM_CLIENT_SECRET && 
      process.env.PIPEDREAM_PROJECT_ID
    );
    
    logger.info('Checking Pipedream client configuration:', {
      hasClientId: !!process.env.PIPEDREAM_CLIENT_ID,
      hasClientSecret: !!process.env.PIPEDREAM_CLIENT_SECRET,
      hasProjectId: !!process.env.PIPEDREAM_PROJECT_ID,
      enabledFlag: process.env.ENABLE_PIPEDREAM_INTEGRATION,
    });
    
    return hasRequiredEnvVars;
  }

  isEnabled() {
    // Check if we have Pipedream credentials
    const hasCredentials = !!(
      process.env.PIPEDREAM_CLIENT_ID && 
      process.env.PIPEDREAM_CLIENT_SECRET && 
      process.env.PIPEDREAM_PROJECT_ID
    );
    
    logger.info('=== PipedreamService.isEnabled: Debug info ===');
    logger.info(`Has credentials: ${hasCredentials}`);
    logger.info(`Client initialized: ${this.client !== null}`);
    logger.info(`ENABLE_PIPEDREAM_INTEGRATION: ${process.env.ENABLE_PIPEDREAM_INTEGRATION}`);
    
    // If explicitly disabled, return false
    if (process.env.ENABLE_PIPEDREAM_INTEGRATION === 'false') {
      logger.info('Service explicitly disabled via ENABLE_PIPEDREAM_INTEGRATION=false');
      return false;
    }
    
    // If we have credentials and client is initialized, we're fully enabled
    if (hasCredentials && this.client !== null) {
      logger.info('Service fully enabled: has credentials and client initialized');
      return true;
    }
    
    // If we don't have credentials but integration is not explicitly disabled,
    // allow the service to work with mock data (useful for development/testing)
    if (!hasCredentials && process.env.ENABLE_PIPEDREAM_INTEGRATION !== 'false') {
      logger.info('Pipedream credentials not found, but service will use mock data');
      return true;
    }
    
    // If we have credentials but client failed to initialize, still allow mock data
    if (hasCredentials && this.client === null && process.env.ENABLE_PIPEDREAM_INTEGRATION !== 'false') {
      logger.info('Pipedream credentials found but client failed to initialize, will use mock data');
      return true;
    }
    
    logger.info('Service disabled: no valid configuration found');
    return false;
  }

  /**
   * Create a Connect Token for a user to initiate account connection
   */
  async createConnectToken(userId, options = {}) {
    if (!this.isEnabled()) {
      throw new Error('Pipedream integration is not enabled');
    }

    try {
      const { token, expires_at, connect_link_url } = await this.client.createConnectToken({
        external_user_id: userId,
        ...options,
      });

      logger.info(`Created connect token for user ${userId}`);
      return { token, expires_at, connect_link_url };
    } catch (error) {
      logger.error('Failed to create connect token:', error);
      throw new Error('Failed to create connection token');
    }
  }

  /**
   * Get all available integrations from Pipedream
   */
  async getAvailableIntegrations() {
    const startTime = Date.now();
    logger.info('=== PipedreamService.getAvailableIntegrations: Starting ===');
    
    // Check if service is enabled
    const isServiceEnabled = this.isEnabled();
    logger.info(`Service enabled: ${isServiceEnabled}`);
    
    // Check if we have Pipedream credentials
    const hasCredentials = !!(
      process.env.PIPEDREAM_CLIENT_ID && 
      process.env.PIPEDREAM_CLIENT_SECRET && 
      process.env.PIPEDREAM_PROJECT_ID
    );
    logger.info(`Has Pipedream credentials: ${hasCredentials}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    
    if (!isServiceEnabled) {
      logger.warn('Pipedream service is not enabled');
      return [];
    }

    try {
      // Check cache first
      logger.info('Checking database cache for available integrations...');
      const cached = await AvailableIntegration.find({ isActive: true }).lean();
      
      if (cached && cached.length > 0) {
        logger.info(`Found ${cached.length} cached integrations in database`);
        
        // Check if cache is still fresh
        const cacheAge = Date.now() - new Date(cached[0].updatedAt || cached[0].createdAt).getTime();
        const cacheAgeSeconds = Math.floor(cacheAge / 1000);
        
        // Cache duration settings (in seconds)
        const CACHE_FRESH_DURATION = parseInt(process.env.PIPEDREAM_CACHE_FRESH_DURATION) || 86400; // 24 hours default
        const CACHE_STALE_DURATION = parseInt(process.env.PIPEDREAM_CACHE_STALE_DURATION) || 604800; // 7 days default
        const CACHE_MAX_AGE = parseInt(process.env.PIPEDREAM_CACHE_MAX_AGE) || 2592000; // 30 days default
        
        const isFresh = cacheAgeSeconds < CACHE_FRESH_DURATION;
        const isStale = cacheAgeSeconds > CACHE_STALE_DURATION;
        const isExpired = cacheAgeSeconds > CACHE_MAX_AGE;
        
        logger.info(`Cache analysis:`, {
          ageSeconds: cacheAgeSeconds,
          ageHours: Math.floor(cacheAgeSeconds / 3600),
          ageDays: Math.floor(cacheAgeSeconds / 86400),
          isFresh,
          isStale,
          isExpired,
          freshDurationHours: CACHE_FRESH_DURATION / 3600,
          staleDurationDays: CACHE_STALE_DURATION / 86400,
          maxAgeDays: CACHE_MAX_AGE / 86400
        });
        
        // If cache is fresh, return it immediately
        if (isFresh) {
          logger.info('Cache is fresh, returning cached data immediately');
          logger.info(`Returning ${cached.length} cached integrations in ${Date.now() - startTime}ms`);
          return cached;
        }
        
        // If cache is expired, we must refresh
        if (isExpired) {
          logger.info('Cache is expired, must refresh from API');
        } else if (isStale) {
          logger.info('Cache is stale but not expired, will try to refresh in background');
          
          // For stale cache, return cached data immediately and refresh in background
          // This provides better user experience with immediate response
          setImmediate(async () => {
            try {
              logger.info('Background refresh: Starting background cache refresh...');
              await this.refreshCacheInBackground();
            } catch (error) {
              logger.error('Background refresh failed:', error);
            }
          });
          
          logger.info(`Returning ${cached.length} stale cached integrations in ${Date.now() - startTime}ms (background refresh initiated)`);
          return cached;
        }
      } else {
        logger.info('No cached integrations found, will fetch from Pipedream API');
      }

      // If we have a working client, try to fetch from Pipedream API
      if (this.client && hasCredentials) {
        logger.info('Attempting to fetch integrations from Pipedream API...');
        try {
          // Use the REST API directly for better pagination support
          const axios = require('axios');
          const baseURL = process.env.PIPEDREAM_API_BASE_URL;
          
          // For the REST API, we need to authenticate properly
          // The Pipedream API supports OAuth tokens or API keys
          let authToken = process.env.PIPEDREAM_API_KEY;
          
          // If no API key, we might need to use OAuth with client credentials
          if (!authToken && process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET) {
            try {
              logger.info('No API key found, attempting OAuth authentication...');
              const tokenResponse = await axios.post(`${baseURL}/oauth/token`, {
                grant_type: 'client_credentials',
                client_id: process.env.PIPEDREAM_CLIENT_ID,
                client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
              }, {
                headers: {
                  'Content-Type': 'application/json',
                },
              });
              
              authToken = tokenResponse.data.access_token;
              logger.info('Successfully obtained OAuth token');
            } catch (oauthError) {
              logger.error('Failed to obtain OAuth token:', oauthError.message);
              throw new Error('Failed to authenticate with Pipedream API');
            }
          }
          
          if (!authToken) {
            throw new Error('No authentication credentials available for Pipedream API');
          }

          let allApps = [];
          let cursor = null;
          let page = 1;
          const limit = 100;
          
          // Track unique app IDs to detect duplicates
          const seenAppIds = new Set();
          const duplicateStats = { total: 0, byPage: {} };

          while (true) {
            logger.info(`Fetching page ${page} of integrations (limit: ${limit}, cursor: ${cursor || 'none'})...`);
            
            try {
              const params = {
                limit: limit,
              };
              
              if (cursor) {
                params.after = cursor;
              }
              
              const response = await axios.get(`${baseURL}/apps`, {
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                  'Content-Type': 'application/json',
                },
                params: params,
              });
              
              const { data, page_info } = response.data;
              
              logger.info(`API Response:`, {
                pageNumber: page,
                dataLength: data?.length || 0,
                hasPageInfo: !!page_info,
                totalCount: page_info?.total_count,
                startCursor: page_info?.start_cursor,
                endCursor: page_info?.end_cursor,
                count: page_info?.count,
              });
              
              if (data && Array.isArray(data)) {
                // Process apps and check for duplicates
                let pageDuplicates = 0;
                const pageApps = [];
                
                data.forEach((app, index) => {
                  if (seenAppIds.has(app.id)) {
                    pageDuplicates++;
                    logger.warn(`Duplicate app found on page ${page}, index ${index}:`, {
                      id: app.id,
                      slug: app.name_slug,
                      name: app.name,
                    });
                  } else {
                    seenAppIds.add(app.id);
                    pageApps.push(app);
                  }
                });
                
                duplicateStats.byPage[page] = pageDuplicates;
                duplicateStats.total += pageDuplicates;
                
                allApps = allApps.concat(pageApps);
                
                logger.info(`Page ${page} processing complete:`, {
                  pageAppsReceived: data.length,
                  pageAppsKept: pageApps.length,
                  pageDuplicates: pageDuplicates,
                  totalAppsSoFar: allApps.length,
                  uniqueAppIdsSoFar: seenAppIds.size,
                });
                
                // Check if we should continue pagination
                if (!page_info?.end_cursor || data.length === 0) {
                  logger.info('No more pages available, stopping pagination');
                  break;
                }
                
                // If this page had all duplicates, something is wrong
                if (data.length > 0 && pageApps.length === 0) {
                  logger.warn(`Page ${page} contained only duplicates, stopping pagination`);
                  break;
                }
                
                cursor = page_info.end_cursor;
                page++;
                
                // Safety check
                if (page > 100) {
                  logger.warn('Reached maximum page limit (100), stopping pagination');
                  break;
                }
              } else {
                logger.warn(`Invalid response format on page ${page}`);
                break;
              }
            } catch (apiError) {
              logger.error(`Error fetching page ${page}:`, {
                message: apiError.message,
                response: apiError.response?.data,
                status: apiError.response?.status,
              });
              break;
            }
          }
          
          logger.info('Pipedream API pagination completed - FINAL STATS:', {
            totalApps: allApps.length,
            uniqueAppIds: seenAppIds.size,
            totalPages: page,
            duplicateStats: duplicateStats,
            firstFewApps: allApps.slice(0, 5).map(app => ({
              id: app.id,
              slug: app.name_slug,
              name: app.name,
            })),
            lastFewApps: allApps.slice(-5).map(app => ({
              id: app.id,
              slug: app.name_slug,
              name: app.name,
            })),
          });

          if (allApps.length > 0) {
            // Transform REST API response to our integration format
            const integrations = allApps.map(app => ({
              appSlug: app.name_slug || app.slug || app.id,
              appName: app.name,
              appDescription: app.description || `Connect with ${app.name}`,
              appIcon: app.img_src,
              appCategories: app.categories || [],
              appUrl: app.url || null,
              pipedreamAppId: app.id,
              authType: app.auth_type === 'oauth' ? 'oauth' : 
                       app.auth_type === 'keys' ? 'api_key' : 
                       app.auth_type === 'basic' ? 'basic' : 'oauth',
              isActive: true,
              popularity: app.featured_weight || 0,
              lastUpdated: new Date(),
            }));

            logger.info(`Transformed ${integrations.length} integrations from ${allApps.length} Pipedream apps`);
            
            // Check for duplicates in transformed integrations
            const slugCounts = {};
            integrations.forEach(int => {
              slugCounts[int.appSlug] = (slugCounts[int.appSlug] || 0) + 1;
            });
            const duplicateSlugs = Object.entries(slugCounts).filter(([_, count]) => count > 1);
            if (duplicateSlugs.length > 0) {
              logger.warn('Duplicate slugs found after transformation:', duplicateSlugs);
            }
            
            if (integrations.length > 0) {
              // Cache the new integrations
              await this.cacheAvailableIntegrations(integrations);
              logger.info(`Successfully fetched and cached ${integrations.length} integrations from Pipedream API in ${Date.now() - startTime}ms`);
              return integrations;
            }
          } else {
            logger.warn('Pipedream API returned no apps');
          }
        } catch (apiError) {
          logger.error('Failed to fetch from Pipedream API:', {
            message: apiError.message,
            status: apiError.status,
            code: apiError.code
          });
          
          // If we have cached data, return it even if stale
          if (cached && cached.length > 0) {
            logger.info('API failed, returning stale cached data');
            return cached;
          }
        }
      } else {
        logger.info('No working Pipedream client available, will use mock data');
      }

      // Fallback to mock data if API fails or client not available
      logger.info('Using mock integrations as fallback');
      const mockIntegrations = this.getMockIntegrations();
      
      // Cache mock data if we don't have any cached data
      if (!cached || cached.length === 0) {
        await this.cacheAvailableIntegrations(mockIntegrations);
        logger.info('Cached mock integrations for future use');
      }
      
      logger.info(`Returning ${mockIntegrations.length} mock integrations in ${Date.now() - startTime}ms`);
      return mockIntegrations;

    } catch (error) {
      logger.error('Error in getAvailableIntegrations:', error);
      
      // Try to return cached data as last resort
      try {
        const cached = await AvailableIntegration.find({ isActive: true }).lean();
        if (cached && cached.length > 0) {
          logger.info('Error occurred, returning cached data as fallback');
          return cached;
        }
      } catch (cacheError) {
        logger.error('Failed to retrieve cached data:', cacheError);
      }
      
      // Final fallback to mock data
      logger.info('All else failed, returning mock data');
      return this.getMockIntegrations();
    }
  }

  /**
   * Get mock integrations for development/testing
   */
  getMockIntegrations() {
    return [
      {
        id: 'slack',
        slug: 'slack',
        name: 'Slack',
        description: 'Team communication and collaboration platform',
        icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg',
        categories: ['Communication', 'Productivity'],
        url: 'https://slack.com',
        auth_type: 'oauth',
        popularity: 100,
      },
      {
        id: 'github',
        slug: 'github',
        name: 'GitHub',
        description: 'Code hosting and version control platform',
        icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg',
        categories: ['Developer Tools', 'Code Management'],
        url: 'https://github.com',
        auth_type: 'oauth',
        popularity: 95,
      },
      {
        id: 'notion',
        slug: 'notion',
        name: 'Notion',
        description: 'All-in-one workspace for notes, docs, and collaboration',
        icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/notion.svg',
        categories: ['Productivity', 'Documentation'],
        url: 'https://notion.so',
        auth_type: 'oauth',
        popularity: 90,
      },
      {
        id: 'google-drive',
        slug: 'google-drive',
        name: 'Google Drive',
        description: 'Cloud storage and file sharing service',
        icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googledrive.svg',
        categories: ['Storage', 'Productivity'],
        url: 'https://drive.google.com',
        auth_type: 'oauth',
        popularity: 85,
      },
      {
        id: 'trello',
        slug: 'trello',
        name: 'Trello',
        description: 'Visual project management and collaboration tool',
        icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/trello.svg',
        categories: ['Project Management', 'Productivity'],
        url: 'https://trello.com',
        auth_type: 'oauth',
        popularity: 80,
      },
    ];
  }

  /**
   * Get user's connected accounts
   */
  async getUserAccounts(userId) {
    if (!this.isEnabled()) {
      return [];
    }

    try {
      const accounts = await this.client.getAccounts({
        external_user_id: userId,
        include_credentials: 1,
      });

      return accounts;
    } catch (error) {
      logger.error(`Failed to get accounts for user ${userId}:`, error);
      throw new Error('Failed to retrieve user accounts');
    }
  }

  /**
   * Get user's integrations from our database
   */
  async getUserIntegrations(userId) {
    const startTime = Date.now();
    logger.info('=== PipedreamService.getUserIntegrations: Starting ===');
    logger.info(`User ID: ${userId}`);
    
    try {
      logger.info('Querying UserIntegration collection...');
      const result = await UserIntegration.find({ userId, isActive: true })
        .sort({ lastUsedAt: -1 })
        .lean();
      
      logger.info(`Found ${result.length} user integrations`);
      if (result.length > 0) {
        logger.info('User integrations details:', result.map(int => ({
          id: int._id,
          appSlug: int.appSlug,
          appName: int.appName,
          isActive: int.isActive,
          lastUsedAt: int.lastUsedAt,
          lastConnectedAt: int.lastConnectedAt
        })));
      }
      
      logger.info(`getUserIntegrations completed in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      logger.error('=== PipedreamService.getUserIntegrations: Error occurred ===');
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        userId
      });
      throw new Error('Failed to retrieve user integrations');
    }
  }

  /**
   * Create or update user integration after successful connection
   */
  async createUserIntegration(userId, accountData) {
    try {
      const integration = await UserIntegration.findOneAndUpdate(
        { 
          userId, 
          pipedreamAccountId: accountData.id 
        },
        {
          userId,
          pipedreamAccountId: accountData.id,
          appSlug: accountData.app,
          appName: accountData.app_name || accountData.app,
          appDescription: accountData.app_description,
          appIcon: accountData.app_icon,
          isActive: true,
          credentials: {
            authProvisionId: accountData.auth_provision_id,
          },
          lastConnectedAt: new Date(),
          lastUsedAt: new Date(),
        },
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true 
        }
      );

      logger.info(`Created/updated integration for user ${userId}, app ${accountData.app}`);
      return integration;
    } catch (error) {
      logger.error('Failed to create user integration:', error);
      throw new Error('Failed to save integration');
    }
  }

  /**
   * Delete user integration
   */
  async deleteUserIntegration(userId, integrationId) {
    try {
      const integration = await UserIntegration.findOneAndUpdate(
        { _id: integrationId, userId },
        { isActive: false },
        { new: true }
      );

      if (!integration) {
        throw new Error('Integration not found');
      }

      // Also revoke from Pipedream if needed
      try {
        await this.client.deleteAccount(integration.pipedreamAccountId);
      } catch (error) {
        logger.warn(`Failed to revoke Pipedream account ${integration.pipedreamAccountId}:`, error);
      }

      logger.info(`Deleted integration ${integrationId} for user ${userId}`);
      return integration;
    } catch (error) {
      logger.error('Failed to delete user integration:', error);
      throw error;
    }
  }

  /**
   * Update available integrations in database
   */
  async updateAvailableIntegrations(apps) {
    try {
      // Ensure apps is an array
      if (!Array.isArray(apps)) {
        logger.warn('updateAvailableIntegrations called with non-array:', typeof apps);
        return;
      }

      if (apps.length === 0) {
        logger.info('No apps to update');
        return;
      }

      const bulkOps = apps.map(app => ({
        updateOne: {
          filter: { appSlug: app.slug },
          update: {
            appSlug: app.slug,
            appName: app.name,
            appDescription: app.description,
            appIcon: app.icon_url,
            appCategories: app.categories || [],
            appUrl: app.url,
            pipedreamAppId: app.id,
            authType: app.auth_type || 'oauth',
            isActive: true,
            popularity: app.popularity || 0,
            lastUpdated: new Date(),
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        await AvailableIntegration.bulkWrite(bulkOps);
        logger.info(`Updated ${bulkOps.length} available integrations`);
      }
    } catch (error) {
      logger.error('Failed to update available integrations:', error);
      throw error;
    }
  }

  /**
   * Generate MCP server configuration for user's integrations
   */
  async generateMCPConfig(userId) {
    try {
      const integrations = await this.getUserIntegrations(userId);
      const mcpServers = {};

      for (const integration of integrations) {
        if (integration.mcpServerConfig) {
          mcpServers[integration.mcpServerConfig.serverName] = {
            type: integration.mcpServerConfig.type,
            url: integration.mcpServerConfig.url,
            command: integration.mcpServerConfig.command,
            args: integration.mcpServerConfig.args,
            timeout: integration.mcpServerConfig.timeout || 60000,
          };
        }
      }

      return mcpServers;
    } catch (error) {
      logger.error(`Failed to generate MCP config for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Cache available integrations in database
   */
  async cacheAvailableIntegrations(integrations) {
    try {
      logger.info(`=== cacheAvailableIntegrations: Starting ===`);
      logger.info(`Input: ${integrations.length} integrations to cache`);
      
      // Log distribution of integrations by various properties
      const stats = {
        totalInput: integrations.length,
        byAuthType: {},
        byCategoryCount: {},
        withoutSlug: 0,
        withoutName: 0,
        slugLengths: [],
      };
      
      integrations.forEach((int, index) => {
        // Track auth types
        stats.byAuthType[int.authType] = (stats.byAuthType[int.authType] || 0) + 1;
        
        // Track category counts
        const catCount = int.appCategories?.length || 0;
        stats.byCategoryCount[catCount] = (stats.byCategoryCount[catCount] || 0) + 1;
        
        // Track missing data
        if (!int.appSlug) {
          stats.withoutSlug++;
          logger.warn(`Integration at index ${index} missing appSlug:`, {
            appName: int.appName,
            pipedreamAppId: int.pipedreamAppId,
          });
        }
        if (!int.appName) {
          stats.withoutName++;
          logger.warn(`Integration at index ${index} missing appName:`, {
            appSlug: int.appSlug,
            pipedreamAppId: int.pipedreamAppId,
          });
        }
        
        // Track slug lengths
        if (int.appSlug) {
          stats.slugLengths.push(int.appSlug.length);
        }
      });
      
      stats.avgSlugLength = stats.slugLengths.length > 0 
        ? Math.round(stats.slugLengths.reduce((a, b) => a + b, 0) / stats.slugLengths.length)
        : 0;
      stats.maxSlugLength = Math.max(...stats.slugLengths, 0);
      stats.minSlugLength = Math.min(...stats.slugLengths, Infinity);
      
      logger.info('Integration statistics before deduplication:', stats);
      
      // Deduplicate integrations by appSlug (keep the first occurrence)
      const uniqueIntegrations = [];
      const seenSlugs = new Set();
      const duplicatedSlugs = [];
      
      for (const integration of integrations) {
        if (!seenSlugs.has(integration.appSlug)) {
          seenSlugs.add(integration.appSlug);
          uniqueIntegrations.push(integration);
        } else {
          duplicatedSlugs.push({
            appSlug: integration.appSlug,
            appName: integration.appName,
            pipedreamAppId: integration.pipedreamAppId,
          });
        }
      }
      
      logger.info(`Deduplication complete:`, {
        inputCount: integrations.length,
        uniqueCount: uniqueIntegrations.length,
        duplicatesRemoved: integrations.length - uniqueIntegrations.length,
        duplicatedSlugs: duplicatedSlugs.slice(0, 10), // Show first 10 duplicates
      });
      
      // Validate the first integration to check the structure
      if (uniqueIntegrations.length > 0) {
        const sample = uniqueIntegrations[0];
        logger.info('Sample integration structure:', {
          appSlug: sample.appSlug,
          appName: sample.appName,
          pipedreamAppId: sample.pipedreamAppId,
          authType: sample.authType,
          hasCategories: !!sample.appCategories,
          categoriesLength: sample.appCategories?.length || 0
        });
      }
      
      // Clear existing cache
      const deleteResult = await AvailableIntegration.deleteMany({});
      logger.info(`Cleared ${deleteResult.deletedCount} existing integrations from cache`);
      
      // Use bulk upsert operations to handle any remaining duplicates gracefully
      const batchSize = 50;
      let processedCount = 0;
      
      for (let i = 0; i < uniqueIntegrations.length; i += batchSize) {
        const batch = uniqueIntegrations.slice(i, i + batchSize);
        try {
          // Use bulkWrite with upsert operations
          const bulkOps = batch.map(integration => ({
            updateOne: {
              filter: { appSlug: integration.appSlug },
              update: { $set: integration },
              upsert: true
            }
          }));
          
          const result = await AvailableIntegration.bulkWrite(bulkOps, { ordered: false });
          processedCount += batch.length;
          
          logger.info(`Processed batch ${Math.floor(i/batchSize) + 1}: ${batch.length} integrations (${result.upsertedCount} new, ${result.modifiedCount} updated)`);
        } catch (batchError) {
          logger.error(`Error processing batch ${Math.floor(i/batchSize) + 1}:`, {
            message: batchError.message,
            code: batchError.code,
            writeErrors: batchError.writeErrors?.length || 0
          });
          
          // Log specific errors but continue processing
          if (batchError.writeErrors) {
            batchError.writeErrors.slice(0, 3).forEach((error, index) => {
              logger.error(`Write error ${index + 1}:`, {
                message: error.errmsg,
                appSlug: error.getOperation?.()?.q?.appSlug || 'Unknown'
              });
            });
          }
          
          // Still count as processed since we tried
          processedCount += batch.length;
        }
      }
      
      // Verify final count
      const finalCount = await AvailableIntegration.countDocuments({ isActive: true });
      logger.info(`Successfully cached ${processedCount}/${uniqueIntegrations.length} integrations in database (${finalCount} total in DB)`);
      
    } catch (error) {
      logger.error('Failed to cache integrations:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      });
      // Don't throw - this is just caching
    }
  }

  /**
   * Refresh cache in background without blocking the main request
   */
  async refreshCacheInBackground() {
    try {
      logger.info('Background refresh: Fetching fresh integrations from Pipedream API...');
      
      if (!this.client || !this.isClientConfigured()) {
        logger.warn('Background refresh: No working Pipedream client available');
        return;
      }

      // Use the REST API directly for better pagination support
      const axios = require('axios');
      const baseURL = process.env.PIPEDREAM_API_BASE_URL;
      
      // For the REST API, we need to authenticate properly
      // The Pipedream API supports OAuth tokens or API keys
      let authToken = process.env.PIPEDREAM_API_KEY;
      
      // If no API key, we might need to use OAuth with client credentials
      if (!authToken && process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET) {
        try {
          logger.info('No API key found, attempting OAuth authentication...');
          const tokenResponse = await axios.post(`${baseURL}/oauth/token`, {
            grant_type: 'client_credentials',
            client_id: process.env.PIPEDREAM_CLIENT_ID,
            client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
          }, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          authToken = tokenResponse.data.access_token;
          logger.info('Successfully obtained OAuth token');
        } catch (oauthError) {
          logger.error('Failed to obtain OAuth token:', oauthError.message);
          throw new Error('Failed to authenticate with Pipedream API');
        }
      }
      
      if (!authToken) {
        throw new Error('No authentication credentials available for Pipedream API');
      }

      let allApps = [];
      let cursor = null;
      let page = 1;
      const limit = 100;
      
      // Track unique app IDs to detect duplicates
      const seenAppIds = new Set();
      const duplicateStats = { total: 0, byPage: {} };

      while (true) {
        logger.info(`Background refresh: Fetching page ${page} (limit: ${limit}, cursor: ${cursor || 'none'})...`);
        
        try {
          const params = {
            limit: limit,
          };
          
          if (cursor) {
            params.after = cursor;
          }
          
          const response = await axios.get(`${baseURL}/apps`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            params: params,
          });
          
          const { data, page_info } = response.data;
          
          if (data && Array.isArray(data)) {
            // Track duplicates on this page
            let pageDuplicates = 0;
            const pageApps = [];
            
            data.forEach((app) => {
              if (seenAppIds.has(app.id)) {
                pageDuplicates++;
              } else {
                seenAppIds.add(app.id);
                pageApps.push(app);
              }
            });
            
            duplicateStats.byPage[page] = pageDuplicates;
            duplicateStats.total += pageDuplicates;
            
            allApps = allApps.concat(pageApps);
            
            logger.info(`Background refresh: Page ${page} complete:`, {
              pageAppsReceived: data.length,
              pageAppsKept: pageApps.length,
              pageDuplicates: pageDuplicates,
              totalAppsSoFar: allApps.length,
              uniqueAppIdsSoFar: seenAppIds.size,
            });
            
            // Check if we should continue pagination
            if (!page_info?.end_cursor || data.length === 0) {
              break;
            }
            
            // If this page had all duplicates, something is wrong
            if (data.length > 0 && pageApps.length === 0) {
              logger.info(`Background refresh: Page ${page} contained only duplicates, stopping pagination`);
              break;
            }
            
            cursor = page_info.end_cursor;
            page++;
            
            if (page > 100) break; // Safety check
          } else {
            logger.warn(`Background refresh: Invalid response on page ${page}`);
            break;
          }
        } catch (apiError) {
          logger.error(`Background refresh: Error fetching page ${page}:`, apiError.message);
          break;
        }
      }
      
      logger.info('Background refresh: Pagination completed - FINAL STATS:', {
        totalApps: allApps.length,
        uniqueAppIds: seenAppIds.size,
        totalPages: page,
        duplicateStats: duplicateStats,
      });

      if (allApps.length > 0) {
        const integrations = allApps.map(app => ({
          appSlug: app.name_slug || app.slug || app.id,
          appName: app.name,
          appDescription: app.description || `Connect with ${app.name}`,
          appIcon: app.img_src,
          appCategories: app.categories || [],
          appUrl: app.url || null,
          pipedreamAppId: app.id,
          authType: app.auth_type === 'oauth' ? 'oauth' : 
                   app.auth_type === 'keys' ? 'api_key' : 
                   app.auth_type === 'basic' ? 'basic' : 'oauth',
          isActive: true,
          popularity: app.featured_weight || 0,
          lastUpdated: new Date(),
        }));

        logger.info(`Background refresh: Transformed ${integrations.length} integrations from ${allApps.length} apps`);
        await this.cacheAvailableIntegrations(integrations);
        logger.info(`Background refresh: Successfully updated cache with ${integrations.length} integrations`);
      }
    } catch (error) {
      logger.error('Background refresh: Failed to refresh cache:', error);
    }
  }

  /**
   * Initialize scheduled cache refresh (call this on service startup)
   */
  initializeScheduledRefresh() {
    const REFRESH_INTERVAL = parseInt(process.env.PIPEDREAM_SCHEDULED_REFRESH_HOURS) || 12; // 12 hours default
    const intervalMs = REFRESH_INTERVAL * 60 * 60 * 1000;
    
    logger.info(`Initializing scheduled cache refresh every ${REFRESH_INTERVAL} hours`);
    
    // Set up periodic refresh
    setInterval(async () => {
      try {
        logger.info('Scheduled refresh: Starting periodic cache refresh...');
        await this.refreshCacheInBackground();
      } catch (error) {
        logger.error('Scheduled refresh: Failed:', error);
      }
    }, intervalMs);
    
    // Also do an initial refresh after a short delay if cache is empty
    setTimeout(async () => {
      try {
        const cached = await AvailableIntegration.find({ isActive: true }).lean();
        if (!cached || cached.length === 0) {
          logger.info('Initial refresh: No cache found, performing initial refresh...');
          await this.refreshCacheInBackground();
        }
      } catch (error) {
        logger.error('Initial refresh: Failed:', error);
      }
    }, 30000); // 30 seconds delay
  }

  /**
   * Get individual app details and metadata
   */
  async getAppDetails(appIdentifier) {
    logger.info(`=== PipedreamService.getAppDetails: Starting for ${appIdentifier} ===`);
    
    if (!this.isEnabled()) {
      logger.warn('Pipedream service is not enabled');
      return this.getMockAppDetails(appIdentifier);
    }

    // Check if we have Pipedream credentials
    const hasCredentials = this.isClientConfigured();
    
    if (!hasCredentials || !this.client) {
      logger.warn('No Pipedream credentials or client not initialized, returning mock data');
      return this.getMockAppDetails(appIdentifier);
    }

    try {
      // First, try to get app details from our cached available integrations
      // Check if the identifier is a pipedreamAppId (starts with app_) or an appSlug
      const query = appIdentifier.startsWith('app_') 
        ? { pipedreamAppId: appIdentifier, isActive: true }
        : { appSlug: appIdentifier, isActive: true };
        
      const cachedIntegration = await AvailableIntegration.findOne(query).lean();

      if (cachedIntegration) {
        logger.info(`Found cached app details for ${appIdentifier}`);
        return {
          id: cachedIntegration.pipedreamAppId,
          name_slug: cachedIntegration.appSlug,
          name: cachedIntegration.appName,
          auth_type: cachedIntegration.authType,
          description: cachedIntegration.appDescription,
          img_src: cachedIntegration.appIcon,
          categories: cachedIntegration.appCategories || [],
          // Add additional metadata
          isConnectable: true,
          hasActions: true,
          hasTriggers: true,
        };
      }

      // If not in cache, try to fetch from Pipedream API
      logger.info(`Fetching app details from Pipedream API for ${appIdentifier}`);
      
      const axios = require('axios');
      const baseURL = 'https://api.pipedream.com/v1'; // General Pipedream API
      let authToken = process.env.PIPEDREAM_API_KEY;
      
      if (!authToken && process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET) {
        try {
          logger.info('Attempting OAuth token for getAppDetails');
          const tokenResponse = await axios.post(`${baseURL}/oauth/token`, {
            grant_type: 'client_credentials',
            client_id: process.env.PIPEDREAM_CLIENT_ID,
            client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
          });
          authToken = tokenResponse.data.access_token;
          logger.info('OAuth token obtained for getAppDetails');
        } catch (tokenError) {
          logger.error(`Failed to get OAuth token for getAppDetails for ${appIdentifier}: ${tokenError.message}`);
          // Fallback to mock if auth fails, as per existing pattern
          return this.getMockAppDetails(appIdentifier);
        }
      }

      if (!authToken) {
        logger.error(`No authentication token available for getAppDetails for ${appIdentifier}`);
        return this.getMockAppDetails(appIdentifier);
      }

      // The general /apps/{app_id_or_slug} endpoint should be used here.
      // If appIdentifier is an app_id (e.g., app_w0hvV7), it should work directly.
      try {
        const response = await axios.get(`${baseURL}/apps/${appIdentifier}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });

        // According to Pipedream REST API for GET /apps/{app_id}, response.data.data is an object
        if (response.data && response.data.data) {
          const appData = response.data.data; // Should be an object, not an array for a single app GET
          logger.info(`Successfully fetched app details from API for ${appIdentifier}:`, appData);
          return {
            id: appData.id, // This is the pipedreamAppId
            name_slug: appData.name_slug, // This is the Pipedream slug
            name: appData.name,
            auth_type: appData.auth_type,
            description: appData.description,
            img_src: appData.img_src,
            categories: appData.categories || [],
            isConnectable: true, // Assuming apps from API are connectable
            hasActions: true,    // Placeholder, will be determined by getAppComponents
            hasTriggers: false,  // Triggers are not needed
          };
        } else {
          logger.warn(`No app data found in API response for ${appIdentifier}. Response:`, response.data);
          return this.getMockAppDetails(appIdentifier);
        }
      } catch (apiError) {
        logger.error(`API error fetching app details for ${appIdentifier}: ${apiError.message}`);
        if (apiError.response) {
          logger.error(`API response status: ${apiError.response.status}`);
          logger.error(`API response data:`, JSON.stringify(apiError.response.data));
          logger.error(`API response headers:`, JSON.stringify(apiError.response.headers));
        }
        return this.getMockAppDetails(appIdentifier);
      }
    } catch (error) {
      // Catch any other errors (e.g., from cache query)
      logger.error(`Generic error in getAppDetails for ${appIdentifier}: ${error.message}`);
      return this.getMockAppDetails(appIdentifier);
    }
  }

  /**
   * Get components (actions/triggers) for a specific app
   */
  async getAppComponents(appIdentifier, type = null) {
    logger.info(`=== PipedreamService.getAppComponents: Starting for ${appIdentifier}, type: actions (hardcoded) ===`);
    
    if (!this.isEnabled()) {
      logger.warn('Pipedream service is not enabled');
      return this.getMockAppComponents(appIdentifier, 'actions');
    }

    const hasCredentials = this.isClientConfigured();
    if (!hasCredentials || !this.client) {
      logger.warn('No Pipedream credentials or client not initialized, returning mock data');
      return this.getMockAppComponents(appIdentifier, 'actions');
    }

    try {
      let pipedreamAppId = appIdentifier;
      let appNameSlug = appIdentifier;
      
      const query = appIdentifier.startsWith('app_') 
        ? { pipedreamAppId: appIdentifier, isActive: true }
        : { appSlug: appIdentifier, isActive: true };
      const cachedIntegration = await AvailableIntegration.findOne(query).lean();

      if (cachedIntegration) {
        if (cachedIntegration.pipedreamAppId) {
          pipedreamAppId = cachedIntegration.pipedreamAppId;
        }
        appNameSlug = cachedIntegration.appSlug.replace(/^_+/, '');
        logger.info(`Using pipedreamAppId ${pipedreamAppId} and nameSlug ${appNameSlug} for ${appIdentifier}`);
      } else {
        logger.warn(`No cached integration found for ${appIdentifier}, attempting to use as-is.`);
        if (appIdentifier.startsWith('app_') && appIdentifier.length > 4) {
           // Attempt to derive a slug if it's an app_id, though this is a guess.
           // Pipedream SDK typically uses the name slug, not the app_id for getComponents.
           appNameSlug = appIdentifier.substring(4); 
        } else {
          appNameSlug = appIdentifier.replace(/^_+/, '');
        }
      }

      const result = { actions: [], triggers: [] }; // Keep structure, but triggers will remain empty

      // Try using the SDK first for actions
      try {
        logger.info(`Attempting to fetch actions (components) using SDK for app: ${appNameSlug}`);
        const componentsResponse = await this.client.getComponents({
          app: appNameSlug, // SDK uses the name slug for the app
          limit: 100, // Fetch more components if needed
        });

        if (componentsResponse && componentsResponse.data) {
          const components = componentsResponse.data;
          logger.info(`SDK returned ${components.length} components for ${appNameSlug}`);
          
          components.forEach(component => {
            const key = component.key || '';
            const name = component.name || '';
            // Simple heuristic: if it doesn't seem like a trigger, assume it's an action/tool.
            // Pipedream components can be generic, SDK's getComponents fetches all.
            // We are interested in actions.
            if (!(key.includes('trigger') || name.toLowerCase().includes('trigger') || name.includes('New ') || name.includes('Updated '))) {
              result.actions.push(component);
            }
          });
          
          logger.info(`SDK call categorized into ${result.actions.length} actions`);
          return result;
        }
      } catch (sdkError) {
        logger.error(`SDK error fetching components for ${appNameSlug}: ${sdkError.message}. Response: ${sdkError.response?.data ? JSON.stringify(sdkError.response.data) : 'N/A'}`);
        logger.info(`Falling back to direct API call for actions for ${pipedreamAppId}`);
      }

      // Fallback to direct API calls for actions if SDK fails or returns no actions
      const axios = require('axios');
      const baseURL = 'https://api.pipedream.com/v1';
      const projectId = process.env.PIPEDREAM_PROJECT_ID;
      
      if (!projectId) {
        logger.error('PIPEDREAM_PROJECT_ID is required for Connect API calls (actions)');
        return this.getMockAppComponents(appIdentifier, 'actions');
      }
      
      let authToken = process.env.PIPEDREAM_API_KEY;
      if (!authToken && process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET) {
        try {
          const tokenResponse = await axios.post(`${baseURL}/oauth/token`, {
            grant_type: 'client_credentials',
            client_id: process.env.PIPEDREAM_CLIENT_ID,
            client_secret: process.env.PIPEDREAM_CLIENT_SECRET,
          });
          authToken = tokenResponse.data.access_token;
        } catch (tokenError) {
          logger.error('Failed to get OAuth token for getAppComponents (actions): ', tokenError.message);
          return this.getMockAppComponents(appIdentifier, 'actions');
        }
      }

      if (!authToken) {
        logger.error('No authentication token available for getAppComponents (actions)');
        return this.getMockAppComponents(appIdentifier, 'actions');
      }
      
      try {
        logger.info(`Fetching actions using Connect API for app identifier: ${pipedreamAppId}`);
        const actionsResponse = await axios.get(`${baseURL}/connect/${projectId}/actions`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            app: pipedreamAppId, // Connect API for actions uses the app_id (pipedreamAppId)
            limit: 100,
          },
        });

        if (actionsResponse.data && actionsResponse.data.data) {
          result.actions = actionsResponse.data.data;
          logger.info(`Connect API found ${result.actions.length} actions for ${pipedreamAppId}`);
        } else {
          logger.info(`No actions found via Connect API for ${pipedreamAppId} (empty response)`);
        }
      } catch (error) {
        logger.error(`Error fetching actions via Connect API for ${pipedreamAppId}: ${error.message}`);
        if (error.response) {
          logger.error(`API response status: ${error.response.status}`);
          logger.error(`API response data:`, JSON.stringify(error.response.data));
          logger.error(`API response headers:`, JSON.stringify(error.response.headers));
          if (error.response.status === 404) {
            logger.info(`App ${pipedreamAppId} might have no actions available (404 from Connect API).`);
          }
        }
      }
      // Triggers are intentionally not fetched.
      return result;

    } catch (error) {
      logger.error(`Generic error in getAppComponents for ${appIdentifier}:`, error.message);
      return this.getMockAppComponents(appIdentifier, 'actions');
    }
  }

  /**
   * Configure a component's props
   */
  async configureComponent(userId, options) {
    logger.info(`=== PipedreamService.configureComponent: Starting for user ${userId} ===`);
    
    if (!this.isEnabled()) {
      throw new Error('Pipedream integration is not enabled');
    }

    if (!this.client) {
      throw new Error('Pipedream client not initialized');
    }

    try {
      const { componentId, propName, configuredProps, dynamicPropsId } = options;

      const result = await this.client.configureComponent({
        id: componentId,
        external_user_id: userId,
        prop_name: propName,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      });

      logger.info(`Successfully configured component ${componentId} for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Failed to configure component:', error);
      throw new Error('Failed to configure component');
    }
  }

  /**
   * Run an action component
   */
  async runAction(userId, options) {
    logger.info(`=== PipedreamService.runAction: Starting for user ${userId} ===`);
    
    if (!this.isEnabled()) {
      throw new Error('Pipedream integration is not enabled');
    }

    if (!this.client) {
      throw new Error('Pipedream client not initialized');
    }

    try {
      const { componentId, configuredProps, dynamicPropsId } = options;

      const result = await this.client.runAction({
        id: componentId,
        external_user_id: userId,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      });

      logger.info(`Successfully ran action ${componentId} for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Failed to run action:', error);
      throw new Error('Failed to run action');
    }
  }

  /**
   * Deploy a trigger component
   */
  async deployTrigger(userId, options) {
    logger.info(`=== PipedreamService.deployTrigger: Starting for user ${userId} ===`);
    
    if (!this.isEnabled()) {
      throw new Error('Pipedream integration is not enabled');
    }

    if (!this.client) {
      throw new Error('Pipedream client not initialized');
    }

    try {
      const { componentId, configuredProps, webhookUrl, workflowId, dynamicPropsId } = options;

      const deployOptions = {
        id: componentId,
        external_user_id: userId,
        configured_props: configuredProps || {},
        dynamic_props_id: dynamicPropsId,
      };

      if (webhookUrl) {
        deployOptions.webhook_url = webhookUrl;
      }

      if (workflowId) {
        deployOptions.workflow_id = workflowId;
      }

      const result = await this.client.deployTrigger(deployOptions);

      logger.info(`Successfully deployed trigger ${componentId} for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Failed to deploy trigger:', error);
      throw new Error('Failed to deploy trigger');
    }
  }

  /**
   * Get mock app details for development/testing
   */
  getMockAppDetails(appSlug) {
    logger.info(`Returning mock app details for ${appSlug}`);
    
    return {
      id: `app_mock_${appSlug}`,
      name_slug: appSlug,
      name: appSlug.charAt(0).toUpperCase() + appSlug.slice(1).replace(/_/g, ' '),
      auth_type: 'oauth',
      description: `Mock integration for ${appSlug}. This is a development placeholder.`,
      img_src: `https://via.placeholder.com/64x64?text=${appSlug.charAt(0).toUpperCase()}`,
      categories: ['Development', 'Mock'],
      isConnectable: true,
      hasActions: true,
      hasTriggers: true,
    };
  }

  /**
   * Get mock app components for development/testing
   */
  getMockAppComponents(appSlug, type) {
    logger.info(`Returning mock components for ${appSlug}, type: actions (hardcoded)`);
    
    const result = { actions: [], triggers: [] }; // Keep structure, triggers will be empty

    // Only return actions as triggers are not needed
    result.actions = [
      {
        name: `Send ${appSlug} Message`,
        version: '1.0.0',
        key: `${appSlug}-send-message`,
        description: `Send a message using ${appSlug}`,
        configurable_props: [
          {
            name: 'message',
            type: 'string',
            label: 'Message',
            description: 'The message to send',
          },
        ],
      },
      {
        name: `Create ${appSlug} Record`,
        version: '1.0.0',
        key: `${appSlug}-create-record`,
        description: `Create a new record in ${appSlug}`,
        configurable_props: [
          {
            name: 'title',
            type: 'string',
            label: 'Title',
            description: 'The title of the record',
          },
          {
            name: 'content',
            type: 'string',
            label: 'Content',
            description: 'The content of the record',
          },
        ],
      },
    ];
    
    return result;
  }
}

module.exports = new PipedreamService(); 