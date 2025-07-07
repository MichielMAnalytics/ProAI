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

export default function DefaultPrompts({
  conversation,
  onPromptSelect,
  isCompact = false,
}: DefaultPromptsProps) {

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

    // Hide if conversation has more than 5 messages
    const messageCount = conversation?.messages?.length || 0;
    if (messageCount > 5) {
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

  const formatPromptText = (text: string) => {
    // Regular expression to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    const abbreviateUrl = (url: string) => {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        const path = urlObj.pathname;
        
        // If URL is short enough, show it as is
        if (url.length <= 30) {
          return url;
        }
        
        // Show domain + truncated path
        if (path.length > 15) {
          return `${domain}${path.substring(0, 12)}...`;
        }
        
        return `${domain}${path}`;
      } catch {
        // Fallback for invalid URLs
        return url.length > 30 ? `${url.substring(0, 27)}...` : url;
      }
    };
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <span key={index} className="text-blue-500 underline" title={part}>
            {abbreviateUrl(part)}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className={isCompact ? 'w-full px-2' : 'mx-auto flex w-full flex-row gap-3 px-3 sm:px-2'}>
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className={isCompact ? 'mb-2' : 'mb-4 mt-2'}>
          {!isCompact && (
            <h3 className="mb-3 text-center text-lg font-medium text-text-primary">
              Get started with these suggestions
            </h3>
          )}
          <div
            className={
              isCompact
                ? 'grid w-full grid-cols-3 gap-2'
                : 'grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
            }
          >
            {defaultPrompts.slice(0, isCompact ? 3 : 6).map((prompt, index) => (
              <TooltipAnchor key={index} description={prompt} side="top">
                <button
                  onClick={() => handlePromptClick(prompt)}
                  className={
                    isCompact
                      ? 'group relative flex h-[58px] w-full flex-col rounded-lg border border-border-light bg-surface-secondary px-2 py-2 text-left transition-all duration-200 hover:border-green-400 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
                      : 'group relative flex h-[100px] w-full flex-col rounded-xl border border-border-light bg-surface-secondary px-3 py-3 text-left transition-all duration-200 hover:border-green-400 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
                  }
                >
                  {prompt.toLowerCase().includes('workflow') && (
                    <div
                      className={
                        isCompact
                          ? 'absolute -right-1 -top-2 z-10 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm'
                          : 'absolute -right-1 -top-1 z-10 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm'
                      }
                    >
                      Beta
                    </div>
                  )}
                  <div className="flex flex-1 items-center">
                    <p
                      className={
                        isCompact
                          ? 'line-clamp-2 text-xs text-text-primary'
                          : 'line-clamp-3 text-sm text-text-primary'
                      }
                    >
                      {formatPromptText(prompt)}
                    </p>
                  </div>
                  <div
                    className={
                      isCompact
                        ? 'absolute inset-0 rounded-lg bg-gradient-to-r from-green-500/5 to-blue-500/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100'
                        : 'absolute inset-0 rounded-xl bg-gradient-to-r from-green-500/5 to-blue-500/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100'
                    }
                  />
                </button>
              </TooltipAnchor>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
