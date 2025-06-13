import { useEffect, useMemo, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
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
  TPlugin,
} from 'librechat-data-provider';
import type { TPluginStoreDialogProps } from '~/common/types';
import { PluginAuthForm } from '~/components/Plugins/Store';
import { useLocalize, usePluginDialogHelpers } from '~/hooks';
import { useAvailableToolsQuery } from '~/data-provider';
import { Pagination } from '~/components/ui';
import ToolItem from './ToolItem';

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
  const { getValues, setValue } = useFormContext();
  const { data: tools, isLoading: isLoadingTools } = useAvailableToolsQuery(endpoint);
  const isAgentTools = isAgentsEndpoint(endpoint);

  const {
    maxPage,
    setMaxPage,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    searchChanged,
    setSearchChanged,
    searchValue,
    setSearchValue,
    gridRef,
    handleSearch,
    handleChangePage,
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

  const onSelectAll = () => {
    if (!filteredTools) return;
    
    // Clear selected servers since we're selecting all tools
    setSelectedServers(new Set());
    
    const currentTools = getValues(toolsFormKey);
    const toolsToAdd = filteredTools.filter(tool => !currentTools.includes(tool.pluginKey));
    
    // Add tools that don't require authentication first
    const toolsWithoutAuth = toolsToAdd.filter(tool => {
      const { authConfig, authenticated = false } = tool;
      return !authConfig || authConfig.length === 0 || authenticated;
    });
    
    if (toolsWithoutAuth.length > 0) {
      const newTools = [...currentTools, ...toolsWithoutAuth.map(tool => tool.pluginKey)];
      setValue(toolsFormKey, newTools);
    }
    
    // Handle tools that require authentication
    const toolsWithAuth = toolsToAdd.filter(tool => {
      const { authConfig, authenticated = false } = tool;
      return authConfig && authConfig.length > 0 && !authenticated;
    });
    
    // For now, just skip tools that require authentication
    if (toolsWithAuth.length > 0) {
      console.log(`${toolsWithAuth.length} tools require authentication and were skipped`);
    }
  };

  const onDeselectAll = () => {
    if (!filteredTools) return;
    
    // Clear selected servers since we're deselecting all tools
    setSelectedServers(new Set());
    
    const currentTools = getValues(toolsFormKey);
    const toolsToRemove = filteredTools
      .filter(tool => currentTools.includes(tool.pluginKey))
      .map(tool => tool.pluginKey);
    
    if (toolsToRemove.length > 0) {
      // Remove all filtered tools from the current selection
      const remainingTools = currentTools.filter((tool: string) => !toolsToRemove.includes(tool));
      setValue(toolsFormKey, remainingTools);
      
      // Call uninstall for each tool that needs it
      toolsToRemove.forEach(pluginKey => {
        updateUserPlugins.mutate(
          { pluginKey, action: 'uninstall', auth: undefined, isEntityTool: true },
          {
            onError: (error: unknown) => {
              handleInstallError(error as TError);
            },
          },
        );
      });
    }
  };

  // Group tools by MCP server and get server metadata
  const mcpServers = useMemo(() => {
    if (!tools) return [];
    
    const serverMap = new Map<string, { name: string; displayName: string; icon?: string }>();
    tools.forEach((tool) => {
      if (tool.pluginKey?.includes('_mcp_')) {
        const serverName = tool.pluginKey.split('_mcp_')[1];
        if (!serverMap.has(serverName)) {
          // Remove 'pipedream-' prefix and capitalize
          const displayName = serverName.startsWith('pipedream-') 
            ? serverName.replace('pipedream-', '').charAt(0).toUpperCase() + serverName.replace('pipedream-', '').slice(1)
            : serverName;
          
          serverMap.set(serverName, { 
            name: serverName,
            displayName,
            icon: tool.icon // Store the icon from the first tool of this server
          });
        }
      }
    });
    
    return Array.from(serverMap.values());
  }, [tools]);

  // State for selected servers (multiple)
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Filter tools by selected servers and search value
  const filteredTools = useMemo(() => {
    if (!tools) return [];
    
    return tools.filter((tool) => {
      const matchesSearch = tool.name.toLowerCase().includes(searchValue.toLowerCase());
      
      if (selectedServers.size > 0) {
        if (!tool.pluginKey?.includes('_mcp_')) return false;
        const serverName = tool.pluginKey.split('_mcp_')[1];
        return matchesSearch && selectedServers.has(serverName);
      }
      
      return matchesSearch;
    });
  }, [tools, searchValue, selectedServers]);

  // Handle server selection and automatically select all tools from that server
  const handleServerSelection = (serverName: string) => {
    const newSelectedServers = new Set(selectedServers);
    
    if (newSelectedServers.has(serverName)) {
      newSelectedServers.delete(serverName);
    } else {
      newSelectedServers.add(serverName);
    }
    
    setSelectedServers(newSelectedServers);

    // Get all tools from the selected servers
    const serverTools = tools?.filter(tool => {
      if (!tool.pluginKey?.includes('_mcp_')) return false;
      const toolServer = tool.pluginKey.split('_mcp_')[1];
      return newSelectedServers.has(toolServer);
    }) || [];

    // Update selected tools
    const currentTools = new Set(getValues(toolsFormKey));
    serverTools.forEach(tool => {
      if (!tool.authConfig || tool.authenticated) {
        currentTools.add(tool.pluginKey);
      }
    });
    
    setValue(toolsFormKey, Array.from(currentTools));
  };

  const selectedToolsCount = filteredTools?.filter(tool => 
    getValues(toolsFormKey).includes(tool.pluginKey)
  ).length || 0;
  
  const totalFilteredTools = filteredTools?.length || 0;

  useEffect(() => {
    if (filteredTools) {
      setMaxPage(Math.ceil(filteredTools.length / itemsPerPage));
      if (searchChanged) {
        setCurrentPage(1);
        setSearchChanged(false);
      }
    }
  }, [
    tools,
    itemsPerPage,
    searchValue,
    filteredTools,
    searchChanged,
    setMaxPage,
    setCurrentPage,
    setSearchChanged,
  ]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
        setCurrentPage(1);
        setSearchValue('');
        setSelectedServers(new Set());
      }}
      className="relative z-[102]"
    >
      {/* The backdrop, rendered as a fixed sibling to the panel container */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
      {/* Full-screen container to center the panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className="relative w-full transform overflow-hidden rounded-xl bg-surface-secondary text-left shadow-2xl transition-all max-sm:h-full sm:mx-7 sm:my-8 sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl border border-border-light"
          style={{ minHeight: '680px' }}
        >
          {/* Header */}
          <div className="border-b border-border-light bg-surface-primary px-6 py-6">
            <div className="flex items-center justify-between">
                          <div>
              <DialogTitle className="text-xl font-bold text-text-primary">
                {isAgentTools
                  ? localize('com_nav_tool_dialog_agents')
                  : localize('com_nav_tool_dialog')}
              </DialogTitle>
              <Description className="text-sm text-text-secondary mt-1">
                {localize('com_nav_tool_dialog_description')}
              </Description>
            </div>
              <div className="flex items-center gap-3">
                {!isLoadingTools && filteredTools && filteredTools.length > 0 && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/d/integrations');
                    }}
                    className="btn btn-primary btn-sm"
                    type="button"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Add Tools
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg p-2 text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-all duration-200"
                  aria-label="Close dialog"
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <div className="flex items-center space-x-2">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{localize('com_nav_plugin_auth_error')} {errorMessage}</span>
              </div>
            </div>
          )}

          {showPluginAuthForm && (
            <div className="border-b border-border-light bg-surface-primary p-6">
              <PluginAuthForm
                plugin={selectedPlugin}
                onSubmit={(installActionData: TPluginAction) => handleInstall(installActionData)}
                isEntityTool={true}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 p-6">
            {/* Search and Controls */}
            <div className="mb-6 space-y-4">
              {/* Search Bar */}
              <div className="relative max-w-md mx-auto">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={handleSearch}
                    placeholder={localize('com_nav_tool_search')}
                    className="w-full h-12 pl-12 pr-12 text-base bg-surface-primary border border-border-light rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 text-text-primary placeholder:text-text-tertiary transition-all duration-200"
                  />
                  {searchValue && (
                    <button
                      onClick={() => setSearchValue('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Controls */}
              {!isLoadingTools && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="text-sm text-text-secondary font-medium">
                    {selectedToolsCount} of {totalFilteredTools} tools selected
                    {selectedServers.size > 0 && ` from ${Array.from(selectedServers).map(serverName => {
                      const server = mcpServers.find(s => s.name === serverName);
                      return server?.displayName || serverName;
                    }).join(', ')}`}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onSelectAll}
                      disabled={selectedToolsCount === totalFilteredTools || totalFilteredTools === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-green-500 text-green-600 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent transition-all duration-200 dark:text-green-400 dark:border-green-400 dark:hover:bg-green-900/10"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={onDeselectAll}
                      disabled={selectedToolsCount === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border-medium text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent transition-all duration-200"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Deselect All
                    </button>

                    {/* MCP Server Dropdown */}
                    {mcpServers.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border-medium text-text-primary hover:bg-surface-hover transition-all duration-200"
                        >
                          Select Apps
                          <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isDropdownOpen && (
                          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border-medium bg-surface-primary shadow-lg z-50">
                            <div className="p-2 space-y-1">
                              {mcpServers.map((server) => (
                                <button
                                  key={server.name}
                                  onClick={() => handleServerSelection(server.name)}
                                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors
                                    ${selectedServers.has(server.name)
                                      ? 'bg-green-50 text-green-600 dark:bg-green-900/10 dark:text-green-400'
                                      : 'hover:bg-surface-hover text-text-primary'
                                    }`}
                                >
                                  {server.icon ? (
                                    <img src={server.icon} alt="" className="w-5 h-5 rounded" />
                                  ) : (
                                    <div className="w-5 h-5 rounded bg-surface-secondary" />
                                  )}
                                  {server.displayName}
                                  {selectedServers.has(server.name) && (
                                    <svg className="h-4 w-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

                         {/* Tools Grid */}
             <div className="min-h-[400px]">
               {isLoadingTools ? (
                 <div className="flex flex-col items-center justify-center py-16 px-4">
                   <div className="flex items-center justify-center space-x-2">
                     <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent"></div>
                     <p className="text-lg text-text-secondary">Loading tools...</p>
                   </div>
                 </div>
               ) : filteredTools && filteredTools.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-16 px-4">
                   <div className="w-16 h-16 bg-surface-tertiary rounded-full flex items-center justify-center mb-4">
                     <Search className="w-8 h-8 text-text-tertiary" />
                   </div>
                   <h3 className="text-lg font-medium text-text-primary mb-2">No tools found</h3>
                   <p className="text-text-secondary text-center max-w-md mb-6">
                     {searchValue 
                       ? 'Try adjusting your search criteria or browse all available tools.'
                       : 'No tools are currently available.'}
                   </p>
                   <button
                     onClick={() => {
                       setIsOpen(false);
                       navigate('/d/integrations');
                     }}
                     className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white border border-green-600 hover:from-green-600 hover:to-emerald-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 shadow-md"
                   >
                     <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                     </svg>
                     Connect Tools
                   </button>
                 </div>
              ) : (
                <div
                  ref={gridRef}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  {filteredTools &&
                    filteredTools
                      .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                      .map((tool, index) => (
                        <ToolItem
                          key={index}
                          tool={tool}
                          isInstalled={getValues(toolsFormKey).includes(tool.pluginKey)}
                          onAddTool={() => onAddTool(tool.pluginKey)}
                          onRemoveTool={() => onRemoveTool(tool.pluginKey)}
                        />
                      ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {maxPage > 1 && (
              <div className="mt-8">
                <Pagination
                  currentPage={currentPage}
                  totalPages={maxPage}
                  onPageChange={handleChangePage}
                  itemsPerPage={itemsPerPage}
                  totalItems={filteredTools?.length || 0}
                  showItemsPerPage={false}
                  className="border-t border-border-light pt-6"
                />
              </div>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default ToolSelectDialog;
