import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  Constants,
  isAssistantsEndpoint,
  isAgentsEndpoint,
  EModelEndpoint,
} from 'librechat-data-provider';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useFocusChatEffect,
  useEndpoints,
} from '~/hooks';
import {
  useAvailableIntegrationsQuery,
  useAvailableToolsQuery,
  useUserIntegrationsQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from '~/data-provider';
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { TextareaAutosize, TooltipAnchor } from '~/components';
import { cn, removeFocusRings, getEntity } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import EnhancePrompt from './EnhancePrompt';
import AppDetailsModal from '../../Integrations/AppDetailsModal';
import ToolDetailsModal from '../../Tools/ToolDetailsModal';
import AgentBadge from './AgentBadge';
import store from '~/store';
import type { TAvailableIntegration } from 'librechat-data-provider';
import { useMCPConnection } from '~/hooks/useMCPConnection';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useLocalize from '~/hooks/useLocalize';

const MCPServerIcons = ({
  agentTools,
}: {
  agentTools: Array<string | { tool: string; server: string; type: 'global' | 'user' }>;
}) => {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();
  const { data: tools } = useAvailableToolsQuery(EModelEndpoint.agents);
  const { data: userIntegrations } = useUserIntegrationsQuery();
  const { isIntegrationConnected } = useMCPConnection();
  const [selectedIntegration, setSelectedIntegration] = useState<TAvailableIntegration | null>(
    null,
  );
  const [selectedTool, setSelectedTool] = useState<{
    id: string;
    name: string;
    icon?: string;
    description?: string;
  } | null>(null);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);

  // Derive MCP servers and tool keys from agentTools
  const mcpServers = Array.from(
    new Set(
      agentTools
        .filter(
          (tool): tool is { tool: string; server: string; type: 'global' | 'user' } =>
            typeof tool === 'object' && 'server' in tool,
        )
        .map((tool) =>
          tool.server.startsWith('pipedream-')
            ? tool.server.replace('pipedream-', '')
            : tool.server,
        ),
    ),
  );

  const toolKeys = agentTools.filter((tool): tool is string => typeof tool === 'string');

  if ((!mcpServers || mcpServers.length === 0) && (!toolKeys || toolKeys.length === 0)) {
    return null;
  }

  const getMCPServerData = (
    serverName: string,
  ): {
    icon?: string;
    integration?: TAvailableIntegration;
    isConnected: boolean;
    isGlobal?: boolean;
  } => {
    // First, try direct match with the server name
    let integration = availableIntegrations?.find((int) => int.appSlug === serverName);
    if (integration?.appIcon) {
      const isConnected = isIntegrationConnected(integration.appSlug);
      return { icon: integration.appIcon, integration, isConnected };
    }

    // If no direct match, try stripping "pipedream-" prefix if it exists
    const strippedServerName = serverName.startsWith('pipedream-')
      ? serverName.replace('pipedream-', '')
      : serverName;

    if (strippedServerName !== serverName) {
      integration = availableIntegrations?.find((int) => int.appSlug === strippedServerName);
      if (integration?.appIcon) {
        const isConnected = isIntegrationConnected(integration.appSlug);
        return { icon: integration.appIcon, integration, isConnected };
      }
    }

    // If still no match in integrations, look in tools
    const serverTool = tools?.find(
      (tool) =>
        tool.serverName === serverName ||
        tool.appSlug === serverName ||
        tool.serverName === strippedServerName ||
        tool.appSlug === strippedServerName ||
        tool.serverName === `pipedream-${serverName}` ||
        tool.appSlug === `pipedream-${serverName}` ||
        tool.serverName === `pipedream-${strippedServerName}` ||
        tool.appSlug === `pipedream-${strippedServerName}`,
    );

    // If we found a server tool, try to find the corresponding integration again
    if (serverTool) {
      // Try to find integration by the tool's appSlug or serverName
      integration = availableIntegrations?.find(
        (int) =>
          int.appSlug === serverTool.appSlug ||
          int.appSlug === serverTool.serverName ||
          int.appSlug === strippedServerName ||
          int.appSlug === serverName,
      );

      // Check if this is a global tool (isGlobal property indicates global MCP tools)
      const isGlobalTool = serverTool.isGlobal === true;

      // For global tools, always consider them "connected" since they're globally available
      // For user tools, check actual user integration status
      const isConnected =
        isGlobalTool || (integration ? isIntegrationConnected(integration.appSlug) : false);

      return {
        icon: serverTool.icon,
        integration,
        isConnected,
        isGlobal: isGlobalTool,
      };
    }

    return { icon: undefined, integration: undefined, isConnected: false };
  };

  const getToolData = (toolKey: string): { icon?: string; name: string; description?: string } => {
    // Find the tool in the available tools data
    const tool = tools?.find((t) => t.pluginKey === toolKey);
    if (tool) {
      return {
        icon: tool.icon,
        name: tool.name,
        description: tool.description,
      };
    }

    return {
      name: toolKey.charAt(0).toUpperCase() + toolKey.slice(1).replace(/_/g, ' '),
    };
  };

  // Combine MCP servers and standalone tools data
  const allItems: Array<{
    id: string;
    type: 'mcp' | 'tool';
    name: string;
    icon?: string;
    integration?: TAvailableIntegration;
    description?: string;
    isConnected: boolean;
    isGlobal?: boolean;
  }> = [];

  // Add MCP servers (one icon per server)
  if (mcpServers && mcpServers.length > 0) {
    mcpServers.forEach((serverName) => {
      const { icon, integration, isConnected, isGlobal } = getMCPServerData(serverName);
      if (icon) {
        allItems.push({
          id: serverName,
          type: 'mcp',
          name: serverName,
          icon,
          integration,
          isConnected,
          isGlobal,
        });
      }
    });
  }

  // Add standalone tools (tools that are NOT part of MCP servers)
  if (toolKeys && toolKeys.length > 0) {
    toolKeys.forEach((toolKey) => {
      const { icon, name, description } = getToolData(toolKey);
      if (icon) {
        // Check if this tool belongs to an MCP server
        const tool = tools?.find((t) => t.pluginKey === toolKey);
        const isStandaloneTool = !tool?.serverName && !tool?.appSlug;

        // Only add if it's a standalone tool (not part of an MCP server)
        if (isStandaloneTool) {
          allItems.push({
            id: toolKey,
            type: 'tool',
            name,
            icon,
            description,
            isConnected: true, // Standalone tools are always "connected"
          });
        }
      }
    });
  }

  if (allItems.length === 0) {
    return null;
  }

  const handleIconClick = (item: (typeof allItems)[0]) => {
    // Don't open modal for global MCP servers
    if (item.isGlobal) {
      return;
    }

    if (item.type === 'mcp' && item.integration) {
      setSelectedIntegration(item.integration);
      setIsAppModalOpen(true);
    } else if (item.type === 'mcp') {
      // If no integration found, create a fallback from server tool data
      const { icon } = getMCPServerData(item.id);
      const strippedServerName = item.id.startsWith('pipedream-')
        ? item.id.replace('pipedream-', '')
        : item.id;

      const serverTool = tools?.find(
        (tool) =>
          tool.serverName === item.id ||
          tool.appSlug === item.id ||
          tool.serverName === strippedServerName ||
          tool.appSlug === strippedServerName ||
          tool.serverName === `pipedream-${item.id}` ||
          tool.appSlug === `pipedream-${item.id}` ||
          tool.serverName === `pipedream-${strippedServerName}` ||
          tool.appSlug === `pipedream-${strippedServerName}`,
      );

      if (serverTool) {
        // Create a fallback integration object
        const fallbackIntegration: TAvailableIntegration = {
          appSlug: serverTool.appSlug || strippedServerName,
          appName:
            serverTool.name ||
            strippedServerName.charAt(0).toUpperCase() + strippedServerName.slice(1),
          appDescription: serverTool.description || `${strippedServerName} integration`,
          appIcon: serverTool.icon || icon,
          authType: 'oauth',
          appCategories: [],
          appUrl: '',
          isActive: true,
        };

        setSelectedIntegration(fallbackIntegration);
        setIsAppModalOpen(true);
      }
    } else if (item.type === 'tool') {
      // For standalone tools, use the simple tool modal
      setSelectedTool({
        id: item.id,
        name: item.name,
        icon: item.icon,
        description: item.description,
      });
      setIsToolModalOpen(true);
    }
  };

  const handleCloseAppModal = () => {
    setIsAppModalOpen(false);
    setSelectedIntegration(null);
  };

  const handleCloseToolModal = () => {
    setIsToolModalOpen(false);
    setSelectedTool(null);
  };

  const handleConnect = () => {
    // This will be handled by the modal's internal logic
  };

  const handleDisconnect = () => {
    // This will be handled by the modal's internal logic
  };

  return (
    <>
      <div className="absolute bottom-3 sm:bottom-2 left-1/2 -translate-x-1/2 transform">
        <div className="rounded-lg bg-black/20 px-2 py-1 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {allItems.map((item) => (
              <TooltipAnchor
                key={item.id}
                description={
                  item.isConnected
                    ? `${item.name} - ${item.isGlobal ? 'Connected (Global)' : 'Connected'}`
                    : item.isGlobal
                      ? `${item.name} - Global tool (always available)`
                      : 'App not connected. Click on it to connect.'
                }
                side="top"
                role="button"
                className={cn(
                  'group relative rounded-md p-1 transition-all duration-200',
                  item.isGlobal
                    ? 'cursor-default' // Global servers are not clickable
                    : item.isConnected
                      ? 'cursor-pointer hover:bg-surface-hover'
                      : 'cursor-pointer hover:bg-orange-100/20 dark:hover:bg-orange-900/20',
                )}
                onClick={() => handleIconClick(item)}
              >
                {/* Connection status indicator */}
                {!item.isConnected && !item.isGlobal && (
                  <div className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border border-white bg-orange-500 dark:border-gray-800" />
                )}
                {/* Global tool indicator */}
                {item.isGlobal && (
                  <div className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border border-white bg-blue-500 dark:border-gray-800" />
                )}
                <img
                  src={item.icon}
                  alt={`${item.name} ${item.type === 'tool' ? 'tool' : 'integration'}`}
                  className={cn(
                    'h-5 w-5 rounded-sm object-cover p-0.5 transition-all duration-200 group-hover:scale-110',
                    {
                      // Connected global tool (blue with ring)
                      'bg-blue-100/90 ring-1 ring-blue-400/50 dark:bg-blue-900/90':
                        item.isConnected && item.isGlobal,
                      // Connected non-global tool (white/gray)
                      'bg-white/90 dark:bg-gray-100/90': item.isConnected && !item.isGlobal,
                      // Not connected tool (orange with ring)
                      'bg-orange-100/90 ring-1 ring-orange-400/50 dark:bg-orange-900/90':
                        !item.isConnected,
                    },
                  )}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </TooltipAnchor>
            ))}
          </div>
        </div>
      </div>
      {selectedIntegration && (
        <AppDetailsModal
          isOpen={isAppModalOpen}
          onClose={handleCloseAppModal}
          integration={selectedIntegration}
          isConnected={!!userIntegrations?.find((ui) => ui.appSlug === selectedIntegration.appSlug)}
          userIntegration={userIntegrations?.find(
            (ui) => ui.appSlug === selectedIntegration.appSlug,
          )}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      )}
      {selectedTool && (
        <ToolDetailsModal
          isOpen={isToolModalOpen}
          onClose={handleCloseToolModal}
          tool={selectedTool}
        />
      )}
    </>
  );
};

