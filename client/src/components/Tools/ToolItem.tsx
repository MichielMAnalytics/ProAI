import { TPlugin } from 'librechat-data-provider';
import { XCircle, PlusCircleIcon, Wrench, ExternalLink } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { formatToolName, cleanDescription } from '~/utils/textProcessing';

type ToolItemProps = {
  tool: TPlugin;
  onAddTool: () => void;
  onRemoveTool: () => void;
  isInstalled?: boolean;
};

function ToolItem({ tool, onAddTool, onRemoveTool, isInstalled = false }: ToolItemProps) {
  const localize = useLocalize();
  const handleClick = () => {
    if (isInstalled) {
      onRemoveTool();
    } else {
      onAddTool();
    }
  };

  // Extract documentation URL from description
  const getDocUrl = () => {
    if (!tool.description) return null;
    const urlMatch = tool.description.match(/https:\/\/[^\s)]+/);
    return urlMatch ? urlMatch[0] : null;
  };

  const docUrl = getDocUrl();

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-surface-primary shadow-sm transition-all duration-300 hover:-translate-y-1 dark:border-gray-700/50 dark:bg-surface-secondary dark:hover:shadow-gray-900/20">
      {/* Documentation link icon in top right corner */}
      {docUrl && (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-3 top-3 z-10 rounded-lg bg-surface-secondary p-1.5 text-text-tertiary transition-all duration-200 hover:bg-surface-hover hover:text-green-600 dark:hover:text-green-400"
          onClick={(e) => e.stopPropagation()}
          title="View documentation"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <div className="flex h-full flex-col p-6">
        {/* Icon in top left corner */}
        <div className="mb-4 flex justify-start">
          <div className="relative flex-shrink-0">
            {tool.icon != null && tool.icon ? (
              <img
                src={tool.icon}
                alt={localize('com_ui_logo', { 0: formatToolName(tool.name) })}
                className="h-12 w-12 rounded-lg bg-white object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                <Wrench className="h-6 w-6" />
              </div>
            )}
          </div>
        </div>

        {/* Title with full width */}
        <div className="mb-4">
          <h3 className="line-clamp-2 text-lg font-bold leading-tight text-text-primary transition-colors group-hover:text-green-600 dark:group-hover:text-green-400">
            {formatToolName(tool.name)}
          </h3>
        </div>

        {/* Description - Full width and flexible height */}
        <div className="mb-4 flex-1">
          <p
            className="line-clamp-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
            title={cleanDescription(tool.description || '')}
          >
            {cleanDescription(tool.description || '')}
          </p>
        </div>

        {/* Footer Section - Fixed at bottom */}
        <div className="mt-auto">
          {!isInstalled ? (
            <button
              className="btn btn-primary h-9 w-full text-sm"
              aria-label={`${localize('com_ui_add')} ${formatToolName(tool.name)}`}
              onClick={handleClick}
            >
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_ui_add')}
                <PlusCircleIcon className="flex h-4 w-4 items-center stroke-2" />
              </div>
            </button>
          ) : (
            <button
              className="btn btn-neutral h-9 w-full text-sm"
              onClick={handleClick}
              aria-label={`${localize('com_nav_tool_remove')} ${formatToolName(tool.name)}`}
            >
              {localize('com_nav_tool_remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ToolItem;
