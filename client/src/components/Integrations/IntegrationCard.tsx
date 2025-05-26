import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
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
  const navigate = useNavigate();
  const localize = useLocalize();

  const handleCardClick = () => {
    // Use pipedreamAppId if available for more reliable navigation
    const appIdentifier = integration.pipedreamAppId || integration.appSlug;
    navigate(`/d/integrations/app/${appIdentifier}`);
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
    <div 
      className="group cursor-pointer rounded-lg border border-border-light bg-surface-primary p-4 transition-all hover:border-border-heavy hover:shadow-md"
      onClick={handleCardClick}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <img
            src={integration.appIcon || `https://via.placeholder.com/40x40?text=${integration.appName.charAt(0)}`}
            alt={integration.appName}
            className="h-10 w-10 rounded-lg object-cover"
          />
        </div>
        
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-text-primary group-hover:text-text-primary">
            {integration.appName}
          </h3>
          <p className="mt-1 text-sm text-text-secondary line-clamp-2">
            {integration.appDescription}
          </p>
          
          {integration.appCategories && integration.appCategories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {integration.appCategories.slice(0, 2).map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center rounded-full bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
                >
                  {category}
                </span>
              ))}
              {integration.appCategories.length > 2 && (
                <span className="inline-flex items-center rounded-full bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
                  +{integration.appCategories.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isConnected && (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-sm text-green-600">Connected</span>
            </>
          )}
          <span className="text-xs text-text-secondary capitalize">
            {integration.authType}
          </span>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          {isConnected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              {isLoading ? <Spinner className="h-4 w-4" /> : 'Disconnect'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={isLoading}
            >
              {isLoading ? <Spinner className="h-4 w-4" /> : 'Connect'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
} 