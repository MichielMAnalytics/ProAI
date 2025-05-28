import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
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
} from '~/data-provider';
import type { TAvailableIntegration, TUserIntegration } from 'librechat-data-provider';
import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type {
  TCreateConnectTokenResponse,
} from 'librechat-data-provider';

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

  // Reset to first page when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, itemsPerPage]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // Mutations
  const integrationCallbackMutation = useIntegrationCallbackMutation({
    onSuccess: (response) => {
      console.log('Integration created successfully:', response);
      // User integrations will be automatically refreshed due to mutation's onSuccess
      
      // Refresh MCP servers to immediately make the new integration available
      refreshUserMCPMutation.mutate();
      
      // TODO: Show success toast
    },
    onError: (error) => {
      console.error('Failed to create integration record:', error);
      // TODO: Show error toast
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
      // TODO: Show success toast
    },
    onError: (error) => {
      console.error('Failed to delete integration:', error);
      // TODO: Show error toast
    },
  });

  // Refresh user MCP servers mutation
  const refreshUserMCPMutation = useMutation({
    mutationFn: () => dataService.refreshUserMCP(),
    onSuccess: () => {
      console.log('MCP servers refreshed successfully');
    },
    onError: (error) => {
      console.warn('Failed to refresh MCP servers:', error);
      // Don't show error to user as this is not critical
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
    
    return integrations.filter((integration) => {
      // Search functionality - check both title and description
      const searchTermLower = searchTerm.trim().toLowerCase();
      const matchesSearch = searchTermLower === '' || 
        (integration.appName && integration.appName.toLowerCase().includes(searchTermLower)) ||
        (integration.appDescription && integration.appDescription.toLowerCase().includes(searchTermLower));
      
      // Category filtering
      const matchesCategory = selectedCategory === 'all' || 
        (integration.appCategories && Array.isArray(integration.appCategories) && 
         integration.appCategories.includes(selectedCategory));

      // Only show active integrations
      return matchesSearch && matchesCategory && integration.isActive;
    });
  }, [availableIntegrations, searchTerm, selectedCategory]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredIntegrations.length / itemsPerPage);
  const paginatedIntegrations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredIntegrations.slice(startIndex, endIndex);
  }, [filteredIntegrations, currentPage, itemsPerPage]);

  // Check if integration is connected
  const isIntegrationConnected = (appSlug: string) => {
    // Ensure userIntegrations is an array
    const integrations = Array.isArray(userIntegrations) ? userIntegrations : [];
    
    return integrations.some(
      (userIntegration) => userIntegration.appSlug === appSlug && userIntegration.isActive
    );
  };

  // Get user integration for an app
  const getUserIntegration = (appSlug: string) => {
    // Ensure userIntegrations is an array
    const integrations = Array.isArray(userIntegrations) ? userIntegrations : [];
    
    return integrations.find(
      (userIntegration) => userIntegration.appSlug === appSlug && userIntegration.isActive
    );
  };

  // Handle connect integration
  const handleConnect = (integration: TAvailableIntegration) => {
    createConnectTokenMutation.mutate({
      app: integration.appSlug,
      // Use frontend URL for redirect, not backend API endpoint
      redirect_url: `${window.location.origin}/d/integrations?connected=true`,
    });
  };

  // Handle disconnect integration
  const handleDisconnect = (userIntegration: TUserIntegration) => {
    if (userIntegration._id) {
      deleteIntegrationMutation.mutate(userIntegration._id, {
        onSuccess: () => {
          // Refresh MCP servers to immediately remove the disconnected integration
          refreshUserMCPMutation.mutate();
        },
      });
    }
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
            className="mt-4"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
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

      {/* Header */}
      <div className="bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              The Personal Assistant Toolkit
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Add 2,500+ APIs and 10,000+ tools to your Personal Assistant. Connect your accounts securely and revoke access at any time. 
            </p>
            
            {/* All/My Toggle */}
            <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-6 py-2 text-sm font-medium rounded-md transition-all ${
                  selectedCategory === 'all' || selectedCategory === 'all'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                All Apps
              </button>
              <button
                onClick={() => setSelectedCategory('my')}
                className={`px-6 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
                  selectedCategory === 'my'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <span>My Apps</span>
                {userIntegrations.length > 0 && (
                  <div className="relative">
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full">
                      {userIntegrations.length}
                    </span>
                    <span className="absolute -inset-1 w-7 h-7 bg-green-400 rounded-full opacity-30 animate-pulse"></span>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar - Categories */}
          <div className="w-64 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Categories</h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                All Apps
              </button>
              {categories.slice(1).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    selectedCategory === category
                      ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
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
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <Input
                  type="text"
                  placeholder="Search apps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-12 pl-12 pr-12 text-base bg-white border-gray-200 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500/20 dark:bg-gray-800 dark:border-gray-700 dark:focus:border-blue-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:text-gray-300"
                    aria-label="Clear search"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Show My Apps or All Apps */}
            {selectedCategory === 'my' ? (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  My Apps ({userIntegrations.length})
                </h2>
                
                {userIntegrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 dark:bg-gray-800">
                      <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No connected apps</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
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
                        <div key={userIntegration._id} className="h-80">
                          <IntegrationCard
                            integration={integration}
                            isConnected={true}
                            userIntegration={userIntegration}
                            onConnect={handleConnect}
                            onDisconnect={handleDisconnect}
                            isLoading={deleteIntegrationMutation.isLoading}
                          />
                        </div>
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
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 dark:bg-gray-800">
                      <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No integrations found</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
                      {searchTerm || selectedCategory !== 'all'
                        ? 'Try adjusting your search criteria or browse all available integrations.'
                        : 'No integrations are currently available.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      {paginatedIntegrations.map((integration) => (
                        <div key={integration._id || integration.appSlug} className="h-80">
                          <IntegrationCard
                            integration={integration}
                            isConnected={isIntegrationConnected(integration.appSlug)}
                            userIntegration={getUserIntegration(integration.appSlug)}
                            onConnect={handleConnect}
                            onDisconnect={handleDisconnect}
                            isLoading={createConnectTokenMutation.isLoading}
                          />
                        </div>
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
                          className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm dark:bg-gray-800 dark:border-gray-700"
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