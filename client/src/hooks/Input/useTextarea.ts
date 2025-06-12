import debounce from 'lodash/debounce';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import type { TEndpointOption } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import {
  forceResize,
  insertTextAtCursor,
  getEntityName,
  getEntity,
  checkIfScrollable,
} from '~/utils';
import { useAssistantsMapContext } from '~/Providers/AssistantsMapContext';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useGetSender from '~/hooks/Conversations/useGetSender';
import useFileHandling from '~/hooks/Files/useFileHandling';
import { useInteractionHealthCheck } from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import useLocalize from '~/hooks/useLocalize';
import { globalAudioId } from '~/common';
import store from '~/store';

type KeyEvent = KeyboardEvent<HTMLTextAreaElement>;

// Custom hook for typing effect
function useTypingEffect(text: string, baseSpeed: number = 80) {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  // Blinking cursor effect
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, []);

  useEffect(() => {
    if (!text) {
      setDisplayText('');
      setIsTyping(false);
      return;
    }

    let timeouts: NodeJS.Timeout[] = [];
    
    // Start by showing the full text immediately
    setDisplayText(text);
    setIsTyping(false);

    const backspaceEffect = (currentText: string, callback: () => void) => {
      if (currentText.length === 0) {
        callback();
        return;
      }

      setIsTyping(true);
      let textLength = currentText.length;

      const deleteNextCharacter = () => {
        if (textLength > 0) {
          textLength--;
          setDisplayText(currentText.substring(0, textLength));
          
          // Backspace speed - faster than typing
          const backspaceSpeed = baseSpeed * 0.3;
          const timeout = setTimeout(deleteNextCharacter, backspaceSpeed + Math.random() * 10);
          timeouts.push(timeout);
        } else {
          setIsTyping(false);
          const pauseTimeout = setTimeout(callback, 300);
          timeouts.push(pauseTimeout);
        }
      };

      deleteNextCharacter();
    };

    const startTypingCycle = () => {
      setIsTyping(true);
      setDisplayText('');
      let currentIndex = 0;

      const typeNextCharacter = () => {
        if (currentIndex < text.length) {
          setDisplayText(text.substring(0, currentIndex + 1));
          currentIndex++;
          
          // Variable speed for more natural typing
          const char = text[currentIndex - 1];
          let speed = baseSpeed;
          if (char === ' ') speed = baseSpeed * 0.5; // Faster for spaces
          if (char === '.' || char === ',' || char === '!') speed = baseSpeed * 1.5; // Slower for punctuation
          
          const timeout = setTimeout(typeNextCharacter, speed + Math.random() * 20);
          timeouts.push(timeout);
        } else {
          // Finished typing, show complete text for 3 seconds
          setIsTyping(false);
          const showTimeout = setTimeout(() => {
            // Use backspace effect before restarting
            backspaceEffect(text, startTypingCycle);
          }, 3000);
          timeouts.push(showTimeout);
        }
      };

      // Start typing immediately
      typeNextCharacter();
    };

    // After showing full text for 3 seconds, start the backspace and typing cycle
    const initialTimeout = setTimeout(() => {
      backspaceEffect(text, startTypingCycle);
    }, 3000);
    timeouts.push(initialTimeout);

    return () => {
      // Clear all timeouts on cleanup
      timeouts.forEach(timeout => clearTimeout(timeout));
      setIsTyping(false);
    };
  }, [text, baseSpeed]);

  return { displayText, isTyping, showCursor };
}

