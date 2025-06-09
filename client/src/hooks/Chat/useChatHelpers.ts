import { useCallback, useState, useRef, useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useResetRecoilState, useSetRecoilState, useRecoilCallback } from 'recoil';
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

  // Create a callback to update workflow artifacts
  const updateWorkflowArtifacts = useRecoilCallback(({ snapshot, set }) => async (workflowId: string, workflowData: any) => {
    try {
      const currentArtifacts = await snapshot.getPromise(store.artifactsState);
      
      // Find workflow artifacts that need updating
      const updatedArtifacts = { ...currentArtifacts };
      let artifactUpdated = false;
      
      Object.entries(currentArtifacts || {}).forEach(([artifactId, artifact]) => {
        if (artifact && artifact.type === 'application/vnd.workflow' && artifact.content) {
          try {
            const artifactWorkflowData = JSON.parse(artifact.content);
            
            // Check if this artifact is for the updated workflow
            if (artifactWorkflowData?.workflow?.id === workflowId) {
              console.log('[SchedulerSSE] 🔄 Recreating workflow artifact:', artifactId);
              
              // Generate new artifact ID with timestamp to force complete refresh
              const newArtifactId = `workflow-${workflowData.id}-${Date.now()}`;
              
              // Generate positions for steps that don't have them
              const nodesWithPositions = workflowData.steps.map((step: any, index: number) => {
                // If step doesn't have position, create a default layout
                const defaultPosition = step.position || {
                  x: 100 + (index % 3) * 200, // Arrange in columns
                  y: 150 + Math.floor(index / 3) * 100 // Arrange in rows
                };
                
                return {
                  id: step.id,
                  type: step.type,
                  position: defaultPosition,
                  data: {
                    label: step.name,
                    config: step.config,
                    status: 'pending' // Default status for viewing
                  }
                };
              });

              // Generate edges from workflow connections
              const edges: Array<{
                id: string;
                source: string;
                target: string;
                type: 'success' | 'failure';
              }> = [];
              
              workflowData.steps.forEach((step: any) => {
                if (step.onSuccess) {
                  // Check if target step exists
                  const targetExists = workflowData.steps.some((s: any) => s.id === step.onSuccess);
                  if (targetExists) {
                    edges.push({
                      id: `${step.id}-success-${step.onSuccess}`,
                      source: step.id,
                      target: step.onSuccess,
                      type: 'success'
                    });
                  }
                }
                if (step.onFailure) {
                  // Check if target step exists
                  const targetExists = workflowData.steps.some((s: any) => s.id === step.onFailure);
                  if (targetExists) {
                    edges.push({
                      id: `${step.id}-failure-${step.onFailure}`,
                      source: step.id,
                      target: step.onFailure,
                      type: 'failure'
                    });
                  }
                }
              });

              // Create complete new workflow visualization data
              const newWorkflowVisualizationData = {
                workflow: {
                  id: workflowData.id,
                  name: workflowData.name,
                  description: workflowData.description,
                  trigger: workflowData.trigger,
                  steps: workflowData.steps
                },
                nodes: nodesWithPositions,
                edges: edges,
                trigger: workflowData.trigger
              };

              // Create completely new artifact
              const newWorkflowArtifact = {
                id: newArtifactId,
                identifier: newArtifactId,
                title: `Workflow: ${workflowData.name}`,
                type: 'application/vnd.workflow',
                content: JSON.stringify(newWorkflowVisualizationData, null, 2),
                messageId: `workflow-update-${Date.now()}`,
                index: 0,
                lastUpdateTime: Date.now(),
              };

              // Remove old artifact and add new one
              delete updatedArtifacts[artifactId];
              updatedArtifacts[newArtifactId] = newWorkflowArtifact;
              
              // Update current artifact ID if this was the active artifact
              const currentArtifactId = snapshot.getLoadable(store.currentArtifactId).valueOrThrow();
              if (currentArtifactId === artifactId) {
                set(store.currentArtifactId, newArtifactId);
                console.log('[SchedulerSSE] 🎯 Updated current artifact ID to new recreated artifact');
              }
              
              artifactUpdated = true;
              console.log('[SchedulerSSE] ✅ Recreated workflow artifact with new visualization data');
            }
          } catch (error) {
            console.warn('[SchedulerSSE] Failed to parse workflow artifact content:', error);
          }
        }
      });
      
      // Update artifacts state if any were modified
      if (artifactUpdated) {
        set(store.artifactsState, updatedArtifacts);
        console.log('[SchedulerSSE] 🎯 Applied workflow artifact recreation');
        
        // Trigger artifact refresh after a short delay to ensure the new artifact is rendered
        setTimeout(async () => {
          try {
            const refreshFunction = await snapshot.getPromise(store.artifactRefreshFunction);
            if (refreshFunction && typeof refreshFunction === 'function') {
              console.log('[SchedulerSSE] 🔄 Triggering automatic artifact refresh');
              refreshFunction();
            }
          } catch (error) {
            console.warn('[SchedulerSSE] Failed to trigger artifact refresh:', error);
          }
        }, 100); // Small delay to ensure the artifact is rendered before refreshing
      }
    } catch (error) {
      console.warn('[SchedulerSSE] Failed to recreate workflow artifacts:', error);
    }
  }, []);

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
      console.log('[SchedulerSSE] Not authenticated or no token, skipping SSE setup');
      return;
    }

    console.log('[SchedulerSSE] Setting up SSE connection...');

    // Close existing connection if any
    if (sseConnectionRef.current) {
      console.log('[SchedulerSSE] Closing existing connection');
      sseConnectionRef.current.close();
    }

    // Create new SSE connection
    const sseUrl = `/api/scheduler/notifications?token=${encodeURIComponent(token)}`;
    console.log('[SchedulerSSE] Connecting to:', sseUrl);
    const eventSource = new EventSource(sseUrl);

    sseConnectionRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SchedulerSSE] ✅ Connected to scheduler notifications');
    };

    eventSource.onmessage = (event) => {
      console.log('[SchedulerSSE] 📨 Received message:', event.data);
      try {
        const data = JSON.parse(event.data);
        console.log('[SchedulerSSE] 📨 Parsed message data:', data);
        
        if (data.type === 'scheduler_message') {
          console.log('[SchedulerSSE] 📅 Processing scheduler message notification');
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
          
          // Force refresh the conversation messages to show the new scheduler message
          // Use refetchQueries instead of invalidateQueries to force immediate refetch
          // regardless of the query's refetch settings
          if (data.conversationId) {
            console.log('[SchedulerSSE] 🔄 Refreshing messages for conversation:', data.conversationId);
            console.log('[SchedulerSSE] Current conversation ID:', conversationId);
            // First try to refetch if it matches current conversation
            if (data.conversationId === conversationId) {
              console.log('[SchedulerSSE] ⚡ Refetching current conversation messages');
              queryClient.refetchQueries([QueryKeys.messages, data.conversationId]);
            } else {
              console.log('[SchedulerSSE] 📝 Invalidating background conversation messages');
              // Also invalidate for background conversations to refresh when user navigates
              queryClient.invalidateQueries([QueryKeys.messages, data.conversationId]);
            }
          }
          
          // Always refresh scheduler tasks when any scheduler notification comes in
          // This ensures the schedules panel shows updated task status
          queryClient.invalidateQueries([QueryKeys.schedulerTasks]);
        } else if (data.type === 'task_status_update' || data.type === 'task_notification') {
          console.log('[SchedulerSSE] 📋 Processing task status update:', data);
          // Handle task status updates (started, failed, cancelled, etc.)
          // These don't necessarily create new messages but do update task status
          queryClient.invalidateQueries([QueryKeys.schedulerTasks]);
          
          // Show a brief status notification
          if (data.taskName && data.notificationType) {
            const statusMessages = {
              started: '⏳ Task started',
              failed: '❌ Task failed', 
              cancelled: '🚫 Task cancelled',
              completed: '✅ Task completed',
              created: '➕ Task created',
              updated: '✏️ Task updated',
              deleted: '🗑️ Task deleted',
              enabled: '▶️ Task enabled',
              disabled: '⏸️ Task disabled',
              conversation_refresh: '🔄 Task completed'
            };
            
            const message = statusMessages[data.notificationType] || '📋 Task updated';
            
            // Handle conversation refresh for tasks that executed in conversation context
            if (data.notificationType === 'conversation_refresh') {
              console.log('[SchedulerSSE] 🔄 Processing conversation refresh notification');
              try {
                const details = JSON.parse(data.details || '{}');
                if (details.conversationId) {
                  console.log('[SchedulerSSE] 🔄 Refreshing messages for conversation:', details.conversationId);
                  console.log('[SchedulerSSE] Current conversation ID:', conversationId);
                  
                  // Refresh the conversation messages to show the new scheduler result
                  if (details.conversationId === conversationId) {
                    console.log('[SchedulerSSE] ⚡ Refetching current conversation messages');
                    queryClient.refetchQueries([QueryKeys.messages, details.conversationId]);
                  } else {
                    console.log('[SchedulerSSE] 📝 Invalidating background conversation messages');
                    // Also invalidate for background conversations to refresh when user navigates
                    queryClient.invalidateQueries([QueryKeys.messages, details.conversationId]);
                  }
                }
              } catch (error) {
                console.error('[SchedulerSSE] Error parsing conversation refresh details:', error);
              }
            }
            
            // Only show toast for certain operations to avoid spam
            const showToastFor = ['started', 'completed', 'failed', 'created', 'deleted', 'conversation_refresh'];
            if (showToastFor.includes(data.notificationType)) {
              showToast({
                message: `${message}: ${data.taskName}`,
                severity: data.notificationType === 'failed' ? NotificationSeverity.ERROR : NotificationSeverity.SUCCESS,
                duration: 3000,
              });
            }
          }
        } else if (data.type === 'workflow_status_update') {
          console.log('[SchedulerSSE] 🔄 Processing workflow status update:', data);
          console.log('[SchedulerSSE] 🔄 Notification type:', data.notificationType);
          console.log('[SchedulerSSE] 🔄 Step data:', data.stepData);
          // Handle workflow status updates (activated, deactivated, created, updated, deleted, etc.)
          // These update the workflow status in the sidebar
          
          // Force aggressive refresh of all workflow-related queries
          queryClient.invalidateQueries([QueryKeys.workflows]);
          queryClient.invalidateQueries([QueryKeys.workflow]);
          
          // Also refetch specific workflow queries immediately to ensure side panel updates
          queryClient.refetchQueries({ queryKey: [QueryKeys.workflows] });
          if (data.workflowId) {
            queryClient.refetchQueries({ queryKey: [QueryKeys.workflow, data.workflowId] });
          }
          
          // Additional aggressive cache invalidation for workflow lists
          queryClient.removeQueries({ queryKey: [QueryKeys.workflows] });
          
          console.log('[SchedulerSSE] 🔄 Invalidated and refetched workflow queries for side panel update');
          
          // Update workflow artifacts if any are currently open and match the updated workflow
          if (data.notificationType === 'updated' && data.workflowData && data.workflowId) {
            updateWorkflowArtifacts(data.workflowId, data.workflowData);
          }
          
          // Dispatch custom event for workflow notifications that other components can listen to
          const workflowEvent = new CustomEvent('workflowNotification', { detail: data });
          window.dispatchEvent(workflowEvent);
          
          // Show a brief status notification for workflows
          if (data.workflowName && data.notificationType) {
            const workflowStatusMessages = {
              activated: '▶️ Workflow activated',
              deactivated: '⏸️ Workflow deactivated',
              created: '➕ Workflow created',
              updated: '✏️ Workflow updated',
              deleted: '🗑️ Workflow deleted',
              test_started: '🧪 Workflow test started',
              execution_started: '⚡ Workflow execution started',
              execution_completed: '✅ Workflow execution completed',
              execution_failed: '❌ Workflow execution failed',
              step_started: '🔄 Step started',
              step_completed: '✅ Step completed',
              step_failed: '❌ Step failed'
            };
            
            const message = workflowStatusMessages[data.notificationType] || '🔄 Workflow updated';
            
            // Only show toast for certain operations to avoid spam
            const showToastFor = ['activated', 'deactivated', 'created', 'deleted', 'execution_completed', 'execution_failed'];
            if (showToastFor.includes(data.notificationType)) {
              // Play notification sound for workflow events
              try {
                // Check if sound notifications are enabled in config for workflows
                const soundEnabled = startupConfig?.workflows?.notifications?.sound ?? true;
                const volume = startupConfig?.workflows?.notifications?.volume ?? 0.3;
                
                if (soundEnabled) {
                  // Create a slightly different sound for workflows (higher frequency)
                  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();
                  
                  oscillator.connect(gainNode);
                  gainNode.connect(audioContext.destination);
                  
                  // Configure workflow notification sound (slightly higher pitch than scheduler)
                  oscillator.frequency.setValueAtTime(900, audioContext.currentTime); // 900Hz frequency
                  oscillator.type = 'sine';
                  
                  // Configure volume envelope
                  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                  gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
                  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                  
                  // Play the sound
                  oscillator.start(audioContext.currentTime);
                  oscillator.stop(audioContext.currentTime + 0.4);
                }
              } catch (error) {
                console.debug('[SchedulerSSE] Could not play workflow notification sound:', error);
              }
              
              const severity = data.notificationType.includes('failed') ? NotificationSeverity.ERROR : NotificationSeverity.SUCCESS;
              showToast({
                message: `${message}: ${data.workflowName}`,
                severity,
                duration: 3000,
              });
            }
          }
        } else if (data.type === 'heartbeat') {
          // Handle heartbeat (keep-alive)
          console.debug('[SchedulerSSE] 💓 Heartbeat received');
        } else if (data.type === 'connected') {
          console.log('[SchedulerSSE] ✅ Initial connection confirmation received');
        } else {
          console.log('[SchedulerSSE] ❓ Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('[SchedulerSSE] ❌ Error parsing SSE message:', error, 'Raw data:', event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SchedulerSSE] ❌ SSE connection error:', error);
      console.error('[SchedulerSSE] EventSource readyState:', eventSource.readyState);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (sseConnectionRef.current === eventSource) {
          console.log('[SchedulerSSE] 🔄 Attempting to reconnect...');
          eventSource.close();
          // Trigger re-connection by updating the effect dependency
        }
      }, 5000);
    };

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log('[SchedulerSSE] 🧹 Cleaning up SSE connection');
      eventSource.close();
      sseConnectionRef.current = null;
    };
  }, [isAuthenticated, token, conversationId, queryClient, showToast, startupConfig, updateWorkflowArtifacts]);

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
