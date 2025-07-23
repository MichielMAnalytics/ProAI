import { useState, useMemo } from 'react';
import type { TAvailableIntegration } from 'librechat-data-provider';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import { cn } from '~/utils';
import {
  useAvailableIntegrationsQuery,
  useUserIntegrationsQuery,
} from '~/data-provider';
import { useMCPConnection } from '~/hooks/useMCPConnection';
import AppDetailsModal from '../../Integrations/AppDetailsModal';

interface AppTriggerIndicatorProps {
  appSlug: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  label?: string;
}

const AppTriggerIndicator: React.FC<AppTriggerIndicatorProps> = ({
  appSlug,
  className = '',
  size = 'md',
  disabled = false,
  label,
}) => {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();
  const { data: userIntegrations } = useUserIntegrationsQuery();
  const { isIntegrationConnected } = useMCPConnection();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Find the integration data for this app
  const integration = useMemo(() => {
    return availableIntegrations?.find((int) => int.appSlug === appSlug);
  }, [availableIntegrations, appSlug]);

  // Find user integration data
  const userIntegration = useMemo(() => {
    return userIntegrations?.find((ui) => ui.appSlug === appSlug);
  }, [userIntegrations, appSlug]);

  // Check connection status
  const isConnected = useMemo(() => {
    return isIntegrationConnected(appSlug);
  }, [isIntegrationConnected, appSlug]);

  // Don't render if no integration found
  if (!integration) {
    return null;
  }

  // Size configurations matching MCPServerIcons pattern
  const sizeConfig = {
    sm: {
      iconSize: 'h-4 w-4',
      padding: 'p-1',
      indicator: 'h-2 w-2',
      textSize: 'text-xs',
    },
    md: {
      iconSize: 'h-5 w-5',
      padding: 'p-1.5',
      indicator: 'h-2.5 w-2.5',
      textSize: 'text-sm',
    },
    lg: {
      iconSize: 'h-6 w-6',
      padding: 'p-2',
      indicator: 'h-3 w-3',
      textSize: 'text-base',
    },
  };

  const config = sizeConfig[size];

  const handleClick = () => {
    if (disabled) return;
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleConnect = () => {
    // This will be handled by the modal's internal logic
  };

  const handleDisconnect = () => {
    // This will be handled by the modal's internal logic
  };

  const tooltipText = isConnected
    ? `${integration.appName} - Connected`
    : `${integration.appName} - Not connected. Click to connect.`;

  return (
    <>
      <div className={cn('flex items-center gap-2', className)}>
        {label && (
          <span className={cn('font-medium text-text-primary', config.textSize)}>
            {label}
          </span>
        )}
        <TooltipAnchor
          description={tooltipText}
          side="top"
          role="button"
          className={cn(
            'group relative rounded-md transition-all duration-200',
            config.padding,
            disabled
              ? 'cursor-not-allowed opacity-50'
              : isConnected
                ? 'cursor-pointer hover:bg-surface-hover'
                : 'cursor-pointer hover:bg-orange-100/20 dark:hover:bg-orange-900/20',
          )}
          onClick={handleClick}
        >
          {/* Connection status indicator */}
          {!isConnected && (
            <div
              className={cn(
                'absolute -right-0.5 -top-0.5 animate-pulse border border-white bg-orange-500 rounded-full dark:border-gray-800',
                config.indicator,
              )}
            />
          )}
          
          {/* App icon */}
          {integration.appIcon ? (
            <img
              src={integration.appIcon}
              alt={`${integration.appName} integration`}
              className={cn(
                'object-cover rounded-sm transition-all duration-200 group-hover:scale-110',
                config.iconSize,
                {
                  // Connected app (clean white/gray background)
                  'bg-white/90 dark:bg-gray-100/90': isConnected,
                  // Not connected app (orange background with ring)
                  'bg-orange-100/90 ring-1 ring-orange-400/50 dark:bg-orange-900/90': !isConnected,
                },
              )}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-sm font-semibold text-white transition-all duration-200 group-hover:scale-110',
                config.iconSize,
                {
                  'bg-blue-500': isConnected,
                  'bg-orange-500': !isConnected,
                },
              )}
            >
              {integration.appName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </TooltipAnchor>
      </div>

      {/* App Details Modal */}
      {integration && (
        <AppDetailsModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          integration={integration}
          isConnected={isConnected}
          userIntegration={userIntegration}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      )}
    </>
  );
};

export default AppTriggerIndicator;