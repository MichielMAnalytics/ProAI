import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
import type {
  TAppComponent,
  TUserIntegration,
  TAvailableIntegration,
} from 'librechat-data-provider';

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
    error: detailsError,
  } = useAppDetailsQuery(integration.appSlug);

  const {
    data: components,
    isLoading: isLoadingComponents,
    error: componentsError,
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
      onClick={handleBackdropClick}
    >
      <div className="relative max-h-[96vh] w-full max-w-sm overflow-hidden rounded-2xl bg-surface-primary shadow-2xl dark:bg-surface-primary sm:max-h-[90vh] sm:max-w-4xl">
        {/* Close button - Mobile responsive */}
        <button
          onClick={onClose}
          className="bg-surface-secondary/80 dark:bg-surface-secondary/80 absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full text-text-secondary backdrop-blur-sm transition-all hover:bg-surface-secondary hover:text-text-primary dark:hover:bg-surface-secondary sm:right-4 sm:top-4 sm:h-8 sm:w-8"
          aria-label="Close modal"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>

        <div className="max-h-[96vh] overflow-y-auto sm:max-h-[90vh]">
          <div className="p-4 sm:p-6">
            {/* Header - Mobile responsive */}
            <div className="mb-6">
              <div className="flex flex-col items-center space-y-4 text-center sm:flex-row sm:items-start sm:space-x-6 sm:space-y-0 sm:text-left">
                <div className="flex-shrink-0">
                  <img
                    src={
                      integration.appIcon ||
                      `https://via.placeholder.com/80x80?text=${integration.appName?.charAt(0) || '?'}`
                    }
                    alt={integration.appName || 'App'}
                    className="h-16 w-16 rounded-2xl object-cover shadow-sm sm:h-16 sm:w-16"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `<div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-2xl shadow-sm">${integration.appName?.charAt(0)?.toUpperCase() || '?'}</div>`;
                      }
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="heading-primary mb-3 text-2xl sm:text-2xl">
                    {integration.appName || 'Unknown App'}
                  </h2>
                  <p className="mb-4 text-sm leading-relaxed text-text-secondary sm:text-base">
                    {integration.appDescription || 'No description available'}
                  </p>

                  {integration.appCategories && integration.appCategories.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                      {integration.appCategories.slice(0, 3).map((category) => (
                        <span
                          key={category}
                          className="inline-flex items-center rounded-lg border border-blue-200/50 bg-blue-50 px-3 py-1.5 text-xs font-medium text-brand-blue dark:border-indigo-700/50 dark:bg-indigo-900/30 dark:text-indigo-300"
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
              <div className="mb-6">
                <TabsList className="grid w-full grid-cols-2 rounded-xl bg-surface-secondary p-1 dark:bg-surface-secondary">
                  <TabsTrigger
                    value="overview"
                    className="rounded-lg px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=inactive]:text-gray-600 data-[state=active]:shadow-sm data-[state=inactive]:hover:text-gray-900 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100 dark:data-[state=inactive]:text-gray-400 dark:data-[state=inactive]:hover:text-gray-200"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="actions"
                    disabled={!components?.actions?.length}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=inactive]:text-gray-600 data-[state=active]:shadow-sm data-[state=inactive]:hover:text-gray-900 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-100 dark:data-[state=inactive]:text-gray-400 dark:data-[state=inactive]:hover:text-gray-200"
                  >
                    Tools ({components?.actions?.length || 0})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview">
                <div className="space-y-6 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 sm:space-y-0">
                  <div className="flex h-full flex-col space-y-4">
                    <h3 className="font-comfortaa text-lg font-semibold text-text-primary">
                      Connection Status
                    </h3>
                    <div className="flex-1 rounded-2xl border border-gray-200 bg-surface-primary p-5 shadow-sm dark:border-gray-700 dark:bg-surface-secondary">
                      {isConnected ? (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3">
                            <div className="relative">
                              <div className="h-3 w-3 rounded-full bg-brand-blue"></div>
                              <div className="absolute inset-0 h-3 w-3 animate-pulse rounded-full bg-indigo-400 opacity-40"></div>
                            </div>
                            <span className="text-base font-medium text-brand-blue dark:text-indigo-400">
                              Connected
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-text-secondary">
                            This app is connected to your account. You can use its actions and
                            triggers in your workflows.
                          </p>
                          {userIntegration?.lastConnectedAt && (
                            <p className="text-xs text-text-tertiary">
                              Connected on{' '}
                              {new Date(userIntegration.lastConnectedAt).toLocaleDateString()}
                            </p>
                          )}
                          <button
                            onClick={handleDisconnect}
                            disabled={mcpIsDisconnecting}
                            className="btn btn-neutral h-11 w-full text-sm font-medium"
                          >
                            {mcpIsDisconnecting ? (
                              <Spinner className="mx-auto h-4 w-4" />
                            ) : (
                              'Disconnect'
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3">
                            <div className="h-3 w-3 rounded-full bg-gray-400"></div>
                            <span className="text-base font-medium text-text-secondary">
                              Not Connected
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-text-secondary">
                            Connect this app to your account to use its actions and triggers in your
                            workflows.
                          </p>
                          <button
                            onClick={handleConnect}
                            disabled={mcpIsConnecting}
                            className="btn btn-primary h-11 w-full text-sm font-medium"
                          >
                            {mcpIsConnecting ? <Spinner className="mx-auto h-4 w-4" /> : 'Connect'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex h-full flex-col space-y-4">
                    <h3 className="font-comfortaa text-lg font-semibold text-text-primary">
                      App Information
                    </h3>
                    <div className="flex-1 rounded-2xl border border-gray-200 bg-surface-primary p-5 shadow-sm dark:border-gray-700 dark:bg-surface-secondary">
                      <dl className="space-y-4">
                        <div>
                          <dt className="mb-2 text-sm font-medium text-text-secondary">
                            Authentication Type
                          </dt>
                          <dd>
                            <span className="inline-flex items-center rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary">
                              {integration.authType || 'oauth'}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="mb-2 text-sm font-medium text-text-secondary">
                            Available Tools
                          </dt>
                          <dd>
                            {isLoadingComponents ? (
                              <Spinner className="h-4 w-4" />
                            ) : components?.actions && components.actions.length > 0 ? (
                              <button
                                onClick={() => setActiveTab('actions')}
                                className="inline-flex min-w-[2.5rem] items-center justify-center rounded-lg border border-blue-200/50 bg-blue-50 px-3 py-1.5 text-sm font-medium text-brand-blue transition-all hover:bg-blue-100 hover:text-blue-800 dark:border-indigo-700/50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 dark:hover:text-indigo-200"
                                title="View tools"
                              >
                                {components.actions.length}
                              </button>
                            ) : (
                              <span className="text-sm font-medium text-text-primary">0</span>
                            )}
                          </dd>
                        </div>
                        {integration.appUrl && (
                          <div>
                            <dt className="mb-2 text-sm font-medium text-text-secondary">
                              Website
                            </dt>
                            <dd>
                              <a
                                href={integration.appUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-sm leading-relaxed text-brand-blue hover:text-blue-700 dark:text-indigo-400 dark:hover:text-indigo-300"
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
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-text-primary">Available Tools</h3>

                  {isLoadingComponents ? (
                    <div className="flex h-32 items-center justify-center">
                      <Spinner className="h-8 w-8" />
                    </div>
                  ) : componentsError ? (
                    <div className="flex h-32 items-center justify-center rounded-2xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                      <p className="px-4 text-center text-sm text-red-600 dark:text-red-400">
                        Failed to load tools
                      </p>
                    </div>
                  ) : components?.actions && components.actions.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <div className="flex h-32 items-center justify-center rounded-2xl border border-gray-200 bg-surface-secondary dark:border-gray-700 dark:bg-surface-secondary">
                      <p className="px-4 text-center text-sm text-text-secondary">
                        No tools available for this app
                      </p>
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

  return createPortal(modalContent, document.body);
}
