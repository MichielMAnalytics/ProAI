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
          className="integrations-heartbeat-button relative rounded-xl border border-border-light bg-surface-secondary hover:bg-surface-hover transition-all duration-200 flex items-center gap-2 px-3 py-2 min-w-fit h-auto"
          onClick={() => navigate('/d/integrations')}
        >
          {/* Heartbeat animation border */}
          <div className="integrations-heartbeat-ring absolute inset-0 rounded-xl"></div>
          
          {/* Icon and text container */}
          <div className="flex items-center gap-2 relative z-10">
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