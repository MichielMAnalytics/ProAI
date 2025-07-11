import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Play,
  Pause,
  TestTube,
  Trash2,
  Plus,
  Search,
  RotateCcw,
  Eye,
  Copy,
  Check,
  Square,
  BarChart3,
  FileText,
} from 'lucide-react';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import DownloadArtifact from './DownloadArtifact';
import { useEditorContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import ArtifactTabs from './ArtifactTabs';
import ExecutionDashboard from './ExecutionDashboard';
import { CopyCodeButton } from './Code';
import store from '~/store';
import {
  useDeleteWorkflowMutation,
  useToggleWorkflowMutation,
  useTestWorkflowMutation,
  useStopWorkflowMutation,
  useWorkflowQuery,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useWorkflowNotifications } from '~/hooks/useWorkflowNotifications';
import { Button } from '~/components/ui';
import { TooltipAnchor } from '~/components/ui/Tooltip';

/**
 * Extract meaningful content from step result object for display
 * @param result - Step result object
 * @returns Meaningful content or null if not found
 */
function extractMeaningfulContent(result: any): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  // Handle LibreChat agent response objects with content array
  if (result.content && Array.isArray(result.content)) {
    // Extract text content from agent response content array
    const textParts = result.content
      .filter((part: any) => part.type === 'text' && part.text && part.text.trim())
      .map((part: any) => part.text.trim());

    if (textParts.length > 0) {
      return textParts.join('\n').trim();
    }
  }

  // Check for direct text field
  if (result.text && typeof result.text === 'string' && result.text.trim()) {
    return result.text.trim();
  }

  // Handle nested agent response objects (common in LibreChat)
  if (result.agentResponse) {
    if (typeof result.agentResponse === 'string') {
      return result.agentResponse;
    }
    if (typeof result.agentResponse === 'object') {
      // Try to extract text from nested agent response content
      if (result.agentResponse.content && Array.isArray(result.agentResponse.content)) {
        const textParts = result.agentResponse.content
          .filter((part: any) => part.type === 'text' && part.text && part.text.trim())
          .map((part: any) => part.text.trim());

        if (textParts.length > 0) {
          return textParts.join('\n').trim();
        }
      }

      // Check for direct text in agent response
      if (
        result.agentResponse.text &&
        typeof result.agentResponse.text === 'string' &&
        result.agentResponse.text.trim()
      ) {
        return result.agentResponse.text.trim();
      }

      // Check for message content in agent response
      if (result.agentResponse.content && typeof result.agentResponse.content === 'string') {
        return result.agentResponse.content;
      }
    }
  }

  // Check for tool results
  if (result.toolResults && Array.isArray(result.toolResults)) {
    const meaningfulResults = result.toolResults
      .map((tool: any) => {
        if (tool.result && typeof tool.result === 'string') {
          return `Tool "${tool.name || 'unknown'}": ${tool.result}`;
        }
        if (tool.result && typeof tool.result === 'object') {
          // Try to extract meaningful data from tool result
          if (tool.result.data || tool.result.message || tool.result.content) {
            const content = tool.result.data || tool.result.message || tool.result.content;
            return `Tool "${tool.name || 'unknown'}": ${typeof content === 'string' ? content : JSON.stringify(content)}`;
          }
        }
        return null;
      })
      .filter(Boolean);

    if (meaningfulResults.length > 0) {
      return meaningfulResults.join('\n');
    }
  }

  // Check for direct content fields
  if (result.content && typeof result.content === 'string') {
    return result.content;
  }

  if (result.message && typeof result.message === 'string') {
    return result.message;
  }

  if (result.data) {
    if (typeof result.data === 'string') {
      return result.data;
    }
    if (typeof result.data === 'object') {
      // Try to extract summary information from data objects
      if (Array.isArray(result.data)) {
        return `Retrieved ${result.data.length} items`;
      }
      if (result.data.summary || result.data.description) {
        return result.data.summary || result.data.description;
      }
    }
  }

  // Check for successful execution indicators
  if (result.success && result.type) {
    return `Successfully executed ${result.type} operation`;
  }

  return null;
}

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const { showToast } = useToastContext();
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isVisible, setIsVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasReceivedStopNotification, setHasReceivedStopNotification] = useState(false);
  const [viewMode, setViewMode] = useState<'visualization' | 'dashboard'>('visualization');
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const setArtifactRefreshFunction = useSetRecoilState(store.artifactRefreshFunction);
  const [testingWorkflows, setTestingWorkflows] = useRecoilState(store.testingWorkflows);

  // Workflow mutations
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const testMutation = useTestWorkflowMutation();
  const stopMutation = useStopWorkflowMutation();

  const handleRefresh = () => {
    setIsRefreshing(true);
    const client = previewRef.current?.getClient();
    if (client != null) {
      client.dispatch({ type: 'refresh' });
    }
    setTimeout(() => setIsRefreshing(false), 750);
  };

  // Store refresh function reference in Recoil store so it can be called externally
  useEffect(() => {
    setArtifactRefreshFunction(() => handleRefresh);
    return () => setArtifactRefreshFunction(null); // Cleanup on unmount
  }, [setArtifactRefreshFunction]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const {
    activeTab,
    isMermaid,
    setActiveTab,
    currentIndex,
    isSubmitting,
    cycleArtifact,
    currentArtifact,
    orderedArtifactIds,
  } = useArtifacts();

  // Extract workflow data from artifact content
  const workflowData = useMemo(() => {
    if (currentArtifact?.type !== 'application/vnd.workflow' || !currentArtifact.content) {
      return null;
    }

    try {
      const parsedContent = JSON.parse(currentArtifact.content);
      return parsedContent;
    } catch (error) {
      console.error('Failed to parse workflow artifact content:', error);
      return null;
    }
  }, [currentArtifact]);

  const isWorkflowArtifact = currentArtifact?.type === 'application/vnd.workflow';

  // Force preview tab for workflow artifacts (since we hide tabs)
  const effectiveActiveTab = isWorkflowArtifact ? 'preview' : activeTab;
  const workflowId = workflowData?.workflow?.id;

  // Check if this workflow is currently being tested
  const isWorkflowTesting = workflowId ? testingWorkflows.has(workflowId) : false;

  // Query the current workflow state from the database
  const { data: currentWorkflowData, refetch: refetchWorkflow } = useWorkflowQuery(workflowId, {
    enabled: !!workflowId && isWorkflowArtifact,
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // Use the current workflow data if available, fallback to artifact data
  const isWorkflowActive = currentWorkflowData?.isActive ?? workflowData?.workflow?.isActive;
  const isDraft = currentWorkflowData?.isDraft ?? workflowData?.workflow?.isDraft;

  // Listen for workflow test notifications from agent-initiated tests
  const {
    isWorkflowTesting: isWorkflowTestingFromHook,
    getCurrentStep,
    getExecutionResult,
    clearExecutionResult,
  } = useWorkflowNotifications({
    workflowId,
    onTestStart: (testWorkflowId) => {
      if (testWorkflowId === workflowId) {
        setIsTesting(true);
        // Add to testing workflows state
        setTestingWorkflows((prev) => new Set(prev).add(testWorkflowId));
        // Result data will be managed by the hook
      }
    },
    onStepUpdate: (testWorkflowId, stepData) => {
      if (testWorkflowId === workflowId) {
        // getCurrentStep handles step state internally
      }
    },
    onTestComplete: (testWorkflowId, success, result) => {
      if (testWorkflowId === workflowId) {
        console.log('[Artifacts] onTestComplete called:', { testWorkflowId, success, result });

        // Check if this is the immediate stop notification
        if (
          result?.error === 'Execution stopped by user' &&
          isCancelling &&
          !hasReceivedStopNotification
        ) {
          console.log(
            '[Artifacts] This is the immediate stop notification - keeping cancelling state',
          );
          setHasReceivedStopNotification(true);
          setIsTesting(false);
          // Remove from testing workflows state but keep cancelling state
          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(testWorkflowId);
            return newSet;
          });
          return; // Don't process further, wait for actual completion
        }

        // This is either a normal completion or the final completion after cancellation
        console.log('[Artifacts] This is final completion - clearing all states');
        setIsTesting(false);
        setIsCancelling(false);
        setHasReceivedStopNotification(false);

        // Remove from testing workflows state
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(testWorkflowId);
          return newSet;
        });
        // Result data is now managed by the hook - no automatic clearing
      }
    },
  });

  // Get current step and result from the hook
  const currentStep = workflowId ? getCurrentStep(workflowId) : null;
  const resultData = workflowId ? getExecutionResult(workflowId) : null;

  // Determine if we should show the result overlay
  const showingResult = !!(
    resultData &&
    !isTesting &&
    !isCancelling &&
    !(workflowId && isWorkflowTestingFromHook(workflowId))
  );

  // Status helper functions
  const getStatusColor = (isActive: boolean, isDraft: boolean) => {
    if (isActive) {
      return 'bg-green-100 text-green-700'; // Active workflows are always green
    }
    if (isDraft) {
      return 'bg-orange-100 text-orange-700'; // Inactive drafts are orange
    }
    return 'bg-gray-100 text-gray-600'; // Inactive non-drafts are gray
  };

  const getStatusText = (isActive: boolean, isDraft: boolean) => {
    if (isActive) return 'active';
    if (isDraft) return 'draft';
    return 'inactive';
  };

  // Debug logging
  console.log('[Artifacts] Workflow ID:', workflowId);
  console.log('[Artifacts] Is testing:', isTesting);
  console.log('[Artifacts] Is cancelling:', isCancelling);
  console.log(
    '[Artifacts] Is workflow testing:',
    workflowId && isWorkflowTestingFromHook(workflowId),
  );
  console.log('[Artifacts] Current step:', currentStep);
  console.log('[Artifacts] Showing result:', showingResult);
  console.log('[Artifacts] Result data:', resultData);

  if (currentArtifact === null || currentArtifact === undefined) {
    return null;
  }

  const closeArtifacts = () => {
    setIsVisible(false);
    setTimeout(() => setArtifactsVisible(false), 300);
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
          // Refetch workflow data to update button state immediately
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
        closeArtifacts(); // Close artifact since workflow is deleted
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
      // Set cancelling state immediately
      console.log('[Artifacts] Setting cancelling state to true');
      setIsCancelling(true);
      setHasReceivedStopNotification(false); // Reset flag when starting to cancel

      stopMutation.mutate(workflowId, {
        onSuccess: () => {
          // Remove the toast message - user will see cancelling state and final result
          // Force clear all testing states immediately
          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(workflowId);
            return newSet;
          });
          setIsTesting(false);
          // Don't clear isCancelling here - let it clear when test actually completes
          // Clear any result data
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
          // Also clear testing states on error to prevent stuck state
          setTestingWorkflows((prev) => {
            const newSet = new Set(prev);
            newSet.delete(workflowId);
            return newSet;
          });
          setIsTesting(false);
          console.log('[Artifacts] Error handler - clearing cancelling state');
          setIsCancelling(false);
        },
      });
      return;
    }

    // Otherwise, start testing
    setIsTesting(true);
    setHasReceivedStopNotification(false); // Reset flag for new test
    // Add to testing workflows state
    setTestingWorkflows((prev) => new Set(prev).add(workflowId));

    testMutation.mutate(workflowId, {
      onSuccess: (response) => {
        // The workflow notification system will handle the result display
        setIsTesting(false);
        // Remove from testing workflows state
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(workflowId);
          return newSet;
        });
      },
      onError: (error: unknown) => {
        setIsTesting(false);
        // Remove from testing workflows state on error
        setTestingWorkflows((prev) => {
          const newSet = new Set(prev);
          newSet.delete(workflowId);
          return newSet;
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // We could show an immediate error toast, but the notification system should handle this too
        showToast({
          message: `Failed to test workflow: ${errorMessage}`,
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  const handleCloseResult = () => {
    if (workflowId) {
      clearExecutionResult(workflowId);
    }
  };

  // Copy function for step outputs
  const handleCopyStepOutput = async (stepId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedStepId(stepId);
      setTimeout(() => setCopiedStepId(null), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy content:', error);
    }
  };

  // Toggle step expansion
  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  // Extract summary from step result
  const getStepSummary = (step: any) => {
    const stepId = step.stepId || `step_${step.stepName}`;

    // For successful steps, try to extract meaningful info
    if (step.status === 'completed' && step.result) {
      const result = step.result;

      // Try to extract meaningful content first
      const meaningfulContent = extractMeaningfulContent(result);
      if (meaningfulContent) {
        // Truncate for summary display
        const truncated =
          meaningfulContent.length > 100
            ? meaningfulContent.substring(0, 100) + '...'
            : meaningfulContent;
        return truncated;
      }

      // Check if it's an MCP agent action
      if (result.type === 'mcp_agent_action') {
        return `Tool: ${result.stepName}, Status: ${result.status || 'success'}`;
      }

      // For other types, show a generic success message
      return `${step.stepType} completed successfully`;
    }

    if (step.status === 'failed') {
      return `Failed: ${step.error || 'Unknown error'}`;
    }

    return `${step.stepType} - ${step.status}`;
  };

  return (
    <Tabs.Root value={effectiveActiveTab} onValueChange={setActiveTab} asChild>
      {/* Main Parent - Full screen overlay on mobile only, normal container on desktop */}
      <div className="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-full sm:bg-transparent sm:backdrop-blur-none">
        {/* Main Container - Full width on mobile, full height on desktop */}
        <div
          className={`flex h-full w-full flex-col overflow-hidden border-0 border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-500 ease-in-out sm:border ${
            isVisible ? 'scale-100 opacity-100 blur-0' : 'scale-105 opacity-0 blur-sm'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2 sm:p-3">
            {/* Left: Back button */}
            <TooltipAnchor description="Close artifacts" side="bottom">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8"
                onClick={closeArtifacts}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </TooltipAnchor>

            {/* Center: Main workflow actions */}
            {isWorkflowArtifact && workflowId && (
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Test/Stop Button */}
                <TooltipAnchor
                  description={isWorkflowTesting ? 'Stop workflow test' : 'Test workflow'}
                  side="bottom"
                >
                  <button
                    className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                      isWorkflowTesting
                        ? 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 hover:border-red-500 hover:from-red-600 hover:to-red-700'
                        : 'border border-brand-blue/60 bg-gradient-to-r from-brand-blue to-indigo-600 hover:border-brand-blue hover:from-indigo-600 hover:to-blue-700'
                    }`}
                    onClick={handleTestWorkflow}
                    disabled={!isWorkflowTesting ? testMutation.isLoading : stopMutation.isLoading}
                  >
                    {isWorkflowTesting ? (
                      <Square className="h-4 w-4 text-white" />
                    ) : (
                      <TestTube className="h-4 w-4 text-white" />
                    )}
                  </button>
                </TooltipAnchor>

                {/* Toggle Button */}
                <TooltipAnchor
                  description={isWorkflowActive ? 'Deactivate workflow' : 'Activate workflow'}
                  side="bottom"
                >
                  <button
                    className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                      isWorkflowActive
                        ? 'border border-amber-500/60 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:border-amber-500 hover:from-amber-600 hover:to-orange-700'
                        : 'border border-green-500/60 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:border-green-500 hover:from-green-600 hover:to-emerald-700'
                    }`}
                    onClick={handleToggleWorkflow}
                    disabled={toggleMutation.isLoading || isWorkflowTesting || isTesting}
                  >
                    {toggleMutation.isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    ) : isWorkflowActive ? (
                      <Pause className="h-4 w-4 text-white" />
                    ) : (
                      <Play className="h-4 w-4 text-white" />
                    )}
                  </button>
                </TooltipAnchor>

                {/* Delete Button */}
                <TooltipAnchor description="Delete workflow" side="bottom">
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm transition-all hover:border-red-500 hover:from-red-600 hover:to-red-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleDeleteWorkflow}
                    disabled={deleteMutation.isLoading || isWorkflowTesting || isTesting}
                  >
                    <Trash2 className="h-4 w-4 text-white" />
                  </button>
                </TooltipAnchor>

                {/* Status Badge */}
                <span
                  className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 font-inter text-xs font-medium ${getStatusColor(
                    isWorkflowActive || false,
                    isDraft || false,
                  )}`}
                >
                  {getStatusText(isWorkflowActive || false, isDraft || false)}
                </span>
              </div>
            )}

            {/* Right: View toggle for workflows, close button for others */}
            {isWorkflowArtifact ? (
              <div className="flex items-center gap-1">
                <TooltipAnchor description="Visualization view" side="bottom">
                  <button
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-hover sm:h-8 sm:w-8 ${
                      viewMode === 'visualization'
                        ? 'bg-surface-hover text-text-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => setViewMode('visualization')}
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </TooltipAnchor>
                <TooltipAnchor description="Execution dashboard" side="bottom">
                  <button
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-hover sm:h-8 sm:w-8 ${
                      viewMode === 'dashboard'
                        ? 'bg-surface-hover text-text-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => setViewMode('dashboard')}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </TooltipAnchor>
              </div>
            ) : (
              <TooltipAnchor description="Close artifacts" side="bottom">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8"
                  onClick={closeArtifacts}
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipAnchor>
            )}
          </div>
          {/* Content */}
          <div className="relative flex-1 overflow-hidden">
            {isWorkflowArtifact && viewMode === 'dashboard' ? (
              <ExecutionDashboard workflowId={workflowId || ''} />
            ) : (
              <ArtifactTabs
                isMermaid={isMermaid}
                artifact={currentArtifact}
                isSubmitting={isSubmitting}
                editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
                previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
              />
            )}

            {/* Testing Overlay - Show for both button-initiated and agent-initiated tests, only in visualization mode */}
            {viewMode === 'visualization' &&
              (isTesting ||
                isCancelling ||
                (workflowId && isWorkflowTestingFromHook(workflowId)) ||
                showingResult) && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gray-900/50"></div>

                  {/* Scanner Line Animation - Only show when testing or cancelling */}
                  {(isTesting ||
                    isCancelling ||
                    (workflowId && isWorkflowTestingFromHook(workflowId))) &&
                    !showingResult && (
                      <div className="absolute inset-0 overflow-hidden">
                        <div
                          className={`scanner-line absolute left-0 right-0 h-1 opacity-80 shadow-lg ${
                            isCancelling
                              ? 'bg-gradient-to-r from-transparent via-red-400 to-transparent shadow-red-400/50'
                              : 'bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-blue-400/50'
                          }`}
                        ></div>
                      </div>
                    )}

                  {/* Testing Status or Results */}
                  {showingResult && resultData ? (
                    // Show execution results
                    <div className="relative z-10 mx-2 flex max-h-[80vh] max-w-[90vw] flex-col items-center space-y-4 overflow-auto rounded-lg bg-white/95 px-4 py-4 backdrop-blur-sm dark:bg-gray-800/95 sm:mx-4 sm:max-w-md sm:px-8 sm:py-6">
                      <div className="flex w-full items-center space-x-3">
                        {resultData.success ? (
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-500 sm:h-8 sm:w-8">
                            <svg
                              className="h-4 w-4 text-white sm:h-5 sm:w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        ) : (
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-500 sm:h-8 sm:w-8">
                            <svg
                              className="h-4 w-4 text-white sm:h-5 sm:w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </div>
                        )}
                        <span className="text-base font-medium text-gray-900 dark:text-gray-100 sm:text-lg">
                          Test{' '}
                          {resultData.success
                            ? 'Completed'
                            : resultData.error === 'Execution was cancelled by user'
                              ? 'Cancelled'
                              : 'Failed'}
                        </span>
                      </div>

                      {/* Result Details */}
                      <div className="max-h-[60vh] w-full space-y-4 overflow-y-auto sm:max-h-96">
                        {resultData.success ? (
                          <div className="space-y-3">
                            {resultData.result && Array.isArray(resultData.result) && (
                              <div className="space-y-2 sm:space-y-4">
                                {resultData.result.map((step: any, index: number) => {
                                  const stepId = step.stepId || `step_${index}`;
                                  const isExpanded = expandedSteps.has(stepId);

                                  return (
                                    <div
                                      key={index}
                                      className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                                    >
                                      {/* Step Header - Always Visible */}
                                      <div className="flex items-center justify-between p-3 sm:p-4">
                                        <div className="flex min-w-0 flex-1 items-center space-x-2 sm:space-x-3">
                                          <span
                                            className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                              step.status === 'completed'
                                                ? 'bg-green-500'
                                                : step.status === 'failed'
                                                  ? 'bg-red-500'
                                                  : 'bg-gray-400'
                                            }`}
                                          ></span>
                                          <div className="min-w-0 flex-1">
                                            <div className="truncate text-xs font-medium text-gray-900 dark:text-gray-100 sm:text-sm">
                                              {step.stepName || step.name || `Step ${index + 1}`}
                                            </div>
                                            {!isExpanded && (
                                              <div className="mt-1 truncate text-xs text-gray-600 dark:text-gray-400">
                                                {getStepSummary(step)}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex flex-shrink-0 items-center space-x-1 sm:space-x-2">
                                          {/* Copy button */}
                                          {(step.result || step.output) && (
                                            <button
                                              onClick={() => {
                                                const resultToCopy = step.result || step.output;
                                                let copyContent: string;

                                                // Try to extract meaningful content first
                                                if (step.result) {
                                                  const meaningfulContent =
                                                    extractMeaningfulContent(step.result);
                                                  if (meaningfulContent) {
                                                    copyContent = meaningfulContent;
                                                  } else {
                                                    copyContent =
                                                      typeof resultToCopy === 'string'
                                                        ? resultToCopy
                                                        : JSON.stringify(resultToCopy, null, 2);
                                                  }
                                                } else {
                                                  copyContent =
                                                    typeof resultToCopy === 'string'
                                                      ? resultToCopy
                                                      : JSON.stringify(resultToCopy, null, 2);
                                                }

                                                handleCopyStepOutput(stepId, copyContent);
                                              }}
                                              className="p-1 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                              title="Copy output"
                                            >
                                              {copiedStepId === stepId ? (
                                                <Check className="h-3 w-3 text-green-500 sm:h-4 sm:w-4" />
                                              ) : (
                                                <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                                              )}
                                            </button>
                                          )}

                                          {/* Expand/Collapse button */}
                                          <button
                                            onClick={() => toggleStepExpansion(stepId)}
                                            className="p-1 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                            title={
                                              isExpanded ? 'Collapse details' : 'Expand details'
                                            }
                                          >
                                            {isExpanded ? (
                                              <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" />
                                            ) : (
                                              <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                                            )}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Step Details - Collapsible */}
                                      {isExpanded && (
                                        <div className="border-t border-gray-200 px-3 pb-3 dark:border-gray-600 sm:px-4 sm:pb-4">
                                          <div className="space-y-3 pt-3">
                                            {step.result && (
                                              <div>
                                                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                  Result:
                                                </div>
                                                <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-600 dark:bg-gray-900 sm:p-3">
                                                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300 sm:max-h-64">
                                                    {(() => {
                                                      // First try to extract meaningful content
                                                      const meaningfulContent =
                                                        extractMeaningfulContent(step.result);
                                                      if (meaningfulContent) {
                                                        return meaningfulContent;
                                                      }
                                                      // Fallback to raw display
                                                      return typeof step.result === 'string'
                                                        ? step.result
                                                        : JSON.stringify(step.result, null, 2);
                                                    })()}
                                                  </pre>
                                                </div>
                                              </div>
                                            )}

                                            {step.output && step.output !== step.result && (
                                              <div>
                                                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                  Output:
                                                </div>
                                                <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-600 dark:bg-gray-900 sm:p-3">
                                                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300 sm:max-h-64">
                                                    {(() => {
                                                      // For output, if it's an object, try to extract meaningful content
                                                      if (typeof step.output === 'object') {
                                                        const meaningfulContent =
                                                          extractMeaningfulContent(step.output);
                                                        if (meaningfulContent) {
                                                          return meaningfulContent;
                                                        }
                                                      }
                                                      // Fallback to raw display
                                                      return typeof step.output === 'string'
                                                        ? step.output
                                                        : JSON.stringify(step.output, null, 2);
                                                    })()}
                                                  </pre>
                                                </div>
                                              </div>
                                            )}

                                            {step.error && (
                                              <div>
                                                <div className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
                                                  Error:
                                                </div>
                                                <div className="rounded border border-red-200 bg-red-50 p-2 dark:border-red-700 dark:bg-red-900/20 sm:p-3">
                                                  <pre className="whitespace-pre-wrap text-xs text-red-700 dark:text-red-300">
                                                    {step.error}
                                                  </pre>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="mb-4 font-medium text-red-600 dark:text-red-400">
                              {resultData.error === 'Execution was cancelled by user'
                                ? 'Workflow execution cancelled'
                                : 'Workflow execution failed'}
                            </div>
                            {resultData.error && (
                              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-left dark:border-red-700 dark:bg-red-900/20 sm:p-4">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                                  {resultData.error === 'Execution was cancelled by user'
                                    ? 'Cancellation Details'
                                    : 'Error Details'}
                                </div>
                                <div className="text-xs leading-relaxed text-red-700 dark:text-red-300 sm:text-sm">
                                  {resultData.error}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleCloseResult}
                        className="absolute right-2 top-2 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <X className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                    </div>
                  ) : (
                    // Show testing status with live step updates
                    <div className="relative z-10 mx-2 flex max-w-[90vw] flex-col items-center space-y-4 rounded-xl border border-white/20 bg-white/95 px-4 py-4 shadow-2xl backdrop-blur-sm dark:bg-gray-800/95 sm:mx-4 sm:max-w-lg sm:space-y-6 sm:px-8 sm:py-6">
                      {/* Live step progress */}
                      {currentStep && !isCancelling ? (
                        <div className="w-full space-y-3 sm:space-y-4">
                          {/* Step header */}
                          <div className="border-b border-gray-200/50 pb-3 text-center dark:border-gray-600/50">
                            <div
                              className={`text-xs font-medium uppercase tracking-wider sm:text-sm ${
                                currentStep.status === 'running'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : currentStep.status === 'completed'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {currentStep.status === 'running' && 'EXECUTING'}
                              {currentStep.status === 'completed' && 'COMPLETED'}
                              {currentStep.status === 'failed' && 'FAILED'}
                            </div>
                            <div className="mt-1 break-words text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                              {currentStep.stepName}
                            </div>
                          </div>

                          {/* Loading indicator for running steps */}
                          {currentStep.status === 'running' && (
                            <div className="flex items-center justify-center py-2">
                              <div className="flex space-x-1">
                                <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]"></div>
                                <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]"></div>
                                <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center space-y-4">
                          <div className="text-center">
                            <span
                              className={`block break-words text-lg font-semibold sm:text-xl ${
                                isCancelling
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {isCancelling
                                ? 'Cancelling workflow execution...'
                                : workflowId && isWorkflowTestingFromHook(workflowId) && !isTesting
                                  ? 'Agent initiated test...'
                                  : 'Initializing workflow test...'}
                            </span>
                            <div className="mt-2 flex items-center justify-center space-x-1">
                              <div
                                className={`h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s] ${
                                  isCancelling ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                              ></div>
                              <div
                                className={`h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s] ${
                                  isCancelling ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                              ></div>
                              <div
                                className={`h-1.5 w-1.5 animate-bounce rounded-full ${
                                  isCancelling ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                              ></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border-medium bg-surface-primary-alt p-2 text-sm text-text-secondary sm:p-3">
            <div className="flex items-center">
              <button onClick={() => cycleArtifact('prev')} className="mr-2 text-text-secondary">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs">{`${currentIndex + 1} / ${
                orderedArtifactIds.length
              }`}</span>
              <button onClick={() => cycleArtifact('next')} className="ml-2 text-text-secondary">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Refresh button - Moved from Header */}
              <TooltipAnchor description="Refresh" side="top">
                <button
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8 ${
                    isRefreshing ? 'animate-pulse' : ''
                  }`}
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`h-3 w-3 sm:h-4 sm:w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              </TooltipAnchor>
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
