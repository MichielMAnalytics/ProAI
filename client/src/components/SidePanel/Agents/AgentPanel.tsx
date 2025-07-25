import { Plus } from 'lucide-react';
import React, { useMemo, useCallback } from 'react';
import { useWatch, useForm, FormProvider } from 'react-hook-form';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  Tools,
  Constants,
  SystemRoles,
  EModelEndpoint,
  isAssistantsEndpoint,
  defaultAgentFormValues,
} from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps, StringOption } from '~/common';
import {
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useGetAgentByIdQuery,
  useDuplicateAgentMutation,
  useGetStartupConfig,
} from '~/data-provider';
import { useSelectAgent, useLocalize, useAuthContext } from '~/hooks';
import AgentPanelSkeleton from './AgentPanelSkeleton';
import { createProviderOption } from '~/utils';
import { useToastContext } from '~/Providers';
import AdvancedPanel from './Advanced/AdvancedPanel';
import AgentConfig from './AgentConfig';
import AgentSelect from './AgentSelect';
import AgentFooter from './AgentFooter';
import { Button } from '~/components';
import ModelPanel from './ModelPanel';
import { Panel } from '~/common';

export default function AgentPanel({
  setAction,
  activePanel,
  actions = [],
  setActivePanel,
  agent_id: current_agent_id,
  setCurrentAgentId,
  agentsConfig,
  endpointsConfig,
}: AgentPanelProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  const { onSelect: onSelectAgent } = useSelectAgent();

  const modelsQuery = useGetModelsQuery();
  const agentQuery = useGetAgentByIdQuery(current_agent_id ?? '', {
    enabled: !!(current_agent_id ?? '') && current_agent_id !== Constants.EPHEMERAL_AGENT_ID,
  });
  const { data: startupConfig } = useGetStartupConfig();

  const models = useMemo(() => modelsQuery.data ?? {}, [modelsQuery.data]);
  const methods = useForm<AgentForm>({
    defaultValues: defaultAgentFormValues,
  });

  const { control, handleSubmit, reset } = methods;
  const agent_id = useWatch({ control, name: 'id' });

  const allowedProviders = useMemo(
    () => new Set(agentsConfig?.allowedProviders),
    [agentsConfig?.allowedProviders],
  );

  const providers = useMemo(
    () =>
      Object.keys(endpointsConfig ?? {})
        .filter(
          (key) =>
            !isAssistantsEndpoint(key) &&
            (allowedProviders.size > 0 ? allowedProviders.has(key) : true) &&
            key !== EModelEndpoint.agents &&
            key !== EModelEndpoint.chatGPTBrowser &&
            key !== EModelEndpoint.gptPlugins,
        )
        .map((provider) => createProviderOption(provider)),
    [endpointsConfig, allowedProviders],
  );

  /* Mutations */
  const update = useUpdateAgentMutation({
    onSuccess: (data) => {
      showToast({
        message: `${localize('com_assistants_update_success')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error & {
        statusCode?: number;
        details?: { duplicateVersion?: any; versionIndex?: number };
        response?: { status?: number; data?: any };
      };

      const isDuplicateVersionError =
        (error.statusCode === 409 && error.details?.duplicateVersion) ||
        (error.response?.status === 409 && error.response?.data?.details?.duplicateVersion);

      if (isDuplicateVersionError) {
        let versionIndex: number | undefined = undefined;

        if (error.details?.versionIndex !== undefined) {
          versionIndex = error.details.versionIndex;
        } else if (error.response?.data?.details?.versionIndex !== undefined) {
          versionIndex = error.response.data.details.versionIndex;
        }

        if (versionIndex === undefined || versionIndex < 0) {
          showToast({
            message: localize('com_agents_update_error'),
            status: 'error',
            duration: 5000,
          });
        } else {
          showToast({
            message: localize('com_ui_agent_version_duplicate', { versionIndex: versionIndex + 1 }),
            status: 'error',
            duration: 10000,
          });
        }

        return;
      }

      showToast({
        message: `${localize('com_agents_update_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const create = useCreateAgentMutation({
    onSuccess: (data) => {
      setCurrentAgentId(data.id);
      showToast({
        message: `${localize('com_assistants_create_success')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_agents_create_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const duplicateAgent = useDuplicateAgentMutation({
    onSuccess: ({ agent, mcp_servers_needed }) => {
      // Switch to the new duplicated agent
      setCurrentAgentId(agent.id);

      // Log MCP servers that might need to be connected for user awareness
      if (mcp_servers_needed && mcp_servers_needed.length > 0) {
        console.log(
          '[Agent Duplication] MCP servers that may need to be connected:',
          mcp_servers_needed,
        );
        // Future: Could show a toast or modal directing user to integrations page
      }

      showToast({
        message: localize('com_ui_agent_duplicated'),
        status: 'success',
      });
    },
    onError: (error) => {
      console.error(error);
      showToast({
        message: localize('com_ui_agent_duplicate_error'),
        status: 'error',
      });
    },
  });

  const onSubmit = useCallback(
    (data: AgentForm) => {
      // Create a new array to avoid mutating the original enhanced tools structure
      const tools = [...(data.tools ?? [])];

      if (data.execute_code === true) {
        tools.push(Tools.execute_code);
      }
      if (data.file_search === true) {
        tools.push(Tools.file_search);
      }
      if (data.web_search === true) {
        tools.push(Tools.web_search);
      }
      if (data.workflows === true) {
        tools.push('workflows');
      }
      if (data.scheduler === true) {
        tools.push('scheduler');
      }

      const {
        name,
        artifacts,
        description,
        instructions,
        model: _model,
        model_parameters,
        provider: _provider,
        agent_ids,
        end_after_tools,
        hide_sequential_outputs,
        recursion_limit,
      } = data;

      const model = _model ?? '';
      const provider =
        (typeof _provider === 'string' ? _provider : (_provider as StringOption).value) ?? '';

      if (agent_id) {
        // Check if this is a shared collaborative agent that needs to be duplicated
        const agent = agentQuery.data;
        const { instanceProjectId } = startupConfig ?? {};
        const isSharedGlobal =
          instanceProjectId && (agent?.projectIds ?? []).includes(instanceProjectId);
        const isCollaborative = agent?.isCollaborative ?? false;
        const isUserOwner = agent?.author === user?.id;
        const isAdmin = user?.role === SystemRoles.ADMIN;

        // If the agent is shared globally, collaborative, and the user doesn't own it and isn't admin,
        // duplicate it first to create a private copy for the user
        if (isSharedGlobal && isCollaborative && !isUserOwner && !isAdmin) {
          duplicateAgent.mutate(
            { agent_id },
            {
              onSuccess: ({ agent: duplicatedAgent }) => {
                // Filter out MCP tools so users need to connect their own integrations
                // Note: MCP tools are now filtered out on the server side during duplication
                // This client-side filtering is kept for backward compatibility
                const filteredTools = tools;

                // After duplication, update the new agent with the changes
                // and make it non-collaborative since it's now the user's private copy
                update.mutate({
                  agent_id: duplicatedAgent.id,
                  data: {
                    name,
                    artifacts,
                    description,
                    instructions,
                    model,
                    tools: filteredTools, // Use filtered tools without MCP tools
                    provider,
                    model_parameters,
                    agent_ids,
                    end_after_tools,
                    hide_sequential_outputs,
                    recursion_limit,
                    isCollaborative: false, // Make the private copy non-collaborative
                    originalAgentId: agent_id, // Track which agent this was duplicated from
                    projectIds: [], // Ensure the duplicated agent is private (not associated with projects)
                  },
                });
              },
            },
          );
          return;
        }

        // Otherwise, update the agent normally
        update.mutate({
          agent_id,
          data: {
            name,
            artifacts,
            description,
            instructions,
            model,
            tools,
            provider,
            model_parameters,
            agent_ids,
            end_after_tools,
            hide_sequential_outputs,
            recursion_limit,
          },
        });
        return;
      }

      if (!provider || !model) {
        return showToast({
          message: localize('com_agents_missing_provider_model'),
          status: 'error',
        });
      }

      create.mutate({
        name,
        artifacts,
        description,
        instructions,
        model,
        tools,
        provider,
        model_parameters,
        agent_ids,
        end_after_tools,
        hide_sequential_outputs,
        recursion_limit,
      });
    },
    [
      agent_id,
      agentQuery.data,
      startupConfig,
      user?.id,
      user?.role,
      duplicateAgent,
      update,
      create,
      showToast,
      localize,
    ],
  );

  const handleSelectAgent = useCallback(() => {
    if (agent_id) {
      onSelectAgent(agent_id);
    }
  }, [agent_id, onSelectAgent]);

  const canEditAgent = useMemo(() => {
    const canEdit =
      (agentQuery.data?.isCollaborative ?? false)
        ? true
        : agentQuery.data?.author === user?.id || user?.role === SystemRoles.ADMIN;

    return agentQuery.data?.id != null && agentQuery.data.id ? canEdit : true;
  }, [
    agentQuery.data?.isCollaborative,
    agentQuery.data?.author,
    agentQuery.data?.id,
    user?.id,
    user?.role,
  ]);

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="scrollbar-gutter-stable h-auto w-full flex-shrink-0 overflow-x-hidden"
        aria-label="Agent configuration form"
      >
        <div className="mt-2 flex w-full flex-wrap gap-2">
          <div className="w-full">
            <AgentSelect
              createMutation={create}
              agentQuery={agentQuery}
              setCurrentAgentId={setCurrentAgentId}
              // The following is required to force re-render the component when the form's agent ID changes
              // Also maintains ComboBox Focus for Accessibility
              selectedAgentId={agentQuery.isInitialLoading ? null : (current_agent_id ?? null)}
            />
          </div>
          {/* Create + Select Button */}
          {agent_id && (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => {
                  reset(defaultAgentFormValues);
                  setCurrentAgentId(undefined);
                }}
                disabled={agentQuery.isInitialLoading}
              >
                <Plus className="mr-1 h-4 w-4" />
                {localize('com_ui_create') +
                  ' ' +
                  localize('com_ui_new') +
                  ' ' +
                  localize('com_ui_agent')}
              </Button>
              <Button
                variant="default"
                className="btn btn-primary"
                disabled={!agent_id || agentQuery.isInitialLoading}
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectAgent();
                }}
                aria-label={localize('com_ui_select') + ' ' + localize('com_ui_agent')}
              >
                {localize('com_ui_select')}
              </Button>
            </div>
          )}
        </div>
        {agentQuery.isInitialLoading && <AgentPanelSkeleton />}
        {!canEditAgent && !agentQuery.isInitialLoading && (
          <div className="flex h-[30vh] w-full items-center justify-center">
            <div className="text-center">
              <h2 className="text-token-text-primary m-2 text-xl font-semibold">
                {localize('com_agents_not_available')}
              </h2>
              <p className="text-token-text-secondary">{localize('com_agents_no_access')}</p>
            </div>
          </div>
        )}
        {canEditAgent && !agentQuery.isInitialLoading && activePanel === Panel.model && (
          <ModelPanel
            setActivePanel={setActivePanel}
            agent_id={agent_id}
            providers={providers}
            models={models}
          />
        )}
        {canEditAgent && !agentQuery.isInitialLoading && activePanel === Panel.builder && (
          <AgentConfig
            actions={actions}
            setAction={setAction}
            createMutation={create}
            agentsConfig={agentsConfig}
            setActivePanel={setActivePanel}
            endpointsConfig={endpointsConfig}
            setCurrentAgentId={setCurrentAgentId}
          />
        )}
        {canEditAgent && !agentQuery.isInitialLoading && activePanel === Panel.advanced && (
          <AdvancedPanel setActivePanel={setActivePanel} agentsConfig={agentsConfig} />
        )}
        {canEditAgent && !agentQuery.isInitialLoading && (
          <AgentFooter
            createMutation={create}
            updateMutation={update}
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            setCurrentAgentId={setCurrentAgentId}
          />
        )}
      </form>
    </FormProvider>
  );
}
