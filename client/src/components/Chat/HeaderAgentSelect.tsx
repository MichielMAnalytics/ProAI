import React, { useMemo, useCallback } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useListAgentsQuery, useGetStartupConfig, useGetEndpointsQuery } from '~/data-provider';
import { useSelectAgent, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { processAgentOption } from '~/utils';
import { EndpointIcon } from '~/components/Endpoints';
import ControlCombobox from '~/components/ui/ControlCombobox';

export default function HeaderAgentSelect() {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const { onSelect } = useSelectAgent();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const { data: agents = [] } = useListAgentsQuery(undefined, {
    select: (res) =>
      res.data.map((agent) =>
        processAgentOption({
          agent,
          instanceProjectId: startupConfig?.instanceProjectId,
        }),
      ),
  });

  const currentAgentId = conversation?.agent_id || '';
  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === currentAgentId),
    [agents, currentAgentId],
  );

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        onSelect(agentId);
      }
    },
    [agents, onSelect],
  );

  const agentItems = useMemo(
    () =>
      agents.map((agent) => ({
        label: agent.name ?? '',
        value: agent.id ?? '',
        icon: (
          <EndpointIcon
            conversation={{
              agent_id: agent.id,
              endpoint: EModelEndpoint.agents,
              iconURL: agent.avatar?.filepath,
            }}
            endpointsConfig={endpointsConfig}
            containerClassName="shadow-stroke overflow-hidden rounded-full"
            context="menu-item"
            size={20}
          />
        ),
      })),
    [agents, endpointsConfig],
  );

  const selectedIcon = currentAgent?.avatar?.filepath ? (
    <EndpointIcon
      conversation={{
        agent_id: currentAgent.id,
        endpoint: EModelEndpoint.agents,
        iconURL: currentAgent.avatar.filepath,
      }}
      endpointsConfig={endpointsConfig}
      containerClassName="shadow-stroke overflow-hidden rounded-full"
      context="menu-item"
      size={20}
    />
  ) : (
    <EndpointIcon
      conversation={{
        endpoint: EModelEndpoint.agents,
      }}
      endpointsConfig={endpointsConfig}
      containerClassName="shadow-stroke overflow-hidden rounded-full"
      context="menu-item"
      size={20}
    />
  );

  const displayValue = currentAgent?.name || localize('com_ui_select') + ' ' + localize('com_ui_agent');

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-2">
      <ControlCombobox
        containerClassName="px-0"
        selectedValue={currentAgentId}
        displayValue={displayValue}
        selectPlaceholder={localize('com_ui_select') + ' ' + localize('com_ui_agent')}
        iconSide="left"
        searchPlaceholder={localize('com_agents_search_name')}
        SelectIcon={selectedIcon}
        setValue={handleSelectAgent}
        items={agentItems}
        className="my-1 flex h-10 w-full max-w-[70vw] items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        ariaLabel={localize('com_ui_select') + ' ' + localize('com_ui_agent')}
        isCollapsed={false}
        showCarat={true}
      />
    </div>
  );
} 