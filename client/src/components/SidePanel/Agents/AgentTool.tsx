import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { TPlugin } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { OGDialog, OGDialogTrigger, Label, TooltipAnchor } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function AgentTool({
  tool,
  allTools,
  agent_id = '',
}: {
  tool: string;
  allTools: TPlugin[];
  agent_id?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext();
  const currentTool = allTools.find((t) => t.pluginKey === tool);

  // Format tool name: replace dashes with spaces and capitalize each word
  const formatToolName = (name: string) => {
    return name
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const removeTool = (tool: string) => {
    if (tool) {
      updateUserPlugins.mutate(
        { pluginKey: tool, action: 'uninstall', auth: undefined, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const tools = getValues('tools').filter((fn: string) => fn !== tool);
            setValue('tools', tools);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  if (!currentTool) {
    return null;
  }

  const toolName = formatToolName(currentTool.name);
  const isNameTooLong = toolName && toolName.length > 30;

  return (
    <OGDialog>
      <div
        className={cn(
          'flex w-full items-center rounded-lg border border-border-light bg-surface-secondary text-sm transition-colors hover:bg-surface-tertiary',
          !agent_id ? 'opacity-40' : ''
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="flex min-w-0 grow items-center">
          {currentTool.icon && (
            <div className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
              <div
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                style={{ backgroundImage: `url(${currentTool.icon})`, backgroundSize: 'cover' }}
              />
            </div>
          )}
          <div className="min-w-0 flex-1 px-3 py-2">
            {isNameTooLong ? (
              <TooltipAnchor
                description={toolName}
                render={
                  <div className="truncate text-text-primary">
                    {toolName}
                  </div>
                }
              />
            ) : (
              <div className="truncate text-text-primary">
                {toolName}
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
            {localize('com_ui_delete_tool_confirm')}
          </Label>
        }
        selection={{
          selectHandler: () => removeTool(currentTool.pluginKey),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-colors duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
