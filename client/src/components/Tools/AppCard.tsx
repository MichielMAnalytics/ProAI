import { useState, useMemo } from 'react';
import { ChevronDown, AlertTriangle, Check, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TPlugin, TPluginAction, TError, TAvailableIntegration } from 'librechat-data-provider';
import { cn } from '~/utils';
import { formatToolName, cleanDescription } from '~/utils/textProcessing';
import { useMCPConnection } from '~/hooks';
import { useAvailableIntegrationsQuery, useUserIntegrationsQuery } from '~/data-provider';
import { TrashIcon } from '~/components/svg';
import AppDetailsModal from '../Integrations/AppDetailsModal';

interface AppCardProps {
  app: {
    id: string;
    name: string;
    displayName: string;
    icon?: string;
    tools: any[];
    isDisconnected?: boolean;
    isSingleTool?: boolean;
    isGlobal?: boolean;
  };
  toolsFormKey: string;
  onInstallError: (error: TError) => void;
  updateMCPServers: () => void;
  onAddTool: (pluginKey: string) => void;
  onRemoveTool: (pluginKey: string) => void;
}

export default function AppCard({ 
  app, 
  toolsFormKey, 
  onInstallError,
  updateMCPServers,
  onAddTool,
  onRemoveTool
}: AppCardProps) {

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<TAvailableIntegration | null>(null);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const { getValues, setValue } = useFormContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  
  // Queries for integration data
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();
  const { data: userIntegrations } = useUserIntegrationsQuery();
  
  // MCP connection hook
  const { handleConnect } = useMCPConnection({
    onConnectionSuccess: () => {
      console.log(`Successfully connected to ${app.displayName}`);
      setIsAppModalOpen(false);
    },
    onConnectionError: (error) => {
      console.error(`Failed to connect to ${app.displayName}:`, error);
    },
  });
  
  const currentTools = getValues(toolsFormKey) || [];
  
  // Helper function to extract tool keys from enhanced tools structure
  const getCurrentToolKeys = useMemo(() => {
    return currentTools.map((tool: string | any) => 
      typeof tool === 'string' ? tool : tool.tool || tool
    ).filter((key: any) => typeof key === 'string');
  }, [currentTools]);
  
  // For single tool apps, check if the tool is selected
  const isSingleToolSelected = app.isSingleTool && getCurrentToolKeys.includes(app.tools[0]?.pluginKey);
  
  // For multi-tool apps, calculate selected tools
  const selectedTools = useMemo(() => {
    if (app.isSingleTool) return [];
    return app.tools.filter(tool => 
      getCurrentToolKeys.includes(tool.pluginKey)
    );
  }, [app.tools, getCurrentToolKeys, app.isSingleTool]);
  
  const allToolsSelected = !app.isSingleTool && selectedTools.length === app.tools.length;
  const someToolsSelected = !app.isSingleTool && selectedTools.length > 0;
  
  const handleAppToggle = () => {
    if (app.isSingleTool) {
      // Handle single tool toggle
      const tool = app.tools[0];
      if (isSingleToolSelected) {
        onRemoveTool(tool.pluginKey);
      } else {
        onAddTool(tool.pluginKey);
      }
    } else {
      // Handle multi-tool server toggle
      if (app.isDisconnected) return; // Can't toggle disconnected servers
      
      const toolKeys = app.tools.map(tool => tool.pluginKey);
      
      if (allToolsSelected) {
        // Deselect all tools from this app
        toolKeys.forEach(toolKey => {
          onRemoveTool(toolKey);
        });
      } else {
        // Select all tools from this app that don't require auth
        app.tools.forEach(tool => {
          if (!getCurrentToolKeys.includes(tool.pluginKey)) {
            const { authConfig, authenticated = false } = tool;
            if (!authConfig || authConfig.length === 0 || authenticated) {
              onAddTool(tool.pluginKey);
            }
          }
        });
      }
    }
  };
  
  const handleToolToggle = (tool: any) => {
    if (tool.isDisconnected) {
      // Handle disconnected tool removal
      onRemoveTool(tool.pluginKey);
      return;
    }
    
    const isSelected = getCurrentToolKeys.includes(tool.pluginKey);
    
    if (isSelected) {
      onRemoveTool(tool.pluginKey);
    } else {
      onAddTool(tool.pluginKey);
    }
  };

  // Helper function to get integration data for disconnected apps
  const getIntegrationForApp = () => {
    if (!app.isDisconnected || !availableIntegrations) return null;
    
    // Convert app name to appSlug for integration lookup
    // Server names like "pipedream-gmail" should match availableIntegrations with appSlug "gmail"
    const appSlug = app.name.startsWith('pipedream-') ? app.name.replace('pipedream-', '') : app.name;
    const integration = availableIntegrations.find(ai => ai.appSlug === appSlug);
    
    if (integration) {
      return integration;
    }
    
    // If no direct match, create a fallback integration object
    return {
      appSlug,
      appName: app.displayName,
      appDescription: `${app.displayName} integration`,
      appIcon: app.icon,
      authType: 'oauth' as const,
      appCategories: [],
      appUrl: '',
      isActive: true,
    };
  };

  const handleConnectClick = () => {
    const integration = getIntegrationForApp();
    if (integration) {
      setSelectedIntegration(integration);
      setIsAppModalOpen(true);
    }
  };

  const handleCloseAppModal = () => {
    setIsAppModalOpen(false);
    setSelectedIntegration(null);
  };

  const handleDeleteServer = () => {
    if (!app.isDisconnected) return;
    
    // Remove ALL tools from this disconnected server (not just selected ones)
    const currentToolsList = getValues(toolsFormKey) || [];
    const toolsToRemove = app.tools.map(tool => tool.pluginKey).filter(Boolean);
    
    // Filter out all tools that belong to this server (handle both strings and objects)
    const updatedTools = currentToolsList.filter((tool: string | any) => {
      // Handle both string tools and MCP tool objects
      const toolKey = typeof tool === 'string' ? tool : tool.tool || tool;
      return !toolsToRemove.includes(toolKey);
    });
    
    // Update the tools array
    setValue(toolsFormKey, updatedTools);
    
    // Note: MCP server metadata is now handled within the enhanced tools structure
    // No need to manually maintain a separate mcp_servers field
    
    // Update MCP servers to refresh the UI (but won't re-add the server since we removed it manually)
    updateMCPServers();
  };

  const isConnected = selectedIntegration 
    ? !!userIntegrations?.find(ui => ui.appSlug === selectedIntegration.appSlug)
    : false;
  
  const getSelectionStatus = () => {
    if (app.isSingleTool) {
      return isSingleToolSelected ? 'all' : 'none';
    }
    if (allToolsSelected) return 'all';
    if (someToolsSelected) return 'some';
    return 'none';
  };
  
  const selectionStatus = getSelectionStatus();
  
  return (
    <div className={cn(
      "rounded-xl border shadow-sm transition-all duration-200",
      app.isDisconnected 
        ? "border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600/50"
        : "border-border-light bg-surface-primary hover:bg-surface-secondary"
    )}>
      {/* App Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* App Icon */}
            <div className="flex-shrink-0 relative">
              {app.isDisconnected ? (
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-800/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
              ) : app.icon ? (
                <img 
                  src={app.icon} 
                  alt={app.displayName} 
                  className="w-10 h-10 rounded-sm object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-sm bg-surface-tertiary flex items-center justify-center">
                  <div className="w-6 h-6 rounded bg-surface-quaternary" />
                </div>
              )}
              {/* Global indicator */}
              {app.isGlobal && (
                <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-500 border border-white dark:border-gray-800" />
              )}
            </div>
            
            {/* App Info */}
            <div className="min-w-0 flex-1">
              <h3 className={cn(
                "font-semibold text-sm truncate",
                app.isDisconnected 
                  ? "text-orange-700 dark:text-orange-300"
                  : "text-text-primary"
              )}>
                {app.displayName}
              </h3>
              <p className={cn(
                "text-xs mt-1",
                app.isDisconnected 
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-text-secondary"
              )}>
                {app.isSingleTool 
                  ? `Single tool${isSingleToolSelected ? ' • Selected' : ''}` 
                  : `${app.tools.length} tool${app.tools.length !== 1 ? 's' : ''} • ${selectedTools.length} selected`
                }
              </p>
            </div>
          </div>
          
          {/* App Actions */}
          <div className="flex items-center gap-2">
            {/* Connect and Delete Buttons (only for disconnected apps) */}
            {app.isDisconnected && (
              <>
                <button
                  onClick={handleConnectClick}
                  className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition-all duration-200"
                  aria-label={`Connect ${app.displayName}`}
                >
                  Connect
                </button>
                <button
                  onClick={handleDeleteServer}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-red-100 dark:hover:bg-red-900/20 text-text-tertiary hover:text-red-600 dark:hover:text-red-400"
                  aria-label={`Delete ${app.displayName} server`}
                  title={`Remove ${app.displayName} server and all its tools`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
            
            {/* Selection Toggle Button */}
            {!app.isDisconnected && (
              <button
                onClick={handleAppToggle}
                className={cn(
                  "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-200",
                  selectionStatus === 'all'
                    ? "bg-[#0E1593] border-[#0E1593] text-white"
                    : selectionStatus === 'some'
                    ? "bg-[#0E1593]/20 border-[#0E1593] text-[#0E1593]"
                    : "border-border-medium hover:border-[#0E1593] hover:bg-[#0E1593]/10"
                )}
                aria-label={
                  app.isSingleTool 
                    ? (isSingleToolSelected ? "Deselect tool" : "Select tool")
                    : (allToolsSelected ? "Deselect all tools" : "Select all tools")
                }
              >
                {selectionStatus === 'all' ? (
                  <Check className="w-3 h-3" />
                ) : selectionStatus === 'some' ? (
                  <div className="w-1.5 h-1.5 bg-[#0E1593] rounded-sm" />
                ) : null}
              </button>
            )}
            
            {/* Expand Button or Spacer */}
            {!app.isDisconnected && (
              !app.isSingleTool ? (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-surface-hover text-text-secondary hover:text-text-primary"
                  aria-label={isExpanded ? "Collapse tools" : "Expand tools"}
                >
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    isExpanded ? "rotate-180" : ""
                  )} />
                </button>
              ) : (
                <div className="w-8 h-8" /> // Spacer to maintain consistent alignment
              )
            )}
          </div>
        </div>
      </div>
      
      {/* Tools List (only for multi-tool apps when expanded and not disconnected) */}
      {!app.isSingleTool && !app.isDisconnected && isExpanded && (
        <div className={cn(
          "border-t px-4 pb-4",
          app.isDisconnected 
            ? "border-orange-300 dark:border-orange-600/50"
            : "border-border-light"
        )}>
          <div className="space-y-2 mt-3">
            {app.tools.map((tool, index) => {
              const isSelected = currentTools.includes(tool.pluginKey);
              const isDisconnected = tool.isDisconnected;
              
              return (
                <div
                  key={tool.pluginKey || index}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border transition-all duration-200",
                    isDisconnected
                      ? "border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-600/30"
                      : isSelected
                      ? "border-[#0E1593]/30 bg-[#0E1593]/5"
                      : "border-border-light bg-surface-secondary hover:bg-surface-tertiary"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isDisconnected && (
                      <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "text-sm font-medium truncate",
                        isDisconnected 
                          ? "text-orange-700 dark:text-orange-300"
                          : "text-text-primary"
                      )}>
                        {formatToolName(tool.name)}
                      </p>
                      {tool.description && (
                        <p 
                          className={cn(
                            "text-xs truncate mt-0.5",
                            isDisconnected 
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-text-secondary"
                          )}
                          title={cleanDescription(tool.description)}
                        >
                          {cleanDescription(tool.description)}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleToolToggle(tool)}
                    className={cn(
                      "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0",
                      isDisconnected
                        ? "border-orange-400 hover:bg-orange-200 dark:hover:bg-orange-800/30"
                        : isSelected
                        ? "bg-[#0E1593] border-[#0E1593] text-white"
                        : "border-border-medium hover:border-[#0E1593] hover:bg-[#0E1593]/10"
                    )}
                    aria-label={isDisconnected ? "Remove tool" : isSelected ? "Deselect tool" : "Select tool"}
                  >
                    {isDisconnected ? (
                      <X className="w-3 h-3" />
                    ) : isSelected ? (
                      <Check className="w-3 h-3" />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* App Details Modal */}
      {selectedIntegration && (
        <AppDetailsModal
          isOpen={isAppModalOpen}
          onClose={handleCloseAppModal}
          integration={selectedIntegration}
          isConnected={isConnected}
          userIntegration={userIntegrations?.find(ui => ui.appSlug === selectedIntegration.appSlug)}
          onConnect={() => {
            if (selectedIntegration) {
              handleConnect({ appSlug: selectedIntegration.appSlug });
            }
          }}
          onDisconnect={() => {
            // Handle disconnect if needed
          }}
        />
      )}
    </div>
  );
}