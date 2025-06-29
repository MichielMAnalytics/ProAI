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
  updateMCPServers,
}: MCPServerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { getValues, setValue } = useFormContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const currentTools = getValues(toolsFormKey) || [];

  // Calculate selected tools for this server
  const serverSelectedTools = useMemo(() => {
    return server.tools.filter((tool) => currentTools.includes(tool.pluginKey));
  }, [server.tools, currentTools]);

  const allServerToolsSelected = serverSelectedTools.length === server.tools.length;
  const someServerToolsSelected = serverSelectedTools.length > 0;

  const handleServerToggle = () => {
    if (server.isDisconnected) return; // Can't toggle disconnected servers

    const toolKeys = server.tools.map((tool) => tool.pluginKey);
    const newCurrentTools = [...currentTools];

    if (allServerToolsSelected) {
      // Deselect all tools from this server
      toolKeys.forEach((toolKey) => {
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
      server.tools.forEach((tool) => {
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
    <div
      className={cn(
        'rounded-xl border shadow-sm transition-all duration-200',
        server.isDisconnected
          ? 'border-orange-300 bg-orange-50 dark:border-orange-600/50 dark:bg-orange-900/20'
          : 'border-border-light bg-surface-primary hover:bg-surface-secondary',
      )}
    >
      {/* Server Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Server Icon */}
            <div className="flex-shrink-0">
              {server.isDisconnected ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-800/50">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              ) : server.icon ? (
                <img
                  src={server.icon}
                  alt={server.displayName}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary">
                  <div className="bg-surface-quaternary h-6 w-6 rounded" />
                </div>
              )}
            </div>

            {/* Server Info */}
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  'truncate text-sm font-semibold',
                  server.isDisconnected
                    ? 'text-orange-700 dark:text-orange-300'
                    : 'text-text-primary',
                )}
              >
                {server.displayName}
                {server.isDisconnected && (
                  <span className="ml-2 text-xs font-normal">(Disconnected)</span>
                )}
              </h3>
              <p
                className={cn(
                  'mt-1 text-xs',
                  server.isDisconnected
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-text-secondary',
                )}
              >
                {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''} •{' '}
                {serverSelectedTools.length} selected
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
                  'flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-all duration-200',
                  allServerToolsSelected
                    ? 'border-[#0E1593] bg-[#0E1593] text-white'
                    : someServerToolsSelected
                      ? 'border-[#0E1593] bg-[#0E1593]/20 text-[#0E1593]'
                      : 'border-border-medium hover:border-[#0E1593] hover:bg-[#0E1593]/10',
                )}
                aria-label={allServerToolsSelected ? 'Deselect all tools' : 'Select all tools'}
              >
                {allServerToolsSelected ? (
                  <Check className="h-4 w-4" />
                ) : someServerToolsSelected ? (
                  <div className="h-2 w-2 rounded-sm bg-[#0E1593]" />
                ) : null}
              </button>
            )}

            {/* Expand Button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200',
                server.isDisconnected
                  ? 'text-orange-600 hover:bg-orange-200 dark:text-orange-400 dark:hover:bg-orange-800/30'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
              aria-label={isExpanded ? 'Collapse tools' : 'Expand tools'}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  isExpanded ? 'rotate-180' : '',
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Tools List */}
      {isExpanded && (
        <div
          className={cn(
            'border-t px-4 pb-4',
            server.isDisconnected
              ? 'border-orange-300 dark:border-orange-600/50'
              : 'border-border-light',
          )}
        >
          <div className="mt-3 space-y-2">
            {server.tools.map((tool, index) => {
              const isSelected = currentTools.includes(tool.pluginKey);
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
                        {tool.name}
                      </p>
                      {tool.description && (
                        <p
                          className={cn(
                            'mt-0.5 truncate text-xs',
                            isDisconnected
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-text-secondary',
                          )}
                        >
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToolToggle(tool)}
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 transition-all duration-200',
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
    </div>
  );
}
