import { memo, useCallback, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Constants, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import { useChatHelpers, useAddedResponse, useSSE, useMCPConnection } from '~/hooks';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import { mainTextareaId } from '~/common';
import ConversationStarters from './Input/ConversationStarters';
import DefaultPrompts from './Input/DefaultPrompts';
import { useGetMessagesByConvoId, useGetAgentByIdQuery } from '~/data-provider';
import MessagesView from './Messages/MessagesView';
import { Spinner } from '~/components/svg';
import Presentation from './Presentation';
import { buildTree, cn } from '~/utils';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import store from '~/store';

function LoadingSpinner() {
  return (
    <>
      {/* Maintain flex layout for the component structure */}
      <div className="flex flex-1 items-center justify-center">
        {/* Invisible placeholder to maintain layout */}
      </div>
      {/* Portal-like fixed spinner that ignores all layout changes */}
      <div
        className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <Spinner className="text-text-primary" />
      </div>
    </>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const addedSubmission = useRecoilValue(store.submissionByIndex(index + 1));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const [isMcpChecking, setIsMcpChecking] = useState(false);

  const fileMap = useFileMapContext();
  const agentsMap = useAgentsMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const dataTree = buildTree({ messages: data, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [fileMap],
    ),
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse({ rootIndex: index });

  const { areAllMCPServersConnected } = useMCPConnection();

  // Fetch agent data if we have an agent_id
  const agentId = chatHelpers.conversation?.agent_id;
  const { data: agentData, isLoading: isAgentLoading } = useGetAgentByIdQuery(agentId ?? '', {
    enabled: !!(agentId && agentId !== Constants.EPHEMERAL_AGENT_ID),
  });

  useSSE(rootSubmission, chatHelpers, false);
  useSSE(addedSubmission, addedChatHelpers, true);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const handlePromptSelect = (prompt: string) => {
    methods.setValue('text', prompt);
    // Focus the text area after setting the value
    const textArea = document.getElementById(mainTextareaId);
    if (textArea) {
      textArea.focus();
    }
  };



  // Simplified useEffect for handling MCP connection checks - we don't need to show connect buttons anymore
  useEffect(() => {
    const { conversation } = chatHelpers;
    if (!conversation) {
      return;
    }

    const endpoint = conversation.endpointType ?? conversation.endpoint;
    const agentId = conversation.agent_id;

    if (isAgentsEndpoint(endpoint) && agentId && agentId !== Constants.EPHEMERAL_AGENT_ID) {
      // If we are on an agent endpoint with a selected agent, start checking.
      setIsMcpChecking(true);

      if (isAgentLoading) {
        return; // Wait for the agent data to be fetched
      }

      // Agent data has been fetched (or failed), finished checking
      setIsMcpChecking(false);
    } else {
      // Not an agent endpoint, or no agent is selected, so reset to default state
      setIsMcpChecking(false);
    }
  }, [chatHelpers.conversation, isAgentLoading, agentData]);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div
              className="flex h-full w-full flex-col"
            >
              {!isLoading && <Header />}
              <>
                <div
                  className={cn(
                    'flex flex-col',
                    isLandingPage
                      ? 'flex-1 items-center justify-end sm:justify-center'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                    )}
                  >
                    <div className="relative">
                      {/* Show DefaultPrompts above ChatForm when conversation has started */}
                      {!isMcpChecking &&
                        chatHelpers.conversation &&
                        !isLandingPage &&
                        agentData?.default_prompts &&
                        agentData.default_prompts.length > 0 && (
                          <div className="mx-auto mb-0.5 flex w-full max-w-3xl justify-center gap-3 sm:px-2 xl:max-w-4xl">
                            <div className="relative flex h-full flex-1 items-stretch md:flex-col">
                              <DefaultPrompts
                                conversation={chatHelpers.conversation}
                                onPromptSelect={handlePromptSelect}
                                isCompact={true}
                              />
                            </div>
                          </div>
                        )}
                      <ChatForm
                        index={index}
                        isMcpChecking={isMcpChecking}
                        disabled={false}
                        agentTools={agentData?.tools || []}
                      />
                    </div>
                    {/* Show DefaultPrompts for new conversations with agents that have default prompts */}
                    {!isMcpChecking && chatHelpers.conversation && isLandingPage && (
                      <DefaultPrompts
                        conversation={chatHelpers.conversation}
                        onPromptSelect={handlePromptSelect}
                      />
                    )}
                    {isLandingPage ? <ConversationStarters /> : <Footer />}
                  </div>
                </div>
                {isLandingPage && <Footer />}
              </>
            </div>

          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
