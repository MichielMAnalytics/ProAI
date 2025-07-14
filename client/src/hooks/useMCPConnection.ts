import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '~/hooks/AuthContext';
import {
  useCreateConnectTokenMutation,
  useDeleteIntegrationMutation,
  useIntegrationCallbackMutation,
  useUserIntegrationsQuery,
  useConnectMCPServerMutation,
  useDisconnectMCPServerMutation,
} from '~/data-provider';
import { dataService } from 'librechat-data-provider';
import type { TAvailableIntegration, TUserIntegration } from 'librechat-data-provider';

export interface UseMCPConnectionProps {
  onConnectionSuccess?: () => void;
  onConnectionError?: (error: any) => void;
  onDisconnectionSuccess?: () => void;
  onDisconnectionError?: (error: any) => void;
}

export function useMCPConnection({
  onConnectionSuccess,
  onConnectionError,
  onDisconnectionSuccess,
  onDisconnectionError,
}: UseMCPConnectionProps = {}) {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  const { data: userIntegrations = [], refetch: refetchUserIntegrations } =
    useUserIntegrationsQuery();

  // Incremental MCP server connect mutation
  const connectMCPServerMutation = useConnectMCPServerMutation({
    onSuccess: (data) => {
      console.log('MCP server connected incrementally:', data);
      refetchUserIntegrations(); // Refresh to get updated integration list

      // Invalidate tools cache to ensure new tools are loaded
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      // Force immediate refetch
      queryClient.refetchQueries({ queryKey: ['tools'] });

      // Invalidate agents cache to ensure agent tools are updated
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      // Force immediate refetch
      queryClient.refetchQueries({ queryKey: ['agents'] });

      onConnectionSuccess?.();
    },
    onError: (error) => {
      console.error('Failed to connect MCP server incrementally:', error);
      onConnectionError?.(error);
    },
  });

  // Incremental MCP server disconnect mutation
  const disconnectMCPServerMutation = useDisconnectMCPServerMutation({
    onSuccess: (data) => {
      console.log('MCP server disconnected incrementally:', data);
      refetchUserIntegrations(); // Refresh to get updated integration list

      // Invalidate tools cache to ensure removed tools are no longer shown
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      // Force immediate refetch
      queryClient.refetchQueries({ queryKey: ['tools'] });

      // Invalidate agents cache to ensure agent tools are updated
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      // Force immediate refetch
      queryClient.refetchQueries({ queryKey: ['agents'] });

      onDisconnectionSuccess?.();
    },
    onError: (error) => {
      console.error('Failed to disconnect MCP server incrementally:', error);
      onDisconnectionError?.(error);
    },
  });

  // Legacy: Refresh user MCP servers mutation (for backwards compatibility)
  const refreshUserMCPMutation = useMutation({
    mutationFn: () => dataService.refreshUserMCP(),
    onSuccess: () => {
      console.log('MCP servers refreshed successfully');
    },
    onError: (error) => {
      console.warn('Failed to refresh MCP servers:', error);
    },
  });

  // Clean up orphaned MCP tools mutation
  const cleanupOrphanedMCPToolsMutation = useMutation({
    mutationFn: () => dataService.cleanupOrphanedMCPTools(),
    onSuccess: (data) => {
      console.log('Orphaned MCP tools cleanup completed:', data);
    },
    onError: (error) => {
      console.error('Failed to cleanup orphaned MCP tools:', error);
    },
  });

  const integrationCallbackMutation = useIntegrationCallbackMutation({
    onSuccess: (response) => {
      console.log('Integration created successfully:', response);

      // Use incremental connection instead of full refresh
      // We can get the appSlug from the createConnectTokenMutation variables
      const appSlug = createConnectTokenMutation.variables?.app;
      if (appSlug) {
        // Convert appSlug to server name (following the pattern: pipedream-{appSlug})
        const serverName = `pipedream-${appSlug}`;
        console.log(`Connecting MCP server incrementally: ${serverName}`);
        connectMCPServerMutation.mutate({ serverName });
      } else {
        // Fallback to full refresh if we can't determine the server name
        console.log('Fallback to full MCP refresh - no appSlug available');
        refreshUserMCPMutation.mutate();
        onConnectionSuccess?.();
      }
    },
    onError: (error) => {
      console.error('Failed to create integration record:', error);
      onConnectionError?.(error);
    },
  });

  const createConnectTokenMutation = useCreateConnectTokenMutation({
    onSuccess: async (response) => {
      console.log('=== Connect Token Response ===', response);

      if (response.data?.token) {
        console.log('Token received, attempting to use Pipedream SDK...');

        try {
          const pipedreamSDK = await import('@pipedream/sdk' as any);
          console.log('SDK imported:', pipedreamSDK);

          if (pipedreamSDK.createFrontendClient) {
            console.log('Creating frontend client...');
            const pd = pipedreamSDK.createFrontendClient();
            console.log('Frontend client created:', pd);

            const appSlug = createConnectTokenMutation.variables?.app;
            console.log('App slug:', appSlug);
            console.log('Token:', response.data.token);

            console.log('Calling connectAccount...');
            pd.connectAccount({
              app: appSlug,
              token: response.data.token,
              onSuccess: (account: any) => {
                console.log(`Account successfully connected: ${account.id}`);
                console.log('Account details:', account);

                if (user?.id) {
                  integrationCallbackMutation.mutate({
                    account_id: account.id,
                    external_user_id: user.id,
                    app: appSlug,
                  });
                } else {
                  console.error('User ID not available for integration callback');
                  onConnectionError?.(new Error('User ID not available'));
                }
              },
              onError: (err: any) => {
                console.error(`Connection error: ${err.message}`);
                console.error('Full error:', err);
                onConnectionError?.(err);
              },
            });
            console.log('connectAccount called successfully');
          } else {
            console.error('Frontend client not available in SDK');
            throw new Error('Frontend client not available in main SDK export');
          }
        } catch (error) {
          console.error('Failed to load or use Pipedream SDK:', error);
          console.log('Falling back to connect link URL...');

          if (response.data?.connect_link_url) {
            console.log('Opening connect link:', response.data.connect_link_url);
            window.open(response.data.connect_link_url, '_blank');
          } else {
            console.error('No connect link URL available');
            onConnectionError?.(error);
          }
        }
      } else {
        console.error('No token in response:', response);
        onConnectionError?.(new Error('No token received'));
      }
    },
    onError: (error) => {
      console.error('Failed to create connect token:', error);
      onConnectionError?.(error);
    },
  });

  const deleteIntegrationMutation = useDeleteIntegrationMutation({
    onSuccess: (_, integrationId) => {
      refetchUserIntegrations();

      // Find the integration to get the server name for incremental disconnect
      const integration = userIntegrations.find((i) => i._id === integrationId);
      if (integration?.appSlug) {
        // Convert appSlug to server name (following the pattern: pipedream-{appSlug})
        const serverName = `pipedream-${integration.appSlug}`;
        console.log(`Disconnecting MCP server incrementally: ${serverName}`);
        disconnectMCPServerMutation.mutate({ serverName });
      } else {
        // Fallback to full refresh and cleanup if we can't determine the server name
        console.log('Fallback to full MCP refresh and cleanup - no appSlug available');
        refreshUserMCPMutation.mutate();

        // Cleanup orphaned MCP tools from agents
        setTimeout(() => {
          cleanupOrphanedMCPToolsMutation.mutate();
        }, 1000);

        onDisconnectionSuccess?.();
      }
    },
    onError: (error) => {
      console.error('Failed to delete integration:', error);
      onDisconnectionError?.(error);
    },
  });

  const handleConnect = (integration: TAvailableIntegration | { appSlug: string }) => {
    createConnectTokenMutation.mutate({
      app: integration.appSlug,
      redirect_url: `${window.location.origin}/d/integrations?connected=true`,
    });
  };

  const handleDisconnect = (userIntegration: TUserIntegration) => {
    if (userIntegration._id) {
      deleteIntegrationMutation.mutate(userIntegration._id);
    }
  };

  // Check if integration is connected
  const isIntegrationConnected = (serverName: string) => {
    const integrations = Array.isArray(userIntegrations) ? userIntegrations : [];

    // Convert server name to appSlug for integration checking
    // Server names like "pipedream-gmail" should match userIntegrations with appSlug "gmail"
    const appSlug = serverName.startsWith('pipedream-')
      ? serverName.replace('pipedream-', '')
      : serverName;

    return integrations.some(
      (userIntegration) => userIntegration.appSlug === appSlug && userIntegration.isActive,
    );
  };

  // Get user integration for an app
  const getUserIntegration = (serverName: string) => {
    const integrations = Array.isArray(userIntegrations) ? userIntegrations : [];

    // Convert server name to appSlug for integration checking
    // Server names like "pipedream-gmail" should match userIntegrations with appSlug "gmail"
    const appSlug = serverName.startsWith('pipedream-')
      ? serverName.replace('pipedream-', '')
      : serverName;

    return integrations.find(
      (userIntegration) => userIntegration.appSlug === appSlug && userIntegration.isActive,
    );
  };

  // Check if all required MCP servers are connected
  const areAllMCPServersConnected = (mcpServers: string[] = []) => {
    if (!mcpServers || mcpServers.length === 0) {
      return true; // No MCP servers required
    }

    console.log('[MCP Connection Check] Required servers:', mcpServers);
    console.log(
      '[MCP Connection Check] Available user integrations:',
      userIntegrations.map((ui) => ({ appSlug: ui.appSlug, isActive: ui.isActive })),
    );

    const result = mcpServers.every((serverName) => {
      const connected = isIntegrationConnected(serverName);
      const appSlug = serverName.startsWith('pipedream-')
        ? serverName.replace('pipedream-', '')
        : serverName;
      console.log(
        `[MCP Connection Check] Server "${serverName}" (appSlug: "${appSlug}") connected:`,
        connected,
      );
      return connected;
    });

    console.log('[MCP Connection Check] All servers connected:', result);
    return result;
  };

  // Get missing MCP servers
  const getMissingMCPServers = (mcpServers: string[] = []) => {
    if (!mcpServers || mcpServers.length === 0) {
      return [];
    }

    return mcpServers.filter((serverName) => !isIntegrationConnected(serverName));
  };

  return {
    // Connection functions
    handleConnect,
    handleDisconnect,

    // Status checking functions
    isIntegrationConnected,
    getUserIntegration,
    areAllMCPServersConnected,
    getMissingMCPServers,

    // Loading states (include incremental operations)
    isConnecting:
      createConnectTokenMutation.isLoading ||
      integrationCallbackMutation.isLoading ||
      connectMCPServerMutation.isLoading,
    isDisconnecting: deleteIntegrationMutation.isLoading || disconnectMCPServerMutation.isLoading,

    // Data
    userIntegrations,
    refetchUserIntegrations,
  };
}
