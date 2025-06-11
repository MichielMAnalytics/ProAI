import { useEffect } from 'react';
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
  const { data: tools } = useAvailableToolsQuery(endpoint);
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
    // In a more sophisticated implementation, you might want to prompt for each one
    if (toolsWithAuth.length > 0) {
      // Could show a toast or message about tools requiring authentication
      console.log(`${toolsWithAuth.length} tools require authentication and were skipped`);
    }
  };

  const onDeselectAll = () => {
    if (!filteredTools) return;
    
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

  const filteredTools = tools?.filter((tool) =>
    tool.name.toLowerCase().includes(searchValue.toLowerCase()),
  );

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
              <div className="flex items-center space-x-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
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
              </div>
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
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="text-sm text-text-secondary font-medium">
                  {selectedToolsCount} of {totalFilteredTools} tools selected
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
                </div>
              </div>
            </div>

                         {/* Tools Grid */}
             <div className="min-h-[400px]">
               {filteredTools && filteredTools.length === 0 ? (
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
