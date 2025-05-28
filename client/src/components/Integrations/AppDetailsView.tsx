import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui';
import { Spinner } from '~/components/svg';
import ComponentCard from './ComponentCard';
import {
  useAppDetailsQuery,
  useAppComponentsQuery,
  useUserIntegrationsQuery,
  useCreateConnectTokenMutation,
  useDeleteIntegrationMutation,
  useIntegrationCallbackMutation,
} from '~/data-provider';
import type { TAppComponent, TUserIntegration, TAppDetails, TAppComponents } from 'librechat-data-provider';

export default function AppDetailsView() {
  const { appSlug } = useParams<{ appSlug: string }>();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [activeTab, setActiveTab] = useState('overview');

  const { 
    data: appDetails, 
    isLoading: isLoadingDetails, 
    error: detailsError 
  } = useAppDetailsQuery(appSlug || '');

  console.log('[AppDetailsView] appSlug:', appSlug);
  console.log('[AppDetailsView] isLoadingDetails:', isLoadingDetails);
  console.log('[AppDetailsView] detailsError:', detailsError ? JSON.stringify(detailsError, null, 2) : null);
  console.log('[AppDetailsView] appDetails (direct from query):', appDetails ? JSON.stringify(appDetails, null, 2) : 'undefined');

  const { 
    data: components, 
    isLoading: isLoadingComponents, 
    error: componentsError 
  } = useAppComponentsQuery(appSlug || '');
  
  console.log('[AppDetailsView] components (direct from query):', components ? JSON.stringify(components, null, 2) : 'undefined');

  const { data: userIntegrations = [], refetch: refetchUserIntegrations } = useUserIntegrationsQuery();

  // Find user integration by comparing userIntegration.appSlug with appDetails.name_slug
  const userIntegration = userIntegrations.find(
    (integration: TUserIntegration) => integration.appSlug === appDetails?.name_slug && integration.isActive
  );
  const isConnected = !!userIntegration;

  // Handle successful connection callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connected') === 'true') {
      // Remove the query parameter from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // Refresh user integrations to show the new connection
      refetchUserIntegrations();
      
      // TODO: Show success toast notification
      console.log('Integration connected successfully!');
    }
  }, [refetchUserIntegrations]);

  const createConnectTokenMutation = useCreateConnectTokenMutation({
    onSuccess: async (response) => {
      console.log('=== Connect Token Response (App Details) ===', response);
      
      // The backend returns { success: true, data: { token, expires_at, connect_link_url } }
      if (response.data?.token) {
        console.log('Token received, attempting to use Pipedream SDK...');
        
        try {
          // Use dynamic import from main package to avoid module resolution issues
          // TypeScript workaround: use type assertion to bypass module resolution
          console.log('Importing Pipedream SDK...');
          const pipedreamSDK = await import('@pipedream/sdk' as any);
          console.log('SDK imported:', pipedreamSDK);
          
          // Check if browser client is available
          if (pipedreamSDK.createFrontendClient) {
            console.log('Creating frontend client...');
            const pd = pipedreamSDK.createFrontendClient();
            console.log('Frontend client created:', pd);
            
            // Get the app slug from the current request
            const appSlugForConnection = appDetails?.name_slug;
            console.log('App slug:', appSlugForConnection);
            console.log('Token:', response.data.token);
            
            console.log('Calling connectAccount...');
            pd.connectAccount({
              app: appSlugForConnection,
              token: response.data.token,
              onSuccess: (account: any) => {
                console.log(`Account successfully connected: ${account.id}`);
                console.log('Account details:', account);
                
                // Call our backend to create the user integration record
                if (user?.id) {
                  integrationCallbackMutation.mutate({
                    account_id: account.id,
                    external_user_id: user.id,
                    app: appSlugForConnection,
                  });
                } else {
                  console.error('User ID not available for integration callback');
                }
              },
              onError: (err: any) => {
                console.error(`Connection error: ${err.message}`);
                console.error('Full error:', err);
                // TODO: Show error toast
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
          
          // Fallback to opening the connect link URL
          if (response.data?.connect_link_url) {
            console.log('Opening connect link:', response.data.connect_link_url);
            window.open(response.data.connect_link_url, '_blank');
          } else {
            console.error('No connect link URL available');
          }
          // TODO: Show error toast
        }
      } else {
        console.error('No token in response:', response);
        // TODO: Show error toast
      }
    },
    onError: (error) => {
      console.error('Failed to create connect token:', error);
      // TODO: Show error toast
    },
  });

  const deleteIntegrationMutation = useDeleteIntegrationMutation({
    onSuccess: () => {
      refetchUserIntegrations();
    },
    onError: (error) => {
      console.error('Failed to delete integration:', error);
    },
  });

  const handleConnect = () => {
    if (!appDetails) return;
    
    createConnectTokenMutation.mutate({
      app: appDetails.name_slug, // Use name_slug from the actual appDetails
      // Use frontend URL for redirect, not backend API endpoint
      redirect_url: `${window.location.origin}${window.location.pathname}?connected=true`,
    });
  };

  const handleDisconnect = () => {
    if (!userIntegration?._id) return;
    deleteIntegrationMutation.mutate(userIntegration._id);
  };

  const integrationCallbackMutation = useIntegrationCallbackMutation({
    onSuccess: (response) => {
      console.log('Integration created successfully:', response);
      // User integrations will be automatically refreshed due to mutation's onSuccess
      // TODO: Show success toast
    },
    onError: (error) => {
      console.error('Failed to create integration record:', error);
      // TODO: Show error toast
    },
  });

  const isLoading = isLoadingDetails || isLoadingComponents;

  if (isLoadingDetails) {
    console.log('[AppDetailsView] Rendering: Loading app details...');
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Spinner className="h-8 w-8" />
          <p className="text-text-secondary">Loading app details...</p>
        </div>
      </div>
    );
  }

  if (detailsError) {
    console.error('[AppDetailsView] Rendering: Error loading app details.', detailsError);
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Failed to load app details</p>
          <p className="text-xs text-text-secondary mt-1">{(detailsError as any)?.message || 'Unknown error'}</p>
          <Button onClick={() => navigate('/d/integrations')} variant="outline" className="mt-4">
            Back to Integrations
          </Button>
        </div>
      </div>
    );
  }

  if (!appDetails) {
    console.warn('[AppDetailsView] Rendering: appDetails object is null or undefined after loading and no error.');
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-orange-600">App details are not available.</p>
          <p className="text-xs text-text-secondary mt-1">The requested app might not exist or data is missing.</p>
          <Button onClick={() => navigate('/d/integrations')} variant="outline" className="mt-4">
            Back to Integrations
          </Button>
        </div>
      </div>
    );
  }
  
  console.log('[AppDetailsView] Rendering: Main content with appDetails:', JSON.stringify(appDetails, null, 2));

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          onClick={() => navigate('/d/integrations')}
          variant="ghost"
          className="mb-4 p-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Integrations
        </Button>

        <div className="flex items-start space-x-6">
          <div className="flex-shrink-0">
            <img
              src={appDetails.img_src || `https://via.placeholder.com/80x80?text=${appDetails.name?.charAt(0) || '?'}`}
              alt={appDetails.name || 'App'}
              className="h-20 w-20 rounded-lg object-cover"
            />
          </div>
          
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary">{appDetails.name || 'Unknown App'}</h1>
            <p className="mt-2 text-text-secondary">{appDetails.description || 'No description available'}</p>
            
            {appDetails.categories && appDetails.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {appDetails.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex-shrink-0">
            {isConnected ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-green-600">Connected</span>
                </div>
                <Button
                  onClick={handleDisconnect}
                  variant="outline"
                  disabled={deleteIntegrationMutation.isLoading}
                >
                  {deleteIntegrationMutation.isLoading ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={createConnectTokenMutation.isLoading || !appDetails.isConnectable}
              >
                {createConnectTokenMutation.isLoading ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="actions" disabled={!components?.actions?.length}>
            Actions ({components?.actions?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">App Information</h3>
              <div className="rounded-lg border border-border-light bg-surface-primary p-4">
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-text-secondary">Authentication Type</dt>
                    <dd className="text-sm text-text-primary capitalize">{appDetails.auth_type}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-text-secondary">Available Actions</dt>
                    <dd className="text-sm text-text-primary">{components?.actions?.length || 0}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Connection Status</h3>
              <div className="rounded-lg border border-border-light bg-surface-primary p-4">
                {isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      <span className="font-medium text-green-600">Connected</span>
                    </div>
                    <p className="text-sm text-text-secondary">
                      This app is connected to your account. You can use its actions and triggers in your workflows.
                    </p>
                    {userIntegration?.lastConnectedAt && (
                      <p className="text-xs text-text-secondary">
                        Connected on {new Date(userIntegration.lastConnectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <div className="h-3 w-3 rounded-full bg-gray-400"></div>
                      <span className="font-medium text-text-secondary">Not Connected</span>
                    </div>
                    <p className="text-sm text-text-secondary">
                      Connect this app to your account to use its actions and triggers in your workflows.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="mt-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">Available Actions</h3>
            {components?.actions && components.actions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {components.actions.map((action: TAppComponent) => (
                  <ComponentCard
                    key={action.key}
                    component={action}
                    type="action"
                    isConnected={isConnected}
                    appSlug={appSlug || ''} /* Pass appSlug or appDetails.id for component specific actions if needed */
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border border-border-light bg-surface-secondary">
                <p className="text-text-secondary">No actions available for this app</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 