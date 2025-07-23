import { useCallback } from 'react';
import type { WorkflowStep, ScheduleType } from '~/components/SidePanel/WorkflowBuilder/types';
import type { AppTrigger } from '~/components/SidePanel/WorkflowBuilder/types';
import { generateCronExpression } from '~/components/SidePanel/WorkflowBuilder/utils/cronHelpers';
import { NotificationSeverity } from '~/common';

interface UseWorkflowActionsProps {
  currentWorkflowId?: string;
  workflowName: string;
  triggerType: string;
  scheduleConfig: string;
  scheduleType: ScheduleType;
  scheduleTime: string;
  scheduleDays: number[];
  scheduleDate: number;
  selectedAppSlug: string;
  selectedTrigger: AppTrigger | null;
  triggerParameters: Record<string, unknown>;
  steps: WorkflowStep[];
  createMutation: any;
  updateMutation: any;
  showToast: (params: any) => void;
  refetchWorkflow: () => void;
  setCurrentWorkflowId: (id: string) => void;
  setSteps: React.Dispatch<React.SetStateAction<WorkflowStep[]>>;
  setExpandedSteps: React.Dispatch<React.SetStateAction<Set<string>>>;
  setExpandedOutputs: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTestingWorkflows: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsTesting: (value: boolean) => void;
  setIsCancelling: (value: boolean) => void;
  setHasReceivedStopNotification: (value: boolean) => void;
  setCurrentRunningStepId: (value: string | null) => void;
  setCompletedStepIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearExecutionResult: (workflowId: string) => void;
}

export const useWorkflowActions = ({
  currentWorkflowId,
  workflowName,
  triggerType,
  scheduleConfig,
  scheduleType,
  scheduleTime,
  scheduleDays,
  scheduleDate,
  selectedAppSlug,
  selectedTrigger,
  triggerParameters,
  steps,
  createMutation,
  updateMutation,
  showToast,
  refetchWorkflow,
  setCurrentWorkflowId,
  setSteps,
  setExpandedSteps,
  setExpandedOutputs,
  setTestingWorkflows,
  setIsTesting,
  setIsCancelling,
  setHasReceivedStopNotification,
  setCurrentRunningStepId,
  setCompletedStepIds,
  clearExecutionResult,
}: UseWorkflowActionsProps) => {
  // Step management
  const removeStep = useCallback((stepId: string) => {
    setSteps((prev) => {
      const filteredSteps = prev.filter((step) => step.id !== stepId);
      // Renumber the remaining steps
      return filteredSteps.map((step, index) => ({
        ...step,
        name: `Step ${index + 1}`,
      }));
    });
  }, [setSteps]);

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
  }, [setSteps]);

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
  }, [setExpandedOutputs]);

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
  }, [setExpandedSteps]);

  // Save workflow
  const handleSave = useCallback(
    async (showNotification = true) => {
      try {
        if (currentWorkflowId) {
          // Update existing workflow (creates new version)
          const updateData = {
            name: workflowName,
            trigger: {
              type: triggerType,
              config:
                triggerType === 'schedule'
                  ? {
                      schedule:
                        scheduleType === 'custom'
                          ? scheduleConfig || '0 9 * * *'
                          : generateCronExpression(
                              scheduleType,
                              scheduleTime,
                              scheduleDays,
                              scheduleDate,
                            ),
                    }
                  : triggerType === 'app'
                    ? {
                        appSlug: selectedAppSlug,
                        triggerKey: selectedTrigger?.key,
                        triggerConfig: selectedTrigger?.configurable_props,
                        parameters: triggerParameters,
                      }
                    : {},
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

          const result = await updateMutation.mutateAsync({
            workflowId: currentWorkflowId,
            data: updateData,
          });

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
              config:
                triggerType === 'schedule'
                  ? {
                      schedule:
                        scheduleType === 'custom'
                          ? scheduleConfig || '0 9 * * *'
                          : generateCronExpression(
                              scheduleType,
                              scheduleTime,
                              scheduleDays,
                              scheduleDate,
                            ),
                    }
                  : triggerType === 'app'
                    ? {
                        appSlug: selectedAppSlug,
                        triggerKey: selectedTrigger?.key,
                        triggerConfig: selectedTrigger?.configurable_props,
                        parameters: triggerParameters,
                      }
                    : {},
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

          // Update the current workflow ID so test/activate buttons become available
          setCurrentWorkflowId(result.id);

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
        throw error; // Re-throw for caller to handle
      }
    },
    [
      currentWorkflowId,
      workflowName,
      triggerType,
      scheduleConfig,
      scheduleType,
      scheduleTime,
      scheduleDays,
      scheduleDate,
      selectedAppSlug,
      selectedTrigger,
      triggerParameters,
      steps,
      createMutation,
      updateMutation,
      showToast,
      refetchWorkflow,
      setCurrentWorkflowId,
    ],
  );

  // Clean up test state
  const cleanupTestState = useCallback(() => {
    setIsTesting(false);
    setIsCancelling(false);
    setHasReceivedStopNotification(false);
    setCurrentRunningStepId(null);
    setCompletedStepIds(new Set());
    if (currentWorkflowId) {
      setTestingWorkflows((prev) => {
        const newSet = new Set(prev);
        newSet.delete(currentWorkflowId);
        return newSet;
      });
      clearExecutionResult(currentWorkflowId);
    }
  }, [
    currentWorkflowId,
    setIsTesting,
    setIsCancelling,
    setHasReceivedStopNotification,
    setCurrentRunningStepId,
    setCompletedStepIds,
    setTestingWorkflows,
    clearExecutionResult,
  ]);

  return {
    removeStep,
    updateStep,
    toggleOutputExpanded,
    toggleStepExpanded,
    handleSave,
    cleanupTestState,
  };
};