import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { useLocalize, useMCPConnection } from '~/hooks';
import ComponentCard from './ComponentCard';
import {
  useAppDetailsQuery,
  useAppComponentsQuery,
  useConnectMCPServerMutation,
  useDisconnectMCPServerMutation,
} from '~/data-provider';
import type { TAppComponent, TUserIntegration, TAvailableIntegration } from 'librechat-data-provider';

interface AppDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  integration: TAvailableIntegration;
  isConnected: boolean;
  userIntegration?: TUserIntegration;
  onConnect: (integration: TAvailableIntegration) => void;
  onDisconnect: (userIntegration: TUserIntegration) => void;
  isLoading?: boolean;
}

export default function AppDetailsModal({
  isOpen,
  onClose,
  integration,
  isConnected,
  userIntegration,
  onConnect,
  onDisconnect,
  isLoading = false,
}: AppDetailsModalProps) {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = useState('overview');

  const { 
    data: appDetails, 
    isLoading: isLoadingDetails, 
    error: detailsError 
  } = useAppDetailsQuery(integration.appSlug);

  const { 
    data: components, 
    isLoading: isLoadingComponents, 
    error: componentsError 
  } = useAppComponentsQuery(integration.appSlug);

  // Use our reusable MCP connection hook
  const {
    handleConnect: mcpHandleConnect,
    handleDisconnect: mcpHandleDisconnect,
    isConnecting: mcpIsConnecting,
    isDisconnecting: mcpIsDisconnecting,
  } = useMCPConnection({
    onConnectionSuccess: () => {
      // Modal will automatically reflect the connection state change through props
      console.log(`Successfully connected to ${integration.appName}`);
    },
    onConnectionError: (error) => {
      console.error(`Failed to connect to ${integration.appName}:`, error);
    },
    onDisconnectionSuccess: () => {
      // Modal will automatically reflect the disconnection state change through props
      console.log(`Successfully disconnected from ${integration.appName}`);
    },
    onDisconnectionError: (error) => {
      console.error(`Failed to disconnect from ${integration.appName}:`, error);
    },
  });

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    mcpHandleConnect(integration);
  };

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userIntegration) {
      mcpHandleDisconnect(userIntegration);
    }
  };

  if (!isOpen) return null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-xl bg-surface-primary shadow-2xl dark:bg-surface-primary">
        {/* Close button - Mobile responsive */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 z-10 flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close modal"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div className="max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
          <div className="p-4 sm:p-6">
            {/* Header - Mobile responsive */}
            <div className="mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6">
                <div className="flex-shrink-0 mx-auto sm:mx-0">
                  <img
                    src={integration.appIcon || `https://via.placeholder.com/80x80?text=${integration.appName?.charAt(0) || '?'}`}
                    alt={integration.appName || 'App'}
                    className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `<div class="h-12 w-12 sm:h-16 sm:w-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg sm:text-2xl">${integration.appName?.charAt(0)?.toUpperCase() || '?'}</div>`;
                      }
                    }}
                  />
                </div>
                
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{integration.appName || 'Unknown App'}</h2>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 px-2 sm:px-0">{integration.appDescription || 'No description available'}</p>
                  
                  {integration.appCategories && integration.appCategories.length > 0 && (
                    <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                      {integration.appCategories.slice(0, 3).map((category) => (
                        <span
                          key={category}
                          className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 border border-green-200/50 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs - Mobile responsive */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="mb-4 sm:mb-6">
                <TabsList className="w-full sm:w-auto inline-flex rounded-lg bg-surface-secondary p-1 dark:bg-surface-secondary">
                  <TabsTrigger 
                    value="overview"
                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 text-sm font-medium rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100 dark:data-[state=inactive]:text-gray-400 dark:data-[state=inactive]:hover:text-gray-200"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger 
                    value="actions" 
                    disabled={!components?.actions?.length}
                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 text-sm font-medium rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100 dark:data-[state=inactive]:text-gray-400 dark:data-[state=inactive]:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Tools ({components?.actions?.length || 0})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview">
                <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
                  <div className="space-y-3 sm:space-y-4 flex flex-col">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Connection Status</h3>
                    <div className="rounded-xl border border-gray-200 bg-surface-primary p-4 sm:p-6 shadow-sm dark:border-gray-700 dark:bg-surface-secondary flex-1 flex flex-col">
                      {isConnected ? (
                        <div className="space-y-3 sm:space-y-4 flex flex-col h-full">
                          <div className="flex items-center space-x-2">
                            <div className="relative">
                              <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                              <div className="absolute inset-0 h-3 w-3 bg-green-400 rounded-full opacity-40 animate-pulse"></div>
                            </div>
                            <span className="font-medium text-green-600 dark:text-green-400">Connected</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">
                            This app is connected to your account. You can use its actions and triggers in your workflows.
                          </p>
                          {userIntegration?.lastConnectedAt && (
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                              Connected on {new Date(userIntegration.lastConnectedAt).toLocaleDateString()}
                            </p>
                          )}
                          <div className="mt-auto pt-2">
                            <button
                              onClick={handleDisconnect}
                              disabled={mcpIsDisconnecting}
                              className="btn btn-neutral w-full h-10 sm:h-9 text-sm"
                            >
                              {mcpIsDisconnecting ? (
                                <Spinner className="h-4 w-4 mx-auto" />
                              ) : (
                                'Disconnect'
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 sm:space-y-4 flex flex-col h-full">
                          <div className="flex items-center space-x-2">
                            <div className="h-3 w-3 rounded-full bg-gray-400"></div>
                            <span className="font-medium text-gray-600 dark:text-gray-400">Not Connected</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">
                            Connect this app to your account to use its actions and triggers in your workflows.
                          </p>
                          <div className="mt-auto pt-2">
                            <button
                              onClick={handleConnect}
                              disabled={mcpIsConnecting}
                              className="btn btn-primary w-full h-10 sm:h-9 text-sm"
                            >
                              {mcpIsConnecting ? (
                                <Spinner className="h-4 w-4 mx-auto" />
                              ) : (
                                'Connect'
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 sm:space-y-4 flex flex-col">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">App Information</h3>
                    <div className="rounded-xl border border-gray-200 bg-surface-primary p-4 sm:p-6 shadow-sm dark:border-gray-700 dark:bg-surface-secondary flex-1">
                      <dl className="space-y-3">
                        <div>
                          <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">Authentication Type</dt>
                          <dd className="mt-1">
                            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 border border-gray-200/50 dark:bg-surface-tertiary dark:text-gray-300 dark:border-gray-700">
                              {integration.authType || 'oauth'}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">Available Tools</dt>
                          <dd className="mt-1">
                            {isLoadingComponents ? (
                              <Spinner className="h-4 w-4" />
                            ) : components?.actions && components.actions.length > 0 ? (
                              <button
                                onClick={() => setActiveTab('actions')}
                                className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 hover:text-green-800 dark:text-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:hover:text-green-200 rounded-md border border-green-200/50 dark:border-green-700/50 transition-all"
                                title="View tools"
                              >
                                {components.actions.length}
                              </button>
                            ) : (
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                0
                              </span>
                            )}
                          </dd>
                        </div>
                        {integration.appUrl && (
                          <div>
                            <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">Website</dt>
                            <dd className="mt-1">
                              <a 
                                href={integration.appUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300 break-all"
                              >
                                {integration.appUrl}
                              </a>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="actions">
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Available Tools</h3>
                  
                  {isLoadingComponents ? (
                    <div className="flex h-32 items-center justify-center">
                      <Spinner className="h-6 w-6 sm:h-8 sm:w-8" />
                    </div>
                  ) : componentsError ? (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                      <p className="text-sm text-red-600 dark:text-red-400 text-center px-4">Failed to load tools</p>
                    </div>
                  ) : components?.actions && components.actions.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                      {components.actions.map((action: TAppComponent) => (
                        <ComponentCard
                          key={action.key}
                          component={action}
                          type="action"
                          isConnected={isConnected}
                          appSlug={integration.appSlug}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-gray-200 bg-surface-secondary dark:border-gray-700 dark:bg-surface-secondary">
                      <p className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">No tools available for this app</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
} 