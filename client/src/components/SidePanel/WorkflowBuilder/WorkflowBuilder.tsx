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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  BarChart3,
} from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '~/components/ui';
import MessageIcon from '~/components/Share/MessageIcon';
import { CircleHelpIcon, Spinner } from '~/components/svg';
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
  useUpdateWorkflowMutation,
  useLatestWorkflowExecutionQuery,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useWorkflowNotifications } from '~/hooks/useWorkflowNotifications';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import WorkflowTestingOverlay from './WorkflowTestingOverlay';
import MCPServerIcons from '~/components/Chat/Input/MCPServerIcons';
import ExecutionDashboard from '~/components/SidePanel/WorkflowBuilder/ExecutionDashboard';
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

// Helper function to convert user-friendly schedule to cron expression
const generateCronExpression = (type: string, time: string, days: number[], date: number): string => {
  const [hour, minute] = time.split(':');
  
  switch (type) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      const cronDays = days.map(day => day === 7 ? 0 : day).join(','); // Convert Sunday from 7 to 0
      return `${minute} ${hour} * * ${cronDays}`;
    case 'monthly':
      return `${minute} ${hour} ${date} * *`;
    default:
      return '0 9 * * *'; // Default fallback
  }
};

// Helper function to parse cron expression to user-friendly format
const parseCronExpression = (cron: string): { type: string; time: string; days: number[]; date: number } => {
  const parts = cron.trim().split(' ');
  if (parts.length !== 5) {
    return { type: 'daily', time: '09:00', days: [1], date: 1 };
  }
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  
  if (dayOfWeek !== '*') {
    // Weekly schedule
    const days = dayOfWeek.split(',').map(d => d === '0' ? 7 : parseInt(d)).filter(d => !isNaN(d));
    return { type: 'weekly', time, days, date: 1 };
  } else if (dayOfMonth !== '*') {
    // Monthly schedule
    const date = parseInt(dayOfMonth) || 1;
    return { type: 'monthly', time, days: [1], date };
  } else {
    // Daily schedule
    return { type: 'daily', time, days: [1], date: 1 };
  }
};

