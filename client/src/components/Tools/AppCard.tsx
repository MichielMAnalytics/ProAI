import { useState, useMemo } from 'react';
import { ChevronDown, AlertTriangle, Check, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type {
  TPlugin,
  TPluginAction,
  TError,
  TAvailableIntegration,
} from 'librechat-data-provider';
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
  onRemoveApp: (appId: string, toolKeys: string[]) => void;
}

export default function AppCard({
  app,
  toolsFormKey,
  onInstallError,
  updateMCPServers,
  onAddTool,
  onRemoveTool,
  onRemoveApp,
}: AppCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<TAvailableIntegration | null>(
    null,
  );
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
    return currentTools
      .map((tool: string | any) => (typeof tool === 'string' ? tool : tool.tool || tool))
      .filter((key: any) => typeof key === 'string');
  }, [currentTools]);

  // For single tool apps, check if the tool is selected
  const isSingleToolSelected =
    app.isSingleTool && getCurrentToolKeys.includes(app.tools[0]?.pluginKey);

  // For multi-tool apps, calculate selected tools
  const selectedTools = useMemo(() => {
    if (app.isSingleTool) return [];
    return app.tools.filter((tool) => {
      // For MCP tools, we need to check if any current tool has this tool name and server
      if (tool.serverName) {
        return currentTools.some((currentTool: any) => {
          if (typeof currentTool === 'object' && currentTool.tool && currentTool.server) {
            return currentTool.tool === tool.pluginKey && currentTool.server === tool.serverName;
          }
          return false;
        });
      } else {
        // For regular tools, check by pluginKey
        return getCurrentToolKeys.includes(tool.pluginKey);
      }
    });
  }, [app.tools, getCurrentToolKeys, app.isSingleTool, currentTools]);

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

      if (allToolsSelected) {
        // For MCP tools, we can now use the clean pluginKey directly
        const toolsToRemove = app.tools.map((tool) => tool.pluginKey);

        // Remove tools directly from the form state
        const currentToolsList = getValues(toolsFormKey) || [];
        const updatedTools = currentToolsList.filter((currentTool: string | any) => {
          if (typeof currentTool === 'string') {
            return !toolsToRemove.includes(currentTool);
          } else if (typeof currentTool === 'object' && currentTool.tool && currentTool.server) {
            // For MCP tool objects, check if this tool belongs to this server
            return !(
              toolsToRemove.includes(currentTool.tool) &&
              currentTool.server === app.tools[0]?.serverName
            );
          }
          return true;
        });
        setValue(toolsFormKey, updatedTools);
      } else {
        // Select all tools from this app that don't require auth
        app.tools.forEach((tool) => {
          // Check if this tool is already selected using the same logic as selectedTools
          const isAlreadySelected = tool.serverName
            ? currentTools.some((currentTool: any) => {
                if (typeof currentTool === 'object' && currentTool.tool && currentTool.server) {
                  return (
                    currentTool.tool === tool.pluginKey && currentTool.server === tool.serverName
                  );
                }
                return false;
              })
            : getCurrentToolKeys.includes(tool.pluginKey);

          if (!isAlreadySelected) {
            const { authConfig, authenticated = false } = tool;
            if (!authConfig || authConfig.length === 0 || authenticated) {
              // For MCP tools, add directly to form state with enhanced format
              if (tool.serverName) {
                const currentToolsList = getValues(toolsFormKey) || [];
                const newTool = {
                  tool: tool.pluginKey,
                  server: tool.serverName,
                  type: tool.isGlobal ? ('global' as const) : ('user' as const),
                };
                setValue(toolsFormKey, [...currentToolsList, newTool]);
              } else {
                // For regular tools, use the standard onAddTool function
                onAddTool(tool.pluginKey);
              }
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

    // Check if this MCP tool is selected using the proper logic
    const isSelected = tool.serverName
      ? currentTools.some((currentTool: any) => {
          if (typeof currentTool === 'object' && currentTool.tool && currentTool.server) {
            return currentTool.tool === tool.pluginKey && currentTool.server === tool.serverName;
          }
          return false;
        })
      : getCurrentToolKeys.includes(tool.pluginKey);

    if (isSelected) {
      // Remove the tool directly from form state
      if (tool.serverName) {
        const currentToolsList = getValues(toolsFormKey) || [];
        const updatedTools = currentToolsList.filter((currentTool: string | any) => {
          if (typeof currentTool === 'object' && currentTool.tool && currentTool.server) {
            return !(currentTool.tool === tool.pluginKey && currentTool.server === tool.serverName);
          }
          return true;
        });
        setValue(toolsFormKey, updatedTools);
      } else {
        onRemoveTool(tool.pluginKey);
      }
    } else {
      // Add the tool to form state
      if (tool.serverName) {
        // For MCP tools, add directly to form state with enhanced format
        const currentToolsList = getValues(toolsFormKey) || [];
        const newTool = {
          tool: tool.pluginKey,
          server: tool.serverName,
          type: tool.isGlobal ? ('global' as const) : ('user' as const),
        };
        setValue(toolsFormKey, [...currentToolsList, newTool]);
      } else {
        // For regular tools, use the standard onAddTool function
        onAddTool(tool.pluginKey);
      }
    }
  };

  // Helper function to get integration data for disconnected apps
  const getIntegrationForApp = () => {
    if (!app.isDisconnected || !availableIntegrations) return null;

    // Convert app name to appSlug for integration lookup
    // Server names like "pipedream-gmail" should match availableIntegrations with appSlug "gmail"
    const appSlug = app.name.startsWith('pipedream-')
      ? app.name.replace('pipedream-', '')
      : app.name;
    const integration = availableIntegrations.find((ai) => ai.appSlug === appSlug);

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
    const toolsToRemove = app.tools.map((tool) => tool.pluginKey).filter(Boolean);

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
    ? !!userIntegrations?.find((ui) => ui.appSlug === selectedIntegration.appSlug)
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
    <div
      className={cn(
        'rounded-xl border shadow-sm transition-all duration-200',
        app.isDisconnected
          ? 'border-orange-300 bg-orange-50 dark:border-orange-600/50 dark:bg-orange-900/20'
          : 'border-border-light bg-surface-primary hover:bg-surface-secondary',
      )}
    >
      {/* App Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* App Icon */}
            <div className="relative flex-shrink-0">
              {app.isDisconnected ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-800/50">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              ) : app.icon ? (
                <img
                  src={app.icon}
                  alt={app.displayName}
                  className="h-10 w-10 rounded-sm object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-surface-tertiary">
                  <div className="bg-surface-quaternary h-6 w-6 rounded" />
                </div>
              )}
              {/* Global indicator */}
              {app.isGlobal && (
                <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-white bg-blue-500 dark:border-gray-800" />
              )}
            </div>

            {/* App Info */}
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  'truncate text-sm font-semibold',
                  app.isDisconnected ? 'text-orange-700 dark:text-orange-300' : 'text-text-primary',
                )}
              >
                {app.displayName}
              </h3>
              <p
                className={cn(
                  'mt-1 text-xs',
                  app.isDisconnected
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-text-secondary',
                )}
              >
                {app.isSingleTool
                  ? `Single tool${isSingleToolSelected ? ' • Selected' : ''}`
                  : `${app.tools.length} tool${app.tools.length !== 1 ? 's' : ''} • ${selectedTools.length} selected`}
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
                  className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-orange-700"
                  aria-label={`Connect ${app.displayName}`}
                >
                  Connect
                </button>
                <button
                  onClick={handleDeleteServer}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-all duration-200 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  aria-label={`Delete ${app.displayName} server`}
                  title={`Remove ${app.displayName} server and all its tools`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </>
            )}

            {/* Selection Toggle Button */}
            {!app.isDisconnected && (
              <button
                onClick={handleAppToggle}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all duration-200',
                  selectionStatus === 'all'
                    ? 'border-[#0E1593] bg-[#0E1593] text-white'
                    : selectionStatus === 'some'
                      ? 'border-[#0E1593] bg-[#0E1593]/20 text-[#0E1593]'
                      : 'border-border-medium hover:border-[#0E1593] hover:bg-[#0E1593]/10',
                )}
                aria-label={
                  app.isSingleTool
                    ? isSingleToolSelected
                      ? 'Deselect tool'
                      : 'Select tool'
                    : allToolsSelected
                      ? 'Deselect all tools'
                      : 'Select all tools'
                }
              >
                {selectionStatus === 'all' ? (
                  <Check className="h-3 w-3" />
                ) : selectionStatus === 'some' ? (
                  <div className="h-1.5 w-1.5 rounded-sm bg-[#0E1593]" />
                ) : null}
              </button>
            )}

            {/* Expand Button or Spacer */}
            {!app.isDisconnected &&
              (!app.isSingleTool ? (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-all duration-200 hover:bg-surface-hover hover:text-text-primary"
                  aria-label={isExpanded ? 'Collapse tools' : 'Expand tools'}
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-200',
                      isExpanded ? 'rotate-180' : '',
                    )}
                  />
                </button>
              ) : (
                <div className="h-8 w-8" /> // Spacer to maintain consistent alignment
              ))}
          </div>
        </div>
      </div>

      {/* Tools List (only for multi-tool apps when expanded and not disconnected) */}
      {!app.isSingleTool && !app.isDisconnected && isExpanded && (
        <div
          className={cn(
            'border-t px-4 pb-4',
            app.isDisconnected
              ? 'border-orange-300 dark:border-orange-600/50'
              : 'border-border-light',
          )}
        >
          <div className="mt-3 space-y-2">
            {app.tools.map((tool, index) => {
              // Check if this tool is selected using the same logic as selectedTools
              const isSelected = tool.serverName
                ? currentTools.some((currentTool: any) => {
                    if (typeof currentTool === 'object' && currentTool.tool && currentTool.server) {
                      return (
                        currentTool.tool === tool.pluginKey &&
                        currentTool.server === tool.serverName
                      );
                    }
                    return false;
                  })
                : getCurrentToolKeys.includes(tool.pluginKey);
              const isDisconnected = tool.isDisconnected;

              return (
                <div
                  key={tool.pluginKey || index}
                  className={cn(
                    'flex items-center justify-between rounded-lg border p-2 transition-all duration-200',
                    isDisconnected
                      ? 'border-orange-200 bg-orange-50 dark:border-orange-600/30 dark:bg-orange-900/10'
                      : isSelected
                        ? 'border-[#0E1593]/30 bg-[#0E1593]/5'
                        : 'border-border-light bg-surface-secondary hover:bg-surface-tertiary',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isDisconnected && (
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-orange-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          isDisconnected
                            ? 'text-orange-700 dark:text-orange-300'
                            : 'text-text-primary',
                        )}
                      >
                        {formatToolName(tool.name)}
                      </p>
                      {tool.description && (
                        <p
                          className={cn(
                            'mt-0.5 truncate text-xs',
                            isDisconnected
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-text-secondary',
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
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200',
                      isDisconnected
                        ? 'border-orange-400 hover:bg-orange-200 dark:hover:bg-orange-800/30'
                        : isSelected
                          ? 'border-[#0E1593] bg-[#0E1593] text-white'
                          : 'border-border-medium hover:border-[#0E1593] hover:bg-[#0E1593]/10',
                    )}
                    aria-label={
                      isDisconnected ? 'Remove tool' : isSelected ? 'Deselect tool' : 'Select tool'
                    }
                  >
                    {isDisconnected ? (
                      <X className="h-3 w-3" />
                    ) : isSelected ? (
                      <Check className="h-3 w-3" />
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
          userIntegration={userIntegrations?.find(
            (ui) => ui.appSlug === selectedIntegration.appSlug,
          )}
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
