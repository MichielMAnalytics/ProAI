import React from 'react';
import { useRecoilValue } from 'recoil';
import { useMCPConnection } from '~/hooks/useMCPConnection';
import { useGetAgentByIdQuery } from '~/data-provider';
import { Constants, isAgentsEndpoint } from 'librechat-data-provider';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import store from '~/store';

interface DefaultPromptsProps {
  conversation: any;
  onPromptSelect: (prompt: string) => void;
  isCompact?: boolean;
}

export default function DefaultPrompts({ conversation, onPromptSelect, isCompact = false }: DefaultPromptsProps) {
  const { areAllMCPServersConnected } = useMCPConnection();
  
  // Check if there's any submission happening
  const isSubmitting = useRecoilValue(store.isSubmitting);

  // Get agent data if we have an agent_id
  const agentId = conversation?.agent_id;
  const { data: agentData } = useGetAgentByIdQuery(agentId ?? '', {
    enabled: !!(agentId && agentId !== Constants.EPHEMERAL_AGENT_ID),
  });

  // Check if we should show default prompts
  const shouldShow = (() => {
    // Hide if there's an active submission
    if (isSubmitting) {
      return false;
    }

    // Must be an agent endpoint with an agent selected
    const endpoint = conversation?.endpointType ?? conversation?.endpoint;
    if (!isAgentsEndpoint(endpoint) || !agentId || agentId === Constants.EPHEMERAL_AGENT_ID) {
      return false;
    }

    // Agent must have default prompts
    if (!agentData?.default_prompts || agentData.default_prompts.length === 0) {
      return false;
    }

    // Must have connected all required MCP servers
    const mcpServers = agentData.mcp_servers || [];
    if (mcpServers.length > 0 && !areAllMCPServersConnected(mcpServers)) {
      return false;
    }

    return true;
  })();

  if (!shouldShow) {
    return null;
  }

  const defaultPrompts = agentData?.default_prompts || [];

  const handlePromptClick = (prompt: string) => {
    onPromptSelect(prompt);
  };

  return (
    <div className={isCompact ? "w-full" : "mx-auto flex w-full flex-row gap-3 px-3 sm:px-2"}>
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className={isCompact ? "mb-2" : "mb-4 mt-2"}>
          {!isCompact && (
            <h3 className="mb-3 text-center text-lg font-medium text-text-primary">
              Get started with these suggestions
            </h3>
          )}
          <div className={isCompact 
            ? "grid grid-cols-3 gap-2 w-full" 
            : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          }>
            {defaultPrompts.slice(0, isCompact ? 3 : 6).map((prompt, index) => (
              <TooltipAnchor key={index} description={prompt} side="top">
                <button
                  onClick={() => handlePromptClick(prompt)}
                  className={isCompact 
                    ? "group relative flex flex-col rounded-lg border border-border-light bg-surface-secondary px-2 py-2 text-left transition-all duration-200 hover:border-green-400 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 h-[58px]"
                    : "group relative flex flex-col rounded-xl border border-border-light bg-surface-secondary px-3 py-3 text-left transition-all duration-200 hover:border-green-400 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 h-[100px]"
                  }
                >
                  {prompt.toLowerCase().includes('workflow') && (
                    <div className={isCompact 
                      ? "absolute -top-2 -right-1 z-10 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm"
                      : "absolute -top-1 -right-1 z-10 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm"
                    }>
                      Beta
                    </div>
                  )}
                  <div className="flex-1 flex items-center">
                    <p className={isCompact 
                      ? "text-xs text-text-primary line-clamp-2" 
                      : "text-sm text-text-primary line-clamp-3"
                    }>
                      {prompt}
                    </p>
                  </div>
                  <div className={isCompact
                    ? "absolute inset-0 rounded-lg bg-gradient-to-r from-green-500/5 to-blue-500/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    : "absolute inset-0 rounded-xl bg-gradient-to-r from-green-500/5 to-blue-500/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  } />
                </button>
              </TooltipAnchor>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 