import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { TPlugin } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { OGDialog, OGDialogTrigger, Label, TooltipAnchor } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { AlertTriangle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { formatToolName } from '~/utils/textProcessing';

export default function AgentTool({
  tool,
  allTools,
  agent_id = '',
}: {
  tool: string | { tool: string; server: string; type: 'global' | 'user' };
  allTools: TPlugin[];
  agent_id?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext();
  
  // Extract tool key from both string tools and MCP tool objects
  const toolKey = typeof tool === 'string' ? tool : tool.tool;
  const currentTool = allTools.find((t) => t.pluginKey === toolKey);
  
  // Check if this is a global MCP tool
  const isGlobalTool = typeof tool === 'object' && tool.type === 'global';

  const removeTool = (tool: string) => {
    if (tool) {
      updateUserPlugins.mutate(
        { pluginKey: tool, action: 'uninstall', auth: undefined, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const tools = getValues('tools').filter((fn: string | any) => {
              // Handle both string tools and MCP tool objects
              const fnKey = typeof fn === 'string' ? fn : fn.tool || fn;
              return fnKey !== tool;
            });
            setValue('tools', tools);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  // Handle disconnected tools
  const isDisconnected = !currentTool;
  const toolName = isDisconnected 
    ? formatToolName(toolKey) 
    : formatToolName(currentTool.name);
  const isNameTooLong = toolName && toolName.length > 30;

  return (
    <OGDialog>
      <div
        className={cn(
          'flex w-full items-center rounded-lg border text-sm transition-colors',
          isDisconnected 
            ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600/50 hover:bg-orange-100 dark:hover:bg-orange-800/30'
            : 'border-border-light bg-surface-secondary hover:bg-surface-tertiary',
          !agent_id ? 'opacity-40' : ''
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="flex min-w-0 grow items-center">
          {isDisconnected ? (
            <div className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center relative">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-800/50">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              {/* Global indicator */}
              {isGlobalTool && (
                <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-500 border border-white dark:border-gray-800" />
              )}
            </div>
          ) : currentTool.icon ? (
            <div className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center relative">
              <img
                src={currentTool.icon}
                alt={currentTool.name}
                className="h-6 w-6 rounded-sm object-cover"
              />
              {/* Global indicator */}
              {isGlobalTool && (
                <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-500 border border-white dark:border-gray-800" />
              )}
            </div>
          ) : null}
          <div className="min-w-0 flex-1 px-3 py-2">
            {isNameTooLong ? (
              <TooltipAnchor
                description={isDisconnected ? `${toolName} (Disconnected - MCP server required)` : toolName}
                render={
                  <div className={cn(
                    "truncate",
                    isDisconnected ? "text-orange-700 dark:text-orange-300" : "text-text-primary"
                  )}>
                    {toolName}
                    {isDisconnected && <span className="text-xs ml-1">(Disconnected)</span>}
                  </div>
                }
              />
            ) : (
              <div className={cn(
                "truncate",
                isDisconnected ? "text-orange-700 dark:text-orange-300" : "text-text-primary"
              )}>
                {toolName}
                {isDisconnected && <span className="text-xs ml-1">(Disconnected)</span>}
              </div>
            )}
          </div>
        </div>

        {isHovering && (
          <OGDialogTrigger asChild>
            <button
              type="button"
              className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-red-100 dark:hover:bg-red-900/20"
              aria-label="Delete tool"
            >
              <TrashIcon className="h-4 w-4 text-red-500" />
            </button>
          </OGDialogTrigger>
        )}
      </div>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_tool')}
        className="max-w-[450px]"
        main={
          <Label className="text-left text-sm font-medium">
            {isDisconnected 
              ? `Remove this disconnected tool "${toolName}" from the agent?`
              : localize('com_ui_delete_tool_confirm')
            }
          </Label>
        }
        selection={{
          selectHandler: () => removeTool(isDisconnected ? toolKey : currentTool.pluginKey),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-colors duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
