import React, { useState } from 'react';
import { Button } from '~/components/ui';
import { Spinner } from '~/components/svg';
import AppIcon from '~/components/ui/AppIcon';
import { useLocalize } from '~/hooks';
import AppDetailsModal from './AppDetailsModal';
import type { TAvailableIntegration, TUserIntegration } from 'librechat-data-provider';

interface IntegrationCardProps {
  integration: TAvailableIntegration;
  isConnected: boolean;
  userIntegration?: TUserIntegration;
  onConnect: (integration: TAvailableIntegration) => void;
  onDisconnect: (userIntegration: TUserIntegration) => void;
  isLoading?: boolean;
}

export default function IntegrationCard({
  integration,
  isConnected,
  userIntegration,
  onConnect,
  onDisconnect,
  isLoading = false,
}: IntegrationCardProps) {
  const localize = useLocalize();
  const [showModal, setShowModal] = useState(false);

  const handleCardClick = () => {
    setShowModal(true);
  };

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConnect(integration);
  };

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userIntegration) {
      onDisconnect(userIntegration);
    }
  };

  return (
    <>
      <div
        className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-surface-primary shadow-sm transition-all duration-300 hover:-translate-y-1 dark:border-gray-700/50 dark:bg-surface-secondary dark:hover:shadow-gray-900/20"
        onClick={handleCardClick}
      >
        {/* Connected Status Indicator */}
        {isConnected && (
          <div className="absolute right-4 top-4 z-10">
            <div className="relative">
              <div className="h-3 w-3 rounded-full bg-brand-blue"></div>
              <div className="absolute inset-0 h-3 w-3 animate-pulse rounded-full bg-indigo-400 opacity-40"></div>
            </div>
          </div>
        )}

        <div className="flex h-full flex-col p-6">
          {/* Header Section */}
          <div className="mb-4 flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <AppIcon
                src={integration.appIcon}
                alt={integration.appName}
                size="lg"
                variant="default"
                fallbackText={integration.appName}
                className="h-14 w-14"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="heading-secondary mb-2 text-lg transition-colors group-hover:text-brand-blue dark:group-hover:text-indigo-400">
                {integration.appName}
              </h3>

              {/* Badges under title */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {integration.appCategories && integration.appCategories.length > 0 && (
                  <span className="inline-flex items-center rounded-md border border-blue-200/50 bg-blue-50 px-2 py-1 text-xs font-medium text-brand-blue dark:border-gray-700 dark:bg-surface-secondary dark:text-gray-300">
                    {integration.appCategories[0]}
                  </span>
                )}
                <span className="inline-flex items-center rounded-md border border-blue-200/50 bg-blue-50 px-2 py-1 text-xs font-medium text-brand-blue dark:border-gray-700 dark:bg-surface-secondary dark:text-gray-300">
                  {integration.authType || 'oauth'}
                </span>
              </div>
            </div>
          </div>

          {/* Description - Full width and flexible height */}
          <div className="mb-4 flex-1">
            <p className="body-text text-sm">
              {integration.appDescription || 'No description available'}
            </p>
          </div>

          {/* Footer Section - Fixed at bottom */}
          <div className="mt-auto">
            <div onClick={(e) => e.stopPropagation()}>
              {isConnected ? (
                <button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="btn btn-neutral h-9 w-full text-sm"
                >
                  {isLoading ? <Spinner className="mx-auto h-4 w-4" /> : 'Disconnect'}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="btn btn-primary h-9 w-full text-sm"
                >
                  {isLoading ? <Spinner className="mx-auto h-4 w-4" /> : 'Connect'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      <AppDetailsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        integration={integration}
        isConnected={isConnected}
        userIntegration={userIntegration}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        isLoading={isLoading}
      />
    </>
  );
}
