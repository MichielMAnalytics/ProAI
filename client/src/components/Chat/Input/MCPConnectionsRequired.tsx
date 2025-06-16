import React from 'react';
import { Button } from '~/components/ui';
import { Spinner } from '~/components/svg';
import AppIcon from '~/components/ui/AppIcon';
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
  const missingIntegrations = missingServers.map(serverName => {
    // Convert server name to appSlug for integration lookup
    // Server names like "pipedream-gmail" should match availableIntegrations with appSlug "gmail"
    const appSlug = serverName.startsWith('pipedream-') ? serverName.replace('pipedream-', '') : serverName;
    const integration = availableIntegrations.find(ai => ai.appSlug === appSlug);
    return {
      appSlug, // Use clean appSlug for connection
      appName: integration?.appName || appSlug,
      appIcon: integration?.appIcon,
    };
  });

  const formatAppName = (appSlug: string, appName?: string) => {
    if (appName && appName !== appSlug) {
      return appName;
    }
    // Format app slug: capitalize first letter and replace underscores with spaces
    // Then capitalize each word after spaces
    return appSlug
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      {missingIntegrations.map(({ appSlug, appName, appIcon }) => (
        <Button
          key={appSlug}
          onClick={() => handleConnect({ appSlug })}
          disabled={isConnecting}
          className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <AppIcon
              src={appIcon}
              alt={formatAppName(appSlug, appName)}
              size="sm"
              variant="button"
              fallbackText={formatAppName(appSlug, appName)}
            />
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