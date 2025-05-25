import React from 'react';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';
import type { TAvailableIntegration, TUserIntegration } from 'librechat-data-provider';

interface IntegrationCardProps {
  integration: TAvailableIntegration;
  isConnected?: boolean;
  userIntegration?: TUserIntegration;
  onConnect: (integration: TAvailableIntegration) => void;
  onDisconnect: (userIntegration: TUserIntegration) => void;
  isLoading?: boolean;
}

export default function IntegrationCard({
  integration,
  isConnected = false,
  userIntegration,
  onConnect,
  onDisconnect,
  isLoading = false,
}: IntegrationCardProps) {
  const localize = useLocalize();

  const handleAction = () => {
    if (isConnected && userIntegration) {
      onDisconnect(userIntegration);
    } else {
      onConnect(integration);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header with icon and name */}
      <div className="mb-3 flex items-center space-x-3">
        {integration.appIcon ? (
          <img
            src={integration.appIcon}
            alt={`${integration.appName} icon`}
            className="h-10 w-10 rounded-lg object-cover"
            onError={(e) => {
              // Fallback to a default icon if image fails to load
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-secondary">
            <span className="text-lg font-semibold text-text-primary">
              {integration.appName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">{integration.appName}</h3>
          {integration.appCategories && integration.appCategories.length > 0 && (
            <p className="text-xs text-text-secondary">
              {integration.appCategories.slice(0, 2).join(', ')}
            </p>
          )}
        </div>
        {isConnected && (
          <div className="flex h-2 w-2 rounded-full bg-green-500" title="Connected" />
        )}
      </div>

      {/* Description */}
      {integration.appDescription && (
        <p className="mb-4 text-sm text-text-secondary line-clamp-2">
          {integration.appDescription}
        </p>
      )}

      {/* Connection info for connected integrations */}
      {isConnected && userIntegration && (
        <div className="mb-4 rounded-md bg-surface-secondary p-2">
          <p className="text-xs text-text-secondary">
            Connected: {new Date(userIntegration.lastConnectedAt || '').toLocaleDateString()}
          </p>
          {userIntegration.lastUsedAt && (
            <p className="text-xs text-text-secondary">
              Last used: {new Date(userIntegration.lastUsedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Action button */}
      <Button
        onClick={handleAction}
        disabled={isLoading}
        variant={isConnected ? 'outline' : 'default'}
        className={`mt-auto ${
          isConnected
            ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isLoading
          ? '...'
          : isConnected
            ? localize('com_ui_integrations_disconnect')
            : localize('com_ui_integrations_connect')}
      </Button>
    </div>
  );
} 