export default function useTextarea({
  textAreaRef,
  submitButtonRef,
  setIsScrollable,
  disabled = false,
  isMcpChecking = false,
  mcpConnectionsRequired = false,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  submitButtonRef: React.RefObject<HTMLButtonElement>;
  setIsScrollable: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  isMcpChecking?: boolean;
  mcpConnectionsRequired?: boolean;
}) {
  const localize = useLocalize();
  const getSender = useGetSender();
  const isComposing = useRef(false);
  const agentsMap = useAgentsMapContext();
  const { handleFiles } = useFileHandling();
  const assistantMap = useAssistantsMapContext();
  const checkHealth = useInteractionHealthCheck();
  const enterToSend = useRecoilValue(store.enterToSend);

  const { index, conversation, isSubmitting, filesLoading, latestMessage, setFilesLoading } =
    useChatContext();
  const [activePrompt, setActivePrompt] = useRecoilState(store.activePromptByIndex(index));

  const { endpoint = '' } = conversation || {};
  const { entity, isAgent, isAssistant } = getEntity({
    endpoint,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });
  const entityName = entity?.name ?? '';

  const isNotAppendable =
    (((latestMessage?.unfinished ?? false) && !isSubmitting) || (latestMessage?.error ?? false)) &&
    !isAssistant;
  // && (conversationId?.length ?? 0) > 6; // also ensures that we don't show the wrong placeholder

  // Get the MCP placeholder text for typing effect
  const mcpPlaceholderText = mcpConnectionsRequired === true ? localize('com_endpoint_config_mcp_placeholder') : '';
  const { displayText: typedMcpText, isTyping, showCursor } = useTypingEffect(mcpPlaceholderText, 30);

  useEffect(() => {
    const prompt = activePrompt ?? '';
    if (prompt && textAreaRef.current) {
      insertTextAtCursor(textAreaRef.current, prompt);
      forceResize(textAreaRef.current);
      setActivePrompt(undefined);
    }
  }, [activePrompt, setActivePrompt, textAreaRef]);

  useEffect(() => {
    const currentValue = textAreaRef.current?.value ?? '';
    if (currentValue) {
      return;
    }

    const getPlaceholderText = () => {
      if (isMcpChecking) {
        return localize('com_ui_checking_connections');
      }

      if (mcpConnectionsRequired) {
        // Use typed text with a blinking pipe cursor
        return typedMcpText + (showCursor ? '|' : '');
      }
      
      if (disabled) {
        return localize('com_endpoint_config_placeholder');
      }
      
      const currentEndpoint = conversation?.endpoint ?? '';
      const currentAgentId = conversation?.agent_id ?? '';
      const currentAssistantId = conversation?.assistant_id ?? '';
      if (isAgent && (!currentAgentId || !agentsMap?.[currentAgentId])) {
        return localize('com_endpoint_agent_placeholder');
      } else if (
        isAssistant &&
        (!currentAssistantId || !assistantMap?.[currentEndpoint]?.[currentAssistantId])
      ) {
        return localize('com_endpoint_assistant_placeholder');
      }

      if (isNotAppendable) {
        return localize('com_endpoint_message_not_appendable');
      }

      const sender =
        isAssistant || isAgent
          ? getEntityName({ name: entityName, isAgent, localize })
          : getSender(conversation as TEndpointOption);

      return `${localize('com_endpoint_message_new', {
        0: sender ? sender : localize('com_endpoint_ai'),
      })}`;
    };

    const placeholder = getPlaceholderText();

    if (textAreaRef.current?.getAttribute('placeholder') === placeholder) {
      return;
    }

    const setPlaceholder = () => {
      const placeholder = getPlaceholderText();

      if (textAreaRef.current?.getAttribute('placeholder') !== placeholder) {
        textAreaRef.current?.setAttribute('placeholder', placeholder);
        forceResize(textAreaRef.current);
      }
    };

    // Use shorter debounce for typing effect, longer for others
    const debounceTime = mcpConnectionsRequired ? 20 : 80;
    const debouncedSetPlaceholder = debounce(setPlaceholder, debounceTime);
    debouncedSetPlaceholder();

    return () => debouncedSetPlaceholder.cancel();
  }, [
    isAgent,
    localize,
    disabled,
    getSender,
    agentsMap,
    entityName,
    textAreaRef,
    isAssistant,
    assistantMap,
    conversation,
    latestMessage,
    isNotAppendable,
    mcpConnectionsRequired,
    typedMcpText,
    showCursor,
    isMcpChecking,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyEvent) => {
      if (textAreaRef.current && checkIfScrollable(textAreaRef.current)) {
        const scrollable = checkIfScrollable(textAreaRef.current);
        scrollable && setIsScrollable(scrollable);
      }
      if (e.key === 'Enter' && isSubmitting) {
        return;
      }

      checkHealth();

      const isNonShiftEnter = e.key === 'Enter' && !e.shiftKey;
      const isCtrlEnter = e.key === 'Enter' && (e.ctrlKey || e.metaKey);

      // NOTE: isComposing and e.key behave differently in Safari compared to other browsers, forcing us to use e.keyCode instead
      const isComposingInput = isComposing.current || e.key === 'Process' || e.keyCode === 229;

      if (isNonShiftEnter && filesLoading) {
        e.preventDefault();
      }

      if (isNonShiftEnter) {
        e.preventDefault();
      }

      if (
        e.key === 'Enter' &&
        !enterToSend &&
        !isCtrlEnter &&
        textAreaRef.current &&
        !isComposingInput
      ) {
        e.preventDefault();
        insertTextAtCursor(textAreaRef.current, '\n');
        forceResize(textAreaRef.current);
        return;
      }

      if ((isNonShiftEnter || isCtrlEnter) && !isComposingInput) {
        const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | undefined;
        if (globalAudio) {
          console.log('Unmuting global audio');
          globalAudio.muted = false;
        }
        submitButtonRef.current?.click();
      }
    },
    [
      isSubmitting,
      checkHealth,
      filesLoading,
      enterToSend,
      setIsScrollable,
      textAreaRef,
      submitButtonRef,
    ],
  );

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const textArea = textAreaRef.current;
      if (!textArea) {
        return;
      }

      const clipboardData = e.clipboardData as DataTransfer | undefined;
      if (!clipboardData) {
        return;
      }

      if (clipboardData.files.length > 0) {
        setFilesLoading(true);
        const timestampedFiles: File[] = [];
        for (const file of clipboardData.files) {
          const newFile = new File([file], `clipboard_${+new Date()}_${file.name}`, {
            type: file.type,
          });
          timestampedFiles.push(newFile);
        }
        handleFiles(timestampedFiles);
      }
    },
    [handleFiles, setFilesLoading, textAreaRef],
  );

  return {
    textAreaRef,
    handlePaste,
    handleKeyDown,
    isNotAppendable,
    handleCompositionEnd,
    handleCompositionStart,
  };
}