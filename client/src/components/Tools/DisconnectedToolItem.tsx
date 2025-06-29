import { AlertTriangle, XCircle } from 'lucide-react';
import { useLocalize } from '~/hooks';

type DisconnectedToolItemProps = {
  tool: {
    pluginKey: string;
    name: string;
    description: string;
    icon?: string;
    isDisconnected: boolean;
  };
  onRemoveTool: () => void;
};

function DisconnectedToolItem({ tool, onRemoveTool }: DisconnectedToolItemProps) {
  const localize = useLocalize();

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-orange-300 bg-orange-50 shadow-sm transition-all duration-300 dark:border-orange-600/50 dark:bg-orange-900/20">
      {/* Warning icon in top right corner */}
      <div className="absolute right-3 top-3 z-10 rounded-lg bg-orange-100 p-1.5 dark:bg-orange-800/50">
        <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      </div>

      <div className="flex h-full flex-col p-6">
        {/* Icon in top left corner */}
        <div className="mb-4 flex justify-start">
          <div className="relative flex-shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-red-500 text-white opacity-60">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Title with full width */}
        <div className="mb-4">
          <h3 className="line-clamp-2 text-lg font-bold leading-tight text-orange-700 dark:text-orange-300">
            {tool.name}
            <span className="mt-1 block text-xs font-medium text-orange-600 dark:text-orange-400">
              (Disconnected)
            </span>
          </h3>
        </div>

        {/* Description - Full width and flexible height */}
        <div className="mb-4 flex-1">
          <p className="line-clamp-3 text-sm leading-relaxed text-orange-600 dark:text-orange-400">
            {tool.description}
          </p>
          <div className="mt-2 rounded-md bg-orange-100 px-2 py-1 text-xs text-orange-500 dark:bg-orange-800/30 dark:text-orange-400">
            ⚠️ MCP server connection required
          </div>
        </div>

        {/* Footer Section - Fixed at bottom */}
        <div className="mt-auto">
          <button
            className="btn h-9 w-full border-orange-300 bg-orange-200 text-sm text-orange-700 hover:bg-orange-300 dark:border-orange-600 dark:bg-orange-800/50 dark:text-orange-300 dark:hover:bg-orange-700/50"
            onClick={onRemoveTool}
            aria-label={`Remove disconnected tool ${tool.name}`}
          >
            <div className="flex w-full items-center justify-center gap-2">
              Remove
              <XCircle className="h-4 w-4" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DisconnectedToolItem;
