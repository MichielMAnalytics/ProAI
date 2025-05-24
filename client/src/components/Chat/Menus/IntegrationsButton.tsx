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
          className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover"
          onClick={() => navigate('/d/integrations')}
        >
          <MCPIcon className="icon-md" />
        </Button>
      }
    />
  );
} 