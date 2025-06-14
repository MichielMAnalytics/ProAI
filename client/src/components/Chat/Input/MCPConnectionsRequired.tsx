import React from 'react';
import { Button } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { useMCPConnection } from '~/hooks/useMCPConnection';
import { useAvailableIntegrationsQuery } from '~/data-provider';

interface MCPConnectionsRequiredProps {
  mcpServers: string[];
  onAllConnected?: () => void;
}

export default function MCPConnectionsRequired({ 
  mcpServers, 
  onAllConnected 
}: MCPConnectionsRequiredProps) {
  const {
    handleConnect,
    isConnecting,
    getMissingMCPServers,
    areAllMCPServersConnected,
    isIntegrationConnected,
  } = useMCPConnection({
    onConnectionSuccess: () => {
      // Check if all servers are now connected
      if (areAllMCPServersConnected(mcpServers)) {
        onAllConnected?.();
      }
    },
  });

  const { data: availableIntegrations, isSuccess } = useAvailableIntegrationsQuery();

  // If all servers are connected, or we don't have the integration data yet, don't render
  if (areAllMCPServersConnected(mcpServers) || !isSuccess) {
    return null;
  }
  
  const missingServers = getMissingMCPServers(mcpServers);

  // Get integration details for missing servers
  const missingIntegrations = missingServers.map(appSlug => {
    const integration = availableIntegrations.find(ai => ai.appSlug === appSlug);
    return {
      appSlug,
      appName: integration?.appName || appSlug,
      appIcon: integration?.appIcon,
    };
  });

  const formatAppName = (appSlug: string, appName?: string) => {
    if (appName && appName !== appSlug) {
      return appName;
    }
    // Capitalize first letter and replace underscores with spaces
    return appSlug.charAt(0).toUpperCase() + appSlug.slice(1).replace(/_/g, ' ');
  };

  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      {missingIntegrations.map(({ appSlug, appName, appIcon }) => (
        <Button
          key={appSlug}
          onClick={() => handleConnect({ appSlug })}
          disabled={isConnecting}
          className="integrations-heartbeat-button relative btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {/* Heartbeat animation border */}
          <div className="integrations-heartbeat-ring absolute inset-0 rounded-lg"></div>
          
          {/* Content container */}
          <div className="flex items-center gap-2 relative z-10">
            {appIcon && (
              <img 
                src={appIcon} 
                alt={formatAppName(appSlug, appName)} 
                className="h-4 w-4 rounded-sm"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {isConnecting ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                Connect {formatAppName(appSlug, appName)}
              </>
            )}
          </div>
        </Button>
      ))}
    </div>
  );
} 