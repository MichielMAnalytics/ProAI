import { useState, useMemo } from 'react';
import { ChevronDown, AlertTriangle, Check, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TPlugin, TPluginAction, TError } from 'librechat-data-provider';
import { cn } from '~/utils';

interface MCPServerCardProps {
  server: {
    name: string;
    displayName: string;
    icon?: string;
    tools: TPlugin[] | any[];
    isDisconnected?: boolean;
  };
  toolsFormKey: string;
  onInstallError: (error: TError) => void;
  updateMCPServers: () => void;
}

export default function MCPServerCard({ 
  server, 
  toolsFormKey, 
  onInstallError,
  updateMCPServers 
}: MCPServerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { getValues, setValue } = useFormContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  
  const currentTools = getValues(toolsFormKey) || [];
  
  // Calculate selected tools for this server
  const serverSelectedTools = useMemo(() => {
    return server.tools.filter(tool => 
      currentTools.includes(tool.pluginKey)
    );
  }, [server.tools, currentTools]);
  
  const allServerToolsSelected = serverSelectedTools.length === server.tools.length;
  const someServerToolsSelected = serverSelectedTools.length > 0;
  
  const handleServerToggle = () => {
    if (server.isDisconnected) return; // Can't toggle disconnected servers
    
    const toolKeys = server.tools.map(tool => tool.pluginKey);
    const newCurrentTools = [...currentTools];
    
    if (allServerToolsSelected) {
      // Deselect all tools from this server
      toolKeys.forEach(toolKey => {
        const index = newCurrentTools.indexOf(toolKey);
        if (index > -1) {
          newCurrentTools.splice(index, 1);
        }
        
        // Call uninstall for each tool
        updateUserPlugins.mutate(
          { pluginKey: toolKey, action: 'uninstall', auth: undefined, isEntityTool: true },
          {
            onError: (error: unknown) => {
              onInstallError(error as TError);
            },
          },
        );
      });
    } else {
      // Select all tools from this server that don't require auth
      server.tools.forEach(tool => {
        if (!currentTools.includes(tool.pluginKey)) {
          const { authConfig, authenticated = false } = tool;
          if (!authConfig || authConfig.length === 0 || authenticated) {
            newCurrentTools.push(tool.pluginKey);
          }
        }
      });
    }
    
    setValue(toolsFormKey, newCurrentTools);
    updateMCPServers();
  };
  
  const handleToolToggle = (tool: TPlugin | any) => {
    if (tool.isDisconnected) {
      // Handle disconnected tool removal
      const newCurrentTools = currentTools.filter((t: string) => t !== tool.pluginKey);
      setValue(toolsFormKey, newCurrentTools);
      updateMCPServers();
      return;
    }
    
    const isSelected = currentTools.includes(tool.pluginKey);
    
    if (isSelected) {
      // Remove tool
      const newCurrentTools = currentTools.filter((t: string) => t !== tool.pluginKey);
      setValue(toolsFormKey, newCurrentTools);
      
      updateUserPlugins.mutate(
        { pluginKey: tool.pluginKey, action: 'uninstall', auth: undefined, isEntityTool: true },
        {
          onError: (error: unknown) => {
            onInstallError(error as TError);
          },
        },
      );
    } else {
      // Add tool
      const { authConfig, authenticated = false } = tool;
      if (!authConfig || authConfig.length === 0 || authenticated) {
        const newCurrentTools = [...currentTools, tool.pluginKey];
        setValue(toolsFormKey, newCurrentTools);
      }
    }
    
    updateMCPServers();
  };
  
  return (
    <div className={cn(
      "rounded-xl border shadow-sm transition-all duration-200",
      server.isDisconnected 
        ? "border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600/50"
        : "border-border-light bg-surface-primary hover:bg-surface-secondary"
    )}>
      {/* Server Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Server Icon */}
            <div className="flex-shrink-0">
              {server.isDisconnected ? (
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-800/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
              ) : server.icon ? (
                <img 
                  src={server.icon} 
                  alt={server.displayName} 
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center">
                  <div className="w-6 h-6 rounded bg-surface-quaternary" />
                </div>
              )}
            </div>
            
            {/* Server Info */}
            <div className="min-w-0 flex-1">
              <h3 className={cn(
                "font-semibold text-sm truncate",
                server.isDisconnected 
                  ? "text-orange-700 dark:text-orange-300"
                  : "text-text-primary"
              )}>
                {server.displayName}
                {server.isDisconnected && (
                  <span className="text-xs font-normal ml-2">(Disconnected)</span>
                )}
              </h3>
              <p className={cn(
                "text-xs mt-1",
                server.isDisconnected 
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-text-secondary"
              )}>
                {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''} • {serverSelectedTools.length} selected
              </p>
            </div>
          </div>
          
          {/* Server Actions */}
          <div className="flex items-center gap-2">
            {/* Server Toggle Button */}
            {!server.isDisconnected && (
              <button
                onClick={handleServerToggle}
                className={cn(
                  "w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200",
                  allServerToolsSelected 
                    ? "bg-[#0E1593] border-[#0E1593] text-white"
                    : someServerToolsSelected
                    ? "bg-[#0E1593]/20 border-[#0E1593] text-[#0E1593]"
                    : "border-border-medium hover:border-[#0E1593] hover:bg-[#0E1593]/10"
                )}
                aria-label={allServerToolsSelected ? "Deselect all tools" : "Select all tools"}
              >
                {allServerToolsSelected ? (
                  <Check className="w-4 h-4" />
                ) : someServerToolsSelected ? (
                  <div className="w-2 h-2 bg-[#0E1593] rounded-sm" />
                ) : null}
              </button>
            )}
            
            {/* Expand Button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
                server.isDisconnected
                  ? "hover:bg-orange-200 dark:hover:bg-orange-800/30 text-orange-600 dark:text-orange-400"
                  : "hover:bg-surface-hover text-text-secondary hover:text-text-primary"
              )}
              aria-label={isExpanded ? "Collapse tools" : "Expand tools"}
            >
              <ChevronDown className={cn(
                "w-4 h-4 transition-transform duration-200",
                isExpanded ? "rotate-180" : ""
              )} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Tools List */}
      {isExpanded && (
        <div className={cn(
          "border-t px-4 pb-4",
          server.isDisconnected 
            ? "border-orange-300 dark:border-orange-600/50"
            : "border-border-light"
        )}>
          <div className="space-y-2 mt-3">
            {server.tools.map((tool, index) => {
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
                        {tool.name}
                      </p>
                      {tool.description && (
                        <p className={cn(
                          "text-xs truncate mt-0.5",
                          isDisconnected 
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-text-secondary"
                        )}>
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleToolToggle(tool)}
                    className={cn(
                      "w-6 h-6 rounded border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0",
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
    </div>
  );
}