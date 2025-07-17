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
  Search,
  Webhook,
  Mail,
  FileText,
  Activity,
  Info,
} from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '~/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import MessageIcon from '~/components/Share/MessageIcon';
import { CircleHelpIcon, Spinner } from '~/components/svg';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize, useMediaQuery, useAuthContext } from '~/hooks';
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
  useAvailableIntegrationsQuery,
  useAppTriggersQuery,
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
  type: 'manual' | 'schedule' | 'webhook' | 'email' | 'event' | 'app';
  config: {
    schedule?: string;
    webhookUrl?: string;
    emailAddress?: string;
    eventType?: string;
    appSlug?: string;
    triggerKey?: string;
    triggerConfig?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
}

interface AppTrigger {
  key: string;
  name: string;
  description?: string;
  version: string;
  type?: 'action' | 'trigger';
  configurable_props?: Array<any>;
  category?: string;
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

const BASIC_TRIGGER_OPTIONS = [
  { value: 'manual', label: 'Manual', icon: <User size={16} />, disabled: false },
  { value: 'schedule', label: 'Schedule', icon: <Calendar size={16} />, disabled: false },
  { value: 'app', label: 'App', icon: <Activity size={16} />, disabled: false },
];

// Category icons for triggers
const TRIGGER_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  webhook: <Webhook size={16} />,
  schedule: <Calendar size={16} />,
  email: <Mail size={16} />,
  new_item: <PlusCircle size={16} />,
  item_updated: <RefreshCw size={16} />,
  item_deleted: <Trash2 size={16} />,
  file: <FileText size={16} />,
  other: <Activity size={16} />,
};

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ onClose, workflowId: initialWorkflowId }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext() || {};
  const { showToast } = useToastContext();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [hideSidePanel, setHideSidePanel] = useRecoilState(store.hideSidePanel);
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [triggerType, setTriggerType] = useState<
    'manual' | 'schedule' | 'webhook' | 'email' | 'event' | 'app'
  >('manual');
  const [scheduleConfig, setScheduleConfig] = useState('');
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]); // 1 = Monday
  const [scheduleDate, setScheduleDate] = useState(1); // Day of month
  
  // App trigger states
  const [selectedAppSlug, setSelectedAppSlug] = useState<string>('');
  const [selectedTrigger, setSelectedTrigger] = useState<AppTrigger | null>(null);
  const [triggerSearchTerm, setTriggerSearchTerm] = useState('');
  const [showTriggerDetails, setShowTriggerDetails] = useState(false);
  const [triggerParameters, setTriggerParameters] = useState<Record<string, unknown>>({});
  const [showRequestTriggerModal, setShowRequestTriggerModal] = useState(false);
  
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

  // Store the original sidebar state when component mounts
  const [originalHideSidePanel] = useState(hideSidePanel);

  // Fetch available integrations for app triggers
  const { data: availableIntegrations = [], isLoading: isLoadingIntegrations } = useAvailableIntegrationsQuery();

  // Fetch triggers for selected app
  const { 
    data: appTriggersData, 
    isLoading: isLoadingTriggers,
    error: triggersError,
    isFetching: isFetchingTriggers
  } = useAppTriggersQuery(selectedAppSlug, {
    enabled: !!selectedAppSlug && triggerType === 'app',
  });
  
  // Debug the query state
  console.log('🔍 Query Debug - selectedAppSlug:', selectedAppSlug);
  console.log('🔍 Query Debug - triggerType:', triggerType);
  console.log('🔍 Query Debug - Query enabled:', !!selectedAppSlug && triggerType === 'app');
  console.log('🔍 Query Debug - isLoading:', isLoadingTriggers);
  console.log('🔍 Query Debug - isFetching:', isFetchingTriggers);
  console.log('🔍 Query Debug - error:', triggersError);
  console.log('🔍 Query Debug - data:', appTriggersData);

  // Hide sidebar on mobile when WorkflowBuilder opens
  useEffect(() => {
    // Only hide on very small mobile screens to avoid issues with desktop users
    if (isMobile && window.innerWidth <= 640) {
      setHideSidePanel(true);
    }

    // Restore original sidebar state when component unmounts
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
      
      // Load app trigger data if it's an app trigger
      if (currentWorkflowData.trigger?.type === 'app') {
        setSelectedAppSlug(currentWorkflowData.trigger?.config?.appSlug || '');
        setTriggerParameters(currentWorkflowData.trigger?.config?.parameters || {});
        // selectedTrigger will be set when appTriggersData is loaded
      }
      
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

  // Set selected trigger when app triggers data is loaded
  useEffect(() => {
    if (appTriggersData?.triggers && currentWorkflowData?.trigger?.config?.triggerKey) {
      const trigger = appTriggersData.triggers.find(
        (t: AppTrigger) => t.key === currentWorkflowData.trigger.config.triggerKey
      );
      if (trigger) {
        setSelectedTrigger(trigger as AppTrigger);
      }
    }
  }, [appTriggersData, currentWorkflowData]);

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

  // Create trigger options with clean basic options
  const triggerOptions = useMemo(() => {
    return BASIC_TRIGGER_OPTIONS.map((option) => {
      if (option.value === 'app' && triggerType === 'app' && selectedAppSlug) {
        // When an app is selected, show a deselect option
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
  }, [triggerType, selectedAppSlug]);

  // Filter app triggers based on search
  const filteredAppTriggers = useMemo(() => {
    console.log('🔍 Debug - Raw appTriggersData:', appTriggersData);
    console.log('🔍 Debug - appTriggersData.triggers:', appTriggersData?.triggers);
    console.log('🔍 Debug - Array.isArray(appTriggersData?.triggers):', Array.isArray(appTriggersData?.triggers));
    
    if (!appTriggersData?.triggers) {
      console.log('🔍 Debug - No triggers data, returning empty array');
      return [];
    }
    
    const triggers = appTriggersData.triggers as AppTrigger[];
    console.log('🔍 Debug - Mapped triggers:', triggers);
    console.log('🔍 Debug - Trigger count:', triggers.length);
    
    if (!triggerSearchTerm) return triggers;
    
    return triggers.filter(trigger =>
      trigger.name.toLowerCase().includes(triggerSearchTerm.toLowerCase()) ||
      (trigger.description && trigger.description.toLowerCase().includes(triggerSearchTerm.toLowerCase())) ||
      (trigger.category && trigger.category.toLowerCase().includes(triggerSearchTerm.toLowerCase()))
    );
  }, [appTriggersData, triggerSearchTerm, selectedAppSlug, triggerType]);

  // Group triggers by category
  const triggersByCategory = useMemo(() => {
    const grouped: Record<string, AppTrigger[]> = {};
    filteredAppTriggers.forEach(trigger => {
      const category = trigger.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(trigger);
    });
    return grouped;
  }, [filteredAppTriggers]);

  // Handle trigger type selection
  const handleTriggerTypeChange = (value: string) => {
    if (value === 'deselect-app') {
      // Handle app deselection - stay in app mode but clear selected app
      setSelectedAppSlug('');
      setSelectedTrigger(null);
      setTriggerParameters({});
      // Don't change trigger type, keep it as 'app'
    } else {
      // Always set the trigger type first
      setTriggerType(value as any);
      
      if (value !== 'app') {
        // Clear app-specific state when switching away from app triggers
        setSelectedAppSlug('');
        setSelectedTrigger(null);
        setTriggerParameters({});
      }
    }
  };

  // Get display value for trigger selector
  const getTriggerDisplayValue = () => {
    if (triggerType === 'app' && selectedAppSlug) {
      const integration = availableIntegrations.find(i => i.appSlug === selectedAppSlug);
      return integration ? integration.appName : 'App';
    }
    return triggerOptions.find((t) => t.value === triggerType)?.label || '';
  };

  // Get icon for trigger selector
  const getTriggerIcon = () => {
    if (triggerType === 'app' && selectedAppSlug) {
      const integration = availableIntegrations.find(i => i.appSlug === selectedAppSlug);
      return integration?.appIcon ? (
        <img src={integration.appIcon} alt={integration.appName} className="w-4 h-4" />
      ) : (
        <Activity size={16} />
      );
    }
    return triggerOptions.find((t) => t.value === triggerType)?.icon;
  };

  // Workflow management handlers
  const handleToggleWorkflow = async () => {
    if (!currentWorkflowId) return;

    // Auto-save workflow before toggling (silently)
    try {
      await handleSave(false);
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

    // Auto-save workflow before testing (silently)
    try {
      await handleSave(false);
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

  const handleSave = useCallback(async (showNotification = true) => {
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
            } : triggerType === 'app' ? {
              appSlug: selectedAppSlug,
              triggerKey: selectedTrigger?.key,
              triggerConfig: selectedTrigger?.configurable_props,
              parameters: triggerParameters,
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
        
        if (showNotification) {
          showToast({
            message: `Workflow "${result.name}" updated successfully!`,
            severity: NotificationSeverity.SUCCESS,
          });
        }
        
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
            } : triggerType === 'app' ? {
              appSlug: selectedAppSlug,
              triggerKey: selectedTrigger?.key,
              triggerConfig: selectedTrigger?.configurable_props,
              parameters: triggerParameters,
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
        
        if (showNotification) {
          showToast({
            message: `Workflow "${result.name}" created successfully!`,
            severity: NotificationSeverity.SUCCESS,
          });
        }
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
  }, [currentWorkflowId, workflowName, triggerType, scheduleConfig, scheduleType, scheduleTime, scheduleDays, scheduleDate, steps, createMutation, updateMutation, showToast, refetchWorkflow, selectedAppSlug, selectedTrigger]);

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
    <>
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
                  setValue={handleTriggerTypeChange}
                  selectPlaceholder="Select trigger type"
                  searchPlaceholder="Search trigger types"
                  items={triggerOptions}
                  displayValue={getTriggerDisplayValue()}
                  SelectIcon={getTriggerIcon()}
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

                {/* App Trigger Selection */}
                {triggerType === 'app' && (
                  <div className="space-y-3">
                    {!selectedAppSlug ? (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          Select App
                        </label>
                        <ControlCombobox
                          isCollapsed={false}
                          ariaLabel="Select app"
                          selectedValue={selectedAppSlug}
                          setValue={(appSlug) => {
                            if (appSlug === 'request-other-app') {
                              setShowRequestTriggerModal(true);
                            } else {
                              setSelectedAppSlug(appSlug);
                              setSelectedTrigger(null); // Clear selected trigger when app changes
                              setTriggerParameters({}); // Clear trigger parameters when app changes
                            }
                          }}
                          selectPlaceholder="Select app"
                          searchPlaceholder="Search apps"
                          items={[
                            // Available integrations
                            ...availableIntegrations
                              .filter(integration => integration.isActive && integration.appSlug === 'gmail')
                              .map(integration => ({
                                label: integration.appName,
                                value: integration.appSlug,
                                icon: integration.appIcon ? (
                                  <img src={integration.appIcon} alt={integration.appName} className="w-4 h-4" />
                                ) : (
                                  <Activity size={16} />
                                ),
                              })),
                            // Request other app trigger option
                            {
                              label: 'Request Other App Trigger',
                              value: 'request-other-app',
                              icon: <PlusCircle size={16} />,
                            }
                          ]}
                          displayValue=""
                          SelectIcon={<Search size={16} className="text-text-secondary" />}
                          className="h-8 w-full border-border-heavy text-sm sm:h-10"
                          disabled={isTesting}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Trigger Selection */}
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-2">
                            Select Trigger
                          </label>
                          <ControlCombobox
                            isCollapsed={false}
                            ariaLabel="Select trigger"
                            selectedValue={selectedTrigger?.key || ''}
                            setValue={(triggerKey) => {
                              const trigger = appTriggersData?.triggers?.find(t => t.key === triggerKey);
                              if (trigger) {
                                setSelectedTrigger(trigger);
                                setTriggerParameters({}); // Clear parameters when trigger changes
                              }
                            }}
                            selectPlaceholder="Select trigger"
                            searchPlaceholder="Search triggers"
                            items={filteredAppTriggers.map(trigger => ({
                              label: trigger.name,
                              value: trigger.key,
                              icon: TRIGGER_CATEGORY_ICONS[trigger.category || 'other'] || <Activity size={16} />,
                            }))}
                            displayValue={selectedTrigger?.name || ''}
                            SelectIcon={selectedTrigger && (
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <button 
                                    type="button" 
                                    className="text-text-secondary hover:text-text-primary"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Info size={14} />
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardPortal>
                                  <HoverCardContent className="w-80 p-4">
                                    <div className="space-y-3">
                                      <h4 className="text-sm font-semibold text-text-primary">{selectedTrigger.name}</h4>
                                      <p className="text-sm text-text-secondary">{selectedTrigger.description || 'No description available'}</p>
                                      
                                      {/* Show trigger category */}
                                      {selectedTrigger.category && (
                                        <div className="text-xs text-text-secondary">
                                          <span className="font-medium">Category:</span> {selectedTrigger.category}
                                        </div>
                                      )}
                                      
                                      {/* Generic configurable properties */}
                                      {selectedTrigger.configurable_props && selectedTrigger.configurable_props.length > 0 && (
                                        <div className="text-xs text-text-secondary">
                                          <p className="font-medium">Configurable properties:</p>
                                          <ul className="list-disc list-inside mt-1">
                                            {selectedTrigger.configurable_props.map((prop: any, index: number) => (
                                              <li key={index}>{prop.name} ({prop.type})</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  </HoverCardContent>
                                </HoverCardPortal>
                              </HoverCard>
                            )}
                            className="h-8 w-full border-border-heavy text-sm sm:h-10"
                            disabled={isTesting}
                          />
                        </div>

                        {/* Gmail-specific configuration */}
                        {selectedAppSlug === 'gmail' && selectedTrigger?.key === 'new_email_received' && (
                          <div className="space-y-3 p-3 bg-surface-secondary rounded-lg border border-border-light">
                            <h5 className="text-sm font-medium text-text-primary">Configure Email Filter</h5>
                            <div>
                              <label className="block text-sm font-medium text-text-primary mb-2">
                                Filter by sender email (optional)
                              </label>
                              <input
                                type="email"
                                value={triggerParameters.fromEmail as string || ''}
                                onChange={(e) => setTriggerParameters(prev => ({ ...prev, fromEmail: e.target.value }))}
                                disabled={isTesting}
                                className={`w-full rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                                  isTesting ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                placeholder="example@domain.com"
                              />
                              <p className="text-xs text-text-secondary mt-1">
                                Only trigger when emails are received from this address. Leave empty to trigger on all emails.
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-text-primary mb-2">
                                Subject contains (optional)
                              </label>
                              <input
                                type="text"
                                value={triggerParameters.subjectFilter as string || ''}
                                onChange={(e) => setTriggerParameters(prev => ({ ...prev, subjectFilter: e.target.value }))}
                                disabled={isTesting}
                                className={`w-full rounded-md border border-border-heavy bg-surface-primary text-text-primary p-2 text-sm focus:border-blue-500 focus:outline-none ${
                                  isTesting ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                placeholder="Order confirmation"
                              />
                              <p className="text-xs text-text-secondary mt-1">
                                Only trigger when the email subject contains this text.
                              </p>
                            </div>
                            <div>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={triggerParameters.markAsRead as boolean || false}
                                  onChange={(e) => setTriggerParameters(prev => ({ ...prev, markAsRead: e.target.checked }))}
                                  disabled={isTesting}
                                  className="rounded border-border-heavy"
                                />
                                <span className="text-sm text-text-primary">Mark emails as read after processing</span>
                              </label>
                            </div>
                          </div>
                        )}
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
          <div className="flex flex-col gap-2">
            {/* Top Row - Test and Toggle */}
            <div className="flex gap-2">
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
                className="flex-1"
              >
                <button
                  className={`btn w-full flex items-center justify-center gap-1 text-sm font-medium h-9 px-2 ${
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
                      <Square className="h-4 w-4" />
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
                className="flex-1"
              >
                <button
                  className={`btn w-full flex items-center justify-center gap-1 text-sm font-medium h-9 px-2 ${
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
                      <Pause className="h-4 w-4" />
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
            </div>

            {/* Bottom Row - Delete and Save */}
            <div className="flex gap-2">
              {/* Delete Button */}
              <TooltipAnchor
                description={!currentWorkflowId ? 'Save workflow first to delete' : 'Delete workflow'}
                side="top"
                className="flex-1"
              >
                <button
                  className={`btn w-full flex items-center justify-center gap-1 text-sm font-medium h-9 px-2 ${
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

              {/* Save button */}
              <div className="flex-1">
                <button
                  onClick={() => handleSave()}
                  disabled={isSaving || !workflowName || steps.length === 0 || isTesting}
                  className="btn btn-primary w-full flex items-center justify-center gap-1 text-sm font-medium h-9 px-2"
                >
                  <Save size={16} />
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      
      {/* Request Other App Trigger Modal */}
      <RequestTriggerModal
        open={showRequestTriggerModal}
        onOpenChange={setShowRequestTriggerModal}
      />
    </>
  );
};

// Request Trigger Modal Component
function RequestTriggerModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!appName.trim()) {
      showToast({
        message: 'Please enter the app name',
        status: 'error',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/enterprise-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          feedbackType: 'general',
          additionalInfo: `App Trigger Request\n\nApp: ${appName}\n\nDescription: ${description}`,
          userId: user?.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit request');
      }

      showToast({
        message: 'Thank you for your request! We will review it and get back to you.',
        status: 'success',
      });

      setAppName('');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting request:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to submit request',
        status: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setAppName('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Request App Trigger</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
          <div>
            <label htmlFor="app-name" className="mb-2 block text-sm font-medium text-text-primary">
              App Name *
            </label>
            <input
              id="app-name"
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g., Slack, Notion, GitHub"
              className="w-full rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-border-heavy focus:outline-none focus:ring-1 focus:ring-border-heavy"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-medium text-text-primary">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what trigger you need and how you'd like to use it..."
              rows={4}
              className="w-full resize-none rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-text-primary placeholder-text-secondary focus:border-border-heavy focus:outline-none focus:ring-1 focus:ring-border-heavy"
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !appName.trim()}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default WorkflowBuilder;
