import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RefreshCw, X, Play, Pause, TestTube, Trash2, Plus, Search, RotateCcw, Eye, Copy, Check, Square } from 'lucide-react';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import DownloadArtifact from './DownloadArtifact';
import { useEditorContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import ArtifactTabs from './ArtifactTabs';
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
  const { isWorkflowTesting: isWorkflowTestingFromHook, getCurrentStep, getExecutionResult, clearExecutionResult } = useWorkflowNotifications({
    workflowId,
    onTestStart: (testWorkflowId) => {
      if (testWorkflowId === workflowId) {
        setIsTesting(true);
        // Add to testing workflows state
        setTestingWorkflows(prev => new Set(prev).add(testWorkflowId));
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
        if (result?.error === 'Execution stopped by user' && isCancelling && !hasReceivedStopNotification) {
          console.log('[Artifacts] This is the immediate stop notification - keeping cancelling state');
          setHasReceivedStopNotification(true);
          setIsTesting(false);
          // Remove from testing workflows state but keep cancelling state
          setTestingWorkflows(prev => {
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
        setTestingWorkflows(prev => {
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
  const showingResult = !!(resultData && !isTesting && !isCancelling && !(workflowId && isWorkflowTestingFromHook(workflowId)));
  
  // Debug logging
  console.log('[Artifacts] Workflow ID:', workflowId);
  console.log('[Artifacts] Is testing:', isTesting);
  console.log('[Artifacts] Is cancelling:', isCancelling);
  console.log('[Artifacts] Is workflow testing:', workflowId && isWorkflowTestingFromHook(workflowId));
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
      }
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
          setTestingWorkflows(prev => {
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
          setTestingWorkflows(prev => {
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
    setTestingWorkflows(prev => new Set(prev).add(workflowId));
    
    testMutation.mutate(workflowId, {
      onSuccess: (response) => {
        // The workflow notification system will handle the result display
        setIsTesting(false);
        // Remove from testing workflows state
        setTestingWorkflows(prev => {
          const newSet = new Set(prev);
          newSet.delete(workflowId);
          return newSet;
        });
      },
      onError: (error: unknown) => {
        setIsTesting(false);
        // Remove from testing workflows state on error
        setTestingWorkflows(prev => {
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
    setExpandedSteps(prev => {
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
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm sm:relative sm:inset-auto sm:z-auto sm:bg-transparent sm:backdrop-blur-none flex h-full w-full items-center justify-center sm:h-full sm:w-full">
        {/* Main Container - Full width on mobile, full height on desktop */}
        <div
          className={`flex h-full w-full flex-col overflow-hidden border-0 sm:border border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-500 ease-in-out ${
            isVisible ? 'scale-100 opacity-100 blur-0' : 'scale-105 opacity-0 blur-sm'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2 sm:p-3">
            {/* Left: Back button */}
            <TooltipAnchor description="Close artifacts" side="bottom">
              <button 
                className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary" 
                onClick={closeArtifacts}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </TooltipAnchor>
            
            {/* Center: Main workflow actions */}
            {isWorkflowArtifact && workflowId && (
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Test/Stop Button */}
                <TooltipAnchor description={isWorkflowTesting ? "Stop workflow test" : "Test workflow"} side="bottom">
                  <button
                    className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                      isWorkflowTesting 
                        ? 'bg-gradient-to-r from-red-500 to-red-600 border border-red-500/60 hover:from-red-600 hover:to-red-700 hover:border-red-500' 
                        : 'bg-gradient-to-r from-brand-blue to-indigo-600 border border-brand-blue/60 hover:from-indigo-600 hover:to-blue-700 hover:border-brand-blue'
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
                <TooltipAnchor description={isWorkflowActive ? 'Deactivate workflow' : 'Activate workflow'} side="bottom">
                  <button
                    className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                      isWorkflowActive 
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 border border-amber-500/60 text-white hover:from-amber-600 hover:to-orange-700 hover:border-amber-500' 
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 border border-green-500/60 text-white hover:from-green-600 hover:to-emerald-700 hover:border-green-500'
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
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-red-500 to-red-600 border border-red-500/60 text-white shadow-sm transition-all hover:from-red-600 hover:to-red-700 hover:shadow-md hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleDeleteWorkflow}
                    disabled={deleteMutation.isLoading || isWorkflowTesting || isTesting}
                  >
                    <Trash2 className="h-4 w-4 text-white" />
                  </button>
                </TooltipAnchor>
              </div>
            )}
            
            {/* Right: Close button */}
            <TooltipAnchor description="Close artifacts" side="bottom">
              <button 
                className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary" 
                onClick={closeArtifacts}
              >
                <X className="h-4 w-4" />
              </button>
            </TooltipAnchor>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-hidden relative">
            <ArtifactTabs
              isMermaid={isMermaid}
              artifact={currentArtifact}
              isSubmitting={isSubmitting}
              editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
              previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
            />
            
            {/* Testing Overlay - Show for both button-initiated and agent-initiated tests */}
            {(isTesting || isCancelling || (workflowId && isWorkflowTestingFromHook(workflowId)) || showingResult) && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gray-900/50"></div>
                
                {/* Scanner Line Animation - Only show when testing or cancelling */}
                {(isTesting || isCancelling || (workflowId && isWorkflowTestingFromHook(workflowId))) && !showingResult && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className={`scanner-line absolute left-0 right-0 h-1 opacity-80 shadow-lg ${
                      isCancelling 
                        ? 'bg-gradient-to-r from-transparent via-red-400 to-transparent shadow-red-400/50'
                        : 'bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-blue-400/50'
                    }`}></div>
                  </div>
                )}
                
                {/* Testing Status or Results */}
                {showingResult && resultData ? (
                  // Show execution results
                  <div className="relative z-10 flex flex-col items-center space-y-4 rounded-lg bg-white/95 px-4 sm:px-8 py-4 sm:py-6 backdrop-blur-sm dark:bg-gray-800/95 max-w-[90vw] sm:max-w-md mx-2 sm:mx-4 max-h-[80vh] overflow-auto">
                    <div className="flex items-center space-x-3 w-full">
                      {resultData.success ? (
                        <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      )}
                      <span className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">
                        Test {resultData.success ? 'Completed' : 
                          (resultData.error === 'Execution was cancelled by user' ? 'Cancelled' : 'Failed')}
                      </span>
                    </div>
                    
                    {/* Result Details */}
                    <div className="w-full space-y-4 max-h-[60vh] sm:max-h-96 overflow-y-auto">
                      {resultData.success ? (
                        <div className="space-y-3">
                          {resultData.result && Array.isArray(resultData.result) && (
                            <div className="space-y-2 sm:space-y-4">
                              {resultData.result.map((step: any, index: number) => {
                                const stepId = step.stepId || `step_${index}`;
                                const isExpanded = expandedSteps.has(stepId);
                                
                                return (
                                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                                    {/* Step Header - Always Visible */}
                                    <div className="flex items-center justify-between p-3 sm:p-4">
                                      <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                          step.status === 'completed' ? 'bg-green-500' : 
                                          step.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                                        }`}></span>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {step.stepName || step.name || `Step ${index + 1}`}
                                          </div>
                                          {!isExpanded && (
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                              {getStepSummary(step)}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                                        {/* Copy button */}
                                        {(step.result || step.output) && (
                                          <button
                                            onClick={() => handleCopyStepOutput(
                                              stepId, 
                                              typeof (step.result || step.output) === 'string' 
                                                ? (step.result || step.output)
                                                : JSON.stringify(step.result || step.output, null, 2)
                                            )}
                                            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                                            title="Copy output"
                                          >
                                            {copiedStepId === stepId ? (
                                              <Check className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                                            ) : (
                                              <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                                            )}
                                          </button>
                                        )}
                                        
                                        {/* Expand/Collapse button */}
                                        <button
                                          onClick={() => toggleStepExpansion(stepId)}
                                          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                                          title={isExpanded ? "Collapse details" : "Expand details"}
                                        >
                                          {isExpanded ? (
                                            <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />
                                          ) : (
                                            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {/* Step Details - Collapsible */}
                                    {isExpanded && (
                                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-gray-200 dark:border-gray-600">
                                        <div className="pt-3 space-y-3">
                                          {step.result && (
                                            <div>
                                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Result:</div>
                                              <div className="bg-white dark:bg-gray-900 rounded p-2 sm:p-3 border border-gray-200 dark:border-gray-600">
                                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-32 sm:max-h-64 overflow-y-auto">
                                                  {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                                                </pre>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {step.output && step.output !== step.result && (
                                            <div>
                                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Output:</div>
                                              <div className="bg-white dark:bg-gray-900 rounded p-2 sm:p-3 border border-gray-200 dark:border-gray-600">
                                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-32 sm:max-h-64 overflow-y-auto">
                                                  {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                                                </pre>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {step.error && (
                                            <div>
                                              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Error:</div>
                                              <div className="bg-red-50 dark:bg-red-900/20 rounded p-2 sm:p-3 border border-red-200 dark:border-red-700">
                                                <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
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
                          <div className="font-medium text-red-600 dark:text-red-400 mb-4">
                            {resultData.error === 'Execution was cancelled by user' 
                              ? 'Workflow execution cancelled' 
                              : 'Workflow execution failed'}
                          </div>
                          {resultData.error && (
                            <div className="text-left bg-red-50 dark:bg-red-900/20 p-3 sm:p-4 rounded-lg border border-red-200 dark:border-red-700">
                              <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 uppercase tracking-wide">
                                {resultData.error === 'Execution was cancelled by user' ? 'Cancellation Details' : 'Error Details'}
                              </div>
                              <div className="text-xs sm:text-sm text-red-700 dark:text-red-300 leading-relaxed">
                                {resultData.error}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleCloseResult}
                      className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  </div>
                ) : (
                  // Show testing status with live step updates
                  <div className="relative z-10 flex flex-col items-center space-y-4 sm:space-y-6 rounded-xl bg-white/95 px-4 sm:px-8 py-4 sm:py-6 backdrop-blur-sm dark:bg-gray-800/95 max-w-[90vw] sm:max-w-lg mx-2 sm:mx-4 shadow-2xl border border-white/20">
                    {/* Live step progress */}
                    {currentStep && !isCancelling ? (
                      <div className="w-full space-y-3 sm:space-y-4">
                        {/* Step header */}
                        <div className="text-center pb-3 border-b border-gray-200/50 dark:border-gray-600/50">
                          <div className={`text-xs sm:text-sm font-medium uppercase tracking-wider ${
                            currentStep.status === 'running' 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : currentStep.status === 'completed'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {currentStep.status === 'running' && 'EXECUTING'}
                            {currentStep.status === 'completed' && 'COMPLETED'}
                            {currentStep.status === 'failed' && 'FAILED'}
                          </div>
                          <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1 break-words">
                            {currentStep.stepName}
                          </div>
                        </div>
                        
                        {/* Loading indicator for running steps */}
                        {currentStep.status === 'running' && (
                          <div className="flex items-center justify-center py-2">
                            <div className="flex space-x-1">
                              <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                              <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                              <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-4">
                        <div className="text-center">
                          <span className={`text-lg sm:text-xl font-semibold block break-words ${
                            isCancelling 
                              ? 'text-red-600 dark:text-red-400' 
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {isCancelling 
                              ? 'Cancelling workflow execution...'
                              : workflowId && isWorkflowTestingFromHook(workflowId) && !isTesting 
                                ? 'Agent initiated test...'
                                : 'Initializing workflow test...'
                            }
                          </span>
                          <div className="flex items-center justify-center space-x-1 mt-2">
                            <div className={`h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s] ${
                              isCancelling ? 'bg-red-500' : 'bg-blue-500'
                            }`}></div>
                            <div className={`h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s] ${
                              isCancelling ? 'bg-red-500' : 'bg-blue-500'
                            }`}></div>
                            <div className={`h-1.5 w-1.5 rounded-full animate-bounce ${
                              isCancelling ? 'bg-red-500' : 'bg-blue-500'
                            }`}></div>
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
          <div className="flex items-center justify-between border-t border-border-medium bg-surface-primary-alt p-2 sm:p-3 text-sm text-text-secondary">
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
                  className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary ${
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
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              <DownloadArtifact artifact={currentArtifact} />
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
