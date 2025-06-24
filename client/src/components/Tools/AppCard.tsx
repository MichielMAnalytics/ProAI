import { useState, useMemo } from 'react';
import { ChevronDown, AlertTriangle, Check, X } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TPlugin, TPluginAction, TError } from 'librechat-data-provider';
import { cn } from '~/utils';

interface AppCardProps {
  app: {
    id: string;
    name: string;
    displayName: string;
    icon?: string;
    tools: any[];
    isDisconnected?: boolean;
    isSingleTool?: boolean;
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
  const { getValues, setValue } = useFormContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  
  const currentTools = getValues(toolsFormKey) || [];
  
  // For single tool apps, check if the tool is selected
  const isSingleToolSelected = app.isSingleTool && currentTools.includes(app.tools[0]?.pluginKey);
  
  // For multi-tool apps, calculate selected tools
  const selectedTools = useMemo(() => {
    if (app.isSingleTool) return [];
    return app.tools.filter(tool => 
      currentTools.includes(tool.pluginKey)
    );
  }, [app.tools, currentTools, app.isSingleTool]);
  
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
          if (!currentTools.includes(tool.pluginKey)) {
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
    
    const isSelected = currentTools.includes(tool.pluginKey);
    
    if (isSelected) {
      onRemoveTool(tool.pluginKey);
    } else {
      onAddTool(tool.pluginKey);
    }
  };
  
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
            <div className="flex-shrink-0">
              {app.isDisconnected ? (
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-800/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
              ) : app.icon ? (
                <img 
                  src={app.icon} 
                  alt={app.displayName} 
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center">
                  <div className="w-6 h-6 rounded bg-surface-quaternary" />
                </div>
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
                {app.isDisconnected && (
                  <span className="text-xs font-normal ml-2">(Disconnected)</span>
                )}
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
            {/* Selection Toggle Button */}
            {!app.isDisconnected && (
              <button
                onClick={handleAppToggle}
                className={cn(
                  "w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200",
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
                  <Check className="w-4 h-4" />
                ) : selectionStatus === 'some' ? (
                  <div className="w-2 h-2 bg-[#0E1593] rounded-sm" />
                ) : null}
              </button>
            )}
            
            {/* Expand Button (only for multi-tool apps) */}
            {!app.isSingleTool && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
                  app.isDisconnected
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
            )}
          </div>
        </div>
      </div>
      
      {/* Tools List (only for multi-tool apps when expanded) */}
      {!app.isSingleTool && isExpanded && (
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