const ChatForm = memo(
  ({
    index = 0,
    disabled = false,
    isMcpChecking = false,
    agentTools = [],
  }: {
    index?: number;
    disabled?: boolean;
    isMcpChecking?: boolean;
    agentTools?: Array<string | { tool: string; server: string; type: 'global' | 'user' }>;
  }) => {
    const submitButtonRef = useRef<HTMLButtonElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    useFocusChatEffect(textAreaRef);

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [, setIsScrollable] = useState(false);
    const [visualRowCount, setVisualRowCount] = useState(1);
    const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
    const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);
    const [isBadgeHidden, setIsBadgeHidden] = useState(false);
    const [badgeWidth, setBadgeWidth] = useState(0);
    const badgeRef = useRef<HTMLDivElement>(null);

    const SpeechToText = useRecoilValue(store.speechToText);
    const TextToSpeech = useRecoilValue(store.textToSpeech);
    const chatDirection = useRecoilValue(store.chatDirection);
    const automaticPlayback = useRecoilValue(store.automaticPlayback);
    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
    const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
    const isTemporary = useRecoilValue(store.isTemporary);

    const [badges, setBadges] = useRecoilState(store.chatBadges);
    const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
    const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
    const [showPlusPopover, setShowPlusPopover] = useRecoilState(
      store.showPlusPopoverFamily(index),
    );
    const [showMentionPopover, setShowMentionPopover] = useRecoilState(
      store.showMentionPopoverFamily(index),
    );

    const { requiresKey } = useRequiresKey();
    const { data: startupConfig } = useGetStartupConfig();
    const { data: endpointsConfig } = useGetEndpointsQuery();
    const methods = useChatFormContext();
    const {
      files,
      setFiles,
      conversation,
      isSubmitting,
      filesLoading,
      newConversation,
      handleStopGenerating,
    } = useChatContext();
    const {
      addedIndex,
      generateConversation,
      conversation: addedConvo,
      setConversation: setAddedConvo,
      isSubmitting: isSubmittingAdded,
    } = useAddedChatContext();
    const assistantMap = useAssistantsMapContext();
    const agentsMap = useAgentsMapContext();
    const localize = useLocalize();
    const { mappedEndpoints } = useEndpoints({
      agentsMap,
      assistantsMap: assistantMap,
      endpointsConfig: endpointsConfig || {},
      startupConfig,
    });
    const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

    const endpoint = useMemo(
      () => conversation?.endpointType ?? conversation?.endpoint,
      [conversation?.endpointType, conversation?.endpoint],
    );
    const conversationId = useMemo(
      () => conversation?.conversationId ?? Constants.NEW_CONVO,
      [conversation?.conversationId],
    );

    const isRTL = useMemo(
      () => (chatDirection != null ? chatDirection?.toLowerCase() === 'rtl' : false),
      [chatDirection],
    );
    const invalidAssistant = useMemo(
      () =>
        isAssistantsEndpoint(endpoint) &&
        (!(conversation?.assistant_id ?? '') ||
          !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
      [conversation?.assistant_id, endpoint, assistantMap],
    );
    const disableInputs = useMemo(
      () => requiresKey || invalidAssistant || disabled,
      [requiresKey, invalidAssistant, disabled],
    );

    const agentData = useMemo(() => {
      if (!conversation || !endpoint) return { name: '', icon: null };
      
      const { entity, isAgent, isAssistant } = getEntity({
        endpoint,
        agentsMap,
        assistantMap,
        agent_id: conversation?.agent_id,
        assistant_id: conversation?.assistant_id,
      });
      
      if (entity?.name) {
        // For agents, try to get avatar; for assistants, try iconURL
        const iconURL = isAgent 
          ? (entity as any).avatar?.filepath 
          : isAssistant 
            ? conversation?.iconURL 
            : undefined;
        
        return { 
          name: entity.name,
          icon: iconURL ? iconURL : null
        };
      }
      
      if (isAgent) {
        return { 
          name: localize('com_ui_agent'),
          icon: null
        };
      }
      
      if (isAssistant) {
        return { 
          name: localize('com_ui_assistant'),
          icon: conversation?.iconURL || null
        };
      }
      
      // For regular endpoints, get icon from mapped endpoints
      if (endpoint) {
        const mappedEndpoint = mappedEndpoints?.find(e => e.value === endpoint);
        return { 
          name: endpoint.charAt(0).toUpperCase() + endpoint.slice(1),
          icon: mappedEndpoint?.icon || null
        };
      }
      
      return { name: '', icon: null };
    }, [conversation, endpoint, agentsMap, assistantMap, localize, mappedEndpoints]);

    const shouldShowBadge = useMemo(() => {
      return Boolean(agentData.name) && !isBadgeHidden;
    }, [agentData.name, isBadgeHidden]);

    const handleContainerClick = useCallback(() => {
      /** Check if the device is a touchscreen */
      if (window.matchMedia?.('(pointer: coarse)').matches) {
        return;
      }
      textAreaRef.current?.focus();
    }, []);

    const handleFocusOrClick = useCallback(() => {
      if (isCollapsed) {
        setIsCollapsed(false);
      }
    }, [isCollapsed]);

    const handleRemoveBadge = useCallback(() => {
      // Just hide the badge, don't create new conversation
      setIsBadgeHidden(true);
    }, []);

    // Wrapper for newConversation that resets badge visibility when user selects via @mention
    const newConversationWithBadgeReset = useCallback((template?: any) => {
      setIsBadgeHidden(false);
      return newConversation(template);
    }, [newConversation]);

    useAutoSave({
      files,
      setFiles,
      textAreaRef,
      conversationId,
      isSubmitting: isSubmitting || isSubmittingAdded,
    });

    const { submitMessage, submitPrompt } = useSubmitMessage();

    const handleKeyUp = useHandleKeyUp({
      index,
      textAreaRef,
      setShowPlusPopover,
      setShowMentionPopover,
    });
    const {
      isNotAppendable,
      handlePaste,
      handleKeyDown,
      handleCompositionStart,
      handleCompositionEnd,
    } = useTextarea({
      textAreaRef,
      submitButtonRef,
      setIsScrollable,
      disabled: disableInputs,
      isMcpChecking: isMcpChecking,
      shouldShowBadge,
      onRemoveBadge: handleRemoveBadge,
    });

    useQueryParams({ textAreaRef });

    const { ref, ...registerProps } = methods.register('text', {
      required: true,
      onChange: useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) =>
          methods.setValue('text', e.target.value, { shouldValidate: true }),
        [methods],
      ),
    });

    const textValue = useWatch({ control: methods.control, name: 'text' });

    useEffect(() => {
      if (textAreaRef.current) {
        const style = window.getComputedStyle(textAreaRef.current);
        const lineHeight = parseFloat(style.lineHeight);
        setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
      }
    }, [textValue]);

    useEffect(() => {
      if (isEditingBadges && backupBadges.length === 0) {
        setBackupBadges([...badges]);
      }
    }, [isEditingBadges, badges, backupBadges.length]);

    // Measure badge width for text indentation
    useEffect(() => {
      if (shouldShowBadge && badgeRef.current) {
        const resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            setBadgeWidth(entry.contentRect.width);
          }
        });
        
        resizeObserver.observe(badgeRef.current);
        
        return () => resizeObserver.disconnect();
      } else {
        setBadgeWidth(0);
      }
    }, [shouldShowBadge, agentData.name]);

    const handleSaveBadges = useCallback(() => {
      setIsEditingBadges(false);
      setBackupBadges([]);
    }, [setIsEditingBadges, setBackupBadges]);

    const handleCancelBadges = useCallback(() => {
      if (backupBadges.length > 0) {
        setBadges([...backupBadges]);
      }
      setIsEditingBadges(false);
      setBackupBadges([]);
    }, [backupBadges, setBadges, setIsEditingBadges]);

    const isMoreThanThreeRows = visualRowCount > 3;

    const baseClasses = useMemo(
      () =>
        cn(
          'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/50 bg-transparent dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
          isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
          isMoreThanThreeRows ? 'pl-5' : 'px-5',
        ),
      [isCollapsed, isMoreThanThreeRows],
    );

    return (
      <form
        onSubmit={methods.handleSubmit(submitMessage)}
        className={cn(
          'mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:px-2',
          maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
          centerFormOnLanding &&
            (conversationId == null || conversationId === Constants.NEW_CONVO) &&
            !isSubmitting &&
            conversation?.messages?.length === 0
            ? 'transition-all duration-200 sm:mb-28'
            : 'sm:mb-10',
        )}
      >
        <div className="relative flex h-full flex-1 items-stretch md:flex-col">
          <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
            {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
              <Mention
                setShowMentionPopover={setShowPlusPopover}
                newConversation={generateConversation}
                textAreaRef={textAreaRef}
                commandChar="+"
                placeholder="com_ui_add_model_preset"
                includeAssistants={false}
              />
            )}
            {showMentionPopover && (
              <Mention
                setShowMentionPopover={setShowMentionPopover}
                newConversation={newConversationWithBadgeReset}
                textAreaRef={textAreaRef}
              />
            )}
            <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />
            <div
              onClick={handleContainerClick}
              className={cn(
                'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
                isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
                isTemporary
                  ? 'border-violet-800/60 bg-violet-950/10'
                  : 'border-border-light bg-surface-chat',
              )}
            >
              <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
              <EditBadges
                isEditingChatBadges={isEditingBadges}
                handleCancelBadges={handleCancelBadges}
                handleSaveBadges={handleSaveBadges}
                setBadges={setBadges}
              />
              <FileFormChat disableInputs={disableInputs} />
              {endpoint && (
                <div className={cn('relative flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                  {shouldShowBadge && (
                    <div ref={badgeRef} className="absolute top-2.5 left-3 z-10 flex items-center">
                      <AgentBadge 
                        agentName={agentData.name}
                        agentIcon={agentData.icon}
                        onRemove={handleRemoveBadge}
                        isVisible={shouldShowBadge}
                      />
                    </div>
                  )}
                  <TextareaAutosize
                    {...registerProps}
                    ref={(e) => {
                      ref(e);
                      (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
                        e;
                    }}
                    disabled={disableInputs || isNotAppendable}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    id={mainTextareaId}
                    tabIndex={0}
                    data-testid="text-input"
                    rows={1}
                    onFocus={() => {
                      handleFocusOrClick();
                      setIsTextAreaFocused(true);
                    }}
                    onBlur={setIsTextAreaFocused.bind(null, false)}
                    onClick={handleFocusOrClick}
                    style={{ 
                      height: 44, 
                      overflowY: 'auto',
                      textIndent: shouldShowBadge && badgeWidth ? `${badgeWidth + 12}px` : '0',
                      paddingLeft: shouldShowBadge ? '0.75rem' : undefined
                    }}
                    className={cn(
                      baseClasses,
                      removeFocusRings,
                      'transition-[max-height] duration-200 disabled:cursor-not-allowed',
                    )}
                  />
                  <div className="flex flex-col items-start justify-start pt-1.5 pr-3">
                    <CollapseChat
                      isCollapsed={isCollapsed}
                      isScrollable={isMoreThanThreeRows}
                      setIsCollapsed={setIsCollapsed}
                    />
                  </div>
                </div>
              )}
              <div
                className={cn(
                  'items-between flex gap-1 sm:gap-2 -mb-1 pb-0 sm:pb-2 sm:mb-0',
                  isRTL ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                  <AttachFileChat disableInputs={disableInputs} />
                </div>
                <BadgeRow
                  showEphemeralBadges={
                    !isAgentsEndpoint(endpoint) &&
                    !isAssistantsEndpoint(endpoint) &&
                    Boolean(endpoint && startupConfig?.endpoints?.[endpoint]?.tools !== false)
                  }
                  conversationId={conversationId}
                  onChange={setBadges}
                  isInChat={
                    Array.isArray(conversation?.messages) && conversation.messages.length >= 1
                  }
                />
                <div className="mx-auto flex" />
                {SpeechToText && (
                  <AudioRecorder
                    methods={methods}
                    ask={submitMessage}
                    textAreaRef={textAreaRef}
                    disabled={disableInputs || isNotAppendable}
                    isSubmitting={isSubmitting}
                  />
                )}
                <div className={`${isRTL ? 'ml-1 sm:ml-2' : 'mr-1 sm:mr-2'}`}>
                  <EnhancePrompt
                    textAreaRef={textAreaRef}
                    methods={methods}
                    disabled={disableInputs || isNotAppendable || !textValue?.trim()}
                    hasText={!!textValue?.trim()}
                  />
                </div>
                <div className={`${isRTL ? 'ml-1 sm:ml-2' : 'mr-2 sm:mr-2'}`}>
                  {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                    <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                  ) : (
                    endpoint && (
                      <SendButton
                        ref={submitButtonRef}
                        control={methods.control}
                        disabled={filesLoading || isSubmitting || disableInputs || isNotAppendable}
                      />
                    )
                  )}
                </div>
              </div>
              {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
              <MCPServerIcons agentTools={agentTools} />
            </div>
          </div>
        </div>
      </form>
    );
  },
);

export default ChatForm;
