import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalize, useMCPConnection } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { Button, Input, Pagination } from '~/components/ui';
import { Spinner } from '~/components/svg';
import IntegrationCard from './IntegrationCard';
import {
  useAvailableIntegrationsQuery,
  useUserIntegrationsQuery,
  useCreateConnectTokenMutation,
  useDeleteIntegrationMutation,
  useIntegrationCallbackMutation,
  useConnectMCPServerMutation,
  useDisconnectMCPServerMutation,
} from '~/data-provider';
import type { TAvailableIntegration, TUserIntegration } from 'librechat-data-provider';
import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type {
  TCreateConnectTokenResponse,
} from 'librechat-data-provider';

// Helper function to format numbers with suffixes
const formatCount = (count: number): string => {
  if (count < 10) return count.toString();
  if (count < 100) return `${Math.floor(count / 10) * 10}+`;
  if (count < 1000) return `${Math.floor(count / 100) * 100}+`;
  if (count < 10000) return `${(count / 1000).toFixed(1)}K+`.replace('.0', '');
  if (count < 100000) return `${Math.floor(count / 1000)}K+`;
  return `${Math.floor(count / 1000)}K+`;
};

// Custom priority apps - these will appear first in the "all apps" view
const PRIORITY_APPS = [
  'linkedin',
  'googlesheets',
  'google_calendar',
  'slack',
  'notion',
  'github',
  'salesforce_rest_api',
  'hubspot',
  'discord',
  'gmail',
  'calendar',
  'zoom',
  'stripe',
  'trello',
  'telegram',
  'asana',
  'zoho_mail',
  'supabase',
  'shopify_developer_app',
  'microsoft_teams',
  'strava',
  'google_drive',
  'dropbox',
  'reddit',
  'telegram',
  'coinbase',
  'coinmarketcap',
  'alchemy'

];

// Custom sorting function for integrations
const sortIntegrationsWithPriority = (integrations: TAvailableIntegration[]): TAvailableIntegration[] => {
  return integrations.sort((a, b) => {
    const aSlug = a.appSlug || '';
    const bSlug = b.appSlug || '';
    
    // Get priority indices using exact matching (-1 if not in priority list)
    const aPriorityIndex = PRIORITY_APPS.indexOf(aSlug);
    const bPriorityIndex = PRIORITY_APPS.indexOf(bSlug);
    
    // If both are priority apps, sort by priority order
    if (aPriorityIndex !== -1 && bPriorityIndex !== -1) {
      return aPriorityIndex - bPriorityIndex;
    }
    
    // If only one is priority, priority comes first
    if (aPriorityIndex !== -1 && bPriorityIndex === -1) {
      return -1;
    }
    if (aPriorityIndex === -1 && bPriorityIndex !== -1) {
      return 1;
    }
    
    // If neither is priority, sort alphabetically by name
    return (a.appName || '').localeCompare(b.appName || '');
  });
};

