import { useCallback, useState, useRef, useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import { useGetMessagesByConvoId, useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '~/Providers';
import { NotificationSeverity } from '~/common';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

// this to be set somewhere else
export default function useChatHelpers(index = 0, paramId?: string) {
  const clearAllSubmissions = store.useClearSubmissionState();
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const [filesLoading, setFilesLoading] = useState(false);

  const queryClient = useQueryClient();
  const { isAuthenticated, token } = useAuthContext();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  
  // Track seen scheduler messages to avoid duplicate notifications
  const seenSchedulerMessages = useRef(new Set<string>());
  // Track SSE connection for scheduler notifications
  const sseConnectionRef = useRef<EventSource | null>(null);

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId } = conversation ?? {};

  const queryParam = paramId === 'new' ? paramId : (conversationId ?? paramId ?? '');

  /* Messages: here simply to fetch, don't export and use `getMessages()` instead */

  const { data: _messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: isAuthenticated,
  });

  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(index));
  const [latestMessage, setLatestMessage] = useRecoilState(store.latestMessageFamily(index));
  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      queryClient.setQueryData<TMessage[]>([QueryKeys.messages, queryParam], messages);
      if (queryParam === 'new' && conversationId && conversationId !== 'new') {
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], messages);
      }
    },
    [queryParam, queryClient, conversationId],
  );

  const getMessages = useCallback(() => {
    return queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]);
  }, [queryParam, queryClient]);

  /* Conversation */
  // const setActiveConvos = useSetRecoilState(store.activeConversations);

  // const setConversation = useCallback(
  //   (convoUpdate: TConversation) => {
  //     _setConversation(prev => {
  //       const { conversationId: convoId } = prev ?? { conversationId: null };
  //       const { conversationId: currentId } = convoUpdate;
  //       if (currentId && convoId && convoId !== 'new' && convoId !== currentId) {
  //         // for now, we delete the prev convoId from activeConversations
  //         const newActiveConvos = { [currentId]: true };
  //         setActiveConvos(newActiveConvos);
  //       }
  //       return convoUpdate;
  //     });
  //   },
  //   [_setConversation, setActiveConvos],
  // );

  const setSubmission = useSetRecoilState(store.submissionByIndex(index));

  const { ask, regenerate } = useChatFunctions({
    index,
    files,
    setFiles,
    getMessages,
    setMessages,
    isSubmitting,
    conversation,
    latestMessage,
    setSubmission,
    setLatestMessage,
  });

  const continueGeneration = () => {
    if (!latestMessage) {
      console.error('Failed to regenerate the message: latestMessage not found.');
      return;
    }

    const messages = getMessages();

    const parentMessage = messages?.find(
      (element) => element.messageId == latestMessage.parentMessageId,
    );

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isContinued: true, isRegenerate: true, isEdited: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found, or not created by user.',
      );
    }
  };

  const stopGenerating = () => clearAllSubmissions();

  const handleStopGenerating = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    stopGenerating();
  };

  const handleRegenerate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const parentMessageId = latestMessage?.parentMessageId ?? '';
    if (!parentMessageId) {
      console.error('Failed to regenerate the message: parentMessageId not found.');
      return;
    }
    regenerate({ parentMessageId });
  };

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    continueGeneration();
    setSiblingIdx(0);
  };

  // Set up SSE connection for real-time scheduler notifications
  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    // Close existing connection if any
    if (sseConnectionRef.current) {
      sseConnectionRef.current.close();
    }

    // Create new SSE connection
    const eventSource = new EventSource(`/api/scheduler/notifications?token=${encodeURIComponent(token)}`);

    sseConnectionRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SchedulerSSE] Connected to scheduler notifications');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'scheduler_message') {
          // Mark message as seen to avoid duplicate notifications
          if (data.messageId) {
            seenSchedulerMessages.current.add(data.messageId);
          }
          
          // Play notification sound
          try {
            // Check if sound notifications are enabled in config
            const soundEnabled = startupConfig?.scheduler?.notifications?.sound ?? true;
            const volume = startupConfig?.scheduler?.notifications?.volume ?? 0.3;
            
            if (soundEnabled) {
              // Create a simple beep sound using Web Audio API
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();
              
              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);
              
              // Configure the beep sound
              oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800Hz frequency
              oscillator.type = 'sine'; // Sine wave for a clean tone
              
              // Configure volume envelope for a pleasant ping sound
              gainNode.gain.setValueAtTime(0, audioContext.currentTime);
              gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01); // Quick attack
              gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5); // Decay over 0.5s
              
              // Play the sound
              oscillator.start(audioContext.currentTime);
              oscillator.stop(audioContext.currentTime + 0.5);
            }
          } catch (error) {
            console.debug('[SchedulerSSE] Could not play notification sound:', error);
          }
          
          // Show toast notification
          showToast({
            message: `📅 ${data.taskName || 'Task completed'} - Check your conversation for details`,
            severity: NotificationSeverity.INFO,
            duration: 5000,
          });
          
          // Refresh the conversation data if it matches current conversation
          if (data.conversationId === conversationId) {
            queryClient.invalidateQueries([QueryKeys.messages, data.conversationId]);
          }
        } else if (data.type === 'heartbeat') {
          // Handle heartbeat (keep-alive)
          console.debug('[SchedulerSSE] Heartbeat received');
        }
      } catch (error) {
        console.error('[SchedulerSSE] Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SchedulerSSE] SSE connection error:', error);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (sseConnectionRef.current === eventSource) {
          eventSource.close();
          // Trigger re-connection by updating the effect dependency
        }
      }, 5000);
    };

    // Cleanup on unmount or when dependencies change
    return () => {
      eventSource.close();
      sseConnectionRef.current = null;
    };
  }, [isAuthenticated, token, conversationId, queryClient, showToast, startupConfig]);

  const [showPopover, setShowPopover] = useRecoilState(store.showPopoverFamily(index));
  const [abortScroll, setAbortScroll] = useRecoilState(store.abortScrollFamily(index));
  const [preset, setPreset] = useRecoilState(store.presetByIndex(index));
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettingsFamily(index));
  const [showAgentSettings, setShowAgentSettings] = useRecoilState(
    store.showAgentSettingsFamily(index),
  );

  return {
    newConversation,
    conversation,
    setConversation,
    // getConvos,
    // setConvos,
    isSubmitting,
    setIsSubmitting,
    getMessages,
    setMessages,
    setSiblingIdx,
    latestMessage,
    setLatestMessage,
    resetLatestMessage,
    ask,
    index,
    regenerate,
    stopGenerating,
    handleStopGenerating,
    handleRegenerate,
    handleContinue,
    showPopover,
    setShowPopover,
    abortScroll,
    setAbortScroll,
    preset,
    setPreset,
    optionSettings,
    setOptionSettings,
    showAgentSettings,
    setShowAgentSettings,
    files,
    setFiles,
    filesLoading,
    setFilesLoading,
  };
}
