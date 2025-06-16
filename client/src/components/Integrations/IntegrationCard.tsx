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
        className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-surface-primary shadow-sm transition-all duration-300 hover:-translate-y-1 dark:bg-surface-secondary dark:border-gray-700/50 dark:hover:shadow-gray-900/20 flex flex-col h-full"
        onClick={handleCardClick}
      >
        {/* Connected Status Indicator */}
        {isConnected && (
          <div className="absolute top-4 right-4 z-10">
            <div className="relative">
              <div className="h-3 w-3 bg-brand-blue rounded-full"></div>
              <div className="absolute inset-0 h-3 w-3 bg-indigo-400 rounded-full opacity-40 animate-pulse"></div>
            </div>
          </div>
        )}

        <div className="p-6 flex flex-col h-full">
          {/* Header Section */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0 relative">
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
              <h3 className="text-lg heading-secondary mb-2 group-hover:text-brand-blue dark:group-hover:text-indigo-400 transition-colors">
                {integration.appName}
              </h3>
              
              {/* Badges under title */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {integration.appCategories && integration.appCategories.length > 0 && (
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-brand-blue border border-blue-200/50 dark:bg-surface-secondary dark:text-gray-300 dark:border-gray-700">
                    {integration.appCategories[0]}
                  </span>
                )}
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-brand-blue border border-blue-200/50 dark:bg-surface-secondary dark:text-gray-300 dark:border-gray-700">
                  {integration.authType || 'oauth'}
                </span>
              </div>
            </div>
          </div>

          {/* Description - Full width and flexible height */}
          <div className="flex-1 mb-4">
            <p className="text-sm body-text">
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
                  className="btn btn-neutral w-full h-9 text-sm"
                >
                  {isLoading ? (
                    <Spinner className="h-4 w-4 mx-auto" />
                  ) : (
                    'Disconnect'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="btn btn-primary w-full h-9 text-sm"
                >
                  {isLoading ? (
                    <Spinner className="h-4 w-4 mx-auto" />
                  ) : (
                    'Connect'
                  )}
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