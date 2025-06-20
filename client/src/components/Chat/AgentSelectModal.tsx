import React, { useCallback, useState } from 'react';
import { useListAgentsQuery, useGetStartupConfig, useAvailableIntegrationsQuery } from '~/data-provider';
import { useSelectAgent, useLocalize } from '~/hooks';
import { processAgentOption } from '~/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { AlertCircle } from 'lucide-react';

interface AgentSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Compact MCP server icons component for agent cards
function AgentMCPIcons({ mcpServers }: { mcpServers?: string[] }) {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();

  if (!mcpServers || mcpServers.length === 0) {
    return null;
  }

  const getMCPServerIcon = (serverName: string): string | undefined => {
    // Strip 'pipedream-' prefix if present to get the appSlug
    const appSlug = serverName.startsWith('pipedream-') 
      ? serverName.replace('pipedream-', '') 
      : serverName;
    
    // Find integration by appSlug and return appIcon
    const integration = availableIntegrations?.find(int => int.appSlug === appSlug);
    return integration?.appIcon;
  };

  const serverIcons = mcpServers.map(serverName => {
    const icon = getMCPServerIcon(serverName);
    return { serverName, icon };
  }).filter(server => server.icon);

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
            className="h-4 w-4 rounded-sm object-cover bg-white/90 dark:bg-gray-100/90 p-0.5"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ))}
      {serverIcons.length > 3 && (
        <div className="flex items-center justify-center h-4 w-4 rounded-sm bg-black/20 text-white text-xs font-medium">
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
  const isValidURL = iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/') || iconURL.startsWith('/assets/'));

  if (imageError || !isValidURL) {
    // Fallback to agent name initial when no image
    return (
      <div className="absolute inset-3 flex items-center justify-center bg-gradient-to-br from-[#0E1593] to-[#04062D] rounded-xl shadow-inner">
        <div className="text-white font-bold text-4xl drop-shadow-lg">
          {agent.name?.charAt(0)?.toUpperCase() || 'A'}
        </div>
        {imageError && iconURL && (
          <div className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-full bg-red-500 border border-white">
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
      className="absolute inset-3 w-[calc(100%-24px)] h-[calc(100%-24px)] object-contain rounded-xl"
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
    select: (res) =>
      res.data.map((agent) =>
        processAgentOption({
          agent,
          instanceProjectId: startupConfig?.instanceProjectId,
        }),
      ),
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden bg-[--surface-primary] dark:bg-[--surface-primary] border-2 border-[--brand-border] shadow-2xl flex flex-col" showCloseButton={false}>
        <DialogHeader className="pb-6 flex-shrink-0 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0E1593] to-[#04062D] opacity-5 rounded-t-lg"></div>
          <DialogTitle className="text-2xl font-bold font-display text-center text-[--text-primary] relative z-10">
            The Agent Collection
          </DialogTitle>
          <p className="text-sm text-[--text-secondary] text-center relative z-10 font-medium">
            Individual knowledge work is often. Pick your agent and get started.
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#0E1593]/20 dark:scrollbar-thumb-[#0E1593]/40">
          {agents.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#0E1593]/10 to-[#04062D]/10 flex items-center justify-center shadow-lg border border-[--brand-border]">
                  <svg className="w-8 h-8 text-[#0E1593]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-[--text-primary] mb-2">
                  No Agents Available
                </p>
                <p className="text-sm text-[--text-secondary]">
                  Contact your administrator to add premium AI agents
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="group cursor-pointer transform transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1"
                  onClick={() => handleSelectAgent(agent.id || '')}
                >
                  {/* Premium EVE Brand Package Container */}
                  <div className="relative bg-[--surface-primary] dark:bg-[--surface-secondary] rounded-2xl shadow-lg border-2 border-[--brand-border] hover:border-[#0E1593]/30 overflow-hidden transition-all duration-300 flex flex-col h-full">
                    
                    {/* MCP Integration Icons */}
                    {agent.mcp_servers && agent.mcp_servers.length > 0 && (
                      <div className="absolute top-3 right-3 z-20">
                        <div className="bg-white/95 dark:bg-[--surface-tertiary]/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-md border border-[--brand-border]">
                          <AgentMCPIcons mcpServers={agent.mcp_servers} />
                        </div>
                      </div>
                    )}

                    {/* Premium Display Window */}
                    <div className="relative h-48 bg-gradient-to-br from-[--surface-secondary] to-[--surface-tertiary] border-2 border-[--brand-border] m-3 rounded-xl overflow-hidden shadow-inner">
                      {/* EVE Brand Inner Glow */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#0E1593]/5 to-[#0E1593]/10 pointer-events-none"></div>
                      <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-black/5 pointer-events-none"></div>
                      
                      {/* Agent Image/Avatar */}
                      <AgentAvatar agent={agent} />
                      
                      {/* Premium Glass Effect */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 opacity-60 pointer-events-none rounded-xl"></div>
                    </div>

                    {/* Professional Information Panel */}
                    <div className="p-4 bg-[--surface-primary] dark:bg-[--surface-secondary] border-t border-[--brand-border] flex-1 flex flex-col">
                      
                      {/* Agent Name - Fixed Height */}
                      <div className="h-12 mb-3 flex items-start">
                        <h3 className="font-bold font-display text-[--text-primary] text-base leading-tight" title={agent.name || 'Unnamed Agent'}>
                          {agent.name || 'Unnamed Agent'}
                        </h3>
                      </div>

                      {/* Agent Description - Flexible Height */}
                      <div className="flex-1 mb-4">
                        {agent.description ? (
                          <p className="text-xs text-[--text-secondary] line-clamp-3 leading-relaxed bg-[--surface-secondary] p-3 rounded-lg border border-[--brand-border] h-full flex items-start">
                            {agent.description}
                          </p>
                        ) : (
                          <div className="text-xs text-[--text-secondary] bg-[--surface-secondary] p-3 rounded-lg border border-[--brand-border] h-full flex items-center justify-center">
                            No description available
                          </div>
                        )}
                      </div>

                      {/* Action Button - Fixed Position */}
                      <div className="mt-auto">
                        <button className="w-full bg-gradient-to-r from-[#0E1593] to-[#04062D] text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg group-hover:from-[#04062D] group-hover:to-[#0E0E0E] transition-all duration-300 border border-white/10">
                          Choose Agent
                        </button>
                      </div>
                    </div>

                    {/* EVE Brand Reflection Effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#0E1593]/3 to-[#0E1593]/8 pointer-events-none rounded-2xl opacity-40"></div>
                    
                    {/* Premium Hover Glow */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg shadow-[#0E1593]/20 pointer-events-none"></div>
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