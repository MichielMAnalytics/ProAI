import { useState, useEffect } from 'react';
import type { WorkflowStep, ScheduleType } from '~/components/SidePanel/WorkflowBuilder/types';
import type { AppTrigger } from '~/components/SidePanel/WorkflowBuilder/types';
import { parseCronExpression } from '~/components/SidePanel/WorkflowBuilder/utils/cronHelpers';

interface UseWorkflowStateProps {
  currentWorkflowData?: any;
  appTriggersData?: { triggers?: AppTrigger[] };
  userTimezone?: string;
}

export const useWorkflowState = ({ currentWorkflowData, userTimezone }: UseWorkflowStateProps) => {
  const [workflowName, setWorkflowName] = useState('⚡ New Workflow');
  const [triggerType, setTriggerType] = useState<
    'manual' | 'schedule' | 'webhook' | 'email' | 'event' | 'app'
  >('manual');
  const [scheduleConfig, setScheduleConfig] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
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

  // Load existing workflow data into form when editing
  useEffect(() => {
    if (currentWorkflowData) {
      // Populate form fields with existing workflow data
      setWorkflowName(currentWorkflowData.name || '⚡ New Workflow');
      setTriggerType(currentWorkflowData.trigger?.type || 'manual');

      const existingSchedule = currentWorkflowData.trigger?.config?.schedule || '';
      setScheduleConfig(existingSchedule);

      // Load app trigger data if it's an app trigger
      if (currentWorkflowData.trigger?.type === 'app') {
        setSelectedAppSlug(currentWorkflowData.trigger?.config?.appSlug || '');
        setTriggerParameters(currentWorkflowData.trigger?.config?.parameters || {});
      }

      // Parse existing cron expression to user-friendly format
      if (existingSchedule && currentWorkflowData.trigger?.type === 'schedule') {
        const parsed = parseCronExpression(existingSchedule, userTimezone);
        setScheduleType(parsed.type);
        setScheduleTime(parsed.time);
        setScheduleDays(parsed.days);
        setScheduleDate(parsed.date);
      }

      // Convert workflow steps to WorkflowStep format
      if (currentWorkflowData.steps && currentWorkflowData.steps.length > 0) {
        const convertedSteps: WorkflowStep[] = currentWorkflowData.steps.map((step: any) => {
          return {
            id: step.id,
            name: step.name,
            agentId: step.agent_id || '',
            task: step.instruction || '',
          };
        });
        setSteps(convertedSteps);
        // Expand all steps by default when loading existing workflow
        setExpandedSteps(new Set(convertedSteps.map((step) => step.id)));
      } else {
        // Start with empty steps for new workflow
        setSteps([]);
      }
    }
  }, [currentWorkflowData, userTimezone]);

  // This effect is now handled in the main component

  return {
    // Workflow basic state
    workflowName,
    setWorkflowName,
    triggerType,
    setTriggerType,
    
    // Schedule state
    scheduleConfig,
    setScheduleConfig,
    scheduleType,
    setScheduleType,
    scheduleTime,
    setScheduleTime,
    scheduleDays,
    setScheduleDays,
    scheduleDate,
    setScheduleDate,
    
    // App trigger state
    selectedAppSlug,
    setSelectedAppSlug,
    selectedTrigger,
    setSelectedTrigger,
    triggerSearchTerm,
    setTriggerSearchTerm,
    showTriggerDetails,
    setShowTriggerDetails,
    triggerParameters,
    setTriggerParameters,
    showRequestTriggerModal,
    setShowRequestTriggerModal,
    
    // Steps state
    steps,
    setSteps,
    newStepAgentId,
    setNewStepAgentId,
    
    // UI state
    isSaving,
    setIsSaving,
    isTesting,
    setIsTesting,
    isCancelling,
    setIsCancelling,
    hasReceivedStopNotification,
    setHasReceivedStopNotification,
    copiedStepId,
    setCopiedStepId,
    expandedSteps,
    setExpandedSteps,
    expandedOutputs,
    setExpandedOutputs,
    isTriggerExpanded,
    setIsTriggerExpanded,
    showDashboard,
    setShowDashboard,
    currentRunningStepId,
    setCurrentRunningStepId,
    completedStepIds,
    setCompletedStepIds,
  };
};