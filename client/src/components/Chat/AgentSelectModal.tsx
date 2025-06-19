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
            className="h-5 w-5 rounded-sm object-cover transition-transform duration-200 group-hover:scale-110 shadow-sm bg-white/90 dark:bg-gray-100/90 p-0.5"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ))}
      {serverIcons.length > 3 && (
        <div className="flex items-center justify-center h-5 w-5 rounded-sm bg-black/20 text-white text-xs font-medium">
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
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 transition-all duration-300 group-hover:scale-105">
        <div className="text-white font-bold text-6xl">
          {agent.name?.charAt(0)?.toUpperCase() || 'A'}
        </div>
        {imageError && iconURL && (
          <div className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full bg-red-500 border-2 border-white">
            <AlertCircle size={20} className="text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={iconURL}
      alt={agent.name || 'Agent Avatar'}
      className="absolute inset-0 w-full h-full object-contain transition-all duration-300 group-hover:scale-105"
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
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden bg-white/95 backdrop-blur-sm dark:bg-gray-900/95 border shadow-2xl flex flex-col" showCloseButton={false}>
        <DialogHeader className="pb-6 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
            {localize('com_endpoint_agent_placeholder')}
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-2">
            Choose an agent to start your conversation
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500">
          {agents.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
                  No agents available
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Contact your administrator to create agents
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12 pb-8 px-4 pt-6">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="group cursor-pointer rounded-2xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-[1.03] border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:z-10 relative"
                  onClick={() => handleSelectAgent(agent.id || '')}
                >
                  {/* Image Container - Takes up most of the card */}
                  <div className="relative h-80 w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {/* Agent Image/Icon - fills entire container */}
                    <AgentAvatar agent={agent} />
                    
                    {/* Gradient Overlay for better text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-300" />
                    
                    {/* Name Tag - Positioned at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="bg-black/40 dark:bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10 dark:border-gray-600/10">
                        <h3 className="text-lg font-bold text-white text-center truncate group-hover:text-blue-200 transition-colors duration-300">
                          {agent.name || 'Unnamed Agent'}
                        </h3>
                      </div>
                    </div>
                    
                    {/* MCP Server Icons - Top right corner */}
                    {agent.mcp_servers && agent.mcp_servers.length > 0 && (
                      <div className="absolute top-3 right-3">
                        <div className="bg-black/20 backdrop-blur-sm rounded-lg px-2 py-1">
                          <AgentMCPIcons mcpServers={agent.mcp_servers} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Description Section - Compact bottom section */}
                  {agent.description && (
                    <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed text-center group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors duration-300">
                        {agent.description}
                      </p>
                    </div>
                  )}
                  
                  {/* Hover Effect Indicator */}
                  <div className="absolute inset-0 ring-0 ring-blue-500/20 rounded-2xl transition-all duration-300 group-hover:ring-4 pointer-events-none" />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}