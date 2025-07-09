import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import {
  X,
  Link2,
  PlusCircle,
  Calendar,
  User,
  Clock,
  Zap,
  Settings,
  Save,
  Trash2,
  Play,
  Pause,
  TestTube,
  Square,
  RefreshCw,
} from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '~/components/ui';
import MessageIcon from '~/components/Share/MessageIcon';
import { CircleHelpIcon } from '~/components/svg';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';
import {
  useDeleteWorkflowMutation,
  useToggleWorkflowMutation,
  useTestWorkflowMutation,
  useStopWorkflowMutation,
  useWorkflowQuery,
  useCreateWorkflowMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useWorkflowNotifications } from '~/hooks/useWorkflowNotifications';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import WorkflowTestingOverlay from './WorkflowTestingOverlay';
import store from '~/store';

interface WorkflowStep {
  id: string;
  name: string;
  agentId: string;
  task: string;
}

interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event';
  config: {
    schedule?: string;
    webhookUrl?: string;
    emailAddress?: string;
    eventType?: string;
    parameters?: Record<string, unknown>;
  };
}

interface WorkflowBuilderProps {
  onClose: () => void;
  workflowId?: string; // Allow passing existing workflow ID for editing
}

/** TODO: make configurable */
const MAX_STEPS = 10;