const TRIGGER_OPTIONS = [
  { value: 'manual', label: 'Manual', icon: <User size={16} />, disabled: false },
  { value: 'schedule', label: 'Schedule', icon: <Calendar size={16} />, disabled: false },
  { value: 'webhook', label: 'Webhook', icon: <Zap size={16} />, disabled: true },
  { value: 'email', label: 'Email', icon: <Settings size={16} />, disabled: true },
  { value: 'event', label: 'Event', icon: <Clock size={16} />, disabled: true },
];

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ onClose, workflowId: initialWorkflowId }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext() || {};
  const { showToast } = useToastContext();
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [triggerType, setTriggerType] = useState<
    'manual' | 'schedule' | 'webhook' | 'email' | 'event'
  >('manual');
  const [scheduleConfig, setScheduleConfig] = useState('');
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]); // 1 = Monday
  const [scheduleDate, setScheduleDate] = useState(1); // Day of month
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [newStepAgentId, setNewStepAgentId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasReceivedStopNotification, setHasReceivedStopNotification] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const [isTriggerExpanded, setIsTriggerExpanded] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [currentRunningStepId, setCurrentRunningStepId] = useState<string | null>(null);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [testingWorkflows, setTestingWorkflows] = useRecoilState(store.testingWorkflows);
  const currentWorkflowId = initialWorkflowId;

  // Workflow mutations
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const testMutation = useTestWorkflowMutation();
  const stopMutation = useStopWorkflowMutation();
  const createMutation = useCreateWorkflowMutation();
  const updateMutation = useUpdateWorkflowMutation();

  // Query the current workflow state from the database (if editing existing workflow)
  const { data: currentWorkflowData, refetch: refetchWorkflow } = useWorkflowQuery(
    currentWorkflowId || '',
    {
      enabled: !!currentWorkflowId,
      refetchOnWindowFocus: true,
      staleTime: 30000,
    },
  );

  // Query the latest execution result for step outputs
  const { data: latestExecutionData, refetch: refetchLatestExecution } = useLatestWorkflowExecutionQuery(
    currentWorkflowId || '',
    {
      enabled: !!currentWorkflowId,
      refetchOnWindowFocus: false,
      refetchInterval: isTesting ? 2000 : false, // Poll every 2 seconds while testing
      staleTime: 10000,
    },
  );


  // Check if we should show loading state for existing workflows
  const isLoadingExistingWorkflow = currentWorkflowId && !currentWorkflowData;

  // Load existing workflow data into form when editing
  useEffect(() => {
    if (currentWorkflowData && currentWorkflowId) {
      console.log('Loading existing workflow data:', currentWorkflowData);
      
      // Populate form fields with existing workflow data
      setWorkflowName(currentWorkflowData.name || 'New Workflow');
      setTriggerType(currentWorkflowData.trigger?.type || 'manual');
      
      const existingSchedule = currentWorkflowData.trigger?.config?.schedule || '';
      setScheduleConfig(existingSchedule);
      
      // Parse existing cron expression to user-friendly format
      if (existingSchedule && currentWorkflowData.trigger?.type === 'schedule') {
        const parsed = parseCronExpression(existingSchedule);
        setScheduleType(parsed.type as 'daily' | 'weekly' | 'monthly' | 'custom');
        setScheduleTime(parsed.time);
        setScheduleDays(parsed.days);
        setScheduleDate(parsed.date);
      }
      
      // Convert workflow steps to WorkflowStep format
      if (currentWorkflowData.steps && currentWorkflowData.steps.length > 0) {
        const convertedSteps: WorkflowStep[] = currentWorkflowData.steps.map((step) => {
          return {
            id: step.id,
            name: step.name,
            agentId: step.agent_id || '',
            task: step.instruction || '',
          };
        });
        setSteps(convertedSteps);
        // Expand all steps by default when loading existing workflow
        setExpandedSteps(new Set(convertedSteps.map(step => step.id)));
      } else {
        // Start with empty steps for new workflow
        setSteps([]);
      }
    }
  }, [currentWorkflowData, currentWorkflowId]);

  // Use the current workflow data if available, fallback to default values
  const isWorkflowActive = currentWorkflowData?.isActive ?? false;
  const isDraft = currentWorkflowData?.isDraft ?? true;

  // Check if this workflow is currently being tested
  const isWorkflowTesting = currentWorkflowId ? testingWorkflows.has(currentWorkflowId) : false;

  // Listen for workflow test notifications (only if currentWorkflowId exists)
  const {
    isWorkflowTesting: isWorkflowTestingFromHook,
    getCurrentStep,
    getExecutionResult,
    clearExecutionResult,
  } = useWorkflowNotifications(
    currentWorkflowId
      ? {
          workflowId: currentWorkflowId,
          onTestStart: (testWorkflowId) => {
            if (testWorkflowId === currentWorkflowId) {
              setIsTesting(true);
              setCurrentRunningStepId(null);
              setCompletedStepIds(new Set());
              setTestingWorkflows((prev) => new Set(prev).add(testWorkflowId));
            }
          },
          onStepUpdate: (testWorkflowId, stepData) => {
            if (testWorkflowId === currentWorkflowId) {
              // getCurrentStep handles step state internally
            }
          },
          onTestComplete: (testWorkflowId, success, result) => {
            if (testWorkflowId === currentWorkflowId) {
              // Check if this is the immediate stop notification
              if (
                result?.error === 'Execution stopped by user' &&
                isCancelling &&
                !hasReceivedStopNotification
              ) {
                setHasReceivedStopNotification(true);
                setIsTesting(false);
                setCurrentRunningStepId(null);
                setCompletedStepIds(new Set());
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
              setCurrentRunningStepId(null);
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
  const handleToggleWorkflow = async () => {
    if (!currentWorkflowId) return;

    // Auto-save workflow before toggling
    try {
      await handleSave();
    } catch (error) {
      // If save fails, don't proceed with toggle
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

  const handleTestWorkflow = async () => {
    if (!currentWorkflowId) return;

    // If workflow is currently testing, stop it
    if (isWorkflowTesting) {
      setIsCancelling(true);
      setHasReceivedStopNotification(false);

      stopMutation.mutate(currentWorkflowId, {
        onSuccess: () => {
          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(currentWorkflowId);
            return newSet;
          });
          setIsTesting(false);
          setCurrentRunningStepId(null);
          setCompletedStepIds(new Set());
          if (currentWorkflowId) {
            clearExecutionResult(currentWorkflowId);
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
            newSet.delete(currentWorkflowId);
            return newSet;
          });
          setIsTesting(false);
          setIsCancelling(false);
          setCurrentRunningStepId(null);
          setCompletedStepIds(new Set());
        },
      });
      return;
    }

    // Auto-save workflow before testing
    try {
      await handleSave();
    } catch (error) {
      // If save fails, don't proceed with test
      return;
    }

    // Otherwise, start testing
    setIsTesting(true);
    setHasReceivedStopNotification(false);
    setTestingWorkflows((prev) => new Set(prev).add(currentWorkflowId));

    testMutation.mutate(currentWorkflowId, {
      onSuccess: (response) => {
        setIsTesting(false);
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(currentWorkflowId);
          return newSet;
        });
        // Refetch the latest execution data to get step outputs
        refetchLatestExecution();
      },
      onError: (error: unknown) => {
        setIsTesting(false);
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
        // Also refetch in case of error to show any partial results
        refetchLatestExecution();
      },
    });
  };

  // Get current step and result from the hook
  const currentStep = currentWorkflowId ? getCurrentStep(currentWorkflowId) : null;
  const resultData = currentWorkflowId ? getExecutionResult(currentWorkflowId) : null;

  const handleCloseResult = () => {
    if (currentWorkflowId) {
      clearExecutionResult(currentWorkflowId);
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


  const removeStep = useCallback((stepId: string) => {
    setSteps((prev) => {
      const filteredSteps = prev.filter((step) => step.id !== stepId);
      // Renumber the remaining steps
      return filteredSteps.map((step, index) => ({
        ...step,
        name: `Step ${index + 1}`,
      }));
    });
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

  const toggleOutputExpanded = useCallback((stepId: string) => {
    setExpandedOutputs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  }, []);

  const toggleStepExpanded = useCallback((stepId: string) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  }, []);

  // Track current step execution state
  useEffect(() => {
    if (isTesting && latestExecutionData) {
      const actualExecutionData = latestExecutionData as any;
      const currentStepId = actualExecutionData?.currentStepId;
      
      if (currentStepId) {
        setCurrentRunningStepId(currentStepId);
        
        // Update completed steps based on execution data
        if (actualExecutionData?.steps) {
          const completed = new Set<string>();
          actualExecutionData.steps.forEach((execStep: any) => {
            if (execStep.status === 'completed') {
              // Find matching step by name since IDs might differ
              const matchingStep = steps.find(s => s.name === execStep.name);
              if (matchingStep) {
                completed.add(matchingStep.id);
              }
            }
          });
          setCompletedStepIds(completed);
        }
      }
    }
  }, [isTesting, latestExecutionData, steps]);

  // Get step status for styling
  const getStepStatus = (stepId: string) => {
    if (!isTesting) return 'idle';
    if (completedStepIds.has(stepId)) return 'completed';
    
    // Check if this step is currently running by matching name
    const step = steps.find(s => s.id === stepId);
    const actualExecutionData = latestExecutionData as any;
    const currentExecStep = actualExecutionData?.steps?.find((s: any) => s.name === step?.name);
    
    if (currentExecStep?.status === 'running') return 'running';
    return 'pending';
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      if (currentWorkflowId) {
        // Update existing workflow (creates new version)
        const updateData = {
          name: workflowName,
          trigger: {
            type: triggerType,
            config: triggerType === 'schedule' ? { 
              schedule: scheduleType === 'custom' 
                ? (scheduleConfig || '0 9 * * *') 
                : generateCronExpression(scheduleType, scheduleTime, scheduleDays, scheduleDate)
            } : {},
          },
          steps: steps.map((step) => ({
            id: step.id,
            name: step.name,
            type: 'mcp_agent_action' as const,
            instruction: step.task,
            agent_id: step.agentId,
          })),
          isDraft: false,
        };

        const result = await updateMutation.mutateAsync({ workflowId: currentWorkflowId, data: updateData });
        
        showToast({
          message: `Workflow "${result.name}" updated successfully!`,
          severity: NotificationSeverity.SUCCESS,
        });
        
        // Refresh the workflow data to show the new version
        refetchWorkflow();
      } else {
        // Create new workflow
        const workflowId = `workflow_${Date.now()}`;
        
        const workflowData = {
          id: workflowId,
          name: workflowName,
          trigger: {
            type: triggerType,
            config: triggerType === 'schedule' ? { 
              schedule: scheduleType === 'custom' 
                ? (scheduleConfig || '0 9 * * *') 
                : generateCronExpression(scheduleType, scheduleTime, scheduleDays, scheduleDate)
            } : {},
          },
          steps: steps.map((step) => ({
            id: step.id,
            name: step.name,
            type: 'mcp_agent_action' as const,
            instruction: step.task,
            agent_id: step.agentId,
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
  }, [currentWorkflowId, workflowName, triggerType, scheduleConfig, scheduleType, scheduleTime, scheduleDays, scheduleDate, steps, createMutation, updateMutation, showToast, refetchWorkflow]);

  // Update scheduleConfig when user-friendly schedule options change
  useEffect(() => {
    if (triggerType === 'schedule' && scheduleType !== 'custom') {
      const newCron = generateCronExpression(scheduleType, scheduleTime, scheduleDays, scheduleDate);
      setScheduleConfig(newCron);
    }
  }, [triggerType, scheduleType, scheduleTime, scheduleDays, scheduleDate]);

  // Show loading spinner while fetching workflow data
  if (isLoadingExistingWorkflow) {
    return (
      <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out sm:border">
          <div className="flex items-center justify-center gap-2 py-4 flex-1">
            <Spinner className="text-text-primary" />
            <span className="animate-pulse text-text-primary">Loading workflow...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
      {/* Main Container - Full width on mobile, full height on desktop */}
      <div className="flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out sm:border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2 sm:p-3">
          {/* Left: Close button */}
          <button
            onClick={onClose}
            disabled={isTesting}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8 ${
              isTesting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Center: Title */}
          <div className="flex-1 flex items-center justify-center">
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">Workflow Builder</h2>
          </div>

          {/* Right: Builder/Runs toggle */}
          <div className="flex items-center">
            <div className="flex rounded-md border border-border-medium bg-surface-secondary p-0.5">
              <button
                onClick={() => setShowDashboard(false)}
                disabled={isTesting}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors sm:px-3 sm:text-sm ${
                  !showDashboard
                    ? 'bg-surface-primary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                } ${isTesting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Builder
              </button>
              <button
                onClick={() => setShowDashboard(true)}
                disabled={isTesting || !currentWorkflowId}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors sm:px-3 sm:text-sm ${
                  showDashboard
                    ? 'bg-surface-primary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                } ${isTesting || !currentWorkflowId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Runs
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative flex-1 overflow-auto p-3 sm:p-4">
          <div className="space-y-4 sm:space-y-6">
            {/* Workflow Name */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  disabled={isTesting}
                  className={`flex-1 border-none bg-transparent text-lg font-bold text-text-primary focus:outline-none focus:ring-0 sm:text-xl ${
                    isTesting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  placeholder="Workflow Name"
                />
                {/* Status Badge - only show if editing existing workflow */}
                {currentWorkflowId && (
                  <span
                    className={`inline-flex items-center rounded-md px-3 py-1.5 font-inter text-sm font-medium ml-3 ${getStatusColor(
                      isWorkflowActive || false,
                      isDraft || false,
                    )}`}
                  >
                    {isWorkflowActive && (
                      <span className="mr-2 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    )}
                    {getStatusText(isWorkflowActive || false, isDraft || false)}
                  </span>
                )}
              </div>
            </div>

            {/* Trigger Configuration */}
            <div className="space-y-3">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setIsTriggerExpanded(!isTriggerExpanded)}
              >
                <h3 className="text-base font-semibold text-text-primary sm:text-lg">Trigger</h3>
                {isTriggerExpanded ? (
                  <ChevronUp size={20} className="text-text-secondary" />
                ) : (
                  <ChevronDown size={20} className="text-text-secondary" />
                )}
              </div>
              
              {isTriggerExpanded && (
                <div className="space-y-2">
                <ControlCombobox
                  isCollapsed={false}
                  ariaLabel="Select trigger type"
                  selectedValue={triggerType}
                  setValue={(value) => {
                    // Prevent selecting disabled trigger types
                    const selectedOption = TRIGGER_OPTIONS.find(option => option.value === value);
                    if (selectedOption && !selectedOption.disabled) {
                      setTriggerType(value as any);
                    }
                  }}
                  selectPlaceholder="Select trigger type"
                  searchPlaceholder="Search trigger types"
                  items={triggerOptions}
                  displayValue={triggerOptions.find((t) => t.value === triggerType)?.label || ''}
                  SelectIcon={triggerOptions.find((t) => t.value === triggerType)?.icon}
                  className={`h-8 w-full border-border-heavy text-sm sm:h-10 ${
                    isTesting ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  disabled={isTesting}
                />
                {triggerType === 'schedule' && (
                  <div className="space-y-3">
                    {/* Schedule Type Selection */}
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        How often should this run?
                      </label>
                      <select
                        value={scheduleType}
                        onChange={(e) => setScheduleType(e.target.value as 'daily' | 'weekly' | 'monthly' | 'custom')}
                        disabled={isTesting}
                        className={`w-full rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                          isTesting ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <option value="daily">Every day</option>
                        <option value="weekly">Weekly (specific days)</option>
                        <option value="monthly">Monthly (specific date)</option>
                        <option value="custom">Custom (cron expression)</option>
                      </select>
                    </div>

                    {/* Time Selection */}
                    {scheduleType !== 'custom' && (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          What time?
                        </label>
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          disabled={isTesting}
                          className={`w-full rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                            isTesting ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        />
                      </div>
                    )}

                    {/* Weekly Days Selection */}
                    {scheduleType === 'weekly' && (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          Which days?
                        </label>
                        <div className="grid grid-cols-7 gap-2">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                            const dayValue = index + 1; // 1 = Monday, 7 = Sunday
                            const isSelected = scheduleDays.includes(dayValue);
                            return (
                              <button
                                key={day}
                                type="button"
                                disabled={isTesting}
                                onClick={() => {
                                  if (isSelected) {
                                    setScheduleDays(scheduleDays.filter(d => d !== dayValue));
                                  } else {
                                    setScheduleDays([...scheduleDays, dayValue]);
                                  }
                                }}
                                className={`p-2 text-xs rounded border ${
                                  isSelected 
                                    ? 'bg-blue-500 text-white border-blue-500' 
                                    : 'bg-surface-secondary border-border-light text-text-secondary'
                                } ${isTesting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-400'}`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Monthly Date Selection */}
                    {scheduleType === 'monthly' && (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          On which day of the month?
                        </label>
                        <select
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(parseInt(e.target.value))}
                          disabled={isTesting}
                          className={`w-full rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                            isTesting ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                            <option key={day} value={day}>
                              {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of the month
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Custom Cron Expression */}
                    {scheduleType === 'custom' && (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          Cron expression
                        </label>
                        <input
                          type="text"
                          value={scheduleConfig}
                          onChange={(e) => setScheduleConfig(e.target.value)}
                          disabled={isTesting}
                          className={`w-full rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                            isTesting ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          placeholder="0 9 * * * (Every day at 9 AM)"
                        />
                        <p className="text-xs text-text-secondary mt-1">
                          Format: minute hour day month weekday
                        </p>
                      </div>
                    )}

                  </div>
                )}
                </div>
              )}
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
                    <div 
                      className={`rounded-lg border transition-all duration-300 ${
                        expandedSteps.has(step.id) ? 'p-3' : 'px-3 pt-2 pb-1.5'
                      } ${
                        getStepStatus(step.id) === 'running' 
                          ? 'border-blue-500 bg-blue-50/20 shadow-lg shadow-blue-500/20 animate-pulse' 
                          : getStepStatus(step.id) === 'completed' 
                          ? 'border-green-500 bg-green-50/20' 
                          : getStepStatus(step.id) === 'pending' 
                          ? 'border-border-medium bg-surface-tertiary opacity-60' 
                          : 'border-border-medium bg-surface-tertiary'
                      } ${
                        isTesting ? 'pointer-events-none' : ''
                      }`}
                      style={getStepStatus(step.id) === 'running' ? {
                        boxShadow: `
                          0 0 0 1px rgb(59 130 246 / 0.5),
                          0 0 0 3px rgb(59 130 246 / 0.3),
                          0 0 20px rgb(59 130 246 / 0.4),
                          inset 0 0 20px rgb(59 130 246 / 0.1)
                        `,
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                      } : {}}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {expandedSteps.has(step.id) ? (
                            /* Expanded view - show only step name input */
                            <input
                              type="text"
                              value={step.name}
                              onChange={(e) => updateStep(step.id, { name: e.target.value })}
                              disabled={isTesting}
                              className={`w-full border-none bg-transparent text-sm font-medium text-text-primary focus:outline-none ${
                                isTesting ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              placeholder="Step name"
                            />
                          ) : (
                            /* Collapsed view - show step name + agent info inline */
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-primary">{step.name}</span>
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
                                  <span className="text-sm text-text-secondary truncate">
                                    {getAgentDetails(step.agentId)?.name}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className={`rounded-xl p-1 transition hover:bg-surface-hover ${
                              isTesting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
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
                              isTesting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
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
                                isTesting ? 'opacity-50 pointer-events-none' : ''
                              }`}
                              disabled={isTesting}
                            />
                            {step.agentId && agentsMap[step.agentId]?.tools && (
                              <div 
                                className="absolute top-1/2 -translate-y-1/2 pointer-events-none" 
                                style={{
                                  left: `calc(40px + ${(getAgentDetails(step.agentId)?.name ?? '').length * 0.65}ch + 16px)`
                                }}
                              >
                                <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                                  <MCPServerIcons
                                    agentTools={(agentsMap[step.agentId]?.tools as Array<string | { tool: string; server: string; type: 'global' | 'user' }>) || []}
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
                            className={`w-full resize-none rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                              isTesting ? 'opacity-50 cursor-not-allowed' : ''
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
                              className="w-full rounded-md border border-border-light bg-surface-secondary p-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover text-left"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                              {(() => {
                                // Get step output from latest execution data
                                // The data structure uses 'steps' array, not 'stepExecutions'
                                const actualExecutionData = latestExecutionData as any;
                                const stepExecution = actualExecutionData?.steps?.find((s: any) => {
                                  // Try to match by step name or step ID
                                  return s.name === step.name || s.id === step.id;
                                });
                                
                                const stepOutput = stepExecution?.output;
                                const stepStatus = stepExecution?.status;
                                const stepError = stepExecution?.error;
                                const currentStepId = latestExecutionData?.currentStepId;
                                
                                let content = '';
                                if (stepOutput && stepOutput !== 'undefined') {
                                  content = typeof stepOutput === 'string' ? stepOutput : JSON.stringify(stepOutput);
                                } else if (currentStepId === step.id && stepStatus === 'running') {
                                  content = 'Step is currently running...';
                                } else if (stepStatus === 'failed' && stepError) {
                                  content = `Step failed: ${stepError}`;
                                } else if (stepStatus === 'completed' && !stepOutput) {
                                  content = 'Step completed but no output available';
                                } else if (stepStatus === 'pending') {
                                  content = 'Step is pending execution';
                                } else if (actualExecutionData && actualExecutionData.steps && actualExecutionData.steps.length > 0) {
                                  content = 'No output from this step';
                                } else {
                                  content = 'No output yet - run workflow test to see results';
                                }

                                // Show preview (first 2 lines) when collapsed, full content when expanded
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
                              ? 'text-blue-500 animate-bounce scale-125' 
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
                            steps.length > 0 && getStepStatus(steps[steps.length - 1].id) === 'completed'
                              ? 'text-green-500 animate-pulse'
                              : 'text-text-secondary'
                          }`} 
                          size={14} 
                        />
                      </div>
                    )}
                    <div className={`${
                      isTesting ? 'opacity-50 pointer-events-none' : ''
                    }`}>
                      <ControlCombobox
                        isCollapsed={false}
                        ariaLabel="Add step with agent"
                        selectedValue={newStepAgentId}
                        setValue={(agentId) => {
                          setNewStepAgentId(agentId);
                          // Automatically add step when agent is selected
                          if (agentId && steps.length < MAX_STEPS) {
                            const newStep: WorkflowStep = {
                              id: `step_${Date.now()}`,
                              name: `Step ${steps.length + 1}`,
                              agentId: agentId,
                              task: '',
                            };
                            setSteps((prev) => [...prev, newStep]);
                            // Expand the new step by default
                            setExpandedSteps((prev) => new Set(prev).add(newStep.id));
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
          </div>


          {/* Execution Dashboard */}
          {currentWorkflowId && showDashboard && (
            <div className="absolute inset-0 z-50 bg-surface-primary">
              <ExecutionDashboard workflowId={currentWorkflowId} />
            </div>
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
                  !currentWorkflowId
                    ? 'Save workflow first to test'
                    : isWorkflowTesting
                      ? 'Stop workflow test'
                      : 'Test workflow'
                }
                side="top"
              >
                <button
                  className={`flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2 sm:text-base ${
                    !currentWorkflowId
                      ? 'border border-gray-300 bg-gray-100 text-gray-400'
                      : isWorkflowTesting
                        ? 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white hover:border-red-500 hover:from-red-600 hover:to-red-700'
                        : 'border border-blue-500/60 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:border-blue-500 hover:from-blue-600 hover:to-blue-700'
                  }`}
                  onClick={handleTestWorkflow}
                  disabled={!currentWorkflowId || (!isWorkflowTesting ? testMutation.isLoading : stopMutation.isLoading)}
                >
                  {isWorkflowTesting ? (
                    <>
                      <Square className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <TestTube className={`h-3 w-3 sm:h-4 sm:w-4 ${!currentWorkflowId ? 'text-gray-400' : 'text-white'}`} />
                      <span>Test</span>
                    </>
                  )}
                </button>
              </TooltipAnchor>

              {/* Toggle Button */}
              <TooltipAnchor
                description={
                  !currentWorkflowId
                    ? 'Save workflow first to activate'
                    : isWorkflowActive
                      ? 'Deactivate workflow'
                      : 'Activate workflow'
                }
                side="top"
              >
                <button
                  className={`flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2 sm:text-base ${
                    !currentWorkflowId
                      ? 'border border-gray-300 bg-gray-100 text-gray-400'
                      : isWorkflowActive
                        ? 'border border-amber-500/60 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:border-amber-500 hover:from-amber-600 hover:to-orange-700'
                        : 'border border-green-500/60 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:border-green-500 hover:from-green-600 hover:to-emerald-700'
                  }`}
                  onClick={handleToggleWorkflow}
                  disabled={!currentWorkflowId || toggleMutation.isLoading || isWorkflowTesting || isTesting}
                >
                  {toggleMutation.isLoading ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin sm:h-4 sm:w-4" />
                      <span>Saving...</span>
                    </>
                  ) : isWorkflowActive ? (
                    <>
                      <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className={`h-3 w-3 sm:h-4 sm:w-4 ${!currentWorkflowId ? 'text-gray-400' : 'text-white'}`} />
                      <span>Activate</span>
                    </>
                  )}
                </button>
              </TooltipAnchor>

              {/* Delete Button */}
              <TooltipAnchor
                description={!currentWorkflowId ? 'Save workflow first to delete' : 'Delete workflow'}
                side="top"
              >
                <button
                  className={`flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2 sm:text-base ${
                    !currentWorkflowId
                      ? 'border border-gray-300 bg-gray-100 text-gray-400'
                      : 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white hover:border-red-500 hover:from-red-600 hover:to-red-700'
                  }`}
                  onClick={handleDeleteWorkflow}
                  disabled={!currentWorkflowId || deleteMutation.isLoading || isWorkflowTesting || isTesting}
                >
                  <Trash2 className={`h-3 w-3 sm:h-4 sm:w-4 ${!currentWorkflowId ? 'text-gray-400' : 'text-white'}`} />
                  <span>Delete</span>
                </button>
              </TooltipAnchor>
            </div>

            {/* Right side: Save button */}
            <div className="flex flex-1 gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving || !workflowName || steps.length === 0 || isTesting}
                className="btn btn-primary flex flex-1 items-center justify-center gap-1 text-sm sm:gap-2 sm:text-base"
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
