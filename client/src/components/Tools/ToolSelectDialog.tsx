import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import { useFormContext } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { isAgentsEndpoint } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type {
  AssistantsEndpoint,
  EModelEndpoint,
  TPluginAction,
  TError,
} from 'librechat-data-provider';
import type { TPluginStoreDialogProps } from '~/common/types';
import { PluginAuthForm } from '~/components/Plugins/Store';
import { useLocalize, usePluginDialogHelpers } from '~/hooks';
import { useAvailableToolsQuery } from '~/data-provider';
import { Pagination } from '~/components/ui';
import AppCard from './AppCard';

function ToolSelectDialog({
  isOpen,
  endpoint,
  setIsOpen,
  toolsFormKey,
}: TPluginStoreDialogProps & {
  toolsFormKey: string;
  endpoint: AssistantsEndpoint | EModelEndpoint.agents;
}) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { getValues, setValue, watch } = useFormContext();
  const { data: tools, isLoading: isLoadingTools } = useAvailableToolsQuery(endpoint);
  const isAgentTools = isAgentsEndpoint(endpoint);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);

  // Watch form values for reactive updates
  const watchedTools = watch(toolsFormKey);

  // Helper function to format numbers with suffixes (only for very large numbers)
  const formatCount = (count: number): string => {
    if (count < 1000) return count.toString();
    if (count < 10000) return `${(count / 1000).toFixed(1)}K+`.replace('.0', '');
    if (count < 100000) return `${Math.floor(count / 1000)}K+`;
    return `${Math.floor(count / 1000)}K+`;
  };

  const {
    searchValue,
    setSearchValue,
    handleSearch,
    error,
    setError,
    errorMessage,
    setErrorMessage,
    showPluginAuthForm,
    setShowPluginAuthForm,
    selectedPlugin,
    setSelectedPlugin,
  } = usePluginDialogHelpers();

  const updateUserPlugins = useUpdateUserPluginsMutation();
  const handleInstallError = (error: TError) => {
    setError(true);
    const errorMessage = error.response?.data?.message ?? '';
    if (errorMessage) {
      setErrorMessage(errorMessage);
    }
    setTimeout(() => {
      setError(false);
      setErrorMessage('');
    }, 5000);
  };

  const handleInstall = (pluginAction: TPluginAction) => {
    const addFunction = () => {
      const fns = getValues(toolsFormKey).slice();

      // Find the tool metadata to check if it's an MCP tool
      const toolMetadata = tools?.find((t) => t.pluginKey === pluginAction.pluginKey);

      if (toolMetadata?.serverName) {
        // For MCP tools, create enhanced tool object with server metadata
        const mcpTool = {
          tool: pluginAction.pluginKey,
          server: toolMetadata.serverName,
          type: toolMetadata.isGlobal ? ('global' as const) : ('user' as const),
        };
        fns.push(mcpTool);
      } else {
        // For regular tools, add as string
        fns.push(pluginAction.pluginKey);
      }

      setValue(toolsFormKey, fns);
    };

    if (!pluginAction.auth) {
      return addFunction();
    }

    updateUserPlugins.mutate(pluginAction, {
      onError: (error: unknown) => {
        handleInstallError(error as TError);
      },
      onSuccess: addFunction,
    });

    setShowPluginAuthForm(false);
  };

  const onRemoveTool = (tool: string) => {
    setShowPluginAuthForm(false);
    updateUserPlugins.mutate(
      { pluginKey: tool, action: 'uninstall', auth: undefined, isEntityTool: true },
      {
        onError: (error: unknown) => {
          handleInstallError(error as TError);
        },
        onSuccess: () => {
          const fns = getValues(toolsFormKey).filter((fn: string | any) => {
            // Handle both string tools and MCP tool objects
            const fnKey = typeof fn === 'string' ? fn : fn.tool || fn;
            return fnKey !== tool;
          });
          setValue(toolsFormKey, fns);
        },
      },
    );
  };

  const onRemoveApp = (appId: string, toolKeys: string[]) => {
    setShowPluginAuthForm(false);

    // Remove all tools from this app immediately from the form
    const currentTools = getValues(toolsFormKey);
    const updatedTools = currentTools.filter((fn: string | any) => {
      const fnKey = typeof fn === 'string' ? fn : fn.tool || fn;
      return !toolKeys.includes(fnKey);
    });
    setValue(toolsFormKey, updatedTools);

    // Then handle uninstallation for each tool
    toolKeys.forEach((toolKey) => {
      updateUserPlugins.mutate(
        { pluginKey: toolKey, action: 'uninstall', auth: undefined, isEntityTool: true },
        {
          onError: (error: unknown) => {
            handleInstallError(error as TError);
          },
        },
      );
    });
  };

  const onAddTool = (pluginKey: string) => {
    setShowPluginAuthForm(false);
    const getAvailablePluginFromKey = tools?.find((p) => p.pluginKey === pluginKey);
    setSelectedPlugin(getAvailablePluginFromKey);

    const { authConfig, authenticated = false } = getAvailablePluginFromKey ?? {};

    if (authConfig && authConfig.length > 0 && !authenticated) {
      setShowPluginAuthForm(true);
    } else {
      handleInstall({ pluginKey, action: 'install', auth: undefined });
    }
  };

  // Note: MCP server metadata is now handled by the enhanced tools structure
  // This function is kept for backward compatibility but no longer manipulates mcp_servers
  const updateMCPServers = () => {
    // The backend now handles MCP server metadata within the enhanced tools structure
    // No need to manually maintain a separate mcp_servers field
  };

  const onSelectAll = () => {
    if (!tools) return;

    const currentTools = getValues(toolsFormKey);

    // Extract tool keys from current tools (handle both strings and objects)
    const currentToolKeys = currentTools
      .map((tool: string | any) => (typeof tool === 'string' ? tool : tool.tool || tool))
      .filter((key: any) => typeof key === 'string');

    const toolsToAdd = tools.filter((tool) => !currentToolKeys.includes(tool.pluginKey));

    // Add tools that don't require authentication first
    const toolsWithoutAuth = toolsToAdd.filter((tool) => {
      const { authConfig, authenticated = false } = tool;
      return !authConfig || authConfig.length === 0 || authenticated;
    });

    if (toolsWithoutAuth.length > 0) {
      const enhancedTools = toolsWithoutAuth.map((tool) => {
        if (tool.serverName) {
          // For MCP tools, create enhanced tool object with server metadata
          return {
            tool: tool.pluginKey,
            server: tool.serverName,
            type: tool.isGlobal ? ('global' as const) : ('user' as const),
          };
        } else {
          // For regular tools, use string
          return tool.pluginKey;
        }
      });
      const newTools = [...currentTools, ...enhancedTools];
      setValue(toolsFormKey, newTools);
    }
  };

  const onDeselectAll = () => {
    const currentTools = getValues(toolsFormKey);
    if (currentTools.length === 0) return;

    setValue(toolsFormKey, []);

    // Call uninstall for each tool that needs it
    currentTools.forEach((tool: string | any) => {
      // Handle both string tools and MCP tool objects
      const pluginKey = typeof tool === 'string' ? tool : tool.tool || tool;

      // Only proceed if we have a valid string pluginKey
      if (typeof pluginKey === 'string') {
        updateUserPlugins.mutate(
          { pluginKey, action: 'uninstall', auth: undefined, isEntityTool: true },
          {
            onError: (error: unknown) => {
              handleInstallError(error as TError);
            },
          },
        );
      }
    });
  };

  // Group tools by MCP server using enhanced tools structure
  const mcpServersWithTools = useMemo(() => {
    if (!tools) return [];

    // Get current agent tools to check for disconnected MCP tools
    const currentAgentTools = getValues(toolsFormKey) || [];

    const serverMap = new Map<
      string,
      {
        name: string;
        displayName: string;
        icon?: string;
        tools: typeof tools;
        isDisconnected?: boolean;
        isGlobal?: boolean;
      }
    >();

    // First, process available/connected tools and group by server
    const availableToolKeys = new Set(tools.map((t) => t.pluginKey));
    tools.forEach((tool) => {
      if (tool.serverName || tool.appSlug) {
        const serverName = tool.serverName || tool.appSlug;
        if (serverName) {
          if (!serverMap.has(serverName)) {
            let displayName = serverName.startsWith('pipedream-')
              ? serverName.replace('pipedream-', '')
              : serverName;

            displayName = displayName
              .replace(/_/g, ' ')
              .split(' ')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            serverMap.set(serverName, {
              name: serverName,
              displayName,
              icon: tool.icon,
              tools: [],
              isDisconnected: false,
              isGlobal: false, // Will be updated as we add tools
            });
          }
          const server = serverMap.get(serverName)!;
          server.tools.push(tool);
          // Update isGlobal if any tool in this server is global
          if (tool.isGlobal) {
            server.isGlobal = true;
          }
        }
      }
    });

    // Then, check for disconnected MCP tools that were previously selected but are no longer available
    const disconnectedToolsByServer = new Map<
      string,
      Array<{ toolName: string; serverName: string }>
    >();

    currentAgentTools.forEach((tool: string | any) => {
      // Handle both string tools and MCP tool objects
      if (typeof tool === 'object' && tool.tool && tool.server) {
        // For MCP tool objects, we have the actual server name
        const toolName = tool.tool;
        const serverName = tool.server;

        // If this tool is not available anymore, it's a disconnected MCP tool
        if (!availableToolKeys.has(toolName)) {
          if (!disconnectedToolsByServer.has(serverName)) {
            disconnectedToolsByServer.set(serverName, []);
          }
          disconnectedToolsByServer.get(serverName)!.push({ toolName, serverName });
        }
      } else if (typeof tool === 'string') {
        // For string tools, check if they're disconnected and try to infer server
        const toolName = tool;

        // If this tool is not available anymore, it might be a disconnected MCP tool
        if (!availableToolKeys.has(toolName)) {
          // Try to infer the server name from the tool name (fallback for legacy data)
          const toolLower = toolName.toLowerCase();

          // Common patterns for MCP tool names: serverName-toolAction
          let inferredServerName: string | null = null;

          // Pattern matching to extract likely server names
          const patterns = [
            /^([a-z]+(?:[_-][a-z]+)*)-/, // server-action pattern
            /^([a-z]+)_/, // server_action pattern
            /^(github|gitlab|slack|discord|notion|airtable|hubspot|salesforce|linkedin|gmail|pipedream)/i,
          ];

          for (const pattern of patterns) {
            const match = toolLower.match(pattern);
            if (match && match[1]) {
              inferredServerName = match[1].toLowerCase();
              break;
            }
          }

          if (inferredServerName) {
            // Normalize server name (add pipedream- prefix if it looks like a pipedream tool)
            const serverKey = inferredServerName.includes('pipedream')
              ? inferredServerName
              : `pipedream-${inferredServerName}`;

            if (!disconnectedToolsByServer.has(serverKey)) {
              disconnectedToolsByServer.set(serverKey, []);
            }
            disconnectedToolsByServer.get(serverKey)!.push({ toolName, serverName: serverKey });
          }
        }
      }
    });

    // Create disconnected server entries
    disconnectedToolsByServer.forEach((toolItems, serverName) => {
      if (!serverMap.has(serverName)) {
        let displayName = serverName.startsWith('pipedream-')
          ? serverName.replace('pipedream-', '')
          : serverName;

        displayName = displayName
          .replace(/_/g, ' ')
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        const disconnectedToolObjects = toolItems.map((toolItem) => ({
          pluginKey: toolItem.toolName,
          name: toolItem.toolName
            // Remove server prefix if it exists (e.g., "linkedin-search-organization" -> "search-organization")
            .replace(new RegExp(`^${displayName.toLowerCase().replace(/\s+/g, '-')}-`), '')
            // Convert to readable format
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
          description: `This tool requires the ${displayName} MCP server to be connected. Please reconnect the server in the integrations page.`,
          isDisconnected: true,
          icon: undefined,
        }));

        serverMap.set(serverName, {
          name: serverName,
          displayName,
          tools: disconnectedToolObjects as any,
          isDisconnected: true,
          icon: undefined,
        });
      }
    });

    return Array.from(serverMap.values()).filter((server) =>
      server.displayName.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [tools, searchValue, getValues, toolsFormKey, watchedTools]);

  // State for standalone tools (non-MCP tools)
  const standaloneTools = useMemo(() => {
    if (!tools) return [];
    return tools
      .filter((tool) => !tool.serverName && !tool.appSlug)
      .filter((tool) => tool.name.toLowerCase().includes(searchValue.toLowerCase()));
  }, [tools, searchValue]);

  // Separate connected and disconnected apps
  const { connectedApps, disconnectedApps } = useMemo(() => {
    const connected: any[] = [];
    const disconnected: any[] = [];

    // Add MCP servers as multi-tool apps
    mcpServersWithTools.forEach((server) => {
      const app = {
        id: server.name,
        name: server.name,
        displayName: server.displayName,
        icon: server.icon,
        tools: server.tools,
        isDisconnected: server.isDisconnected || false,
        isSingleTool: false,
        isGlobal: server.isGlobal || false,
      };

      if (server.isDisconnected) {
        disconnected.push(app);
      } else {
        connected.push(app);
      }
    });

    // Add standalone tools as single-tool apps (these are always connected)
    standaloneTools.forEach((tool) => {
      connected.push({
        id: tool.pluginKey,
        name: tool.pluginKey,
        displayName: tool.name,
        icon: tool.icon,
        tools: [tool],
        isDisconnected: false,
        isSingleTool: true,
      });
    });

    // Filter by search value
    const searchLower = searchValue.toLowerCase();
    return {
      connectedApps: connected.filter((app) => app.displayName.toLowerCase().includes(searchLower)),
      disconnectedApps: disconnected.filter((app) =>
        app.displayName.toLowerCase().includes(searchLower),
      ),
    };
  }, [mcpServersWithTools, standaloneTools, searchValue]);

  // Calculate total available tools and selected tools
  const totalAvailableTools = useMemo(() => {
    return connectedApps.reduce((acc, app) => acc + app.tools.length, 0);
  }, [connectedApps]);

  const selectedToolsCount = getValues(toolsFormKey)?.length || 0;

  // Calculate connected selected tools (exclude disconnected tools from count)
  const connectedSelectedToolsCount = useMemo(() => {
    const allSelectedTools = getValues(toolsFormKey) || [];
    const availableToolKeys = new Set(tools?.map((t) => t.pluginKey) || []);
    return allSelectedTools.filter((tool: string | any) => {
      // Handle both string tools and MCP tool objects
      const toolKey = typeof tool === 'string' ? tool : tool.tool || tool;
      return typeof toolKey === 'string' && availableToolKeys.has(toolKey);
    }).length;
  }, [getValues, toolsFormKey, tools, watchedTools]);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, itemsPerPage]);

  // Initialize when tools data is loaded (no longer need to manage mcp_servers manually)
  useEffect(() => {
    if (tools && tools.length > 0) {
      // Enhanced tools structure now handles MCP server metadata automatically
    }
  }, [tools]);

  // Calculate pagination for connected apps only
  const connectedAppsPagination = useMemo(() => {
    const totalItems = connectedApps.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = connectedApps.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      totalItems,
      totalPages,
      currentPage,
      itemsPerPage,
    };
  }, [connectedApps, currentPage, itemsPerPage]);

  // Determine which pagination to show - only paginate connected apps since disconnected apps are usually few
  const showPagination = useMemo(() => {
    return connectedApps.length > itemsPerPage;
  }, [connectedApps.length, itemsPerPage]);

  // Show all disconnected apps (no pagination) and paginated connected apps
  const currentPageApps = useMemo(() => {
    return {
      disconnected: disconnectedApps, // Show all disconnected apps
      connected: connectedAppsPagination.items, // Show paginated connected apps
    };
  }, [disconnectedApps, connectedAppsPagination.items]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
        setSearchValue('');
      }}
      className="relative z-[102]"
    >
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4">
        <DialogPanel className="relative flex max-h-[90vh] w-full transform flex-col overflow-hidden rounded-xl border border-border-light bg-surface-secondary text-left shadow-2xl transition-all sm:mx-7 sm:my-8 sm:max-h-[85vh] sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-border-light bg-surface-primary px-4 py-4 sm:px-6 sm:py-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-lg font-bold text-text-primary sm:text-xl">
                  {isAgentTools
                    ? localize('com_nav_tool_dialog_agents')
                    : localize('com_nav_tool_dialog')}
                </DialogTitle>
                <Description className="mt-1 hidden text-sm text-text-secondary sm:block">
                  {localize('com_nav_tool_dialog_description')}
                </Description>
              </div>
              <div className="ml-4 flex flex-shrink-0 items-center gap-2 sm:gap-3">
                {!isLoadingTools && (connectedApps.length > 0 || disconnectedApps.length > 0) && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/d/integrations');
                    }}
                    className="btn btn-primary btn-sm text-xs sm:text-sm"
                    type="button"
                  >
                    <svg
                      className="h-3 w-3 sm:h-4 sm:w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span className="hidden sm:inline">Add Tools</span>
                    <span className="sm:hidden">Add Tools</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    updateMCPServers(); // Ensure MCP servers are updated when dialog closes
                    setIsOpen(false);
                    setSearchValue('');
                  }}
                  className="rounded-lg p-2 text-text-tertiary transition-all duration-200 hover:bg-surface-hover hover:text-text-primary"
                  aria-label="Close dialog"
                  type="button"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-4 flex-shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 sm:mx-6">
              <div className="flex items-center space-x-2">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm">
                  {localize('com_nav_plugin_auth_error')} {errorMessage}
                </span>
              </div>
            </div>
          )}

          {showPluginAuthForm && (
            <div className="flex-shrink-0 border-b border-border-light bg-surface-primary p-4 sm:p-6">
              <PluginAuthForm
                plugin={selectedPlugin}
                onSubmit={(installActionData: TPluginAction) => handleInstall(installActionData)}
                isEntityTool={true}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {/* Search and Controls */}
            <div className="mb-4 space-y-4 sm:mb-5">
              {/* Search Bar */}
              <div className="relative mx-auto max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary sm:left-4 sm:h-5 sm:w-5" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={handleSearch}
                    placeholder={localize('com_nav_tool_search')}
                    className="h-10 w-full rounded-lg border border-border-light bg-surface-primary pl-10 pr-10 text-sm text-text-primary shadow-sm transition-all duration-200 placeholder:text-text-tertiary focus:border-[#0E1593] focus:ring-2 focus:ring-[#0E1593]/20 sm:h-12 sm:pl-12 sm:pr-12 sm:text-base"
                  />
                  {searchValue && (
                    <button
                      onClick={() => setSearchValue('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-secondary sm:right-4"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Controls */}
              {!isLoadingTools && (
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="text-center text-xs font-medium text-text-secondary sm:text-sm">
                    {connectedSelectedToolsCount} of {totalAvailableTools} connected tools selected
                    {disconnectedApps.length > 0 && (
                      <div className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                        ⚠️ {disconnectedApps.reduce((acc, app) => acc + app.tools.length, 0)}{' '}
                        disconnected tool
                        {disconnectedApps.reduce((acc, app) => acc + app.tools.length, 0) !== 1
                          ? 's'
                          : ''}{' '}
                        require
                        {disconnectedApps.reduce((acc, app) => acc + app.tools.length, 0) === 1
                          ? 's'
                          : ''}{' '}
                        reconnecting.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={onSelectAll}
                      disabled={
                        connectedSelectedToolsCount === totalAvailableTools ||
                        totalAvailableTools === 0
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-border-medium px-3 py-2 text-xs font-medium text-text-primary transition-all duration-200 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent sm:gap-2 sm:px-4 sm:text-sm"
                    >
                      <svg
                        className="h-3 w-3 sm:h-4 sm:w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={onDeselectAll}
                      disabled={selectedToolsCount === 0}
                      className="inline-flex items-center gap-1 rounded-lg border border-border-medium px-3 py-2 text-xs font-medium text-text-primary transition-all duration-200 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent sm:gap-2 sm:px-4 sm:text-sm"
                    >
                      <svg
                        className="h-3 w-3 sm:h-4 sm:w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      Deselect All
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tools Content */}
            <div className="space-y-6">
              {isLoadingTools ? (
                <div className="flex flex-col items-center justify-center px-4 py-8 sm:py-16">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#0E1593] border-t-transparent sm:h-8 sm:w-8"></div>
                    <p className="text-base text-text-secondary sm:text-lg">Loading tools...</p>
                  </div>
                </div>
              ) : connectedApps.length === 0 && disconnectedApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-8 sm:py-16">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary sm:h-16 sm:w-16">
                    <Search className="h-6 w-6 text-text-tertiary sm:h-8 sm:w-8" />
                  </div>
                  <h3 className="mb-2 text-center text-base font-medium text-text-primary sm:text-lg">
                    No tools found
                  </h3>
                  <p className="mb-4 max-w-md text-center text-sm text-text-secondary sm:mb-6 sm:text-base">
                    {searchValue
                      ? 'Try adjusting your search criteria or browse all available tools.'
                      : 'No tools are currently available.'}
                  </p>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/d/integrations');
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#0E1593] bg-gradient-to-br from-[#0E1593] to-[#04062D] px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:from-[#04062D] hover:to-[#0E0E0E] hover:shadow-lg sm:px-6 sm:py-3"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Connect Tools
                  </button>
                </div>
              ) : (
                <>
                  {/* Disconnected Apps Section */}
                  {currentPageApps.disconnected.length > 0 && (
                    <div className="mb-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <h4 className="flex-1 border-b border-border-light pb-2 text-sm font-semibold text-text-primary">
                          Disconnected Apps ({formatCount(disconnectedApps.length)})
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                        {currentPageApps.disconnected.map((app) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            toolsFormKey={toolsFormKey}
                            onInstallError={handleInstallError}
                            updateMCPServers={updateMCPServers}
                            onAddTool={onAddTool}
                            onRemoveTool={onRemoveTool}
                            onRemoveApp={onRemoveApp}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connected Apps Section */}
                  {currentPageApps.connected.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="border-b border-border-light pb-2 text-sm font-semibold text-text-primary">
                        Apps ({formatCount(connectedApps.length)})
                      </h4>
                      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                        {currentPageApps.connected.map((app) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            toolsFormKey={toolsFormKey}
                            onInstallError={handleInstallError}
                            updateMCPServers={updateMCPServers}
                            onAddTool={onAddTool}
                            onRemoveTool={onRemoveTool}
                            onRemoveApp={onRemoveApp}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pagination Controls - Only for connected apps */}
                  {showPagination && (
                    <div className="mt-4 sm:mt-6">
                      <Pagination
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        totalItems={connectedApps.length}
                        totalPages={connectedAppsPagination.totalPages}
                        onPageChange={(newPage) => setCurrentPage(newPage)}
                        onItemsPerPageChange={(newItemsPerPage) => setItemsPerPage(newItemsPerPage)}
                        showItemsPerPage={true}
                      />
                    </div>
                  )}

                  {/* Show message if no apps at all */}
                  {connectedApps.length === 0 && disconnectedApps.length === 0 && (
                    <div className="flex flex-col items-center justify-center px-4 py-8 sm:py-16">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary sm:h-16 sm:w-16">
                        <Search className="h-6 w-6 text-text-tertiary sm:h-8 sm:w-8" />
                      </div>
                      <h3 className="mb-2 text-center text-base font-medium text-text-primary sm:text-lg">
                        No apps found
                      </h3>
                      <p className="mb-4 max-w-md text-center text-sm text-text-secondary sm:mb-6 sm:text-base">
                        {searchValue
                          ? 'Try adjusting your search criteria or browse all available apps.'
                          : 'No apps are currently available.'}
                      </p>
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate('/d/integrations');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#0E1593] bg-gradient-to-br from-[#0E1593] to-[#04062D] px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:from-[#04062D] hover:to-[#0E0E0E] hover:shadow-lg sm:px-6 sm:py-3"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Connect Apps
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default ToolSelectDialog;
