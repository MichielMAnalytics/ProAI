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
import type { TCreateConnectTokenResponse } from 'librechat-data-provider';

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
  'gmail',
  'microsoft_calendar',
  'googlesheets',
  'google_calendar',
  'slack',
  'notion',
  'github',
  'salesforce_rest_api',
  'hubspot',
  'discord',
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
  'alchemy',
];

// Custom sorting function for integrations
const sortIntegrationsWithPriority = (
  integrations: TAvailableIntegration[],
): TAvailableIntegration[] => {
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // State for tracking image load status
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Preload critical images properly
  useEffect(() => {
    const imageUrls = ['/assets/logo.svg', '/assets/pipedream.png', '/assets/zen2.png'];
    let loadedCount = 0;

    const handleImageLoad = () => {
      loadedCount++;
      if (loadedCount === imageUrls.length) {
        setImagesLoaded(true);
      }
    };

    imageUrls.forEach((url) => {
      const img = new Image();
      img.onload = handleImageLoad;
      img.onerror = handleImageLoad; // Still count as "loaded" to prevent hanging
      img.src = url;
    });
  }, []);

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
              },
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
      const matchesCategory =
        selectedCategory === 'all' ||
        (integration.appCategories &&
          Array.isArray(integration.appCategories) &&
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
          integration.appCategories.forEach((category) => {
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
      .filter((item) => item.score > 0) // Only include matches
      .sort((a, b) => {
        // Sort by score (descending), then by name (ascending)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return (a.integration.appName || '').localeCompare(b.integration.appName || '');
      })
      .map((item) => item.integration);

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
    // Navigate back to chat - no refresh needed since our caching system
    // automatically handles data synchronization after connect/disconnect operations
    navigate('/c/new');
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

  // Close mobile sidebar when category changes
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [selectedCategory]);

  const isLoading = isLoadingAvailable || isLoadingUser || !imagesLoaded;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Spinner className="h-8 w-8" />
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
            className="btn-neutral mt-4"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-primary dark:bg-surface-primary">
      {/* Close button - Mobile-friendly positioning */}
      <button
        onClick={handleClose}
        className="fixed right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 sm:h-10 sm:w-10"
        aria-label="Close integrations"
      >
        <svg
          className="h-4 w-4 sm:h-5 sm:w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Header - Mobile responsive */}
      <div className="integrations-header relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge - Premium design with improved mobile layout */}
            <div
              className="group relative mx-auto mb-4 inline-flex max-w-sm cursor-pointer items-center rounded-2xl border border-blue-300/80 bg-gradient-to-r from-blue-50/95 via-indigo-50/90 to-blue-50/95 px-3 py-2 text-sm font-semibold text-gray-800 shadow-lg shadow-brand-blue/15 backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:shadow-brand-blue/25 dark:border-indigo-400/30 dark:from-gray-900/80 dark:via-indigo-900/30 dark:to-blue-900/40 dark:text-gray-100 dark:shadow-indigo-400/20 dark:hover:shadow-indigo-400/30 sm:mb-8 sm:max-w-none sm:px-6 sm:py-4 sm:text-base"
              onClick={() => {
                const toolsSection = document.querySelector(
                  '.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-3',
                );
                if (toolsSection) {
                  toolsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              {/* Premium glassmorphism overlay */}
              <div className="from-brand-blue/8 via-indigo-500/12 to-brand-blue/8 absolute inset-0 z-10 rounded-2xl bg-gradient-to-r dark:from-indigo-400/10 dark:via-blue-400/15 dark:to-indigo-400/10"></div>

              {/* Animated border glow effect */}
              <div className="absolute inset-0 z-10 rounded-2xl bg-gradient-to-r from-brand-blue/25 via-indigo-400/35 to-brand-blue/25 opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100 dark:from-indigo-300/25 dark:via-blue-300/35 dark:to-indigo-300/25"></div>

              {/* Content container */}
              <div className="relative z-40 flex items-center gap-2 sm:gap-3">
                {/* Eve logo with Pipedream attribution underneath */}
                <div className="flex flex-shrink-0 flex-col items-center gap-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-blue shadow-lg shadow-brand-blue/30 transition-all duration-300 group-hover:scale-110 group-hover:shadow-brand-blue/40 dark:shadow-indigo-400/30 dark:group-hover:shadow-indigo-400/40 sm:h-10 sm:w-10">
                    <img
                      src="/assets/logo.svg"
                      alt="Eve Logo"
                      className="h-full w-full object-contain"
                      style={{ minHeight: '100%', minWidth: '100%' }}
                    />
                  </div>

                  {/* Pipedream attribution - Under Eve logo */}
                  <div className="flex items-center gap-1">
                    <span className="hidden font-inter text-xs font-medium text-text-tertiary sm:block">
                      powered by
                    </span>
                    <div
                      className="flex h-3 w-3 cursor-pointer items-center justify-center rounded bg-green-500 opacity-60 transition-all duration-200 hover:scale-110 hover:opacity-100 sm:h-4 sm:w-4"
                      title="Visit Pipedream.com"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent badge scroll behavior
                        window.open('https://pipedream.com', '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <img
                        src="/assets/pipedream.png"
                        alt="Pipedream"
                        className="h-full w-full rounded object-contain"
                        style={{ minHeight: '100%', minWidth: '100%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Text content with premium typography - Mobile optimized */}
                <div className="flex min-w-0 flex-col">
                  {/* Top line with numbers */}
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-700 bg-clip-text font-comfortaa text-sm font-bold tracking-tight text-transparent dark:from-indigo-300 dark:via-blue-200 dark:to-indigo-300 sm:text-base">
                      2,700+
                    </span>
                    <span className="font-inter text-sm font-medium text-text-primary sm:text-base">
                      Apps &
                    </span>
                    <span className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-700 bg-clip-text font-comfortaa text-sm font-bold tracking-tight text-transparent dark:from-indigo-300 dark:via-blue-200 dark:to-indigo-300 sm:text-base">
                      10,000+
                    </span>
                  </div>
                  {/* Bottom line */}
                  <div className="font-inter text-xs font-medium leading-tight text-text-primary sm:text-base">
                    Tools Available
                  </div>
                </div>
              </div>

              {/* Subtle inner glow */}
              <div className="pointer-events-none absolute inset-px z-30 rounded-2xl bg-gradient-to-r from-white/20 via-transparent to-white/20 dark:from-white/10 dark:via-transparent dark:to-white/10"></div>

              {/* Premium shine effect */}
              <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-2xl">
                <div className="absolute -left-2 -top-2 h-6 w-6 rounded-full bg-white/40 opacity-60 blur-xl transition-opacity duration-500 group-hover:opacity-80 dark:bg-white/20 sm:h-8 sm:w-8"></div>
                <div className="absolute left-1 top-1 h-px w-12 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-50 dark:via-white/30 sm:w-16"></div>
              </div>

              {/* Zen character positioned on badge */}
              <div className="pointer-events-none absolute bottom-0.5 right-0.5 z-20 h-8 w-8 sm:bottom-0.5 sm:right-1 sm:h-10 sm:w-10">
                <img
                  src="/assets/zen2.png"
                  alt="Zen character pointing"
                  className="h-full w-full transform object-contain transition-transform duration-300 group-hover:scale-110"
                  style={{
                    filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.1))',
                    minHeight: '100%',
                    minWidth: '100%',
                  }}
                />
              </div>
            </div>

            {/* Main Title - Mobile responsive */}
            <h1 className="heading-primary mb-3 text-2xl sm:mb-4 sm:text-4xl md:text-5xl">
              The Automation
              <br />
              <span className="text-text-secondary">Toolkit</span>
            </h1>

            {/* Subtitle - Mobile responsive */}
            <p className="text base mx-auto mb-6 max-w-3xl px-4 leading-relaxed text-text-secondary sm:mb-8 sm:text-lg">
              Connect your favorite apps, in a single click, and unlock unlimited possibilities with
              enterprise-grade security.
            </p>

            {/* Feature highlights - Enhanced EVE branded dots */}
            <div className="mb-6 flex flex-wrap justify-center gap-4 px-4 text-xs sm:mb-8 sm:gap-8 sm:text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <div className="relative">
                  <div className="h-2 w-2 rounded-full border border-brand-blue/30 bg-gradient-to-r from-brand-blue to-indigo-600 shadow-md shadow-brand-blue/30 dark:border-indigo-400/40 dark:bg-indigo-400 dark:shadow-indigo-400/20"></div>
                  <div className="absolute inset-0 h-2 w-2 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-70 dark:bg-indigo-400/30"></div>
                </div>
                <span className="font-medium">One-click Setup</span>
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <div className="relative">
                  <div className="h-2 w-2 rounded-full border border-brand-blue/30 bg-gradient-to-r from-brand-blue to-indigo-600 shadow-md shadow-brand-blue/30 dark:border-indigo-400/40 dark:bg-indigo-400 dark:shadow-indigo-400/20"></div>
                  <div className="absolute inset-0 h-2 w-2 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-70 dark:bg-indigo-400/30"></div>
                </div>
                <span className="font-medium">Enterprise-grade security</span>
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <div className="relative">
                  <div className="h-2 w-2 rounded-full border border-brand-blue/30 bg-gradient-to-r from-brand-blue to-indigo-600 shadow-md shadow-brand-blue/30 dark:border-indigo-400/40 dark:bg-indigo-400 dark:shadow-indigo-400/20"></div>
                  <div className="absolute inset-0 h-2 w-2 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-70 dark:bg-indigo-400/30"></div>
                </div>
                <span className="font-medium">Revoke access any time</span>
              </div>
            </div>

            {/* Navigation Toggle - Black/White for light/dark themes */}
            <div className="bg-surface-secondary/50 relative inline-flex items-center rounded-lg border border-border-light p-1 shadow-sm dark:bg-surface-secondary">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`relative z-10 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 sm:px-6 sm:py-2.5 ${
                  selectedCategory === 'all' || selectedCategory !== 'my'
                    ? 'border border-gray-300 bg-white font-semibold shadow-sm dark:border-gray-600 dark:bg-gray-800'
                    : 'hover:bg-surface-hover/50 border-none bg-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  <span
                    className={
                      selectedCategory === 'all' || selectedCategory !== 'my'
                        ? 'font-semibold text-gray-900 dark:text-gray-100'
                        : ''
                    }
                  >
                    All Apps
                  </span>
                </span>
              </button>
              <button
                onClick={() => setSelectedCategory('my')}
                className={`relative z-10 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 sm:px-6 sm:py-2.5 ${
                  selectedCategory === 'my'
                    ? 'border border-gray-300 bg-white font-semibold shadow-sm dark:border-gray-600 dark:bg-gray-800'
                    : 'hover:bg-surface-hover/50 border-none bg-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  <span
                    className={
                      selectedCategory === 'my'
                        ? 'font-semibold text-gray-900 dark:text-gray-100'
                        : ''
                    }
                  >
                    My Apps
                  </span>
                  {userIntegrations.length > 0 && (
                    <span
                      className={`ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-medium ${
                        selectedCategory === 'my'
                          ? 'border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'
                          : 'border-border-light bg-surface-tertiary text-text-primary'
                      }`}
                    >
                      {formatCount(userIntegrations.length)}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Mobile Category Filter Button */}
        <div className="mb-4 block lg:hidden">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-all duration-200 hover:bg-surface-hover"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
              />
            </svg>
            Categories
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${isMobileSidebarOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* Left Sidebar - Mobile responsive */}
          <div
            className={`w-full lg:w-64 lg:flex-shrink-0 ${
              isMobileSidebarOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <h3 className="heading-secondary mb-4 text-sm">Categories</h3>
            <div className="grid grid-cols-2 gap-2 space-y-1 sm:grid-cols-3 lg:grid-cols-1 lg:gap-0 lg:space-y-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-all duration-200 ${
                  selectedCategory === 'all'
                    ? 'border border-brand-blue bg-surface-primary text-brand-blue hover:bg-blue-50 dark:border-indigo-400 dark:bg-surface-primary dark:text-indigo-400 dark:hover:bg-indigo-900/10'
                    : 'text-text-primary hover:bg-surface-hover'
                }`}
              >
                All Apps
              </button>
              {categories.slice(1).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-all duration-200 ${
                    selectedCategory === category
                      ? 'border border-brand-blue bg-surface-primary text-brand-blue hover:bg-blue-50 dark:border-indigo-400 dark:bg-surface-primary dark:text-indigo-400 dark:hover:bg-indigo-900/10'
                      : 'text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="min-w-0 flex-1">
            {/* Search Bar - Mobile responsive */}
            <div className="mb-6">
              <div className="relative ml-auto max-w-md">
                <Input
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-lg border-border-light bg-surface-primary pl-4 pr-12 text-sm text-text-primary shadow-sm placeholder:text-text-tertiary focus:border-brand-blue focus:ring-brand-blue/20 sm:h-12 sm:text-base"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-blue dark:text-indigo-400">
                  <svg
                    className="h-4 w-4 sm:h-5 sm:w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-12 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-secondary"
                    aria-label="Clear search"
                  >
                    <svg
                      className="h-4 w-4 sm:h-5 sm:w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Show My Apps or All Apps */}
            {selectedCategory === 'my' ? (
              <div>
                <h2 className="heading-secondary mb-4 text-lg sm:mb-6 sm:text-xl">
                  My Apps ({formatCount(userIntegrations.length)})
                </h2>

                {userIntegrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 sm:py-16">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary sm:h-16 sm:w-16">
                      <svg
                        className="h-6 w-6 text-text-tertiary sm:h-8 sm:w-8"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <h3 className="heading-secondary mb-2 text-base sm:text-lg">
                      No connected apps
                    </h3>
                    <p className="body-text max-w-md text-center text-sm sm:text-base">
                      Connect your first app to get started with AI-powered automation.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
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
                {/* Integrations Grid - Mobile responsive */}
                {filteredIntegrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 sm:py-16">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary sm:h-16 sm:w-16">
                      <svg
                        className="h-6 w-6 text-text-tertiary sm:h-8 sm:w-8"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="heading-secondary mb-2 text-base sm:text-lg">
                      No integrations found
                    </h3>
                    <p className="body-text max-w-md text-center text-sm sm:text-base">
                      {searchTerm || selectedCategory !== 'all'
                        ? 'Try adjusting your search criteria or browse all available integrations.'
                        : 'No integrations are currently available.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
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

                    {/* Pagination Controls - Mobile responsive */}
                    {totalPages > 1 && (
                      <div className="mt-6 sm:mt-8">
                        <Pagination
                          currentPage={currentPage}
                          itemsPerPage={itemsPerPage}
                          totalItems={filteredIntegrations.length}
                          totalPages={totalPages}
                          onPageChange={(newPage) => setCurrentPage(newPage)}
                          onItemsPerPageChange={(newItemsPerPage) =>
                            setItemsPerPage(newItemsPerPage)
                          }
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
