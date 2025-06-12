import { useNavigate } from 'react-router-dom';
import { TooltipAnchor, Button } from '~/components/ui';
import { MCPIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

export default function IntegrationsButton() {
  const navigate = useNavigate();
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_ui_integrations')}
      render={
        <Button
          size="icon"
          variant="outline"
          data-testid="integrations-button"
          aria-label={localize('com_ui_integrations')}
          className="rounded-xl border border-border-light bg-surface-secondary hover:bg-surface-hover transition-all duration-200 flex items-center gap-2 px-3 py-2 min-w-fit h-auto"
          onClick={() => navigate('/d/integrations')}
        >
          {/* Icon and text container */}
          <div className="flex items-center gap-2">
            <MCPIcon className="icon-md flex-shrink-0" />
            <span className="text-sm font-medium text-text-primary whitespace-nowrap">
              Apps
            </span>
          </div>
        </Button>
      }
    />
  );
} 