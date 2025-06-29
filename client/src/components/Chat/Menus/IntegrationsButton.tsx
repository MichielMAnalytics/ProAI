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
          className="flex h-auto min-w-fit items-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 transition-all duration-200 hover:bg-surface-hover"
          onClick={() => navigate('/d/integrations')}
        >
          {/* Icon and text container */}
          <div className="flex items-center gap-2">
            <MCPIcon className="icon-md flex-shrink-0" />
            <span className="whitespace-nowrap text-sm font-medium text-text-primary">Apps</span>
          </div>
        </Button>
      }
    />
  );
}
