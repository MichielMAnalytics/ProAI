import React, { useState, useMemo, useCallback } from 'react';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import { EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps, IconComponentTypes } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines, getEndpointField, getIconKey } from '~/utils';
import { useToastContext, useFileMapContext } from '~/Providers';
import Action from '~/components/SidePanel/Builder/Action';
import { ToolSelectDialog } from '~/components/Tools';
import { icons } from '~/hooks/Endpoint/Icons';
import { processAgentOption } from '~/utils';
import Instructions from './Instructions';
import AgentAvatar from './AgentAvatar';
import FileContext from './FileContext';
import SearchForm from './Search/Form';
import { useLocalize } from '~/hooks';
import FileSearch from './FileSearch';
import Artifacts from './Artifacts';
import AgentTool from './AgentTool';
import CodeForm from './Code/Form';
import { Panel } from '~/common';
import { useGetStartupConfig, useAvailableAgentToolsQuery } from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import Workflows from './Workflows';
import Scheduler from './Scheduler';

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

export default function AgentConfig({
  setAction,
  actions = [],
  agentsConfig,
  createMutation,
  setActivePanel,
  endpointsConfig,
}: AgentPanelProps) {
  const fileMap = useFileMapContext();
  const { data: startupConfig } = useGetStartupConfig();

  const { data: allTools = [] } = useAvailableAgentToolsQuery();
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const [showToolDialog, setShowToolDialog] = useState(false);

  const methods = useFormContext<AgentForm>();

  const { control } = methods;
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const agent = useWatch({ control, name: 'agent' });
  const tools = useWatch({ control, name: 'tools' });
  const agent_id = useWatch({ control, name: 'id' });

  // Agent panel UI visibility controls (keeps capabilities enabled)
  const agentPanelConfig = startupConfig?.interface?.agentPanel || {
    actions: true,
    tools: true,
    capabilities: true,
    modelSelection: true,
    instructions: true,
    agentId: true,
  };

  // Granular capability items visibility controls
  const capabilityItemsConfig = startupConfig?.interface?.agentPanel?.capabilityItems || {
    codeExecution: true,
    webSearch: true,
    fileContext: true,
    artifacts: true,
    fileSearch: true,
    scheduler: true,
  };

  const toolsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.tools) ?? false,
    [agentsConfig],
  );
  const actionsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.actions) ?? false,
    [agentsConfig],
  );
  const artifactsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.artifacts) ?? false,
    [agentsConfig],
  );
  const ocrEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.ocr) ?? false,
    [agentsConfig],
  );
  const fileSearchEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.file_search) ?? false,
    [agentsConfig],
  );
  const webSearchEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.web_search) ?? false,
    [agentsConfig],
  );
  const codeEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.execute_code) ?? false,
    [agentsConfig],
  );
  const workflowsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.workflows) ?? false,
    [agentsConfig],
  );
  const schedulerEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.scheduler) ?? false,
    [agentsConfig],
  );

  const context_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.context_files) {
      return agent.context_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.context_files ?? [];
  }, [agent, agent_id, fileMap]);

  const knowledge_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.knowledge_files) {
      return agent.knowledge_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.knowledge_files ?? [];
  }, [agent, agent_id, fileMap]);

  const code_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.code_files) {
      return agent.code_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.code_files ?? [];
  }, [agent, agent_id, fileMap]);

  const handleAddActions = useCallback(() => {
    if (!agent_id) {
      showToast({
        message: localize('com_assistants_actions_disabled'),
        status: 'warning',
      });
      return;
    }
    setActivePanel(Panel.actions);
  }, [agent_id, setActivePanel, showToast, localize]);

  const providerValue = typeof provider === 'string' ? provider : provider?.value;
  let Icon: IconComponentTypes | null | undefined;
  let endpointType: EModelEndpoint | undefined;
  let endpointIconURL: string | undefined;
  let iconKey: string | undefined;

  if (providerValue !== undefined) {
    endpointType = getEndpointField(endpointsConfig, providerValue as string, 'type');
    endpointIconURL = getEndpointField(endpointsConfig, providerValue as string, 'iconURL');
    iconKey = getIconKey({
      endpoint: providerValue as string,
      endpointsConfig,
      endpointType,
      endpointIconURL,
    });
    Icon = icons[iconKey];
  }

  return (
    <>
      <div className="h-auto bg-white px-4 pt-3 dark:bg-transparent">
        {/* Avatar & Name */}
        <div className="mb-4">
          <AgentAvatar
            agent_id={agent_id}
            createMutation={createMutation}
            avatar={agent?.['avatar'] ?? null}
          />
          <label className={labelClass} htmlFor="name">
            {localize('com_ui_name')}
          </label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={256}
                className={inputClass}
                id="name"
                type="text"
                placeholder={localize('com_agents_name_placeholder')}
                aria-label="Agent name"
              />
            )}
          />
          {agentPanelConfig.agentId !== false && (
            <Controller
              name="id"
              control={control}
              render={({ field }) => (
                <p className="h-3 text-xs italic text-text-secondary" aria-live="polite">
                  {field.value}
                </p>
              )}
            />
          )}
        </div>
        {/* Description */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="description">
            {localize('com_ui_description')}
          </label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={512}
                className={inputClass}
                id="description"
                type="text"
                placeholder={localize('com_agents_description_placeholder')}
                aria-label="Agent description"
              />
            )}
          />
        </div>
        {/* Instructions */}
        {agentPanelConfig.instructions !== false && <Instructions />}
        {/* Model and Provider */}
        {agentPanelConfig.modelSelection !== false && (
          <div className="mb-4">
            <label className={labelClass} htmlFor="provider">
              {localize('com_ui_model')} <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setActivePanel(Panel.model)}
              className="btn btn-neutral border-token-border-light relative h-10 w-full rounded-lg font-medium"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <div className="flex w-full items-center gap-2">
                {Icon && (
                  <div className="shadow-stroke relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-black dark:bg-white">
                    <Icon
                      className="h-2/3 w-2/3"
                      endpoint={providerValue as string}
                      endpointType={endpointType}
                      iconURL={endpointIconURL}
                    />
                  </div>
                )}
                <span>{model != null && model ? model : localize('com_ui_select_model')}</span>
              </div>
            </button>
          </div>
        )}
        {agentPanelConfig.capabilities !== false && (
          (capabilityItemsConfig.codeExecution !== false && codeEnabled) ||
          (capabilityItemsConfig.fileSearch !== false && fileSearchEnabled) ||
          (capabilityItemsConfig.artifacts !== false && artifactsEnabled) ||
          (capabilityItemsConfig.fileContext !== false && ocrEnabled) ||
          (capabilityItemsConfig.webSearch !== false && webSearchEnabled) ||
          (capabilityItemsConfig.scheduler !== false && schedulerEnabled) ||
          workflowsEnabled ||
          schedulerEnabled
        ) && (
          <div className="mb-4 flex w-full flex-col items-start gap-3">
            <label className="text-token-text-primary block font-medium">
              {localize('com_assistants_capabilities')}
            </label>
            {/* Code Execution */}
            {capabilityItemsConfig.codeExecution !== false && codeEnabled && <CodeForm agent_id={agent_id} files={code_files} />}
            {/* Web Search */}
            {capabilityItemsConfig.webSearch !== false && webSearchEnabled && <SearchForm />}
            {/* File Context (OCR) */}
            {capabilityItemsConfig.fileContext !== false && ocrEnabled && <FileContext agent_id={agent_id} files={context_files} />}
            {/* Artifacts */}
            {capabilityItemsConfig.artifacts !== false && artifactsEnabled && <Artifacts />}
            {/* File Search */}
            {capabilityItemsConfig.fileSearch !== false && fileSearchEnabled && <FileSearch agent_id={agent_id} files={knowledge_files} />}
            {/* Scheduler */}
            {capabilityItemsConfig.scheduler !== false && schedulerEnabled && (
              <Scheduler />
            )}
            {/* Workflows */}
            {workflowsEnabled && (
              <Workflows />
            )}
          </div>
        )}
        {/* Agent Tools & Actions */}
        {(agentPanelConfig.tools !== false || agentPanelConfig.actions !== false) && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-token-text-primary block font-medium">
                {`${toolsEnabled === true && agentPanelConfig.tools !== false ? localize('com_ui_tools') : ''}
                  ${toolsEnabled === true && agentPanelConfig.tools !== false && actionsEnabled === true && agentPanelConfig.actions !== false ? ' + ' : ''}
                  ${actionsEnabled === true && agentPanelConfig.actions !== false ? localize('com_assistants_actions') : ''}`}
              </label>
              {(() => {
                const validToolsCount = agentPanelConfig.tools !== false ? tools?.filter(tool => allTools.find(t => t.pluginKey === tool)).length ?? 0 : 0;
                const validActionsCount = agentPanelConfig.actions !== false ? actions?.filter((action) => action.agent_id === agent_id).length ?? 0 : 0;
                const totalCount = validToolsCount + validActionsCount;
                
                return totalCount > 0 ? (
                  <span className="rounded-full bg-surface-tertiary px-2 py-1 text-xs text-text-secondary">
                    {totalCount}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="space-y-2">
              {/* Tools and Actions Container with Scrolling */}
              {(() => {
                const validTools = agentPanelConfig.tools !== false ? tools?.filter(tool => allTools.find(t => t.pluginKey === tool)) ?? [] : [];
                const validActions = agentPanelConfig.actions !== false ? actions?.filter((action) => action.agent_id === agent_id) ?? [] : [];
                const hasItems = validTools.length > 0 || validActions.length > 0;
                
                if (!hasItems) {
                  return (
                    <div className="rounded-lg border border-dashed border-border-medium bg-surface-primary p-4 text-center">
                      <p className="text-sm text-text-secondary">
                        {toolsEnabled && agentPanelConfig.tools !== false && actionsEnabled && agentPanelConfig.actions !== false
                          ? 'No tools or actions added yet' 
                          : toolsEnabled && agentPanelConfig.tools !== false
                          ? 'No tools added yet'
                          : actionsEnabled && agentPanelConfig.actions !== false
                          ? 'No actions added yet'
                          : 'Tools and actions not available'
                        }
                      </p>
                    </div>
                  );
                }
                
                return (
                  <div 
                    className={cn(
                      "space-y-2 rounded-lg border border-border-light bg-surface-primary p-2",
                      (validTools.length + validActions.length) > 4
                        ? "max-h-60 overflow-y-auto"
                        : ""
                    )}
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgb(156 163 175) transparent',
                    }}
                  >
                    {agentPanelConfig.tools !== false && validTools.map((func, i) => (
                      <AgentTool
                        key={`${func}-${i}-${agent_id}`}
                        tool={func}
                        allTools={allTools}
                        agent_id={agent_id}
                      />
                    ))}
                    {agentPanelConfig.actions !== false && validActions.map((action, i) => (
                      <Action
                        key={i}
                        action={action}
                        onClick={() => {
                          setAction(action);
                          setActivePanel(Panel.actions);
                        }}
                      />
                    ))}
                  </div>
                );
              })()}
              
              {/* Add Tools/Actions Buttons */}
              <div className="flex space-x-2">
                {(toolsEnabled ?? false) && agentPanelConfig.tools !== false && (
                  <button
                    type="button"
                    onClick={() => setShowToolDialog(true)}
                    className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                    aria-haspopup="dialog"
                  >
                    <div className="flex w-full items-center justify-center gap-2">
                      {localize('com_assistants_add_tools')}
                    </div>
                  </button>
                )}
                {(actionsEnabled ?? false) && agentPanelConfig.actions !== false && (
                  <button
                    type="button"
                    disabled={!agent_id}
                    onClick={handleAddActions}
                    className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                    aria-haspopup="dialog"
                  >
                    <div className="flex w-full items-center justify-center gap-2">
                      {localize('com_assistants_add_actions')}
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <ToolSelectDialog
        isOpen={showToolDialog}
        setIsOpen={setShowToolDialog}
        toolsFormKey="tools"
        endpoint={EModelEndpoint.agents}
      />
    </>
  );
}