export default function IntegrationsView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Fetch data
  const {
    data: availableIntegrations = [],
    isLoading: isLoadingAvailable,
    error: availableError,
  } = useAvailableIntegrationsQuery();

  const {
    data: userIntegrations = [],
    isLoading: isLoadingUser,
    refetch: refetchUserIntegrations,
  } = useUserIntegrationsQuery();

  // Use our MCP connection hook for connection management
  const {
    handleConnect: mcpHandleConnect,
    handleDisconnect: mcpHandleDisconnect,
    isIntegrationConnected: mcpIsIntegrationConnected,
    getUserIntegration: mcpGetUserIntegration,
    isConnecting: mcpIsConnecting,
    isDisconnecting: mcpIsDisconnecting,
  } = useMCPConnection({
    onConnectionSuccess: () => {
      refetchUserIntegrations();
    },
    onDisconnectionSuccess: () => {
      refetchUserIntegrations();
    },
  });

  // Reset to first page when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, itemsPerPage]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // Incremental MCP server connect mutation (for manual connect operations)
  const connectMCPServerMutation = useConnectMCPServerMutation({
    onSuccess: (data) => {
      console.log('MCP server connected successfully:', data);
      refetchUserIntegrations();
    },
    onError: (error) => {
      console.error('Failed to connect MCP server:', error);
    },
  });

  // Incremental MCP server disconnect mutation (for manual disconnect operations)
  const disconnectMCPServerMutation = useDisconnectMCPServerMutation({
    onSuccess: (data) => {
      console.log('MCP server disconnected successfully:', data);
      refetchUserIntegrations();
    },
    onError: (error) => {
      console.error('Failed to disconnect MCP server:', error);
    },
  });

  // Legacy: Clean up orphaned MCP tools mutation (still needed for cleanup operations)
  const cleanupOrphanedMCPToolsMutation = useMutation({
    mutationFn: () => dataService.cleanupOrphanedMCPTools(),
    onSuccess: (data) => {
      console.log('=== Orphaned MCP tools cleanup completed ===');
      console.log('Result:', data);
      console.log('Agents processed:', data.agentsProcessed);
      console.log('Agents updated:', data.agentsUpdated);
      console.log('Tools removed:', data.toolsRemoved);
      console.log('Valid MCP servers:', data.validMCPServers);
      if (data.removedToolsDetails) {
        console.log('Removed tools details:', data.removedToolsDetails);
      }
    },
    onError: (error) => {
      console.error('=== Failed to cleanup orphaned MCP tools ===');
      console.error('Error:', error);
    },
  });

  // Mutations for integration management
  const integrationCallbackMutation = useIntegrationCallbackMutation({
    onSuccess: (response) => {
      console.log('Integration created successfully:', response);
      // User integrations will be automatically refreshed due to mutation's onSuccess
      // The incremental MCP connection is handled by the useMCPConnection hook
    },
    onError: (error) => {
      console.error('Failed to create integration record:', error);
    },
  });

  const createConnectTokenMutation = useCreateConnectTokenMutation({
    onSuccess: async (response) => {
      console.log('=== Connect Token Response ===', response);
      
      // The backend returns { success: true, data: { token, expires_at, connect_link_url } }
      if (response.data?.token) {
        console.log('Token received, attempting to use Pipedream SDK...');
        
        try {
          // Use dynamic import from main package to avoid module resolution issues
          // TypeScript workaround: use type assertion to bypass module resolution
          console.log('Importing Pipedream SDK...');
          const pipedreamSDK = await import('@pipedream/sdk' as any);
          console.log('SDK imported:', pipedreamSDK);
          
          // Check if browser client is available
          if (pipedreamSDK.createFrontendClient) {
            console.log('Creating frontend client...');
            const pd = pipedreamSDK.createFrontendClient();
            console.log('Frontend client created:', pd);
            
            // Get the app slug from the current request
            const appSlug = createConnectTokenMutation.variables?.app;
            console.log('App slug:', appSlug);
            console.log('Token:', response.data.token);
            
            console.log('Calling connectAccount...');
            pd.connectAccount({
              app: appSlug,
              token: response.data.token,
              onSuccess: (account: any) => {
                console.log(`Account successfully connected: ${account.id}`);
                console.log('Account details:', account);
                
                // Call our backend to create the user integration record
                if (user?.id) {
                  integrationCallbackMutation.mutate({
                    account_id: account.id,
                    external_user_id: user.id,
                    app: appSlug,
                  });
                } else {
                  console.error('User ID not available for integration callback');
                }
              },
              onError: (err: any) => {
                console.error(`Connection error: ${err.message}`);
                console.error('Full error:', err);
                // TODO: Show error toast
              }
            });
            console.log('connectAccount called successfully');
          } else {
            console.error('Frontend client not available in SDK');
            throw new Error('Frontend client not available in main SDK export');
          }
        } catch (error) {
          console.error('Failed to load or use Pipedream SDK:', error);
          console.log('Falling back to connect link URL...');
          
          // Fallback to opening the connect link URL
          if (response.data?.connect_link_url) {
            console.log('Opening connect link:', response.data.connect_link_url);
            window.open(response.data.connect_link_url, '_blank');
          } else {
            console.error('No connect link URL available');
          }
          // TODO: Show error toast
        }
      } else {
        console.error('No token in response:', response);
        // TODO: Show error toast
      }
    },
    onError: (error) => {
      console.error('Failed to create connect token:', error);
      // TODO: Show error toast
    },
  });

  const deleteIntegrationMutation = useDeleteIntegrationMutation({
    onSuccess: () => {
      refetchUserIntegrations();
      // Incremental MCP disconnection is handled by the useMCPConnection hook
      // TODO: Show success toast
    },
    onError: (error) => {
      console.error('Failed to delete integration:', error);
      // TODO: Show error toast
    },
  });

  // Get unique categories
  const categories = useMemo(() => {
    const allCategories = new Set<string>();
    
    // Ensure availableIntegrations is an array
    const integrations = Array.isArray(availableIntegrations) ? availableIntegrations : [];
    
    integrations.forEach((integration) => {
      if (integration.appCategories && Array.isArray(integration.appCategories)) {
        integration.appCategories.forEach((category) => allCategories.add(category));
      }
    });
    return ['all', ...Array.from(allCategories).sort()];
  }, [availableIntegrations]);

  // Filter integrations
  const filteredIntegrations = useMemo(() => {
    // Ensure availableIntegrations is an array
    const integrations = Array.isArray(availableIntegrations) ? availableIntegrations : [];
    
    // If showing "my" integrations, return empty array since we handle this separately
    if (selectedCategory === 'my') {
      return [];
    }
    
    // First filter by category and active status
    const categoryFiltered = integrations.filter((integration) => {
      const matchesCategory = selectedCategory === 'all' || 
        (integration.appCategories && Array.isArray(integration.appCategories) && 
         integration.appCategories.includes(selectedCategory));
      return matchesCategory && integration.isActive;
    });

    // If no search term, apply custom priority sorting and return
    if (!searchTerm.trim()) {
      return sortIntegrationsWithPriority(categoryFiltered);
    }

    // Search with relevance scoring
    const searchTermLower = searchTerm.trim().toLowerCase();
    
    const scoredResults = categoryFiltered
      .map((integration) => {
        let score = 0;
        
        // App name scoring (highest priority)
        if (integration.appName) {
          const appNameLower = integration.appName.toLowerCase();
          if (appNameLower === searchTermLower) {
            score += 100; // Exact match
          } else if (appNameLower.startsWith(searchTermLower)) {
            score += 80; // Starts with
          } else if (appNameLower.includes(searchTermLower)) {
            score += 60; // Contains
          }
        }
        
        // App slug scoring (second priority)
        if (integration.appSlug) {
          const appSlugLower = integration.appSlug.toLowerCase();
          if (appSlugLower === searchTermLower) {
            score += 90; // Exact match
          } else if (appSlugLower.startsWith(searchTermLower)) {
            score += 70; // Starts with
          } else if (appSlugLower.includes(searchTermLower)) {
            score += 50; // Contains
          }
        }
        
        // Categories scoring (third priority)
        if (integration.appCategories && Array.isArray(integration.appCategories)) {
          integration.appCategories.forEach(category => {
            const categoryLower = category.toLowerCase();
            if (categoryLower === searchTermLower) {
              score += 40; // Exact match
            } else if (categoryLower.includes(searchTermLower)) {
              score += 20; // Contains
            }
          });
        }
        
        // Description scoring (lowest priority)
        if (integration.appDescription) {
          const descriptionLower = integration.appDescription.toLowerCase();
          if (descriptionLower.includes(searchTermLower)) {
            score += 10; // Contains
          }
        }
        
        return { integration, score };
      })
      .filter(item => item.score > 0) // Only include matches
      .sort((a, b) => {
        // Sort by score (descending), then by name (ascending)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return (a.integration.appName || '').localeCompare(b.integration.appName || '');
      })
      .map(item => item.integration);

    return scoredResults;
  }, [availableIntegrations, searchTerm, selectedCategory]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredIntegrations.length / itemsPerPage);
  const paginatedIntegrations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredIntegrations.slice(startIndex, endIndex);
  }, [filteredIntegrations, currentPage, itemsPerPage]);

  // Check if integration is connected - use our reusable hook
  const isIntegrationConnected = (appSlug: string) => {
    return mcpIsIntegrationConnected(appSlug);
  };

  // Get user integration for an app - use our reusable hook
  const getUserIntegration = (appSlug: string) => {
    return mcpGetUserIntegration(appSlug);
  };

  // Handle connect integration - use our reusable hook
  const handleConnect = (integration: TAvailableIntegration) => {
    mcpHandleConnect(integration);
  };

  // Handle disconnect integration - use our reusable hook
  const handleDisconnect = (userIntegration: TUserIntegration) => {
    mcpHandleDisconnect(userIntegration);
  };

  // Handle successful connection callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connected') === 'true') {
      // Remove the query parameter from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // Refresh user integrations to show the new connection
      refetchUserIntegrations();
      
      // TODO: Show success toast notification
      console.log('Integration connected successfully!');
    }
  }, [refetchUserIntegrations]);

  // Handle close button - navigate back to chat
  const handleClose = () => {
    // Force a page refresh to ensure new tools are loaded
    window.location.href = '/c/new';
  };

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isLoading = isLoadingAvailable || isLoadingUser;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Spinner className="h-8 w-8" />
          <p className="text-text-secondary">{localize('com_ui_integrations_loading')}</p>
        </div>
      </div>
    );
  }

  if (availableError) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{localize('com_ui_integrations_error')}</p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="mt-4 btn-neutral"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-primary dark:bg-surface-primary">
      {/* Close button - Fixed to top-right corner */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
        aria-label="Close integrations"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Manual cleanup button for debugging - Fixed to top-right corner */}
      {/* <button
        onClick={() => cleanupOrphanedMCPToolsMutation.mutate()}
        className="fixed top-6 right-20 z-50 flex h-10 w-32 items-center justify-center rounded-lg bg-yellow-500 text-white text-sm font-medium hover:bg-yellow-600 transition-all duration-200"
        aria-label="Cleanup MCP tools"
        disabled={cleanupOrphanedMCPToolsMutation.isLoading}
      >
        {cleanupOrphanedMCPToolsMutation.isLoading ? 'Cleaning...' : 'Cleanup Tools'}
      </button> */}

      {/* Header */}
      <div className="integrations-header relative overflow-hidden">
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-60 dark:opacity-45">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path 
                  d="M 32 0 L 0 0 0 32" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="0.75" 
                  className="text-border-light dark:text-border-medium"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-7xl px-6 py-12">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center rounded-full bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 px-4 py-2 text-base font-medium text-text-primary ring-1 ring-green-200 dark:ring-green-800/50 mb-6 shadow-sm">
              <svg className="h-5 w-5 mr-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-green-700 dark:text-green-300 font-bold">2,700+</span>
              <span className="mx-1">Apps &</span>
              <span className="text-green-700 dark:text-green-300 font-bold">10,000+</span>
              <span className="ml-1">Tools Available</span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4 leading-tight">
              The Automation
              <br />
              <span className="text-text-secondary">
                Toolkit
              </span>
            </h1>
            
            {/* Subtitle */}
            <p className="text-lg text-text-secondary mb-8 leading-relaxed max-w-3xl mx-auto">
              Connect your favorite apps, in a single click, and unlock unlimited possibilities with enterprise-grade security.
            </p>

            {/* Feature highlights */}
            <div className="flex flex-wrap justify-center gap-8 mb-8 text-sm">
              <div className="flex items-center gap-2 text-text-tertiary">
                <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full"></div>
                <span>One-click Setup</span>
              </div>
              <div className="flex items-center gap-2 text-text-tertiary">
                <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full"></div>
                <span>Enterprise-grade security</span>
              </div>
              <div className="flex items-center gap-2 text-text-tertiary">
                <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full"></div>
                <span>Real-time</span>
              </div>
              <div className="flex items-center gap-2 text-text-tertiary">
                <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full"></div>
                <span>No coding required</span>
              </div>
            </div>
            
            {/* Navigation Toggle with sliding animation */}
            <div className="relative inline-flex items-center p-1 rounded-lg shadow-sm border border-border-light">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`relative z-10 px-6 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  selectedCategory === 'all' || selectedCategory !== 'my'
                    ? 'text-green-600 dark:text-green-400 border border-green-500 bg-transparent'
                    : 'text-text-secondary hover:text-text-primary bg-transparent border-none'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  All Apps
                </span>
              </button>
              <button
                onClick={() => setSelectedCategory('my')}
                className={`relative z-10 px-6 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  selectedCategory === 'my'
                    ? 'text-green-600 dark:text-green-400 border border-green-500 bg-transparent'
                    : 'text-text-secondary hover:text-text-primary bg-transparent border-none'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  My Apps
                  {userIntegrations.length > 0 && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full border ml-2 ${
                      selectedCategory === 'my' 
                        ? 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-400/50' 
                        : 'text-text-primary bg-surface-tertiary border-border-light'
                    }`}>
                      {formatCount(userIntegrations.length)}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar - Categories */}
          <div className="w-64 flex-shrink-0">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Categories</h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 ${
                  selectedCategory === 'all'
                    ? 'bg-surface-primary border border-green-500 text-green-600 hover:bg-green-50 dark:bg-surface-primary dark:text-green-400 dark:border-green-400 dark:hover:bg-green-900/10'
                    : 'text-text-primary hover:bg-surface-hover'
                }`}
              >
                All Apps
              </button>
              {categories.slice(1).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all duration-200 ${
                    selectedCategory === category
                      ? 'bg-surface-primary border border-green-500 text-green-600 hover:bg-green-50 dark:bg-surface-primary dark:text-green-400 dark:border-green-400 dark:hover:bg-green-900/10'
                      : 'text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Search Bar */}
            <div className="mb-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div></div>
                <div></div>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-12 pl-4 pr-12 text-base bg-surface-primary border-border-light rounded-lg shadow-sm focus:border-green-500 focus:ring-green-500/20 text-text-primary placeholder:text-text-tertiary"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-12 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                      aria-label="Clear search"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Show My Apps or All Apps */}
            {selectedCategory === 'my' ? (
              <div>
                <h2 className="text-xl font-semibold text-text-primary mb-6">
                  My Apps ({formatCount(userIntegrations.length)})
                </h2>
                
                {userIntegrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="w-16 h-16 bg-surface-secondary rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-text-primary mb-2">No connected apps</h3>
                    <p className="text-text-secondary text-center max-w-md">
                      Connect your first app to get started with AI-powered automation.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {userIntegrations.map((userIntegration) => {
                      const integration = Array.isArray(availableIntegrations) 
                        ? availableIntegrations.find((ai) => ai.appSlug === userIntegration.appSlug)
                        : null;
                      if (!integration) return null;

                      return (
                        <IntegrationCard
                          key={userIntegration._id}
                          integration={integration}
                          isConnected={true}
                          userIntegration={userIntegration}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          isLoading={mcpIsDisconnecting}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Integrations Grid */}
                {filteredIntegrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="w-16 h-16 bg-surface-secondary rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-text-primary mb-2">No integrations found</h3>
                    <p className="text-text-secondary text-center max-w-md">
                      {searchTerm || selectedCategory !== 'all'
                        ? 'Try adjusting your search criteria or browse all available integrations.'
                        : 'No integrations are currently available.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      {paginatedIntegrations.map((integration) => (
                        <IntegrationCard
                          key={integration._id || integration.appSlug}
                          integration={integration}
                          isConnected={isIntegrationConnected(integration.appSlug)}
                          userIntegration={getUserIntegration(integration.appSlug)}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          isLoading={mcpIsConnecting}
                        />
                      ))}
                    </div>

                    {/* Pagination Controls - Bottom */}
                    {totalPages > 1 && (
                      <div className="mt-8">
                        <Pagination
                          currentPage={currentPage}
                          itemsPerPage={itemsPerPage}
                          totalItems={filteredIntegrations.length}
                          totalPages={totalPages}
                          onPageChange={(newPage) => setCurrentPage(newPage)}
                          onItemsPerPageChange={(newItemsPerPage) => setItemsPerPage(newItemsPerPage)}
                          showItemsPerPage={true}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 