const TRIGGER_OPTIONS = [
  { value: 'manual', label: 'Manual', icon: <User size={16} /> },
  { value: 'schedule', label: 'Schedule', icon: <Calendar size={16} /> },
  { value: 'webhook', label: 'Webhook', icon: <Zap size={16} /> },
  { value: 'email', label: 'Email', icon: <Settings size={16} /> },
  { value: 'event', label: 'Event', icon: <Clock size={16} /> },
];

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ onClose, workflowId }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext() || {};
  const { showToast } = useToastContext();
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [triggerType, setTriggerType] = useState<
    'manual' | 'schedule' | 'webhook' | 'email' | 'event'
  >('manual');
  const [scheduleConfig, setScheduleConfig] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [newStepAgentId, setNewStepAgentId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasReceivedStopNotification, setHasReceivedStopNotification] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [testingWorkflows, setTestingWorkflows] = useRecoilState(store.testingWorkflows);

  // Workflow mutations
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const testMutation = useTestWorkflowMutation();
  const stopMutation = useStopWorkflowMutation();
  const createMutation = useCreateWorkflowMutation();

  // Query the current workflow state from the database (if editing existing workflow)
  const { data: currentWorkflowData, refetch: refetchWorkflow } = useWorkflowQuery(
    workflowId || '',
    {
      enabled: !!workflowId,
      refetchOnWindowFocus: true,
      staleTime: 30000,
    },
  );

  // Load existing workflow data into form when editing
  useEffect(() => {
    if (currentWorkflowData && workflowId) {
      console.log('Loading existing workflow data:', currentWorkflowData);
      
      // Populate form fields with existing workflow data
      setWorkflowName(currentWorkflowData.name || 'New Workflow');
      setWorkflowDescription(currentWorkflowData.description || '');
      setTriggerType(currentWorkflowData.trigger?.type || 'manual');
      setScheduleConfig(currentWorkflowData.trigger?.config?.schedule || '');
      
      // Convert workflow steps to WorkflowStep format
      if (currentWorkflowData.steps && currentWorkflowData.steps.length > 0) {
        const convertedSteps: WorkflowStep[] = currentWorkflowData.steps.map((step) => {
          // Extract agent ID from various possible locations
          let agentId = '';
          if (step.config?.parameters?.agent_id && typeof step.config.parameters.agent_id === 'string') {
            agentId = step.config.parameters.agent_id;
          } else if (step.config?.toolName && typeof step.config.toolName === 'string' && step.config.toolName.startsWith('agent_')) {
            agentId = step.config.toolName.replace('agent_', '');
          }
          
          // Extract task/instruction
          let task = '';
          if (step.config?.parameters?.instruction && typeof step.config.parameters.instruction === 'string') {
            task = step.config.parameters.instruction;
          }
          
          return {
            id: step.id,
            name: step.name,
            agentId: agentId,
            task: task,
          };
        });
        setSteps(convertedSteps);
      } else {
        // Start with empty steps for new workflow
        setSteps([]);
      }
    }
  }, [currentWorkflowData, workflowId]);

  // Use the current workflow data if available, fallback to default values
  const isWorkflowActive = currentWorkflowData?.isActive ?? false;
  const isDraft = currentWorkflowData?.isDraft ?? true;

  // Check if this workflow is currently being tested
  const isWorkflowTesting = workflowId ? testingWorkflows.has(workflowId) : false;

  // Listen for workflow test notifications (only if workflowId exists)
  const {
    isWorkflowTesting: isWorkflowTestingFromHook,
    getCurrentStep,
    getExecutionResult,
    clearExecutionResult,
  } = useWorkflowNotifications(
    workflowId
      ? {
          workflowId,
          onTestStart: (testWorkflowId) => {
            if (testWorkflowId === workflowId) {
              setIsTesting(true);
              setTestingWorkflows((prev) => new Set(prev).add(testWorkflowId));
            }
          },
          onStepUpdate: (testWorkflowId, stepData) => {
            if (testWorkflowId === workflowId) {
              // getCurrentStep handles step state internally
            }
          },
          onTestComplete: (testWorkflowId, success, result) => {
            if (testWorkflowId === workflowId) {
              // Check if this is the immediate stop notification
              if (
                result?.error === 'Execution stopped by user' &&
                isCancelling &&
                !hasReceivedStopNotification
              ) {
                setHasReceivedStopNotification(true);
                setIsTesting(false);
                setTestingWorkflows((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(testWorkflowId);
                  return newSet;
                });
                return;
              }

              // Final completion
              setIsTesting(false);
              setIsCancelling(false);
              setHasReceivedStopNotification(false);
              setTestingWorkflows((prev) => {
                const newSet = new Set(prev);
                newSet.delete(testWorkflowId);
                return newSet;
              });
            }
          },
        }
      : {},
  );

  // Status helper functions
  const getStatusColor = (isActive: boolean, isDraft: boolean) => {
    if (isActive) {
      return 'bg-green-100 text-green-700';
    }
    if (isDraft) {
      return 'bg-orange-100 text-orange-700';
    }
    return 'bg-gray-100 text-gray-600';
  };

  const getStatusText = (isActive: boolean, isDraft: boolean) => {
    if (isActive) return 'active';
    if (isDraft) return 'draft';
    return 'inactive';
  };

  // Workflow management handlers
  const handleToggleWorkflow = () => {
    if (!workflowId) return;

    toggleMutation.mutate(
      { workflowId, isActive: !isWorkflowActive },
      {
        onSuccess: () => {
          showToast({
            message: `Workflow ${isWorkflowActive ? 'deactivated' : 'activated'} successfully`,
            severity: NotificationSeverity.SUCCESS,
          });
          refetchWorkflow();
        },
        onError: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            message: `Failed to ${isWorkflowActive ? 'deactivate' : 'activate'} workflow: ${errorMessage}`,
            severity: NotificationSeverity.ERROR,
          });
        },
      },
    );
  };

  const handleDeleteWorkflow = () => {
    if (!workflowId) return;

    deleteMutation.mutate(workflowId, {
      onSuccess: () => {
        showToast({
          message: 'Workflow deleted successfully',
          severity: NotificationSeverity.SUCCESS,
        });
        onClose(); // Close workflow builder since workflow is deleted
      },
      onError: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          message: `Failed to delete workflow: ${errorMessage}`,
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  const handleTestWorkflow = () => {
    if (!workflowId) return;

    // If workflow is currently testing, stop it
    if (isWorkflowTesting) {
      setIsCancelling(true);
      setHasReceivedStopNotification(false);

      stopMutation.mutate(workflowId, {
        onSuccess: () => {
          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(workflowId);
            return newSet;
          });
          setIsTesting(false);
          if (workflowId) {
            clearExecutionResult(workflowId);
          }
        },
        onError: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            message: `Failed to stop workflow test: ${errorMessage}`,
            severity: NotificationSeverity.ERROR,
          });
          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(workflowId);
            return newSet;
          });
          setIsTesting(false);
          setIsCancelling(false);
        },
      });
      return;
    }

    // Otherwise, start testing
    setIsTesting(true);
    setHasReceivedStopNotification(false);
    setTestingWorkflows((prev) => new Set(prev).add(workflowId));

    testMutation.mutate(workflowId, {
      onSuccess: (response) => {
        setIsTesting(false);
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(workflowId);
          return newSet;
        });
      },
      onError: (error: unknown) => {
        setIsTesting(false);
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(workflowId);
          return newSet;
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          message: `Failed to test workflow: ${errorMessage}`,
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  // Get current step and result from the hook
  const currentStep = workflowId ? getCurrentStep(workflowId) : null;
  const resultData = workflowId ? getExecutionResult(workflowId) : null;

  const handleCloseResult = () => {
    if (workflowId) {
      clearExecutionResult(workflowId);
    }
  };

  const agents = useMemo(() => Object.values(agentsMap), [agentsMap]);

  const selectableAgents = useMemo(
    () =>
      agents.map(
        (agent) =>
          ({
            label: agent?.name || '',
            value: agent?.id,
            icon: (
              <MessageIcon
                message={
                  {
                    endpoint: EModelEndpoint.agents,
                    isCreatedByUser: false,
                  } as TMessage
                }
                agent={agent}
              />
            ),
          }) as OptionWithIcon,
      ),
    [agents],
  );

  const getAgentDetails = useCallback((id: string) => agentsMap[id], [agentsMap]);

  const triggerOptions = useMemo(
    () =>
      TRIGGER_OPTIONS.map((option) => ({
        ...option,
        icon: option.icon,
      })),
    [],
  );

  const addStep = useCallback(() => {
    if (newStepAgentId && steps.length < MAX_STEPS) {
      const newStep: WorkflowStep = {
        id: `step_${Date.now()}`,
        name: `Step ${steps.length + 1}`,
        agentId: newStepAgentId,
        task: '',
      };
      setSteps((prev) => [...prev, newStep]);
      setNewStepAgentId('');
    }
  }, [newStepAgentId, steps]);

  const removeStep = useCallback((stepId: string) => {
    setSteps((prev) => prev.filter((step) => step.id !== stepId));
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<WorkflowStep>) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId
          ? {
              ...step,
              ...updates,
            }
          : step,
      ),
    );
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      if (workflowId) {
        // Update existing workflow
        const updateData = {
          name: workflowName,
          description: workflowDescription,
          trigger: {
            type: triggerType,
            config: triggerType === 'schedule' ? { schedule: scheduleConfig || '0 9 * * *' } : {},
          },
          steps: steps.map((step) => ({
            id: step.id,
            name: step.name,
            type: 'mcp_agent_action' as const,
            config: {
              toolName: `agent_${step.agentId}`,
              parameters: {
                instruction: step.task,
                agent_id: step.agentId,
              },
            },
          })),
        };

        // Use update mutation instead of create
        // Note: You might need to import and use an update mutation here
        // For now, using the create mutation as a placeholder
        const result = await createMutation.mutateAsync(updateData);
        
        showToast({
          message: `Workflow "${result.name}" updated successfully!`,
          severity: NotificationSeverity.SUCCESS,
        });
      } else {
        // Create new workflow
        const workflowId = `workflow_${Date.now()}`;
        
        const workflowData = {
          id: workflowId,
          name: workflowName,
          description: workflowDescription,
          trigger: {
            type: triggerType,
            config: triggerType === 'schedule' ? { schedule: scheduleConfig || '0 9 * * *' } : {},
          },
          steps: steps.map((step) => ({
            id: step.id,
            name: step.name,
            type: 'mcp_agent_action' as const,
            config: {
              toolName: `agent_${step.agentId}`,
              parameters: {
                instruction: step.task,
                agent_id: step.agentId,
              },
            },
          })),
          isActive: false, // Start inactive by default
          isDraft: false, // Mark as not draft since we're saving
          version: 1,
        };

        const result = await createMutation.mutateAsync(workflowData);
        
        showToast({
          message: `Workflow "${result.name}" created successfully!`,
          severity: NotificationSeverity.SUCCESS,
        });
      }
      
      // Don't close the workflow builder - keep it open for continued editing
    } catch (error) {
      console.error('Error saving workflow:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast({
        message: `Failed to save workflow: ${errorMessage}`,
        severity: NotificationSeverity.ERROR,
      });
    } finally {
      setIsSaving(false);
    }
  }, [workflowId, workflowName, workflowDescription, triggerType, scheduleConfig, steps, createMutation, showToast]);

  const handleClear = useCallback(() => {
    if (confirm('Are you sure you want to clear all workflow data?')) {
      setWorkflowName('New Workflow');
      setWorkflowDescription('');
      setTriggerType('manual');
      setScheduleConfig('');
      setSteps([]);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
      {/* Main Container - Full width on mobile, full height on desktop */}
      <div className="flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out sm:border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2 sm:p-3">
          {/* Left: Close button */}
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Center: Title */}
          <div className="flex-1 text-center">
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">Workflow Builder</h2>
            {/* Status Badge - only show if editing existing workflow */}
            {workflowId && (
              <span
                className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 font-inter text-xs font-medium ${getStatusColor(
                  isWorkflowActive || false,
                  isDraft || false,
                )}`}
              >
                {getStatusText(isWorkflowActive || false, isDraft || false)}
              </span>
            )}
          </div>

          {/* Right: Empty placeholder for alignment */}
          <div className="h-7 w-7 sm:h-8 sm:w-8" />
        </div>

        {/* Main Content */}
        <div className="relative flex-1 overflow-auto p-3 sm:p-4">
          <div className="space-y-4 sm:space-y-6">
            {/* Workflow Name and Description */}
            <div className="space-y-2">
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="w-full border-none bg-transparent text-lg font-bold text-text-primary focus:outline-none focus:ring-0 sm:text-xl"
                placeholder="Workflow Name"
              />
              <textarea
                value={workflowDescription}
                onChange={(e) => setWorkflowDescription(e.target.value)}
                className="w-full resize-none border-none bg-transparent text-sm text-text-secondary focus:outline-none focus:ring-0"
                placeholder="Workflow description..."
                rows={2}
              />
            </div>

            {/* Trigger Configuration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-text-primary sm:text-lg">Trigger</h3>
              </div>
              <div className="space-y-2">
                <ControlCombobox
                  isCollapsed={false}
                  ariaLabel="Select trigger type"
                  selectedValue={triggerType}
                  setValue={(value) => setTriggerType(value as any)}
                  selectPlaceholder="Select trigger type"
                  searchPlaceholder="Search trigger types"
                  items={triggerOptions}
                  displayValue={triggerOptions.find((t) => t.value === triggerType)?.label || ''}
                  SelectIcon={triggerOptions.find((t) => t.value === triggerType)?.icon}
                  className="h-8 w-full border-border-heavy text-sm sm:h-10"
                />
                {triggerType === 'schedule' && (
                  <input
                    type="text"
                    value={scheduleConfig}
                    onChange={(e) => setScheduleConfig(e.target.value)}
                    className="w-full rounded-md border border-border-heavy p-2 text-sm focus:border-blue-500 focus:outline-none sm:p-3"
                    placeholder="0 9 * * * (Every day at 9 AM)"
                  />
                )}
              </div>
            </div>

            {/* Workflow Steps */}
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
                    <div className="rounded-lg border border-border-medium bg-surface-tertiary p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => updateStep(step.id, { name: e.target.value })}
                          className="border-none bg-transparent text-sm font-medium text-text-primary focus:outline-none"
                          placeholder="Step name"
                        />
                        <button
                          className="rounded-xl p-1 transition hover:bg-surface-hover"
                          onClick={() => removeStep(step.id)}
                        >
                          <X size={14} className="text-text-secondary" />
                        </button>
                      </div>
                      <div className="space-y-2">
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
                          className="h-8 w-full border-border-heavy text-sm sm:h-10"
                        />
                        <textarea
                          value={step.task}
                          onChange={(e) => updateStep(step.id, { task: e.target.value })}
                          className="w-full resize-none rounded-md border border-border-heavy p-2 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="Describe the task for this agent..."
                          rows={2}
                        />
                      </div>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex justify-center">
                        <Link2 className="text-text-secondary" size={14} />
                      </div>
                    )}
                  </React.Fragment>
                ))}

                {/* Add Step Button */}
                {steps.length < MAX_STEPS && (
                  <>
                    {steps.length > 0 && (
                      <div className="flex justify-center">
                        <Link2 className="text-text-secondary" size={14} />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <ControlCombobox
                        isCollapsed={false}
                        ariaLabel="Add step with agent"
                        selectedValue={newStepAgentId}
                        setValue={setNewStepAgentId}
                        selectPlaceholder="Select agent to add step"
                        searchPlaceholder="Search agents"
                        items={selectableAgents}
                        displayValue={getAgentDetails(newStepAgentId)?.name ?? ''}
                        SelectIcon={<PlusCircle size={14} className="text-text-secondary" />}
                        className="h-8 flex-1 border-dashed border-border-heavy text-center text-sm text-text-secondary hover:text-text-primary sm:h-10"
                      />
                      <button
                        onClick={addStep}
                        disabled={!newStepAgentId}
                        className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:px-4 sm:py-2"
                      >
                        Add
                      </button>
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
          </div>

          {/* Testing Overlay */}
          {workflowId && (
            <WorkflowTestingOverlay
              workflowId={workflowId}
              isTesting={isTesting}
              isCancelling={isCancelling}
              isWorkflowTestingFromHook={isWorkflowTestingFromHook}
              currentStep={currentStep || null}
              resultData={resultData || null}
              onCloseResult={handleCloseResult}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 border-t border-border-medium bg-surface-primary-alt p-2 sm:p-3">
          <div className="flex gap-2">
            {/* Left side: Workflow management buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Test/Stop Button */}
              <TooltipAnchor
                description={
                  !workflowId
                    ? 'Save workflow first to test'
                    : isWorkflowTesting
                      ? 'Stop workflow test'
                      : 'Test workflow'
                }
                side="top"
              >
                <button
                  className={`flex h-8 w-8 items-center justify-center rounded-md shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
                    !workflowId
                      ? 'border border-gray-300 bg-gray-100 text-gray-400'
                      : isWorkflowTesting
                        ? 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 hover:border-red-500 hover:from-red-600 hover:to-red-700'
                        : 'border border-brand-blue/60 bg-gradient-to-r from-brand-blue to-indigo-600 hover:border-brand-blue hover:from-indigo-600 hover:to-blue-700'
                  }`}
                  onClick={handleTestWorkflow}
                  disabled={!workflowId || (!isWorkflowTesting ? testMutation.isLoading : stopMutation.isLoading)}
                >
                  {isWorkflowTesting ? (
                    <Square className="h-3 w-3 text-white sm:h-4 sm:w-4" />
                  ) : (
                    <TestTube className={`h-3 w-3 sm:h-4 sm:w-4 ${!workflowId ? 'text-gray-400' : 'text-white'}`} />
                  )}
                </button>
              </TooltipAnchor>

              {/* Toggle Button */}
              <TooltipAnchor
                description={
                  !workflowId
                    ? 'Save workflow first to activate'
                    : isWorkflowActive
                      ? 'Deactivate workflow'
                      : 'Activate workflow'
                }
                side="top"
              >
                <button
                  className={`flex h-8 w-8 items-center justify-center rounded-md shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
                    !workflowId
                      ? 'border border-gray-300 bg-gray-100 text-gray-400'
                      : isWorkflowActive
                        ? 'border border-amber-500/60 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:border-amber-500 hover:from-amber-600 hover:to-orange-700'
                        : 'border border-green-500/60 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:border-green-500 hover:from-green-600 hover:to-emerald-700'
                  }`}
                  onClick={handleToggleWorkflow}
                  disabled={!workflowId || toggleMutation.isLoading || isWorkflowTesting || isTesting}
                >
                  {toggleMutation.isLoading ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-white sm:h-4 sm:w-4" />
                  ) : isWorkflowActive ? (
                    <Pause className="h-3 w-3 text-white sm:h-4 sm:w-4" />
                  ) : (
                    <Play className={`h-3 w-3 sm:h-4 sm:w-4 ${!workflowId ? 'text-gray-400' : 'text-white'}`} />
                  )}
                </button>
              </TooltipAnchor>

              {/* Delete Button */}
              <TooltipAnchor
                description={!workflowId ? 'Save workflow first to delete' : 'Delete workflow'}
                side="top"
              >
                <button
                  className={`flex h-8 w-8 items-center justify-center rounded-md shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
                    !workflowId
                      ? 'border border-gray-300 bg-gray-100 text-gray-400'
                      : 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white hover:border-red-500 hover:from-red-600 hover:to-red-700'
                  }`}
                  onClick={handleDeleteWorkflow}
                  disabled={!workflowId || deleteMutation.isLoading || isWorkflowTesting || isTesting}
                >
                  <Trash2 className={`h-3 w-3 sm:h-4 sm:w-4 ${!workflowId ? 'text-gray-400' : 'text-white'}`} />
                </button>
              </TooltipAnchor>
            </div>

            {/* Right side: Save button */}
            <div className="flex flex-1 gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving || !workflowName || steps.length === 0}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:gap-2 sm:px-4 sm:py-2"
              >
                <Save size={14} />
                {isSaving ? 'Saving...' : 'Save Workflow'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
