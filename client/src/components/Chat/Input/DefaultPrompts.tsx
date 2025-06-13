import React from 'react';
import { useRecoilValue } from 'recoil';
import { useMCPConnection } from '~/hooks/useMCPConnection';
import { useGetAgentByIdQuery } from '~/data-provider';
import { Constants, isAgentsEndpoint } from 'librechat-data-provider';
import store from '~/store';

interface DefaultPromptsProps {
  conversation: any;
  onPromptSelect: (prompt: string) => void;
}

export default function DefaultPrompts({ conversation, onPromptSelect }: DefaultPromptsProps) {
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
    <div className="mx-auto flex w-full flex-row gap-3 px-3 sm:px-2">
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="mb-4 mt-2">
          <h3 className="mb-3 text-center text-lg font-medium text-text-primary">
            Get started with these suggestions
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {defaultPrompts.slice(0, 6).map((prompt, index) => (
              <button
                key={index}
                onClick={() => handlePromptClick(prompt)}
                className="group relative flex flex-col rounded-xl border border-border-light bg-surface-secondary p-4 text-left transition-all duration-200 hover:border-green-400 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                <div className="flex-1">
                  <p className="text-sm text-text-primary line-clamp-3">
                    {prompt}
                  </p>
                </div>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500/5 to-blue-500/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 