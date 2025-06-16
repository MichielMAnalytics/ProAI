import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint, EModelEndpoint } from 'librechat-data-provider';
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
} from '~/hooks';
import { useAvailableIntegrationsQuery, useAvailableToolsQuery, useUserIntegrationsQuery } from '~/data-provider';
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { TextareaAutosize } from '~/components';
import { cn, removeFocusRings } from '~/utils';
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
import AppDetailsModal from '../../Integrations/AppDetailsModal';
import store from '~/store';
import type { TAvailableIntegration } from 'librechat-data-provider';

const MCPServerIcons = ({ mcpServers }: { mcpServers: string[] }) => {
  const { data: availableIntegrations } = useAvailableIntegrationsQuery();
  const { data: tools } = useAvailableToolsQuery(EModelEndpoint.agents);
  const { data: userIntegrations } = useUserIntegrationsQuery();
  const [selectedIntegration, setSelectedIntegration] = useState<TAvailableIntegration | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!mcpServers || mcpServers.length === 0) {
    return null;
  }

  const getMCPServerData = (serverName: string): { icon?: string; integration?: TAvailableIntegration } => {
    // First, try direct match with the server name
    let integration = availableIntegrations?.find(int => int.appSlug === serverName);
    if (integration?.appIcon) {
      return { icon: integration.appIcon, integration };
    }
    
    // If no direct match, try stripping "pipedream-" prefix if it exists
    const strippedServerName = serverName.startsWith('pipedream-') 
      ? serverName.replace('pipedream-', '') 
      : serverName;
    
    if (strippedServerName !== serverName) {
      integration = availableIntegrations?.find(int => int.appSlug === strippedServerName);
      if (integration?.appIcon) {
        return { icon: integration.appIcon, integration };
      }
    }
    
    // If still no match in integrations, look in tools
    const serverTool = tools?.find(tool => 
      tool.serverName === serverName || 
      tool.appSlug === serverName ||
      tool.serverName === strippedServerName ||
      tool.appSlug === strippedServerName ||
      tool.serverName === `pipedream-${serverName}` ||
      tool.appSlug === `pipedream-${serverName}` ||
      tool.serverName === `pipedream-${strippedServerName}` ||
      tool.appSlug === `pipedream-${strippedServerName}`
    );
    
    // If we found a server tool, try to find the corresponding integration again
    if (serverTool) {
      // Try to find integration by the tool's appSlug or serverName
      integration = availableIntegrations?.find(int => 
        int.appSlug === serverTool.appSlug ||
        int.appSlug === serverTool.serverName ||
        int.appSlug === strippedServerName ||
        int.appSlug === serverName
      );
      
      return { icon: serverTool.icon, integration };
    }
    
    return { icon: undefined, integration: undefined };
  };

  const serverData = mcpServers.map(serverName => {
    const { icon, integration } = getMCPServerData(serverName);
    return { serverName, icon, integration };
  }).filter(server => server.icon);

  if (serverData.length === 0) {
    return null;
  }

  const getConnectionStatus = (integration: TAvailableIntegration) => {
    const userIntegration = userIntegrations?.find(ui => ui.appSlug === integration.appSlug);
    return {
      isConnected: !!userIntegration,
      userIntegration
    };
  };

  const handleIconClick = (integration: TAvailableIntegration | undefined, serverName: string) => {
    if (integration) {
      setSelectedIntegration(integration);
      setIsModalOpen(true);
    } else {
      // If no integration found, create a fallback from server tool data
      const { icon } = getMCPServerData(serverName);
      const strippedServerName = serverName.startsWith('pipedream-') 
        ? serverName.replace('pipedream-', '') 
        : serverName;
      
      const serverTool = tools?.find(tool => 
        tool.serverName === serverName || 
        tool.appSlug === serverName ||
        tool.serverName === strippedServerName ||
        tool.appSlug === strippedServerName ||
        tool.serverName === `pipedream-${serverName}` ||
        tool.appSlug === `pipedream-${serverName}` ||
        tool.serverName === `pipedream-${strippedServerName}` ||
        tool.appSlug === `pipedream-${strippedServerName}`
      );
      
      if (serverTool) {
        // Create a fallback integration object
        const fallbackIntegration: TAvailableIntegration = {
          appSlug: serverTool.appSlug || strippedServerName,
          appName: serverTool.name || strippedServerName.charAt(0).toUpperCase() + strippedServerName.slice(1),
          appDescription: serverTool.description || `${strippedServerName} integration`,
          appIcon: serverTool.icon || icon,
          authType: 'oauth',
          appCategories: [],
          appUrl: '',
          isActive: true,
        };
        
        setSelectedIntegration(fallbackIntegration);
        setIsModalOpen(true);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedIntegration(null);
  };

  const handleConnect = (integration: TAvailableIntegration) => {
    // This will be handled by the modal's internal logic
  };

  const handleDisconnect = (userIntegration: any) => {
    // This will be handled by the modal's internal logic
  };

  return (
    <>
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center gap-2">
        {serverData.map(({ serverName, icon, integration }) => (
          <button
            key={serverName}
            onClick={() => handleIconClick(integration, serverName)}
            className="group relative p-1 rounded-md hover:bg-surface-hover transition-colors duration-200"
            title={`${serverName.charAt(0).toUpperCase() + serverName.slice(1)} - Click for details`}
          >
            <img
              src={icon}
              alt={`${serverName} integration`}
              className="h-5 w-5 rounded-sm object-cover transition-transform duration-200 group-hover:scale-110"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </button>
        ))}
      </div>
      {selectedIntegration && (
        <AppDetailsModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          integration={selectedIntegration}
          isConnected={getConnectionStatus(selectedIntegration).isConnected}
          userIntegration={getConnectionStatus(selectedIntegration).userIntegration}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
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
    mcpServers = [],
  }: {
    index?: number;
    disabled?: boolean;
    isMcpChecking?: boolean;
    mcpServers?: string[];
  }) => {
    const submitButtonRef = useRef<HTMLButtonElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    useFocusChatEffect(textAreaRef);

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [, setIsScrollable] = useState(false);
    const [visualRowCount, setVisualRowCount] = useState(1);
    const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
    const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);

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
    const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
    const [showMentionPopover, setShowMentionPopover] = useRecoilState(
      store.showMentionPopoverFamily(index),
    );

    const { requiresKey } = useRequiresKey();
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
      mcpConnectionsRequired: disabled,
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
                newConversation={newConversation}
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
                <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                  <TextareaAutosize
                    {...registerProps}
                    ref={(e) => {
                      ref(e);
                      (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
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
                    style={{ height: 44, overflowY: 'auto' }}
                    className={cn(
                      baseClasses,
                      removeFocusRings,
                      'transition-[max-height] duration-200 disabled:cursor-not-allowed',
                    )}
                  />
                  <div className="flex flex-col items-start justify-start pt-1.5">
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
                  'items-between flex gap-2 pb-2',
                  isRTL ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                  <AttachFileChat disableInputs={disableInputs} />
                </div>
                <BadgeRow
                  showEphemeralBadges={!isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)}
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
                <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
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
              <MCPServerIcons mcpServers={mcpServers} />
            </div>
          </div>
        </div>
      </form>
    );
  }
);

export default ChatForm;