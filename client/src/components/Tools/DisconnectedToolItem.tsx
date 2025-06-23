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
    <div className="group relative overflow-hidden rounded-xl border border-orange-300 bg-orange-50 shadow-sm transition-all duration-300 dark:bg-orange-900/20 dark:border-orange-600/50 flex flex-col h-full">
      {/* Warning icon in top right corner */}
      <div className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-orange-100 dark:bg-orange-800/50">
        <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      </div>
      
      <div className="p-6 flex flex-col h-full">
        {/* Icon in top left corner */}
        <div className="flex justify-start mb-4">
          <div className="flex-shrink-0 relative">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white opacity-60">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        {/* Title with full width */}
        <div className="mb-4">
          <h3 className="font-bold text-orange-700 dark:text-orange-300 text-lg leading-tight line-clamp-2">
            {tool.name}
            <span className="text-xs font-medium text-orange-600 dark:text-orange-400 block mt-1">
              (Disconnected)
            </span>
          </h3>
        </div>

        {/* Description - Full width and flexible height */}
        <div className="flex-1 mb-4">
          <p className="text-sm text-orange-600 dark:text-orange-400 leading-relaxed line-clamp-3">
            {tool.description}
          </p>
          <div className="mt-2 text-xs text-orange-500 dark:text-orange-400 bg-orange-100 dark:bg-orange-800/30 rounded-md px-2 py-1">
            ⚠️ MCP server connection required
          </div>
        </div>

        {/* Footer Section - Fixed at bottom */}
        <div className="mt-auto">
          <button
            className="btn w-full h-9 text-sm bg-orange-200 hover:bg-orange-300 dark:bg-orange-800/50 dark:hover:bg-orange-700/50 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-600"
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