import { useMutation } from '@tanstack/react-query';
import { useAuthContext } from '~/hooks/AuthContext';
import {
  useCreateConnectTokenMutation,
  useDeleteIntegrationMutation,
  useIntegrationCallbackMutation,
  useUserIntegrationsQuery,
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
  
  const {
    data: userIntegrations = [],
    refetch: refetchUserIntegrations,
  } = useUserIntegrationsQuery();

  // Refresh user MCP servers mutation
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
      
      // Refresh MCP servers to immediately make the new integration available
      refreshUserMCPMutation.mutate();
      
      onConnectionSuccess?.();
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
              }
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
    onSuccess: () => {
      refetchUserIntegrations();
      
      // Refresh MCP servers to immediately remove the disconnected integration
      refreshUserMCPMutation.mutate();
      
      // Cleanup orphaned MCP tools from agents
      setTimeout(() => {
        cleanupOrphanedMCPToolsMutation.mutate();
      }, 1000);
      
      onDisconnectionSuccess?.();
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
  const isIntegrationConnected = (appSlug: string) => {
    const integrations = Array.isArray(userIntegrations) ? userIntegrations : [];
    return integrations.some(
      (userIntegration) => userIntegration.appSlug === appSlug && userIntegration.isActive
    );
  };

  // Get user integration for an app
  const getUserIntegration = (appSlug: string) => {
    const integrations = Array.isArray(userIntegrations) ? userIntegrations : [];
    return integrations.find(
      (userIntegration) => userIntegration.appSlug === appSlug && userIntegration.isActive
    );
  };

  // Check if all required MCP servers are connected
  const areAllMCPServersConnected = (mcpServers: string[] = []) => {
    if (!mcpServers || mcpServers.length === 0) {
      return true; // No MCP servers required
    }
    
    return mcpServers.every(appSlug => isIntegrationConnected(appSlug));
  };

  // Get missing MCP servers
  const getMissingMCPServers = (mcpServers: string[] = []) => {
    if (!mcpServers || mcpServers.length === 0) {
      return [];
    }
    
    return mcpServers.filter(appSlug => !isIntegrationConnected(appSlug));
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
    
    // Loading states
    isConnecting: createConnectTokenMutation.isLoading || integrationCallbackMutation.isLoading,
    isDisconnecting: deleteIntegrationMutation.isLoading,
    
    // Data
    userIntegrations,
    refetchUserIntegrations,
  };
} 