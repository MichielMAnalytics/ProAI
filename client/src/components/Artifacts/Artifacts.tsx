import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RefreshCw, X, Play, Pause, TestTube, Trash2, Plus, Search, RotateCcw, Eye, Copy, Check } from 'lucide-react';
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
  useWorkflowQuery,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useWorkflowNotifications } from '~/hooks/useWorkflowNotifications';
import { Button } from '~/components/ui';

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const { showToast } = useToastContext();
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isVisible, setIsVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const setArtifactRefreshFunction = useSetRecoilState(store.artifactRefreshFunction);

  // Workflow mutations
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const testMutation = useTestWorkflowMutation();

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
  const { isWorkflowTesting, getCurrentStep, getExecutionResult, clearExecutionResult } = useWorkflowNotifications({
    workflowId,
    onTestStart: (testWorkflowId) => {
      if (testWorkflowId === workflowId) {
        setIsTesting(true);
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
        setIsTesting(false);
        // Result data is now managed by the hook - no automatic clearing
      }
    },
  });

  // Get current step and result from the hook
  const currentStep = workflowId ? getCurrentStep(workflowId) : null;
  const resultData = workflowId ? getExecutionResult(workflowId) : null;
  
  // Determine if we should show the result overlay
  const showingResult = !!(resultData && !isTesting && !(workflowId && isWorkflowTesting(workflowId)));
  
  // Debug logging
  console.log('[Artifacts] Workflow ID:', workflowId);
  console.log('[Artifacts] Is testing:', isTesting);
  console.log('[Artifacts] Is workflow testing:', workflowId && isWorkflowTesting(workflowId));
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
    
    setIsTesting(true);
    
    testMutation.mutate(workflowId, {
      onSuccess: (response) => {
        // The workflow notification system will handle the result display
        setIsTesting(false);
      },
      onError: (error: unknown) => {
        setIsTesting(false);
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
      {/* Main Parent */}
      <div className="flex h-full w-full items-center justify-center">
        {/* Main Container */}
        <div
          className={`flex h-full w-full flex-col overflow-hidden border border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-500 ease-in-out ${
            isVisible ? 'scale-100 opacity-100 blur-0' : 'scale-105 opacity-0 blur-sm'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-3">
            {/* Left: Back button */}
            <button className="text-text-secondary hover:text-text-primary" onClick={closeArtifacts}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            
            {/* Center: Main workflow actions */}
            {isWorkflowArtifact && workflowId && (
              <div className="flex items-center gap-4">
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm transition-all hover:bg-blue-100 hover:shadow-md disabled:opacity-50"
                  onClick={handleTestWorkflow}
                  disabled={testMutation.isLoading}
                  title="Test workflow"
                >
                  <TestTube className="h-5 w-5" />
                </button>
                <button
                  className={`flex h-10 w-10 items-center justify-center rounded-lg shadow-sm transition-all hover:shadow-md disabled:opacity-50 ${
                    isWorkflowActive 
                      ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' 
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                  onClick={handleToggleWorkflow}
                  disabled={toggleMutation.isLoading}
                  title={isWorkflowActive ? 'Deactivate workflow' : 'Activate workflow'}
                >
                  {toggleMutation.isLoading ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : isWorkflowActive ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </button>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 shadow-sm transition-all hover:bg-red-100 hover:shadow-md disabled:opacity-50"
                  onClick={handleDeleteWorkflow}
                  disabled={deleteMutation.isLoading}
                  title="Delete workflow"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            )}
            
            {/* Right: Close button */}
            <button className="text-text-secondary hover:text-text-primary" onClick={closeArtifacts}>
              <X className="h-5 w-5" />
            </button>
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
            {(isTesting || (workflowId && isWorkflowTesting(workflowId)) || showingResult) && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gray-900/50"></div>
                
                {/* Scanner Line Animation - Only show when testing */}
                {(isTesting || (workflowId && isWorkflowTesting(workflowId))) && !showingResult && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="scanner-line absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-80 shadow-lg shadow-blue-400/50"></div>
                  </div>
                )}
                
                {/* Testing Status or Results */}
                {showingResult && resultData ? (
                  // Show execution results
                  <div className="relative z-10 flex flex-col items-center space-y-4 rounded-lg bg-white/95 px-8 py-6 backdrop-blur-sm dark:bg-gray-800/95 max-w-md mx-4">
                    <div className="flex items-center space-x-3">
                      {resultData.success ? (
                        <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-red-500 flex items-center justify-center">
                          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      )}
                      <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        Test {resultData.success ? 'Completed' : 'Failed'}
                      </span>
                    </div>
                    
                    {/* Result Details */}
                    <div className="w-full space-y-4 max-h-96 overflow-y-auto">
                      {resultData.success ? (
                        <div className="space-y-3">
                          {resultData.result && Array.isArray(resultData.result) && (
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                              {resultData.result.map((step: any, index: number) => {
                                const stepId = step.stepId || `step_${index}`;
                                const isExpanded = expandedSteps.has(stepId);
                                
                                return (
                                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                                    {/* Step Header - Always Visible */}
                                    <div className="flex items-center justify-between p-4">
                                      <div className="flex items-center space-x-3 flex-1">
                                        <span className={`w-2 h-2 rounded-full ${
                                          step.status === 'completed' ? 'bg-green-500' : 
                                          step.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                                        }`}></span>
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {step.stepName || step.name || `Step ${index + 1}`}
                                          </div>
                                          {!isExpanded && (
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                              {getStepSummary(step)}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="flex items-center space-x-2">
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
                                              <Check className="w-4 h-4 text-green-500" />
                                            ) : (
                                              <Copy className="w-4 h-4" />
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
                                            <ChevronUp className="w-4 h-4" />
                                          ) : (
                                            <ChevronDown className="w-4 h-4" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {/* Step Details - Collapsible */}
                                    {isExpanded && (
                                      <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-600">
                                        <div className="pt-3 space-y-3">
                                          {step.result && (
                                            <div>
                                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Result:</div>
                                              <div className="bg-white dark:bg-gray-900 rounded p-3 border border-gray-200 dark:border-gray-600">
                                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                                                  {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                                                </pre>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {step.output && step.output !== step.result && (
                                            <div>
                                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Output:</div>
                                              <div className="bg-white dark:bg-gray-900 rounded p-3 border border-gray-200 dark:border-gray-600">
                                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                                                  {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                                                </pre>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {step.error && (
                                            <div>
                                              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Error:</div>
                                              <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 border border-red-200 dark:border-red-700">
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
                            ❌ Workflow execution failed
                          </div>
                          {resultData.error && (
                            <div className="text-left bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-700">
                              <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 uppercase tracking-wide">
                                Error Details
                              </div>
                              <div className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
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
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  // Show testing status with live step updates
                  <div className="relative z-10 flex flex-col items-center space-y-6 rounded-xl bg-white/95 px-8 py-6 backdrop-blur-sm dark:bg-gray-800/95 max-w-lg mx-4 shadow-2xl border border-white/20">
                    {/* Live step progress */}
                    {currentStep ? (
                      <div className="w-full space-y-4">
                        {/* Step header */}
                        <div className="text-center pb-3 border-b border-gray-200/50 dark:border-gray-600/50">
                          <div className={`text-sm font-medium uppercase tracking-wider ${
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
                          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1">
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
                          <span className="text-xl font-semibold text-gray-900 dark:text-gray-100 block">
                            {workflowId && isWorkflowTesting(workflowId) && !isTesting 
                              ? 'Agent initiated test...'
                              : 'Initializing workflow test...'
                            }
                          </span>
                          <div className="flex items-center justify-center space-x-1 mt-2">
                            <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-bounce"></div>
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
          <div className="flex items-center justify-between border-t border-border-medium bg-surface-primary-alt p-2 text-sm text-text-secondary">
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
            
            <div className="flex items-center gap-2">
              {/* Refresh button - Moved from Header */}
              <button
                className={`flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary ${
                  isRefreshing ? 'animate-pulse' : ''
                }`}
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </button>
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              <DownloadArtifact artifact={currentArtifact} />
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
