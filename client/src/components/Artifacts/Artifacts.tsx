import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, X, Play, Pause, TestTube, Trash2 } from 'lucide-react';
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

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const { showToast } = useToastContext();
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isVisible, setIsVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
    
    testMutation.mutate(workflowId, {
      onSuccess: () => {
        showToast({
          message: 'Workflow test successfully',
          severity: NotificationSeverity.SUCCESS,
        });
      },
      onError: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          message: `Failed to test workflow: ${errorMessage}`,
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      {/* Main Parent */}
      <div className="flex h-full w-full items-center justify-center">
        {/* Main Container */}
        <div
          className={`flex h-full w-full flex-col overflow-hidden border border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-500 ease-in-out ${
            isVisible ? 'scale-100 opacity-100 blur-0' : 'scale-105 opacity-0 blur-sm'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2">
            <div className="flex items-center">
              <button className="mr-2 text-text-secondary" onClick={closeArtifacts}>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h3 className="truncate text-sm text-text-primary">{currentArtifact.title}</h3>
            </div>
            <div className="flex items-center">
              {/* Refresh button */}
              {activeTab === 'preview' && (
                <button
                  className={`mr-2 text-text-secondary transition-transform duration-500 ease-in-out ${
                    isRefreshing ? 'rotate-180' : ''
                  }`}
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh"
                >
                  <RefreshCw
                    size={16}
                    className={`transform ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
              {activeTab !== 'preview' && isMutating && (
                <RefreshCw size={16} className="mr-2 animate-spin text-text-secondary" />
              )}
              {/* Tabs */}
              <Tabs.List className="mr-2 inline-flex h-7 rounded-full border border-border-medium bg-surface-tertiary">
                <Tabs.Trigger
                  value="preview"
                  disabled={isMutating}
                  className="border-0.5 flex items-center gap-1 rounded-full border-transparent py-1 pl-2.5 pr-2.5 text-xs font-medium text-text-secondary data-[state=active]:border-border-light data-[state=active]:bg-surface-primary-alt data-[state=active]:text-text-primary"
                >
                  {localize('com_ui_preview')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="code"
                  className="border-0.5 flex items-center gap-1 rounded-full border-transparent py-1 pl-2.5 pr-2.5 text-xs font-medium text-text-secondary data-[state=active]:border-border-light data-[state=active]:bg-surface-primary-alt data-[state=active]:text-text-primary"
                >
                  {localize('com_ui_code')}
                </Tabs.Trigger>
              </Tabs.List>
              <button className="text-text-secondary" onClick={closeArtifacts}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-hidden">
          <ArtifactTabs
            isMermaid={isMermaid}
            artifact={currentArtifact}
            isSubmitting={isSubmitting}
            editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
            previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
          />
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
            
            {/* Workflow Management Buttons - Centered */}
            {isWorkflowArtifact && workflowId && (
              <div className="flex items-center gap-2">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  onClick={handleTestWorkflow}
                  disabled={testMutation.isLoading}
                  title="Test workflow"
                >
                  <TestTube className="h-4 w-4" />
                </button>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  onClick={handleToggleWorkflow}
                  disabled={toggleMutation.isLoading}
                  title={isWorkflowActive ? 'Deactivate workflow' : 'Activate workflow'}
                >
                  {toggleMutation.isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : isWorkflowActive ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  onClick={handleDeleteWorkflow}
                  disabled={deleteMutation.isLoading}
                  title="Delete workflow"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              {/* Download Button */}
              <DownloadArtifact artifact={currentArtifact} />
              {/* Publish button */}
              {/* <button className="border-0.5 min-w-[4rem] whitespace-nowrap rounded-md border-border-medium bg-[radial-gradient(ellipse,_var(--tw-gradient-stops))] from-surface-active from-50% to-surface-active px-3 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-active hover:text-text-primary active:scale-[0.985] active:bg-surface-active">
                Publish
              </button> */}
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
