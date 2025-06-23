import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { TPlugin } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { AlertTriangle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function AssistantTool({
  tool,
  allTools,
  assistant_id = '',
}: {
  tool: string;
  allTools: TPlugin[];
  assistant_id?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext();
  const currentTool = allTools.find((t) => t.pluginKey === tool);

  const removeTool = (tool: string) => {
    if (tool) {
      updateUserPlugins.mutate(
        { pluginKey: tool, action: 'uninstall', auth: null, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const fns = getValues('functions').filter((fn) => fn !== tool);
            setValue('functions', fns);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  // Handle disconnected tools
  const isDisconnected = !currentTool;
  const toolName = isDisconnected 
    ? tool.charAt(0).toUpperCase() + tool.slice(1).replace(/_/g, ' ').replace(/-/g, ' ')
    : currentTool.name;

  return (
    <OGDialog>
      <div
        className={cn(
          'flex w-full items-center rounded-lg text-sm border',
          isDisconnected 
            ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600/50'
            : 'border-transparent',
          !assistant_id ? 'opacity-40' : '',
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="flex grow items-center">
          {isDisconnected ? (
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-orange-100 dark:bg-orange-800/50">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          ) : currentTool.icon ? (
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
              <div
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                style={{ backgroundImage: `url(${currentTool.icon})`, backgroundSize: 'cover' }}
              />
            </div>
          ) : null}
          <div
            className={cn(
              "h-9 grow px-3 py-2",
              isDisconnected ? "text-orange-700 dark:text-orange-300" : "text-text-primary"
            )}
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            {toolName}
            {isDisconnected && <span className="text-xs ml-1">(Disconnected)</span>}
          </div>
        </div>

        {isHovering && (
          <OGDialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <TrashIcon />
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
              ? `Remove this disconnected tool "${toolName}" from the assistant?`
              : localize('com_ui_delete_tool_confirm')
            }
          </Label>
        }
        selection={{
          selectHandler: () => removeTool(isDisconnected ? tool : currentTool.pluginKey),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-colors duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
