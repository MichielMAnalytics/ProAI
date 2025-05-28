import React, { useState } from 'react';
import { Button } from '~/components/ui';
import { Spinner } from '~/components/svg';
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
        className="group relative cursor-pointer overflow-hidden rounded-xl bg-white border border-gray-200/60 shadow-sm hover:shadow-lg hover:shadow-gray-900/10 transition-all duration-300 hover:-translate-y-1 dark:bg-gray-800/50 dark:border-gray-700/50 dark:hover:shadow-gray-900/20 flex flex-col h-full"
        onClick={handleCardClick}
      >
        {/* Connected Status Indicator */}
        {isConnected && (
          <div className="absolute top-4 right-4 z-10">
            <div className="relative">
              <div className="h-3 w-3 bg-green-500 rounded-full"></div>
              <div className="absolute inset-0 h-3 w-3 bg-green-400 rounded-full opacity-40 animate-pulse"></div>
            </div>
          </div>
        )}

        <div className="p-6 flex flex-col h-full">
          {/* Header Section */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0 relative">
              <img
                src={integration.appIcon || `https://via.placeholder.com/56x56?text=${integration.appName.charAt(0)}`}
                alt={integration.appName}
                className="h-14 w-14 rounded-xl object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `<div class="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xl">${integration.appName.charAt(0).toUpperCase()}</div>`;
                  }
                }}
              />
            </div>
            
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg leading-tight mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {integration.appName}
              </h3>
              
              {/* Badges under title */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {integration.appCategories && integration.appCategories.length > 0 && (
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200/50 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50">
                    {integration.appCategories[0]}
                  </span>
                )}
                <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 border border-gray-200/50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
                  {integration.authType || 'oauth'}
                </span>
              </div>
            </div>
          </div>

          {/* Description - Full width and flexible height */}
          <div className="flex-1 mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
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
                  className="w-full h-9 px-4 text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:border-gray-500"
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
                  className="w-full h-9 px-4 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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