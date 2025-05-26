import React, { useState, useMemo } from 'react';
import { useLocalize } from '~/hooks';
import { Button, Input } from '~/components/ui';
import { Spinner } from '~/components/svg';
import IntegrationCard from './IntegrationCard';
import {
  useAvailableIntegrationsQuery,
  useUserIntegrationsQuery,
  useCreateConnectTokenMutation,
  useDeleteIntegrationMutation,
} from '~/data-provider';
import type { TAvailableIntegration, TUserIntegration } from 'librechat-data-provider';

export default function IntegrationsView() {
  const localize = useLocalize();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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

  // Mutations
  const createConnectTokenMutation = useCreateConnectTokenMutation({
    onSuccess: (data) => {
      // Redirect to Pipedream Connect URL
      window.open(data.connect_link_url, '_blank');
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
    
    return integrations.filter((integration) => {
      const matchesSearch = integration.appName
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
        integration.appDescription?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'all' || 
        (integration.appCategories && integration.appCategories.includes(selectedCategory));

      return matchesSearch && matchesCategory && integration.isActive;
    });
  }, [availableIntegrations, searchTerm, selectedCategory]);

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
      redirect_url: `${window.location.origin}/d/integrations`,
    });
  };

  // Handle disconnect integration
  const handleDisconnect = (userIntegration: TUserIntegration) => {
    if (userIntegration._id) {
      deleteIntegrationMutation.mutate(userIntegration._id);
    }
  };

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
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary">
          {localize('com_ui_integrations')}
        </h1>
        <p className="mt-2 text-text-secondary">
          Connect your favorite apps and services to enhance your chat experience with MCP integrations.
        </p>
      </div>

      {/* Connected Integrations Section */}
      {Array.isArray(userIntegrations) && userIntegrations.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            {localize('com_ui_integrations_connected')} ({userIntegrations.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  isLoading={deleteIntegrationMutation.isLoading}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Available Integrations Section */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-text-primary">
          {localize('com_ui_integrations_available')} ({filteredIntegrations.length})
        </h2>

        {/* Search and Filter Controls */}
        <div className="mb-6 flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
          <div className="flex-1">
            <Input
              type="text"
              placeholder={localize('com_ui_integrations_search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="sm:w-48">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-text-primary focus:border-border-heavy focus:outline-none focus:ring-1 focus:ring-border-heavy"
            >
              <option value="all">{localize('com_ui_integrations_category_all')}</option>
              {categories.slice(1).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Integrations Grid */}
        {filteredIntegrations.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-text-secondary">
              {searchTerm || selectedCategory !== 'all'
                ? 'No integrations match your search criteria.'
                : localize('com_ui_integrations_no_available')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredIntegrations.map((integration) => (
              <IntegrationCard
                key={integration._id || integration.appSlug}
                integration={integration}
                isConnected={isIntegrationConnected(integration.appSlug)}
                userIntegration={getUserIntegration(integration.appSlug)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                isLoading={createConnectTokenMutation.isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 