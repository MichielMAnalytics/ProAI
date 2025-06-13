import { useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Blocks } from '~/components/svg';
import { PermissionTypes, Permissions, EModelEndpoint } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { useHasAccess } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';

export default function AgentsButton() {
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });

  const agentsEnabled = !!endpointsConfig[EModelEndpoint.agents];

  const handleClick = useCallback(() => {
    if (!navVisible) {
      setNavVisible(true);
    }
    // Small delay to ensure panel is open before trying to focus agent section
    setTimeout(() => {
      const agentAccordion = document.querySelector('[data-testid="agent-builder-accordion"]');
      if (agentAccordion && !agentAccordion.getAttribute('data-state')?.includes('open')) {
        (agentAccordion as HTMLElement).click();
      }
    }, 100);
  }, [navVisible, setNavVisible]);

  if (!hasAccessToAgents || !agentsEnabled) {
    return null;
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
      title="Open Agents Panel"
    >
      <Blocks className="h-4 w-4" />
      <span>Agents</span>
    </button>
  );
}