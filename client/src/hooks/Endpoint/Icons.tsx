import { EModelEndpoint } from 'librechat-data-provider';
import type { IconMapProps, AgentIconMapProps, IconsRecord } from '~/common';
import {
  MinimalPlugin,
  GPTIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
  AssistantIcon,
  LightningIcon,
  BedrockIcon,
  Sparkles,
} from '~/components/svg';
import UnknownIcon from './UnknownIcon';
import { cn } from '~/utils';

const AssistantAvatar = ({
  className = '',
  assistantName = '',
  avatar = '',
  context,
  size,
}: IconMapProps) => {
  if (assistantName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-contain"
        alt={assistantName}
        width="80"
        height="80"
      />
    );
  } else if (assistantName) {
    return <AssistantIcon className={cn('text-token-secondary', className)} size={size} />;
  }

  return <Sparkles className={cn(context === 'landing' ? 'icon-2xl' : '', className)} />;
};

const AgentAvatar = ({ className = '', avatar = '', agentName, size }: AgentIconMapProps) => {
  if (agentName != null && agentName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-contain"
        alt={agentName}
        width="80"
        height="80"
      />
    );
  }

  return (
    <img 
      src="/assets/logo.svg" 
      alt="Eve Agent" 
      className={cn(agentName === '' ? 'icon-2xl' : '', className)} 
      style={{ width: size, height: size }}
    />
  );
};

const Bedrock = ({ className = '' }: IconMapProps) => {
  return <BedrockIcon className={cn(className, 'h-full w-full')} />;
};

export const icons: IconsRecord = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: GPTIcon,
  [EModelEndpoint.gptPlugins]: MinimalPlugin,
  [EModelEndpoint.anthropic]: AnthropicIcon,
  [EModelEndpoint.chatGPTBrowser]: LightningIcon,
  [EModelEndpoint.google]: GoogleMinimalIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: AssistantAvatar,
  [EModelEndpoint.azureAssistants]: AssistantAvatar,
  [EModelEndpoint.agents]: AgentAvatar,
  [EModelEndpoint.bedrock]: Bedrock,
  unknown: UnknownIcon,
};
