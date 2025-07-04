import React, { useCallback, useState, useMemo } from 'react';
import {
  useListAgentsQuery,
  useGetStartupConfig,
  useAvailableIntegrationsQuery,
} from '~/data-provider';
import { useSelectAgent, useLocalize } from '~/hooks';
import { processAgentOption } from '~/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { AlertCircle } from 'lucide-react';

interface AgentSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Tools count component for agent cards
function AgentToolsCount({
  tools,
}: {
  tools?: Array<string | { tool: string; server: string; type: 'global' | 'user' }>;
}) {
  if (!tools || tools.length === 0) {
    return null;
  }

  return (
    <div className="dark:bg-[--surface-tertiary]/95 rounded-lg border border-[--brand-border] bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <svg className="h-3 w-3 text-[#0E1593]" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" />
        </svg>
        <span className="text-xs font-medium text-[#0E1593]">{tools.length}</span>
      </div>
    </div>
  );
}

// Compact MCP server icons component for agent cards
function AgentMCPIcons({
  tools,
}: {
  tools?: Array<string | { tool: string; server: string; type: 'global' | 'user' }>;
}) {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();

  // Extract MCP servers from the enhanced tools structure
  const mcpServers = useMemo(() => {
    if (!tools) return [];

    const serverSet = new Set<string>();
    tools.forEach((tool) => {
      if (typeof tool === 'object' && tool.server) {
        // Remove pipedream- prefix for display consistency
        const serverName = tool.server.startsWith('pipedream-')
          ? tool.server.replace('pipedream-', '')
          : tool.server;
        serverSet.add(serverName);
      }
    });

    return Array.from(serverSet);
  }, [tools]);

  if (mcpServers.length === 0) {
    return null;
  }

  const getMCPServerIcon = (serverName: string): string | undefined => {
    // Strip 'pipedream-' prefix if present to get the appSlug
    const appSlug = serverName.startsWith('pipedream-')
      ? serverName.replace('pipedream-', '')
      : serverName;

    // Find integration by appSlug and return appIcon
    const integration = availableIntegrations?.find((int) => int.appSlug === appSlug);
    return integration?.appIcon;
  };

  const serverIcons = mcpServers
    .map((serverName) => {
      const icon = getMCPServerIcon(serverName);
      return { serverName, icon };
    })
    .filter((server) => server.icon);

  if (serverIcons.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {serverIcons.slice(0, 3).map(({ serverName, icon }) => (
        <div
          key={serverName}
          className="group relative"
          title={serverName.charAt(0).toUpperCase() + serverName.slice(1)}
        >
          <img
            src={icon}
            alt={`${serverName} integration`}
            className="h-4 w-4 rounded-sm bg-white/90 object-cover p-0.5 dark:bg-gray-100/90"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ))}
      {serverIcons.length > 3 && (
        <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-black/20 text-xs font-medium text-white">
          +{serverIcons.length - 3}
        </div>
      )}
    </div>
  );
}

// Custom component to render agent avatars without circular constraints
function AgentAvatar({ agent }: { agent: any }) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const iconURL = agent.avatar?.filepath;
  const isValidURL =
    iconURL &&
    (iconURL.includes('http') || iconURL.startsWith('/images/') || iconURL.startsWith('/assets/'));

  if (imageError || !isValidURL) {
    // Fallback to agent name initial when no image
    return (
      <div className="absolute inset-3 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#0E1593] to-[#04062D] shadow-inner">
        <div className="text-4xl font-bold text-white drop-shadow-lg">
          {agent.name?.charAt(0)?.toUpperCase() || 'A'}
        </div>
        {imageError && iconURL && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-red-500">
            <AlertCircle size={16} className="text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={iconURL}
      alt={agent.name || 'Agent Avatar'}
      className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] rounded-xl object-contain"
      onError={handleImageError}
      loading="lazy"
      decoding="async"
    />
  );
}

export default function AgentSelectModal({ isOpen, onClose }: AgentSelectModalProps) {
  const localize = useLocalize();
  const { onSelect } = useSelectAgent();
  const { data: startupConfig } = useGetStartupConfig();

  const { data: agents = [] } = useListAgentsQuery(undefined, {
    select: (res) => {
      //console.log('Raw agent data from API:', res.data);
      return res.data.map((agent) => {
        //console.log('Processing agent:', agent.name, 'tools:', agent.tools);
        return processAgentOption({
          agent,
          instanceProjectId: startupConfig?.instanceProjectId,
        });
      });
    },
  });

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        onSelect(agentId);
        onClose();
      }
    },
    [agents, onSelect, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden border-2 border-[--brand-border] bg-[--surface-primary] shadow-2xl dark:bg-[--surface-primary]"
        showCloseButton={false}
      >
        <DialogHeader className="relative flex-shrink-0 pb-6">
          <div className="absolute inset-0 rounded-t-lg bg-gradient-to-r from-[#0E1593] to-[#04062D] opacity-5"></div>
          <DialogTitle className="relative z-10 text-center font-display text-2xl font-bold text-[--text-primary]">
            The Agent Collection
          </DialogTitle>
          <p className="relative z-10 text-center text-sm font-medium text-[--text-secondary]">
            Individual knowledge work is over. Pick your agent and be productive.
          </p>
        </DialogHeader>

        <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#0E1593]/20 dark:scrollbar-thumb-[#0E1593]/40 flex-1 overflow-y-auto px-4">
          {agents.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[--brand-border] bg-gradient-to-br from-[#0E1593]/10 to-[#04062D]/10 shadow-lg">
                  <svg
                    className="h-8 w-8 text-[#0E1593]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <p className="mb-2 text-lg font-semibold text-[--text-primary]">
                  No Agents Available
                </p>
                <p className="text-sm text-[--text-secondary]">
                  Contact your administrator to add AI agents
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="group transform cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02]"
                  onClick={() => handleSelectAgent(agent.id || '')}
                >
                  {/* Premium EVE Brand Package Container */}
                  <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-[--brand-border] bg-[--surface-primary] shadow-lg transition-all duration-300 hover:border-[#0E1593]/30 dark:bg-[--surface-secondary]">
                    {/* Tools Count */}
                    {agent.tools && agent.tools.length > 0 && (
                      <div className="absolute left-3 top-3 z-20">
                        <AgentToolsCount tools={agent.tools} />
                      </div>
                    )}

                    {/* MCP Integration Icons */}
                    {agent.tools && (
                      <div className="absolute right-3 top-3 z-20">
                        <div className="dark:bg-[--surface-tertiary]/95 rounded-lg border border-[--brand-border] bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm">
                          <AgentMCPIcons tools={agent.tools} />
                        </div>
                      </div>
                    )}

                    {/* Premium Display Window */}
                    <div className="relative m-3 h-48 overflow-hidden rounded-xl border-2 border-[--brand-border] bg-gradient-to-br from-[--surface-secondary] to-[--surface-tertiary] shadow-inner">
                      {/* EVE Brand Inner Glow */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-[#0E1593]/5 to-[#0E1593]/10"></div>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-black/5"></div>

                      {/* Agent Image/Avatar */}
                      <AgentAvatar agent={agent} />

                      {/* Premium Glass Effect */}
                      <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-tr from-transparent via-white/5 to-white/15 opacity-60"></div>
                    </div>

                    {/* Professional Information Panel */}
                    <div className="flex flex-1 flex-col border-t border-[--brand-border] bg-[--surface-primary] p-4 dark:bg-[--surface-secondary]">
                      {/* Agent Name - Fixed Height */}
                      <div className="mb-3 flex h-12 items-start">
                        <h3
                          className="font-display text-base font-bold leading-tight text-[--text-primary]"
                          title={agent.name || 'Unnamed Agent'}
                        >
                          {agent.name || 'Unnamed Agent'}
                        </h3>
                      </div>

                      {/* Agent Description - Flexible Height */}
                      <div className="mb-4 flex-1">
                        {agent.description ? (
                          <p className="line-clamp-3 flex h-full items-start rounded-lg border border-[--brand-border] bg-[--surface-secondary] p-3 text-xs leading-relaxed text-[--text-secondary]">
                            {agent.description}
                          </p>
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-[--brand-border] bg-[--surface-secondary] p-3 text-xs text-[--text-secondary]">
                            No description available
                          </div>
                        )}
                      </div>

                      {/* Action Button - Fixed Position */}
                      <div className="mt-auto">
                        <button className="btn btn-primary w-full">Choose Agent</button>
                      </div>
                    </div>

                    {/* EVE Brand Reflection Effect */}
                    <div className="via-[#0E1593]/3 to-[#0E1593]/8 pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent opacity-40"></div>

                    {/* Premium Hover Glow */}
                    <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 shadow-lg shadow-[#0E1593]/20 transition-opacity duration-300 group-hover:opacity-100"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
