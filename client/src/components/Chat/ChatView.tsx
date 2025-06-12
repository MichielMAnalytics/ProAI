import { memo, useCallback, useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Constants, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import { useChatHelpers, useAddedResponse, useSSE, useMCPConnection } from '~/hooks';
import { mainTextareaId } from '~/common';
import ConversationStarters from './Input/ConversationStarters';
import MCPConnectionsRequired from './Input/MCPConnectionsRequired';
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
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const addedSubmission = useRecoilValue(store.submissionByIndex(index + 1));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  
  const [isMcpChecking, setIsMcpChecking] = useState(false);
  const [mcpConnectionsComplete, setMCPConnectionsComplete] = useState(true);

  const fileMap = useFileMapContext();

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
  const { data: agentData, isLoading: isAgentLoading, error: agentError } = useGetAgentByIdQuery(agentId ?? '', {
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
  
  // Consolidated useEffect for handling MCP connection checks
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

      // Agent data has been fetched (or failed)
      if (agentData) {
        const mcpServers = agentData.mcp_servers || [];
        const allConnected = areAllMCPServersConnected(mcpServers);
        setMCPConnectionsComplete(allConnected);
      } else {
        // Default to complete if agent data fails to load, to prevent UI lock
        setMCPConnectionsComplete(true);
      }
      setIsMcpChecking(false); // Finished checking
    } else {
      // Not an agent endpoint, or no agent is selected, so reset to default state
      setIsMcpChecking(false);
      setMCPConnectionsComplete(true);
    }
  }, [
    chatHelpers.conversation,
    isAgentLoading,
    agentData,
    areAllMCPServersConnected,
  ]);

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
              className="flex h-full w-full flex-col chat-grid-bg"
              style={{
                backgroundSize: '32px 32px',
                backgroundRepeat: 'repeat'
              }}
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
                    <ChatForm
                      index={index}
                      isMcpChecking={isMcpChecking}
                      disabled={isMcpChecking || !mcpConnectionsComplete}
                    />
                    {/* Show MCP connections required component right under the chat form */}
                    {!isMcpChecking && !mcpConnectionsComplete && chatHelpers.conversation && agentData && (
                      <div className="mx-auto flex w-full flex-row gap-3 px-3 sm:px-2">
                        <div className="relative flex h-full flex-1 items-stretch md:flex-col">
                          <MCPConnectionsRequired
                            mcpServers={agentData?.mcp_servers || []}
                            onAllConnected={() => setMCPConnectionsComplete(true)}
                          />
                        </div>
                      </div>
                    )}
                    {/* Show DefaultPrompts for new conversations with agents that have default prompts and connected integrations */}
                    {!isMcpChecking && mcpConnectionsComplete && (
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
