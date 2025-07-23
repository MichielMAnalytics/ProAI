import React from 'react';
import { X, Link2, ChevronDown, ChevronUp, PlusCircle } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import ControlCombobox from '~/components/ui/ControlCombobox';
import MessageIcon from '~/components/Share/MessageIcon';
import MCPServerIcons from '~/components/Chat/Input/MCPServerIcons';
import type { WorkflowStep, StepStatus } from '../types';
import { MAX_STEPS } from '../types';

interface StepsPanelProps {
  steps: WorkflowStep[];
  setSteps: React.Dispatch<React.SetStateAction<WorkflowStep[]>>;
  newStepAgentId: string;
  setNewStepAgentId: (id: string) => void;
  expandedSteps: Set<string>;
  expandedOutputs: Set<string>;
  agentsMap: Record<string, any>;
  selectableAgents: any[];
  latestExecutionData: any;
  isTesting: boolean;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Partial<WorkflowStep>) => void;
  toggleStepExpanded: (stepId: string) => void;
  toggleOutputExpanded: (stepId: string) => void;
  getStepStatus: (stepId: string) => StepStatus;
  getAgentDetails: (id: string) => any;
}

const StepsPanel: React.FC<StepsPanelProps> = ({
  steps,
  setSteps,
  newStepAgentId,
  setNewStepAgentId,
  expandedSteps,
  expandedOutputs,
  agentsMap,
  selectableAgents,
  latestExecutionData,
  isTesting,
  removeStep,
  updateStep,
  toggleStepExpanded,
  toggleOutputExpanded,
  getStepStatus,
  getAgentDetails,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text-primary sm:text-lg">Steps</h3>
        <div className="text-xs text-text-secondary">
          {steps.length} / {MAX_STEPS}
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div
              className={`rounded-lg border transition-all duration-300 ${
                expandedSteps.has(step.id) ? 'p-3' : 'px-3 pb-1.5 pt-2'
              } ${
                getStepStatus(step.id) === 'running'
                  ? 'animate-pulse border-blue-500 bg-blue-50/20 shadow-lg shadow-blue-500/20'
                  : getStepStatus(step.id) === 'completed'
                    ? 'border-green-500 bg-green-50/20'
                    : getStepStatus(step.id) === 'pending'
                      ? 'border-border-medium bg-surface-tertiary opacity-60'
                      : 'border-border-medium bg-surface-tertiary'
              } ${isTesting ? 'pointer-events-none' : ''}`}
              style={
                getStepStatus(step.id) === 'running'
                  ? {
                      boxShadow: `
                        0 0 0 1px rgb(59 130 246 / 0.5),
                        0 0 0 3px rgb(59 130 246 / 0.3),
                        0 0 20px rgb(59 130 246 / 0.4),
                        inset 0 0 20px rgb(59 130 246 / 0.1)
                      `,
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }
                  : {}
              }
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {expandedSteps.has(step.id) ? (
                    <input
                      type="text"
                      value={step.name}
                      onChange={(e) => updateStep(step.id, { name: e.target.value })}
                      disabled={isTesting}
                      className={`w-full border-none bg-transparent text-sm font-medium text-text-primary focus:outline-none ${
                        isTesting ? 'cursor-not-allowed opacity-50' : ''
                      }`}
                      placeholder="Step name"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {step.name}
                      </span>
                      {step.agentId && (
                        <>
                          <span className="text-text-secondary">•</span>
                          <MessageIcon
                            message={
                              {
                                endpoint: EModelEndpoint.agents,
                                isCreatedByUser: false,
                              } as TMessage
                            }
                            agent={agentsMap[step.agentId]}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className={`rounded-xl p-1 transition hover:bg-surface-hover ${
                      isTesting ? 'pointer-events-none cursor-not-allowed opacity-50' : ''
                    }`}
                    onClick={() => toggleStepExpanded(step.id)}
                    disabled={isTesting}
                    title={expandedSteps.has(step.id) ? 'Collapse step' : 'Expand step'}
                  >
                    {expandedSteps.has(step.id) ? (
                      <ChevronUp size={14} className="text-text-secondary" />
                    ) : (
                      <ChevronDown size={14} className="text-text-secondary" />
                    )}
                  </button>
                  <button
                    className={`rounded-xl p-1 transition hover:bg-surface-hover ${
                      isTesting ? 'pointer-events-none cursor-not-allowed opacity-50' : ''
                    }`}
                    onClick={() => removeStep(step.id)}
                    disabled={isTesting}
                    title="Remove step"
                  >
                    <X size={14} className="text-text-secondary" />
                  </button>
                </div>
              </div>
              {expandedSteps.has(step.id) && (
                <div className="space-y-2">
                  <div className="relative">
                    <ControlCombobox
                      isCollapsed={false}
                      ariaLabel="Select agent"
                      selectedValue={step.agentId}
                      setValue={(id) => updateStep(step.id, { agentId: id })}
                      selectPlaceholder="Select agent"
                      searchPlaceholder="Search agents"
                      items={selectableAgents}
                      displayValue={getAgentDetails(step.agentId)?.name ?? ''}
                      SelectIcon={
                        <MessageIcon
                          message={
                            {
                              endpoint: EModelEndpoint.agents,
                              isCreatedByUser: false,
                            } as TMessage
                          }
                          agent={step.agentId ? agentsMap[step.agentId] : undefined}
                        />
                      }
                      className={`h-8 w-full border-border-heavy text-sm sm:h-10 ${
                        isTesting ? 'pointer-events-none opacity-50' : ''
                      }`}
                      disabled={isTesting}
                    />
                    {step.agentId && agentsMap[step.agentId]?.tools && (
                      <div
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                        style={{
                          left: `calc(40px + ${(getAgentDetails(step.agentId)?.name ?? '').length * 0.65}ch + 16px)`,
                        }}
                      >
                        <div
                          className="pointer-events-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MCPServerIcons
                            agentTools={
                              (agentsMap[step.agentId]?.tools as Array<
                                | string
                                | {
                                    tool: string;
                                    server: string;
                                    type: 'global' | 'user';
                                  }
                              >) || []
                            }
                            size="lg"
                            showBackground={false}
                            className="flex-shrink-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <textarea
                    value={step.task}
                    onChange={(e) => updateStep(step.id, { task: e.target.value })}
                    disabled={isTesting}
                    className={`w-full resize-none rounded-md border border-border-heavy bg-surface-primary p-2 text-sm text-text-primary focus:border-blue-500 focus:outline-none ${
                      isTesting ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                    placeholder="Describe the task for this agent..."
                    rows={2}
                  />

                  {/* Step Output Field */}
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-text-secondary">
                      Step Output
                    </div>
                    <button
                      onClick={() => toggleOutputExpanded(step.id)}
                      className="w-full rounded-md border border-border-light bg-surface-secondary p-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          {(() => {
                            const actualExecutionData = latestExecutionData as any;
                            const stepExecution = actualExecutionData?.steps?.find(
                              (s: any) => {
                                return s.name === step.name || s.id === step.id;
                              },
                            );

                            const stepOutput = stepExecution?.output;
                            const stepStatus = stepExecution?.status;
                            const stepError = stepExecution?.error;
                            const currentStepId = latestExecutionData?.currentStepId;

                            let content = '';
                            if (stepOutput && stepOutput !== 'undefined') {
                              content =
                                typeof stepOutput === 'string'
                                  ? stepOutput
                                  : JSON.stringify(stepOutput);
                            } else if (
                              currentStepId === step.id &&
                              stepStatus === 'running'
                            ) {
                              content = 'Step is currently running...';
                            } else if (stepStatus === 'failed' && stepError) {
                              content = `Step failed: ${stepError}`;
                            } else if (stepStatus === 'completed' && !stepOutput) {
                              content = 'Step completed but no output available';
                            } else if (stepStatus === 'pending') {
                              content = 'Step is pending execution';
                            } else if (
                              actualExecutionData &&
                              actualExecutionData.steps &&
                              actualExecutionData.steps.length > 0
                            ) {
                              content = 'No output from this step';
                            } else {
                              content =
                                'No output yet - run workflow test to see results';
                            }

                            if (!expandedOutputs.has(step.id) && content) {
                              const lines = content.split('\n');
                              if (lines.length > 2) {
                                return lines.slice(0, 2).join('\n') + '...';
                              }
                            }

                            return content;
                          })()}
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          {expandedOutputs.has(step.id) ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div className="flex justify-center">
                <Link2
                  className={`transition-all duration-500 ${
                    getStepStatus(step.id) === 'completed' &&
                    getStepStatus(steps[idx + 1].id) === 'running'
                      ? 'scale-125 animate-bounce text-blue-500'
                      : getStepStatus(step.id) === 'completed'
                        ? 'text-green-500'
                        : 'text-text-secondary'
                  }`}
                  size={14}
                />
              </div>
            )}
          </React.Fragment>
        ))}

        {/* Add Step Button */}
        {steps.length < MAX_STEPS && (
          <>
            {steps.length > 0 && (
              <div className="flex justify-center">
                <Link2
                  className={`transition-all duration-500 ${
                    steps.length > 0 &&
                    getStepStatus(steps[steps.length - 1].id) === 'completed'
                      ? 'animate-pulse text-green-500'
                      : 'text-text-secondary'
                  }`}
                  size={14}
                />
              </div>
            )}
            <div className={`${isTesting ? 'pointer-events-none opacity-50' : ''}`}>
              <ControlCombobox
                isCollapsed={false}
                ariaLabel="Add step with agent"
                selectedValue={newStepAgentId}
                setValue={(agentId) => {
                  setNewStepAgentId(agentId);
                  if (agentId && steps.length < MAX_STEPS) {
                    const newStep: WorkflowStep = {
                      id: `step_${Date.now()}`,
                      name: `Step ${steps.length + 1}`,
                      agentId: agentId,
                      task: '',
                    };
                    setSteps((prev) => [...prev, newStep]);
                    setNewStepAgentId('');
                  }
                }}
                selectPlaceholder="Select agent to add step"
                searchPlaceholder="Search agents"
                items={selectableAgents}
                displayValue={getAgentDetails(newStepAgentId)?.name ?? ''}
                SelectIcon={<PlusCircle size={14} className="text-text-secondary" />}
                className="h-8 w-full border-dashed border-border-heavy text-center text-sm text-text-secondary hover:text-text-primary sm:h-10"
                disabled={isTesting}
              />
            </div>
          </>
        )}

        {steps.length >= MAX_STEPS && (
          <p className="pt-1 text-center text-xs italic text-text-tertiary">
            Maximum {MAX_STEPS} steps reached
          </p>
        )}
      </div>
    </div>
  );
};

export default StepsPanel;