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
  const watchedMcpServers = watch('mcp_servers');

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
      fns.push(pluginAction.pluginKey);
      setValue(toolsFormKey, fns);
      updateMCPServers(); // Update MCP servers after adding tool
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
          const fns = getValues(toolsFormKey).filter((fn: string) => fn !== tool);
          setValue(toolsFormKey, fns);
          updateMCPServers(); // Update MCP servers after removing tool
        },
      },
    );
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

  // Update mcp_servers when tools are modified
  const updateMCPServers = () => {
    const currentTools = getValues(toolsFormKey);
    const currentMcpServers = new Set(getValues('mcp_servers') || []);
    
    currentTools.forEach((toolName: string) => {
      const tool = tools?.find(t => t.pluginKey === toolName);
      if (tool && (tool.serverName || tool.appSlug)) {
        // Use appSlug for mcp_servers field to match userIntegrations appSlug
        // Remove 'pipedream-' prefix from serverName if present
        let appSlug = tool.appSlug;
        if (!appSlug && tool.serverName) {
          appSlug = tool.serverName.startsWith('pipedream-') 
            ? tool.serverName.replace('pipedream-', '') 
            : tool.serverName;
        }
        if (appSlug) {
          currentMcpServers.add(appSlug);
        }
      } else if (!tool) {
        // This is a disconnected tool - try to infer its server from the tool name
        const toolLower = toolName.toLowerCase();
        
        // Extract service name from tool name (e.g., "linkedin-search-org" -> "linkedin")
        const serviceName = toolLower.split('-')[0];
        if (serviceName) {
          // Add the inferred server to preserve it for grouping
          currentMcpServers.add(`pipedream-${serviceName}`);
        }
      }
    });
    
    // Update the mcp_servers field in the form
    setValue('mcp_servers', Array.from(currentMcpServers));
  };

  const onSelectAll = () => {
    if (!tools) return;
    
    const currentTools = getValues(toolsFormKey);
    const toolsToAdd = tools.filter(tool => !currentTools.includes(tool.pluginKey));
    
    // Add tools that don't require authentication first
    const toolsWithoutAuth = toolsToAdd.filter(tool => {
      const { authConfig, authenticated = false } = tool;
      return !authConfig || authConfig.length === 0 || authenticated;
    });
    
    if (toolsWithoutAuth.length > 0) {
      const newTools = [...currentTools, ...toolsWithoutAuth.map(tool => tool.pluginKey)];
      setValue(toolsFormKey, newTools);
      updateMCPServers(); // Update MCP servers after selecting all
    }
  };

  const onDeselectAll = () => {
    const currentTools = getValues(toolsFormKey);
    if (currentTools.length === 0) return;
    
    setValue(toolsFormKey, []);
    setValue('mcp_servers', []);
    
    // Call uninstall for each tool that needs it
    currentTools.forEach((pluginKey: string) => {
      updateUserPlugins.mutate(
        { pluginKey, action: 'uninstall', auth: undefined, isEntityTool: true },
        {
          onError: (error: unknown) => {
            handleInstallError(error as TError);
          },
        },
      );
    });
  };


  // Group tools by MCP server and get server metadata with tools
  const mcpServersWithTools = useMemo(() => {
    if (!tools) return [];
    
    // Force reactive updates when form values change
    const currentMcpServers = getValues('mcp_servers') || [];
    const currentSelectedTools = getValues(toolsFormKey) || [];
    
    const serverMap = new Map<string, {
      name: string;
      displayName: string;
      icon?: string;
      tools: typeof tools;
      isDisconnected?: boolean;
    }>();
    
    // First, process connected servers (tools that are available in the tools array)
    const connectedServerNames = new Set<string>();
    tools.forEach((tool) => {
      if (tool.serverName || tool.appSlug) {
        const serverName = tool.serverName || tool.appSlug;
        if (serverName) {
          connectedServerNames.add(serverName);
          if (!serverMap.has(serverName)) {
            let displayName = serverName.startsWith('pipedream-') 
              ? serverName.replace('pipedream-', '')
              : serverName;
            
            displayName = displayName
              .replace(/_/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            
            serverMap.set(serverName, {
              name: serverName,
              displayName,
              icon: tool.icon,
              tools: [],
              isDisconnected: false
            });
          }
          serverMap.get(serverName)!.tools.push(tool);
        }
      }
    });
    
    // Then, process disconnected servers from the mcp_servers form field
    // These are servers that exist in the form but are not in the connected tools
    console.log(`[ToolSelectDialog] Processing MCP servers:`, currentMcpServers);
    console.log(`[ToolSelectDialog] Connected servers:`, Array.from(connectedServerNames));
    console.log(`[ToolSelectDialog] Selected tools:`, currentSelectedTools);
    
    currentMcpServers.forEach((mcpServerName: string) => {
      if (!connectedServerNames.has(mcpServerName)) {
        console.log(`[ToolSelectDialog] Processing disconnected server: ${mcpServerName}`);
        
        // This is a disconnected server
        // Find tools that are selected but belong to this server
        const disconnectedToolsForServer = currentSelectedTools.filter((toolKey: string) => {
          // First check if this tool is in the available tools (if so, it's not disconnected)
          const availableTool = tools.find(t => t.pluginKey === toolKey);
          if (availableTool) return false;
          
          // Then check if this tool likely belongs to this server based on naming patterns
          const toolLower = toolKey.toLowerCase();
          const serverLower = mcpServerName.toLowerCase();
          const serverWithoutPrefix = serverLower.replace('pipedream-', '');
          
          // Check if this tool belongs to the current MCP server
          // For "pipedream-linkedin" server, match tools like "linkedin-search-organization"
          // For "gmail" server, match tools like "gmail-send" 
          const matches = serverWithoutPrefix && toolLower.startsWith(serverWithoutPrefix + '-');
          
          if (matches) {
            console.log(`[ToolSelectDialog] ✅ Matched tool "${toolKey}" to server "${mcpServerName}" (prefix: "${serverWithoutPrefix}")`);
          } else {
            console.log(`[ToolSelectDialog] ❌ Tool "${toolKey}" did not match server "${mcpServerName}" (prefix: "${serverWithoutPrefix}")`);
          }
          
          return matches;
        });
        
        console.log(`[ToolSelectDialog] Found ${disconnectedToolsForServer.length} tools for server ${mcpServerName}:`, disconnectedToolsForServer);
        
        if (disconnectedToolsForServer.length > 0) {
          let displayName = mcpServerName.startsWith('pipedream-') 
            ? mcpServerName.replace('pipedream-', '')
            : mcpServerName;
          
          displayName = displayName
            .replace(/_/g, ' ')
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          
          console.log(`[ToolSelectDialog] Creating disconnected server "${displayName}" for ${disconnectedToolsForServer.length} tools`);
          
          const disconnectedToolObjects = disconnectedToolsForServer.map((toolKey: string) => ({
            pluginKey: toolKey,
            name: toolKey.charAt(0).toUpperCase() + toolKey.slice(1)
              .replace(/_/g, ' ')
              .replace(/-/g, ' ')
              .split(' ')
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' '),
            description: `This tool requires the ${displayName} MCP server to be connected. Please reconnect the server in the integrations page.`,
            isDisconnected: true,
            icon: undefined
          }));
          
          serverMap.set(mcpServerName, {
            name: mcpServerName,
            displayName,
            tools: disconnectedToolObjects,
            isDisconnected: true,
            icon: undefined
          });
        }
      }
    });
    
    // Handle any remaining disconnected tools that couldn't be mapped to a specific server
    const availableToolKeys = new Set(tools.map(t => t.pluginKey));
    const mappedDisconnectedTools = new Set<string>();
    
    // Collect all tools that have been mapped to disconnected servers
    Array.from(serverMap.values())
      .filter(server => server.isDisconnected)
      .forEach(server => {
        server.tools.forEach((tool: any) => {
          if (tool.pluginKey) {
            mappedDisconnectedTools.add(tool.pluginKey);
          }
        });
      });
    
    // Find truly orphaned disconnected tools
    const orphanedTools = currentSelectedTools.filter((toolKey: string) => 
      !availableToolKeys.has(toolKey) && !mappedDisconnectedTools.has(toolKey)
    );
    
    console.log(`[ToolSelectDialog] Orphaned tools that couldn't be mapped to servers:`, orphanedTools);
    
    // Try to group orphaned tools by likely server names based on prefixes
    const serverGroups = new Map<string, string[]>();
    
    orphanedTools.forEach((toolKey: string) => {
      let serverName: string | null = null;
      
      // Try to extract server name from tool name patterns
      const toolLower = toolKey.toLowerCase();
      
      // Common patterns: serverName_toolName, serverName-toolName, serverNameToolName
      const patterns = [
        // Pattern 1: prefix_suffix
        /^([a-z]+(?:[_-][a-z]+)*)_/,
        // Pattern 2: prefix-suffix  
        /^([a-z]+(?:[_-][a-z]+)*)-/,
        // Pattern 3: camelCase - extract first part
        /^([a-z]+)(?=[A-Z])/,
        // Pattern 4: all lowercase with common service names
        /^(github|gitlab|slack|discord|notion|airtable|hubspot|salesforce|pipedream)/
      ];
      
      for (const pattern of patterns) {
        const match = toolLower.match(pattern);
        if (match && match[1]) {
          serverName = match[1];
          break;
        }
      }
      
      // Fallback: use first part of tool name
      if (!serverName) {
        const parts = toolKey.split(/[_-]/);
        if (parts.length > 1 && parts[0]) {
          serverName = parts[0].toLowerCase();
        }
      }
      
      if (serverName) {
        if (!serverGroups.has(serverName)) {
          serverGroups.set(serverName, []);
        }
        serverGroups.get(serverName)!.push(toolKey);
      } else {
        // If we can't determine a server name, group under a generic category
        if (!serverGroups.has('unknown')) {
          serverGroups.set('unknown', []);
        }
        serverGroups.get('unknown')!.push(toolKey);
      }
    });
    
    // Create servers for each group
    serverGroups.forEach((toolKeys, inferredServerName) => {
      const displayName = inferredServerName === 'unknown' 
        ? 'Disconnected Tools'
        : inferredServerName
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
      
      console.log(`[ToolSelectDialog] Creating inferred server "${displayName}" for tools:`, toolKeys);
      
      const toolObjects = toolKeys.map((toolKey: string) => ({
        pluginKey: toolKey,
        name: toolKey.charAt(0).toUpperCase() + toolKey.slice(1)
          .replace(/_/g, ' ')
          .replace(/-/g, ' ')
          .split(' ')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        description: inferredServerName === 'unknown'
          ? 'This tool is no longer available. The MCP server may have been disconnected or removed.'
          : `This tool requires the ${displayName} MCP server to be connected. Please reconnect the server in the integrations page.`,
        isDisconnected: true,
        icon: undefined
      }));
      
      const serverKey = inferredServerName === 'unknown' ? '__disconnected_tools__' : `__inferred_${inferredServerName}__`;
      
      serverMap.set(serverKey, {
        name: serverKey,
        displayName,
        icon: undefined,
        tools: toolObjects,
        isDisconnected: true
      });
    });
    
    return Array.from(serverMap.values()).filter(server => 
      server.displayName.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [tools, getValues, toolsFormKey, searchValue, watchedTools, watchedMcpServers]);

  // State for standalone tools (non-MCP tools)
  const standaloneTools = useMemo(() => {
    if (!tools) return [];
    return tools.filter(tool => !tool.serverName && !tool.appSlug)
      .filter(tool => tool.name.toLowerCase().includes(searchValue.toLowerCase()));
  }, [tools, searchValue]);

  // Separate connected and disconnected apps
  const { connectedApps, disconnectedApps } = useMemo(() => {
    const connected: any[] = [];
    const disconnected: any[] = [];
    
    // Add MCP servers as multi-tool apps
    mcpServersWithTools.forEach(server => {
      const app = {
        id: server.name,
        name: server.name,
        displayName: server.displayName,
        icon: server.icon,
        tools: server.tools,
        isDisconnected: server.isDisconnected,
        isSingleTool: false
      };
      
      if (server.isDisconnected) {
        disconnected.push(app);
      } else {
        connected.push(app);
      }
    });
    
    // Add standalone tools as single-tool apps (these are always connected)
    standaloneTools.forEach(tool => {
      connected.push({
        id: tool.pluginKey,
        name: tool.pluginKey,
        displayName: tool.name,
        icon: tool.icon,
        tools: [tool],
        isDisconnected: false,
        isSingleTool: true
      });
    });
    
    // Filter by search value
    const searchLower = searchValue.toLowerCase();
    return {
      connectedApps: connected.filter(app => 
        app.displayName.toLowerCase().includes(searchLower)
      ),
      disconnectedApps: disconnected.filter(app => 
        app.displayName.toLowerCase().includes(searchLower)
      )
    };
  }, [mcpServersWithTools, standaloneTools, searchValue]);



  // Calculate total available tools and selected tools
  const totalAvailableTools = useMemo(() => {
    return connectedApps.reduce((acc, app) => acc + app.tools.length, 0);
  }, [connectedApps]);

  const selectedToolsCount = getValues(toolsFormKey)?.length || 0;

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, itemsPerPage]);

  // Initialize MCP servers when tools data is loaded
  useEffect(() => {
    if (tools && tools.length > 0) {
      updateMCPServers();
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
      itemsPerPage
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
      connected: connectedAppsPagination.items // Show paginated connected apps
    };
  }, [disconnectedApps, connectedAppsPagination.items]);


  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        updateMCPServers(); // Ensure MCP servers are updated when dialog closes
        setIsOpen(false);
        setSearchValue('');
      }}
      className="relative z-[102]"
    >
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4">
        <DialogPanel
          className="relative w-full transform overflow-hidden rounded-xl bg-surface-secondary text-left shadow-2xl transition-all h-full max-h-[95vh] sm:max-h-[90vh] sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl border border-border-light flex flex-col"
        >
          {/* Header */}
          <div className="border-b border-border-light bg-surface-primary px-4 py-4 sm:px-6 sm:py-6 flex-shrink-0">
            <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg sm:text-xl font-bold text-text-primary truncate">
                {isAgentTools
                  ? localize('com_nav_tool_dialog_agents')
                  : localize('com_nav_tool_dialog')}
              </DialogTitle>
              <Description className="text-sm text-text-secondary mt-1 hidden sm:block">
                {localize('com_nav_tool_dialog_description')}
              </Description>
            </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-4">
                {!isLoadingTools && (connectedApps.length > 0 || disconnectedApps.length > 0) && (
                  <button
                    onClick={() => {
                      updateMCPServers(); // Ensure MCP servers are updated before navigating
                      setIsOpen(false);
                      navigate('/d/integrations');
                    }}
                    className="btn btn-primary btn-sm text-xs sm:text-sm"
                    type="button"
                  >
                    <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
                  className="rounded-lg p-2 text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-all duration-200"
                  aria-label="Close dialog"
                  type="button"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-4 sm:mx-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">{localize('com_nav_plugin_auth_error')} {errorMessage}</span>
              </div>
            </div>
          )}

          {showPluginAuthForm && (
            <div className="border-b border-border-light bg-surface-primary p-4 sm:p-6 flex-shrink-0">
              <PluginAuthForm
                plugin={selectedPlugin}
                onSubmit={(installActionData: TPluginAction) => handleInstall(installActionData)}
                isEntityTool={true}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0">
            {/* Search and Controls */}
            <div className="mb-4 sm:mb-6 space-y-4">
              {/* Search Bar */}
              <div className="relative max-w-md mx-auto">
                <div className="relative">
                  <Search className="absolute left-3 sm:left-4 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={handleSearch}
                    placeholder={localize('com_nav_tool_search')}
                    className="w-full h-10 sm:h-12 pl-10 sm:pl-12 pr-10 sm:pr-12 text-sm sm:text-base bg-surface-primary border border-border-light rounded-lg shadow-sm focus:border-[#0E1593] focus:ring-2 focus:ring-[#0E1593]/20 text-text-primary placeholder:text-text-tertiary transition-all duration-200"
                  />
                  {searchValue && (
                    <button
                      onClick={() => setSearchValue('')}
                      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
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
                  <div className="text-xs sm:text-sm text-text-secondary font-medium text-center">
                    {selectedToolsCount} of {totalAvailableTools} connected tools selected
                    {disconnectedApps.length > 0 && (
                      <div className="mt-1 text-orange-600 dark:text-orange-400 text-xs">
                        ⚠️ {disconnectedApps.reduce((acc, app) => acc + app.tools.length, 0)} disconnected tool{disconnectedApps.reduce((acc, app) => acc + app.tools.length, 0) !== 1 ? 's' : ''} require{disconnectedApps.reduce((acc, app) => acc + app.tools.length, 0) === 1 ? 's' : ''} reconnecting.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={onSelectAll}
                      disabled={selectedToolsCount === totalAvailableTools || totalAvailableTools === 0}
                      className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-[#0E1593] text-[#0E1593] dark:text-white hover:bg-[#0E1593]/10 dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent transition-all duration-200"
                    >
                      <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={onDeselectAll}
                      disabled={selectedToolsCount === 0}
                      className="inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-border-medium text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent transition-all duration-200"
                    >
                      <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Deselect All
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tools Content */}
            <div className="min-h-[200px] space-y-6">
              {isLoadingTools ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-4">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-4 border-[#0E1593] border-t-transparent"></div>
                    <p className="text-base sm:text-lg text-text-secondary">Loading tools...</p>
                  </div>
                </div>
              ) : connectedApps.length === 0 && disconnectedApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-surface-tertiary rounded-full flex items-center justify-center mb-4">
                    <Search className="w-6 h-6 sm:w-8 sm:h-8 text-text-tertiary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-medium text-text-primary mb-2 text-center">No tools found</h3>
                  <p className="text-sm sm:text-base text-text-secondary text-center max-w-md mb-4 sm:mb-6">
                    {searchValue 
                      ? 'Try adjusting your search criteria or browse all available tools.'
                      : 'No tools are currently available.'}
                  </p>
                  <button
                    onClick={() => {
                      updateMCPServers();
                      setIsOpen(false);
                      navigate('/d/integrations');
                    }}
                    className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 text-sm font-medium rounded-lg bg-gradient-to-br from-[#0E1593] to-[#04062D] text-white border border-[#0E1593] hover:from-[#04062D] hover:to-[#0E0E0E] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 shadow-md"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Connect Tools
                  </button>
                </div>
              ) : (
                <>
                  {/* Disconnected Apps Section */}
                  {currentPageApps.disconnected.length > 0 && (
                    <div className="space-y-4 mb-6">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-text-primary border-b border-border-light pb-2 flex-1">
                          Disconnected Apps ({formatCount(disconnectedApps.length)})
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                        {currentPageApps.disconnected.map((app) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            toolsFormKey={toolsFormKey}
                            onInstallError={handleInstallError}
                            updateMCPServers={updateMCPServers}
                            onAddTool={onAddTool}
                            onRemoveTool={onRemoveTool}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connected Apps Section */}
                  {currentPageApps.connected.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-text-primary border-b border-border-light pb-2">
                        Apps ({formatCount(connectedApps.length)})
                      </h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                        {currentPageApps.connected.map((app) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            toolsFormKey={toolsFormKey}
                            onInstallError={handleInstallError}
                            updateMCPServers={updateMCPServers}
                            onAddTool={onAddTool}
                            onRemoveTool={onRemoveTool}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pagination Controls - Only for connected apps */}
                  {showPagination && (
                    <div className="mt-6 sm:mt-8">
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
                    <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-4">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-surface-tertiary rounded-full flex items-center justify-center mb-4">
                        <Search className="w-6 h-6 sm:w-8 sm:h-8 text-text-tertiary" />
                      </div>
                      <h3 className="text-base sm:text-lg font-medium text-text-primary mb-2 text-center">No apps found</h3>
                      <p className="text-sm sm:text-base text-text-secondary text-center max-w-md mb-4 sm:mb-6">
                        {searchValue 
                          ? 'Try adjusting your search criteria or browse all available apps.'
                          : 'No apps are currently available.'}
                      </p>
                      <button
                        onClick={() => {
                          updateMCPServers();
                          setIsOpen(false);
                          navigate('/d/integrations');
                        }}
                        className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 text-sm font-medium rounded-lg bg-gradient-to-br from-[#0E1593] to-[#04062D] text-white border border-[#0E1593] hover:from-[#04062D] hover:to-[#0E0E0E] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 shadow-md"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
