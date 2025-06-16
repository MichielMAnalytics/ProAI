import { TPlugin } from 'librechat-data-provider';
import { XCircle, PlusCircleIcon, Wrench, ExternalLink } from 'lucide-react';
import { useLocalize } from '~/hooks';

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

  // Format tool name: replace dashes with spaces and capitalize each word
  const formatToolName = (name: string) => {
    return name
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Extract documentation URL from description
  const getDocUrl = () => {
    if (!tool.description) return null;
    const urlMatch = tool.description.match(/https:\/\/[^\s)]+/);
    return urlMatch ? urlMatch[0] : null;
  };

  const docUrl = getDocUrl();

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-surface-primary shadow-sm transition-all duration-300 hover:-translate-y-1 dark:bg-surface-secondary dark:border-gray-700/50 dark:hover:shadow-gray-900/20 flex flex-col h-full">
      {/* Documentation link icon in top right corner */}
      {docUrl && (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-hover text-text-tertiary hover:text-green-600 dark:hover:text-green-400 transition-all duration-200"
          onClick={(e) => e.stopPropagation()}
          title="View documentation"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      
      <div className="p-6 flex flex-col h-full">
        {/* Icon in top left corner */}
        <div className="flex justify-start mb-4">
          <div className="flex-shrink-0 relative">
            {tool.icon != null && tool.icon ? (
              <img
                src={tool.icon}
                alt={localize('com_ui_logo', { 0: formatToolName(tool.name) })}
                className="h-12 w-12 rounded-lg object-cover bg-white"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                <Wrench className="h-6 w-6" />
              </div>
            )}
          </div>
        </div>
        
        {/* Title with full width */}
        <div className="mb-4">
          <h3 className="font-bold text-text-primary text-lg leading-tight group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors line-clamp-2">
            {formatToolName(tool.name)}
          </h3>
        </div>

        {/* Description - Full width and flexible height */}
        <div className="flex-1 mb-4">
          <p 
            className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3"
            title={tool.description 
              ? tool.description
                  .replace(/\[See the docs?\]/gi, '')
                  .replace(/\[See the docs here\]/gi, '')
                  .replace(/\[See the documentation\]/gi, '')
                  .replace(/See the docs?/gi, '')
                  .replace(/See the documentation/gi, '')
                  .replace(/IMPORTANT:[\s\S]*?format:\s*string/gi, '')
                  .replace(/\s*for more information/gi, '')
                  .replace(/\s*-\s*cc:[\s\S]*?format:\s*string/gi, '')
                  .replace(/\s*-\s*bcc:[\s\S]*?format:\s*string/gi, '')
                  .replace(/\s*-\s*attachment[\s\S]*?format:\s*string/gi, '')
                  .replace(/https:\/\/[^\s)]+/g, '')
                  .replace(/\(\s*\)/g, '')
                  .replace(/\[\s*\]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
              : ''
            }
          >
            {tool.description 
              ? tool.description
                  .replace(/\[See the docs?\]/gi, '')
                  .replace(/\[See the docs here\]/gi, '')
                  .replace(/\[See the documentation\]/gi, '')
                  .replace(/See the docs?/gi, '')
                  .replace(/See the documentation/gi, '')
                  .replace(/IMPORTANT:[\s\S]*?format:\s*string/gi, '')
                  .replace(/\s*for more information/gi, '')
                  .replace(/\s*-\s*cc:[\s\S]*?format:\s*string/gi, '')
                  .replace(/\s*-\s*bcc:[\s\S]*?format:\s*string/gi, '')
                  .replace(/\s*-\s*attachment[\s\S]*?format:\s*string/gi, '')
                  .replace(/https:\/\/[^\s)]+/g, '')
                  .replace(/\(\s*\)/g, '')
                  .replace(/\[\s*\]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
              : ''
            }
          </p>
        </div>

        {/* Footer Section - Fixed at bottom */}
        <div className="mt-auto">
          {!isInstalled ? (
            <button
              className="btn btn-primary w-full h-9 text-sm"
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
              className="btn btn-neutral w-full h-9 text-sm"
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
