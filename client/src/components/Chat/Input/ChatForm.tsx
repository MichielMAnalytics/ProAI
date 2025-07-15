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
  useGetStartupConfig,
  useGetEndpointsQuery,
} from '~/data-provider';
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { TextareaAutosize } from '~/components';
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
import AgentBadge from './AgentBadge';
import store from '~/store';
import MCPServerIcons from './MCPServerIcons';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useLocalize from '~/hooks/useLocalize';

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
    const [isEnhancing, setIsEnhancing] = useState(false);
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
      
      // Check if this is actually an agent conversation by agent_id presence
      const hasAgentId = Boolean(conversation?.agent_id);
      const hasAssistantId = Boolean(conversation?.assistant_id);
      
      const { entity, isAgent, isAssistant } = getEntity({
        endpoint: hasAgentId ? 'agents' : hasAssistantId ? 'assistants' : endpoint,
        agentsMap,
        assistantMap,
        agent_id: conversation?.agent_id,
        assistant_id: conversation?.assistant_id,
      });
      
      if (entity?.name) {
        // For agents, try to get avatar; for assistants, try iconURL
        const iconURL = (isAgent || hasAgentId)
          ? (entity as any).avatar?.filepath 
          : (isAssistant || hasAssistantId)
            ? conversation?.iconURL 
            : undefined;
        
        return { 
          name: entity.name,
          icon: iconURL ? iconURL : null
        };
      }
      
      if (isAgent || hasAgentId) {
        return { 
          name: localize('com_ui_agent'),
          icon: null
        };
      }
      
      if (isAssistant || hasAssistantId) {
        return { 
          name: localize('com_ui_assistant'),
          icon: conversation?.iconURL || null
        };
      }
      
      // For custom endpoints, use conversation.endpoint to get the actual endpoint name
      const actualEndpoint = conversation?.endpointType === EModelEndpoint.custom 
        ? conversation?.endpoint 
        : endpoint;
      
      // Get display name and icon from mapped endpoints
      if (actualEndpoint) {
        const mappedEndpoint = mappedEndpoints?.find(e => e.value === actualEndpoint);
        return { 
          name: mappedEndpoint?.label || actualEndpoint.charAt(0).toUpperCase() + actualEndpoint.slice(1),
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
      isEnhancing: isEnhancing,
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
                  'items-between -mb-1 flex gap-1 pb-0 sm:mb-0 sm:gap-2 sm:pb-2',
                  isRTL ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                  <AttachFileChat disableInputs={disableInputs} />
                </div>
                <BadgeRow
                  showEphemeralBadges={
                    (() => {
                      const isAgentEndpoint = isAgentsEndpoint(endpoint);
                      const isAssistantEndpoint = isAssistantsEndpoint(endpoint);
                      
                      // Also check if this is an agent conversation by agent_id presence
                      const hasAgentId = Boolean(conversation?.agent_id);
                      const hasAssistantId = Boolean(conversation?.assistant_id);
                      
                      // Don't show ephemeral badges for agents or assistants
                      if (isAgentEndpoint || isAssistantEndpoint || hasAgentId || hasAssistantId) {
                        return false;
                      }
                      
                      // For custom endpoints, use conversation.endpoint instead of the generic 'custom'
                      const actualEndpoint = conversation?.endpointType === EModelEndpoint.custom 
                        ? conversation?.endpoint 
                        : endpoint;
                      return Boolean(actualEndpoint && startupConfig?.endpoints?.[actualEndpoint]?.tools !== false);
                    })()
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
                    onEnhancingChange={setIsEnhancing}
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
              <MCPServerIcons 
                agentTools={agentTools} 
                size="lg"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 transform sm:bottom-2" 
                showBackground={true}
              />
            </div>
          </div>
        </div>
      </form>
    );
  },
);

export default ChatForm;
