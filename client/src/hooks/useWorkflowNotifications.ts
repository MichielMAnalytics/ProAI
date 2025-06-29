import { useCallback, useEffect, useState } from 'react';

interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  isTest: boolean;
}

interface StepData {
  stepId: string;
  stepName: string;
  stepType: string;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

interface UseWorkflowNotificationsOptions {
  workflowId?: string;
  onTestStart?: (workflowId: string) => void;
  onTestComplete?: (workflowId: string, success: boolean, result?: ExecutionResult) => void;
  onStepUpdate?: (workflowId: string, stepData: StepData) => void;
}

interface QueuedNotification {
  data: any;
  timestamp: number;
}

export const useWorkflowNotifications = (options: UseWorkflowNotificationsOptions = {}) => {
  const [testingWorkflows, setTestingWorkflows] = useState<Set<string>>(new Set());
  const [executionResults, setExecutionResults] = useState<Map<string, ExecutionResult>>(new Map());
  const [currentSteps, setCurrentSteps] = useState<Map<string, StepData>>(new Map());
  const [notificationQueue, setNotificationQueue] = useState<Map<string, QueuedNotification[]>>(
    new Map(),
  );
  const [processingQueue, setProcessingQueue] = useState<Map<string, boolean>>(new Map());

  // Extract step data from notification
  const extractStepData = useCallback((data: any): StepData | null => {
    let stepData = data.stepData as StepData;

    // Extract step info from details if needed
    if (!stepData && data.details) {
      const details = data.details;
      let stepName = '';
      let status: 'running' | 'completed' | 'failed' = 'running';

      const executingMatch = details.match(/Executing step:\s*(.+?)$/i);
      const completedMatch = details.match(/(?:Step completed|Completed step):\s*(.+?)$/i);
      const failedMatch = details.match(/(?:Step failed|Failed step):\s*(.+?)$/i);

      if (executingMatch) {
        stepName = executingMatch[1].trim();
        status = 'running';
      } else if (completedMatch) {
        stepName = completedMatch[1].trim();
        status = 'completed';
      } else if (failedMatch) {
        stepName = failedMatch[1].trim();
        status = 'failed';
      }

      if (stepName) {
        stepData = {
          stepId: `step_${Date.now()}`,
          stepName: stepName,
          stepType: 'action',
          status: status,
        };
        console.log('[WorkflowNotifications] Extracted step data from details:', stepData);
      }
    }

    return stepData;
  }, []);

  // Process a single notification immediately
  const processNotification = useCallback(
    (data: any) => {
      console.log('[WorkflowNotifications] Processing notification:', data);

      const workflowId = data.workflowId;
      if (!workflowId) return;

      switch (data.notificationType) {
        case 'test_started':
        case 'execution_started':
          console.log('[WorkflowNotifications] Starting workflow test/execution:', workflowId);
          setTestingWorkflows((prev) => new Set(prev).add(workflowId));
          setCurrentSteps((prev) => {
            const newMap = new Map(prev);
            newMap.delete(workflowId);
            return newMap;
          });
          setExecutionResults((prev) => {
            const newMap = new Map(prev);
            newMap.delete(workflowId);
            return newMap;
          });
          options.onTestStart?.(workflowId);
          break;

        case 'step_started':
        case 'step_completed':
        case 'step_failed':
          const stepData = extractStepData(data);
          if (stepData) {
            console.log(`[WorkflowNotifications] Step ${data.notificationType}:`, stepData);
            setCurrentSteps((prev) => new Map(prev).set(workflowId, stepData));
            options.onStepUpdate?.(workflowId, stepData);
          }
          break;

        case 'execution_completed':
        case 'execution_failed':
          console.log(
            '[WorkflowNotifications] Workflow execution complete:',
            data.notificationType,
          );
          const executionResult = data.executionResult as ExecutionResult;

          if (executionResult) {
            setExecutionResults((prev) => new Map(prev).set(workflowId, executionResult));
          }

          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(workflowId);
            return newSet;
          });

          // The final result is now displayed, don't clear the current step immediately
          // It will be cleared when the user dismisses the result panel

          options.onTestComplete?.(
            workflowId,
            data.notificationType === 'execution_completed',
            executionResult,
          );
          break;
      }
    },
    [extractStepData, options],
  );

  // Process notification queue for a workflow
  const processNotificationQueue = useCallback(
    (workflowId: string) => {
      setNotificationQueue((prev) => {
        const queue = prev.get(workflowId) || [];
        if (queue.length === 0) {
          setProcessingQueue((prevProcessing) => {
            const newMap = new Map(prevProcessing);
            newMap.set(workflowId, false);
            return newMap;
          });
          return prev;
        }

        const [nextNotification, ...remainingQueue] = queue;
        const newMap = new Map(prev);
        newMap.set(workflowId, remainingQueue);

        // Process the notification
        processNotification(nextNotification.data);

        // If this was a completion notification, delay before processing the next one
        if (
          nextNotification.data.notificationType === 'step_completed' ||
          nextNotification.data.notificationType === 'step_failed'
        ) {
          console.log(
            '[WorkflowNotifications] Delaying next notification processing for 2.5 seconds',
          );
          setTimeout(() => {
            processNotificationQueue(workflowId);
          }, 2500);
        } else {
          // Process immediately for step_started and other notifications
          setTimeout(() => {
            processNotificationQueue(workflowId);
          }, 10); // Small delay to prevent stack overflow
        }

        return newMap;
      });
    },
    [processNotification],
  );

  // Main event handler that queues step notifications
  const handleWorkflowNotification = useCallback(
    (event: CustomEvent) => {
      const data = event.detail;

      console.log('[WorkflowNotifications] Received notification:', data);

      if (data.type === 'workflow_status_update' && data.workflowId) {
        const { workflowId, notificationType } = data;

        // If we have a specific workflow ID filter, only react to that workflow
        if (options.workflowId && workflowId !== options.workflowId) {
          console.log(
            '[WorkflowNotifications] Ignoring notification for different workflow:',
            workflowId,
          );
          return;
        }

        // For non-step notifications, process immediately
        if (!['step_started', 'step_completed', 'step_failed'].includes(notificationType)) {
          processNotification(data);
          return;
        }

        // For step notifications, add to queue
        setNotificationQueue((prev) => {
          const currentQueue = prev.get(workflowId) || [];
          const newQueue = [...currentQueue, { data, timestamp: Date.now() }];
          const newMap = new Map(prev);
          newMap.set(workflowId, newQueue);
          return newMap;
        });

        // Start processing if not already processing
        setProcessingQueue((prev) => {
          const isProcessing = prev.get(workflowId) || false;
          if (!isProcessing) {
            const newMap = new Map(prev);
            newMap.set(workflowId, true);
            // Start processing after a small delay
            setTimeout(() => {
              processNotificationQueue(workflowId);
            }, 10);
            return newMap;
          }
          return prev;
        });
      } else {
        console.log('[WorkflowNotifications] Ignoring non-workflow notification:', data.type);
      }
    },
    [options.workflowId, processNotification, processNotificationQueue],
  );

  useEffect(() => {
    console.log(
      '[WorkflowNotifications] Setting up event listener for workflow:',
      options.workflowId,
    );

    // Listen for workflow notifications on the window object
    window.addEventListener('workflowNotification', handleWorkflowNotification as EventListener);

    return () => {
      console.log(
        '[WorkflowNotifications] Cleaning up event listener for workflow:',
        options.workflowId,
      );
      window.removeEventListener(
        'workflowNotification',
        handleWorkflowNotification as EventListener,
      );
    };
  }, [handleWorkflowNotification]);

  const clearExecutionResult = useCallback((workflowId: string) => {
    setExecutionResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(workflowId);
      return newMap;
    });
    setCurrentSteps((prev) => {
      const newMap = new Map(prev);
      newMap.delete(workflowId);
      return newMap;
    });
  }, []);

  return {
    isWorkflowTesting: (workflowId: string) => testingWorkflows.has(workflowId),
    testingWorkflows: Array.from(testingWorkflows),
    getCurrentStep: (workflowId: string) => currentSteps.get(workflowId),
    getExecutionResult: (workflowId: string) => executionResults.get(workflowId),
    clearExecutionResult,
  };
};
