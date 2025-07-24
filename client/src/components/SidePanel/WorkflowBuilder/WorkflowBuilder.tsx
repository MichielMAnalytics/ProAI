import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { User, Calendar, Activity } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import MessageIcon from '~/components/Share/MessageIcon';
import { Spinner } from '~/components/svg';
import { useAgentsMapContext, useTimezoneContext } from '~/Providers';
import { useMediaQuery, useMCPConnection } from '~/hooks';
import {
  useDeleteWorkflowMutation,
  useToggleWorkflowMutation,
  useTestWorkflowMutation,
  useStopWorkflowMutation,
  useWorkflowQuery,
  useCreateWorkflowMutation,
  useUpdateWorkflowMutation,
  useLatestWorkflowExecutionQuery,
  useAvailableIntegrationsQuery,
  useAppTriggersQuery,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useWorkflowNotifications } from '~/hooks/useWorkflowNotifications';
import ExecutionDashboard from './ExecutionDashboard';
import RequestTriggerModal from './RequestTriggerModal';
import WorkflowHeader from './WorkflowHeader';
import WorkflowTitleSection from './WorkflowTitleSection';
import WorkflowFooter from './WorkflowFooter';
import TriggerPanel from './Trigger/TriggerPanel';
import StepsPanel from './Steps/StepsPanel';
import { useWorkflowState } from '~/hooks/Workflows/useWorkflowState';
import { useWorkflowActions } from '~/hooks/Workflows/useWorkflowActions';
import { useWorkflowValidation } from '~/hooks/Workflows/useWorkflowValidation';
import { generateCronExpression } from './utils/cronHelpers';
import type { WorkflowBuilderProps, TriggerOption, AppTrigger } from './types';
import { BASIC_TRIGGER_VALUES } from './types';
import store from '~/store';

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  onClose,
  workflowId: initialWorkflowId,
}) => {
  const agentsMap = useAgentsMapContext() || {};
  const { showToast } = useToastContext();
  const { timezone } = useTimezoneContext();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { isIntegrationConnected } = useMCPConnection();
  const [hideSidePanel, setHideSidePanel] = useRecoilState(store.hideSidePanel);
  const [testingWorkflows, setTestingWorkflows] = useRecoilState(store.testingWorkflows);
  const [currentWorkflowId, setCurrentWorkflowId] = useState(initialWorkflowId);

  // Store the original sidebar state when component mounts
  const [originalHideSidePanel] = useState(hideSidePanel);

  // Fetch available integrations for app triggers
  const { data: availableIntegrations = [] } = useAvailableIntegrationsQuery();

  // Hide sidebar on mobile when WorkflowBuilder opens
  useEffect(() => {
    if (isMobile && window.innerWidth <= 640) {
      setHideSidePanel(true);
    }

    return () => {
      if (isMobile && window.innerWidth <= 640) {
        setHideSidePanel(originalHideSidePanel);
      }
    };
  }, [isMobile, setHideSidePanel, originalHideSidePanel]);

  // Workflow mutations
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const testMutation = useTestWorkflowMutation();
  const stopMutation = useStopWorkflowMutation();
  const createMutation = useCreateWorkflowMutation();
  const updateMutation = useUpdateWorkflowMutation();

  // Query the current workflow state from the database
  const { data: currentWorkflowData, refetch: refetchWorkflow } = useWorkflowQuery(
    currentWorkflowId || '',
    {
      enabled: !!currentWorkflowId,
      refetchOnWindowFocus: true,
      staleTime: 30000,
    },
  );

  // Query the latest execution result for step outputs
  const { data: latestExecutionData, refetch: refetchLatestExecution } =
    useLatestWorkflowExecutionQuery(currentWorkflowId || '', {
      enabled: !!currentWorkflowId,
      refetchOnWindowFocus: false,
      refetchInterval: false,
      staleTime: 10000,
    });

  // Initialize state with workflow data
  const workflowState = useWorkflowState({
    currentWorkflowData,
    userTimezone: timezone,
  });

  // Fetch triggers for selected app - MOVED HERE so we can access workflowState
  const {
    data: appTriggersData,
    isLoading: isLoadingTriggers,
  } = useAppTriggersQuery(workflowState.selectedAppSlug, {
    enabled: !!workflowState.selectedAppSlug && workflowState.triggerType === 'app',
  });

  // Set selected trigger when app triggers data is loaded
  useEffect(() => {
    if (appTriggersData?.triggers && currentWorkflowData?.trigger?.config?.triggerKey) {
      const trigger = appTriggersData.triggers.find(
        (t: AppTrigger) => t.key === currentWorkflowData.trigger.config.triggerKey,
      );
      if (trigger) {
        workflowState.setSelectedTrigger(trigger);
      }
    }
  }, [appTriggersData, currentWorkflowData, workflowState.setSelectedTrigger]);

  // Initialize validation
  const validation = useWorkflowValidation({
    triggerType: workflowState.triggerType,
    selectedAppSlug: workflowState.selectedAppSlug,
    triggerParameters: workflowState.triggerParameters,
    isIntegrationConnected,
  });

  // Initialize actions
  const actions = useWorkflowActions({
    currentWorkflowId,
    workflowName: workflowState.workflowName,
    triggerType: workflowState.triggerType,
    scheduleConfig: workflowState.scheduleConfig,
    scheduleType: workflowState.scheduleType,
    scheduleTime: workflowState.scheduleTime,
    scheduleDays: workflowState.scheduleDays,
    scheduleDate: workflowState.scheduleDate,
    selectedAppSlug: workflowState.selectedAppSlug,
    selectedTrigger: workflowState.selectedTrigger,
    triggerParameters: workflowState.triggerParameters,
    steps: workflowState.steps,
    createMutation,
    updateMutation,
    showToast,
    refetchWorkflow,
    setCurrentWorkflowId,
    setSteps: workflowState.setSteps,
    setExpandedSteps: workflowState.setExpandedSteps,
    setExpandedOutputs: workflowState.setExpandedOutputs,
    setTestingWorkflows,
    setIsTesting: workflowState.setIsTesting,
    setIsCancelling: workflowState.setIsCancelling,
    setHasReceivedStopNotification: workflowState.setHasReceivedStopNotification,
    setCurrentRunningStepId: workflowState.setCurrentRunningStepId,
    setCompletedStepIds: workflowState.setCompletedStepIds,
    clearExecutionResult: () => {}, // Will be provided by notifications hook
    userTimezone: timezone,
  });

  // Check if we should show loading state for existing workflows
  const isLoadingExistingWorkflow = currentWorkflowId && !currentWorkflowData;

  // Use the current workflow data if available, fallback to default values
  const isWorkflowActive = currentWorkflowData?.isActive ?? false;
  const isDraft = currentWorkflowData?.isDraft ?? true;

  // Check if this workflow is currently being tested
  const isWorkflowTesting = currentWorkflowId ? testingWorkflows.has(currentWorkflowId) : false;

  // Listen for workflow test notifications
  const { clearExecutionResult } = useWorkflowNotifications(
    currentWorkflowId
      ? {
          workflowId: currentWorkflowId,
          onTestStart: (testWorkflowId) => {
            if (testWorkflowId === currentWorkflowId) {
              workflowState.setIsTesting(true);
              workflowState.setCurrentRunningStepId(null);
              workflowState.setCompletedStepIds(new Set());
              setTestingWorkflows((prev) => new Set(prev).add(testWorkflowId));
            }
          },
          onStepUpdate: (testWorkflowId) => {
            if (testWorkflowId === currentWorkflowId) {
              // Handle step updates
            }
          },
          onTestComplete: (testWorkflowId) => {
            if (testWorkflowId === currentWorkflowId) {
              actions.cleanupTestState();
            }
          },
        }
      : {},
  );

  // Update scheduleConfig when user-friendly schedule options change
  useEffect(() => {
    if (workflowState.triggerType === 'schedule' && workflowState.scheduleType !== 'custom') {
      const newCron = generateCronExpression(
        workflowState.scheduleType,
        workflowState.scheduleTime,
        workflowState.scheduleDays,
        workflowState.scheduleDate,
        timezone,
      );
      workflowState.setScheduleConfig(newCron);
    }
  }, [workflowState.triggerType, workflowState.scheduleType, workflowState.scheduleTime, workflowState.scheduleDays, workflowState.scheduleDate, timezone]);

  // Agents and selectable agents
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

  // Create trigger options with clean basic options
  const triggerOptions = useMemo(() => {
    const basicOptions: TriggerOption[] = BASIC_TRIGGER_VALUES.map((option) => ({
      ...option,
      icon: option.value === 'manual' ? <User size={16} /> : 
            option.value === 'schedule' ? <Calendar size={16} /> : 
            <Activity size={16} />
    }));
    
    return basicOptions.map((option) => {
      if (option.value === 'app' && workflowState.triggerType === 'app' && workflowState.selectedAppSlug) {
        return {
          ...option,
          label: 'App',
          value: 'deselect-app',
          icon: option.icon,
        };
      }
      return {
        ...option,
        icon: option.icon,
      };
    });
  }, [workflowState.triggerType, workflowState.selectedAppSlug]);

  // Filter app triggers based on search
  const filteredAppTriggers = useMemo(() => {
    if (!appTriggersData?.triggers) {
      return [];
    }

    const triggers = appTriggersData.triggers as AppTrigger[];

    if (!workflowState.triggerSearchTerm) return triggers;

    return triggers.filter(
      (trigger) =>
        trigger.name.toLowerCase().includes(workflowState.triggerSearchTerm.toLowerCase()) ||
        (trigger.description &&
          trigger.description.toLowerCase().includes(workflowState.triggerSearchTerm.toLowerCase())) ||
        (trigger.category &&
          trigger.category.toLowerCase().includes(workflowState.triggerSearchTerm.toLowerCase())),
    );
  }, [appTriggersData, workflowState.triggerSearchTerm]);

  // Handle trigger type selection
  const handleTriggerTypeChange = (value: string) => {
    if (value === 'deselect-app') {
      workflowState.setSelectedAppSlug('');
      workflowState.setSelectedTrigger(null);
      workflowState.setTriggerParameters({ passTriggerToFirstStep: true });
    } else {
      workflowState.setTriggerType(value as any);

      if (value !== 'app') {
        workflowState.setSelectedAppSlug('');
        workflowState.setSelectedTrigger(null);
        workflowState.setTriggerParameters({});
      }
    }
  };

  // Get display value for trigger selector
  const getTriggerDisplayValue = () => {
    if (workflowState.triggerType === 'app' && workflowState.selectedAppSlug) {
      const integration = availableIntegrations.find((i) => i.appSlug === workflowState.selectedAppSlug);
      return integration ? integration.appName : 'App';
    }
    return triggerOptions.find((t) => t.value === workflowState.triggerType)?.label || '';
  };

  // Get icon for trigger selector
  const getTriggerIcon = () => {
    if (workflowState.triggerType === 'app' && workflowState.selectedAppSlug) {
      const integration = availableIntegrations.find((i) => i.appSlug === workflowState.selectedAppSlug);
      return integration?.appIcon ? (
        <img src={integration.appIcon} alt={integration.appName} className="h-4 w-4" />
      ) : (
        <Activity size={16} />
      );
    }
    return triggerOptions.find((t) => t.value === workflowState.triggerType)?.icon;
  };

  // Workflow management handlers
  const handleToggleWorkflow = async () => {
    if (!currentWorkflowId) return;

    try {
      await actions.handleSave(false);
    } catch (error) {
      return;
    }

    toggleMutation.mutate(
      { workflowId: currentWorkflowId, isActive: !isWorkflowActive },
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
    if (!currentWorkflowId) return;

    deleteMutation.mutate(currentWorkflowId, {
      onSuccess: () => {
        showToast({
          message: 'Workflow deleted successfully',
          severity: NotificationSeverity.SUCCESS,
        });
        onClose();
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

  const handleTestWorkflow = async () => {
    if (!currentWorkflowId) return;

    if (isWorkflowTesting) {
      workflowState.setIsCancelling(true);
      workflowState.setHasReceivedStopNotification(false);

      stopMutation.mutate(currentWorkflowId, {
        onSuccess: () => {
          actions.cleanupTestState();
        },
        onError: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            message: `Failed to stop workflow test: ${errorMessage}`,
            severity: NotificationSeverity.ERROR,
          });
          actions.cleanupTestState();
        },
      });
      return;
    }

    try {
      await actions.handleSave(false);
    } catch (error) {
      return;
    }

    workflowState.setIsTesting(true);
    workflowState.setHasReceivedStopNotification(false);
    setTestingWorkflows((prev) => new Set(prev).add(currentWorkflowId));

    testMutation.mutate(currentWorkflowId, {
      onSuccess: () => {
        workflowState.setIsTesting(false);
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(currentWorkflowId);
          return newSet;
        });
        refetchLatestExecution();
      },
      onError: (error: unknown) => {
        workflowState.setIsTesting(false);
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(currentWorkflowId);
          return newSet;
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          message: `Failed to test workflow: ${errorMessage}`,
          severity: NotificationSeverity.ERROR,
        });
        refetchLatestExecution();
      },
    });
  };

  // Get step status for styling
  const getStepStatus = (stepId: string) => {
    if (!workflowState.isTesting) return 'idle';
    if (workflowState.completedStepIds.has(stepId)) return 'completed';

    const step = workflowState.steps.find((s) => s.id === stepId);
    const actualExecutionData = latestExecutionData as any;
    const currentExecStep = actualExecutionData?.steps?.find((s: any) => s.name === step?.name);

    if (currentExecStep?.status === 'running') return 'running';
    return 'pending';
  };

  // Show loading spinner while fetching workflow data
  if (isLoadingExistingWorkflow) {
    return (
      <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out sm:border">
          <div className="flex flex-1 items-center justify-center gap-2 py-4">
            <Spinner className="text-text-primary" />
            <span className="animate-pulse text-text-primary">Loading workflow...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out sm:border">
          
          {/* Header */}
          <WorkflowHeader
            currentWorkflowId={currentWorkflowId}
            isTesting={workflowState.isTesting}
            showDashboard={workflowState.showDashboard}
            setShowDashboard={workflowState.setShowDashboard}
            onClose={onClose}
          />

          {/* Workflow Title Section */}
          <WorkflowTitleSection
            workflowName={workflowState.workflowName}
            setWorkflowName={workflowState.setWorkflowName}
            currentWorkflowId={currentWorkflowId}
            isWorkflowActive={isWorkflowActive}
            isDraft={isDraft}
            isTesting={workflowState.isTesting}
          />

          {/* Main Content */}
          <div className="relative flex-1 overflow-auto p-3 sm:p-4">
            <div className="space-y-4 sm:space-y-6">
              
              {/* Trigger Configuration */}
              <TriggerPanel
                triggerType={workflowState.triggerType}
                isTriggerExpanded={workflowState.isTriggerExpanded}
                setIsTriggerExpanded={workflowState.setIsTriggerExpanded}
                isTesting={workflowState.isTesting}
                handleTriggerTypeChange={handleTriggerTypeChange}
                getTriggerDisplayValue={getTriggerDisplayValue}
                getTriggerIcon={getTriggerIcon}
                triggerOptions={triggerOptions}
                scheduleType={workflowState.scheduleType}
                setScheduleType={workflowState.setScheduleType}
                scheduleTime={workflowState.scheduleTime}
                setScheduleTime={workflowState.setScheduleTime}
                scheduleDays={workflowState.scheduleDays}
                setScheduleDays={workflowState.setScheduleDays}
                scheduleDate={workflowState.scheduleDate}
                setScheduleDate={workflowState.setScheduleDate}
                scheduleConfig={workflowState.scheduleConfig}
                setScheduleConfig={workflowState.setScheduleConfig}
                selectedAppSlug={workflowState.selectedAppSlug}
                setSelectedAppSlug={workflowState.setSelectedAppSlug}
                selectedTrigger={workflowState.selectedTrigger}
                setSelectedTrigger={workflowState.setSelectedTrigger}
                triggerParameters={workflowState.triggerParameters}
                setTriggerParameters={workflowState.setTriggerParameters}
                setShowRequestTriggerModal={workflowState.setShowRequestTriggerModal}
                availableIntegrations={availableIntegrations}
                appTriggersData={appTriggersData}
                isLoadingTriggers={isLoadingTriggers}
                filteredAppTriggers={filteredAppTriggers}
                isIntegrationConnected={isIntegrationConnected}
                userTimezone={timezone}
              />

              {/* Workflow Steps */}
              <StepsPanel
                steps={workflowState.steps}
                setSteps={workflowState.setSteps}
                newStepAgentId={workflowState.newStepAgentId}
                setNewStepAgentId={workflowState.setNewStepAgentId}
                expandedSteps={workflowState.expandedSteps}
                expandedOutputs={workflowState.expandedOutputs}
                agentsMap={agentsMap}
                selectableAgents={selectableAgents}
                latestExecutionData={latestExecutionData}
                isTesting={workflowState.isTesting}
                removeStep={actions.removeStep}
                updateStep={actions.updateStep}
                toggleStepExpanded={actions.toggleStepExpanded}
                toggleOutputExpanded={actions.toggleOutputExpanded}
                getStepStatus={getStepStatus}
                getAgentDetails={getAgentDetails}
              />
            </div>

            {/* Execution Dashboard */}
            {currentWorkflowId && workflowState.showDashboard && (
              <div className="absolute inset-0 z-50 bg-surface-primary">
                <ExecutionDashboard workflowId={currentWorkflowId} />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <WorkflowFooter
            currentWorkflowId={currentWorkflowId}
            workflowName={workflowState.workflowName}
            steps={workflowState.steps}
            isSaving={workflowState.isSaving}
            isTesting={workflowState.isTesting}
            isWorkflowTesting={isWorkflowTesting}
            isWorkflowActive={isWorkflowActive}
            canTest={validation.canTest}
            canActivate={validation.canActivate}
            testMutation={testMutation}
            stopMutation={stopMutation}
            toggleMutation={toggleMutation}
            deleteMutation={deleteMutation}
            getTestTooltip={validation.getTestTooltip}
            getActivateTooltip={validation.getActivateTooltip}
            handleSave={actions.handleSave}
            handleTestWorkflow={handleTestWorkflow}
            handleToggleWorkflow={handleToggleWorkflow}
            handleDeleteWorkflow={handleDeleteWorkflow}
          />
        </div>
      </div>

      {/* Request Other App Trigger Modal */}
      <RequestTriggerModal
        open={workflowState.showRequestTriggerModal}
        onOpenChange={workflowState.setShowRequestTriggerModal}
      />
    </>
  );
};

export default WorkflowBuilder;