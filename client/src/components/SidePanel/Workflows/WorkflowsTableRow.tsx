import React from 'react';
import { Play, Pause, Trash2, Eye } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import type { TUserWorkflow } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { Button, TableCell, TableRow } from '~/components/ui';
import {
  useDeleteWorkflowMutation,
  useToggleWorkflowMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useNavigateToConvo } from '~/hooks';
import store from '~/store';
import { useTimezone } from '~/hooks/useTimezone';
import { TooltipAnchor } from '~/components/ui/Tooltip';

interface WorkflowsTableRowProps {
  workflow: TUserWorkflow;
}

const WorkflowsTableRow: React.FC<WorkflowsTableRowProps> = ({ workflow }) => {
  const { showToast } = useToastContext();
  const { formatDateTime, getTimezoneAbbr } = useTimezone();
  const { navigateToConvo } = useNavigateToConvo();
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  
  // Artifact state management
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);

  const handleToggle = () => {
    toggleMutation.mutate(
      { workflowId: workflow.id, isActive: !workflow.isActive },
      {
        onSuccess: () => {
          showToast({
            message: `Workflow ${workflow.isActive ? 'deactivated' : 'activated'} successfully`,
            severity: NotificationSeverity.SUCCESS,
          });
        },
        onError: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            message: `Failed to ${workflow.isActive ? 'deactivate' : 'activate'} workflow: ${errorMessage}`,
            severity: NotificationSeverity.ERROR,
          });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(workflow.id, {
      onSuccess: () => {
        showToast({
          message: 'Workflow deleted successfully',
          severity: NotificationSeverity.SUCCESS,
        });
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



  const handleView = () => {
    try {
      console.log('Opening workflow visualization for:', workflow);
      console.log('Workflow conversation_id:', workflow.conversation_id);
      console.log('Workflow fields:', Object.keys(workflow));
      
      // Create workflow artifact with proper positioning
      const artifactId = `workflow-${workflow.id}`;
      
      // Generate positions for steps that don't have them
      const nodesWithPositions = workflow.steps.map((step, index) => {
        // If step doesn't have position, create a default layout
        const defaultPosition = step.position || {
          x: 100 + (index % 3) * 200, // Arrange in columns
          y: 150 + Math.floor(index / 3) * 100 // Arrange in rows
        };
        
        return {
          id: step.id,
          type: step.type,
          position: defaultPosition,
          data: {
            label: step.name,
            config: step.config,
            status: 'pending' // Default status for viewing
          }
        };
      });

      // Generate edges more carefully
      const edges: Array<{
        id: string;
        source: string;
        target: string;
        type: 'success' | 'failure';
      }> = [];
      workflow.steps.forEach((step) => {
        if (step.onSuccess) {
          // Check if target step exists
          const targetExists = workflow.steps.some(s => s.id === step.onSuccess);
          if (targetExists) {
            edges.push({
              id: `${step.id}-success-${step.onSuccess}`,
              source: step.id,
              target: step.onSuccess,
              type: 'success'
            });
          }
        }
        if (step.onFailure) {
          // Check if target step exists
          const targetExists = workflow.steps.some(s => s.id === step.onFailure);
          if (targetExists) {
            edges.push({
              id: `${step.id}-failure-${step.onFailure}`,
              source: step.id,
              target: step.onFailure,
              type: 'failure'
            });
          }
        }
      });

      const workflowData = {
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: workflow.steps
        },
        nodes: nodesWithPositions,
        edges: edges,
        trigger: workflow.trigger
      };

      console.log('Generated workflow data:', workflowData);

      const workflowArtifact = {
        id: artifactId,
        identifier: artifactId,
        title: `Workflow: ${workflow.name}`,
        type: 'application/vnd.workflow',
        content: JSON.stringify(workflowData, null, 2),
        messageId: workflow.parent_message_id || `workflow-view-${Date.now()}`,
        index: 0,
        lastUpdateTime: Date.now(),
      };

      console.log('Creating artifact:', workflowArtifact);

      // Check if we have conversation info for navigation
      if (workflow.conversation_id) {
        // Navigate to the conversation where the workflow was created
        const targetConversation = {
          conversationId: workflow.conversation_id,
          title: `Workflow: ${workflow.name}`,
          endpoint: (workflow.endpoint as EModelEndpoint) || null,
          model: workflow.ai_model || null,
          createdAt: workflow.createdAt ? 
            (typeof workflow.createdAt === 'object' && '$date' in workflow.createdAt ? 
              workflow.createdAt.$date : workflow.createdAt.toString()) : 
            new Date().toISOString(),
          updatedAt: workflow.updatedAt ? 
            (typeof workflow.updatedAt === 'object' && '$date' in workflow.updatedAt ? 
              workflow.updatedAt.$date : workflow.updatedAt.toString()) : 
            new Date().toISOString(),
          // Include other necessary fields
        };

        // Set up artifacts after navigation using a slight delay to ensure navigation completes
        const setupArtifacts = () => {
          // Set the artifact in state
          setArtifacts(prev => ({
            ...prev,
            [artifactId]: workflowArtifact
          }));

          // Set as current artifact and show artifacts panel
          setCurrentArtifactId(artifactId);
          setArtifactsVisible(true);
        };

        // Navigate to conversation first, then set up artifacts
        navigateToConvo(targetConversation);
        
        // Use setTimeout to ensure navigation completes before setting artifacts
        setTimeout(setupArtifacts, 100);

        showToast({
          message: 'Opening workflow visualization',
          severity: NotificationSeverity.SUCCESS,
        });
      } else {
        // Fallback: Just show the artifact in the current conversation
        console.log('No conversation_id found, showing artifact in current conversation');
        
        // Set the artifact in state
        setArtifacts(prev => ({
          ...prev,
          [artifactId]: workflowArtifact
        }));

        // Set as current artifact and show artifacts panel
        setCurrentArtifactId(artifactId);
        setArtifactsVisible(true);

        showToast({
          message: 'Workflow visualization opened (no source conversation found)',
          severity: NotificationSeverity.SUCCESS,
        });
      }
    } catch (error) {
      console.error('Failed to open workflow visualization:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast({
        message: `Failed to open workflow visualization: ${errorMessage}`,
        severity: NotificationSeverity.ERROR,
      });
    }
  };

  const formatDate = (dateInput?: string | Date | { $date: string }) => {
    if (!dateInput) return 'Not scheduled';
    
    try {
      let dateToFormat: string | Date;
      
      // Handle MongoDB date objects { "$date": "ISO_STRING" }
      if (typeof dateInput === 'object' && dateInput !== null && '$date' in dateInput) {
        dateToFormat = dateInput.$date;
      } else {
        dateToFormat = dateInput as string | Date;
      }
      
      return formatDateTime(dateToFormat);
    } catch (error) {
      console.warn('Failed to format date:', dateInput, error);
      return 'Invalid date';
    }
  };

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
    if (isActive) return 'active'; // Active workflows are always "active"
    if (isDraft) return 'draft';   // Inactive drafts are "draft"
    return 'inactive';             // Inactive non-drafts are "inactive"
  };

  // Function to count only main workflow steps (excluding error/success handlers)
  const getMainStepCount = (steps: TUserWorkflow['steps']) => {
    return steps.filter(step => {
      const isErrorStep = step.name.toLowerCase().includes('error') || 
                         step.name.toLowerCase().includes('handler') ||
                         step.id.toLowerCase().includes('error');
      const isSuccessStep = step.name.toLowerCase().includes('success') ||
                           step.id.toLowerCase().includes('success');
      return !isErrorStep && !isSuccessStep;
    }).length;
  };

  const description = workflow.description || 'No description';

  return (
    <TableRow className="border-b border-border-light hover:bg-surface-hover">
      <TableCell className="py-2">
        <div className="flex flex-row gap-1 px-1 sm:px-2 items-center justify-start">
          <TooltipAnchor description="View workflow" side="top">
            <button
              onClick={handleView}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 border border-gray-300 text-gray-700 shadow-sm transition-all hover:bg-gray-200 hover:shadow-md hover:border-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 dark:hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={false}
            >
              <Eye className="h-3 w-3" />
            </button>
          </TooltipAnchor>
          <TooltipAnchor description={workflow.isActive ? 'Deactivate workflow' : 'Activate workflow'} side="top">
            <button
              onClick={handleToggle}
              className={`flex h-6 w-6 items-center justify-center rounded-lg shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                workflow.isActive 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 border border-amber-500/60 text-white hover:from-amber-600 hover:to-orange-700 hover:border-amber-500' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-600 border border-green-500/60 text-white hover:from-green-600 hover:to-emerald-700 hover:border-green-500'
              }`}
              disabled={false}
            >
              {workflow.isActive ? (
                <Pause className="h-3 w-3 text-white" />
              ) : (
                <Play className="h-3 w-3 text-white" />
              )}
            </button>
          </TooltipAnchor>
          <TooltipAnchor description="Delete workflow" side="top">
            <button
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-r from-red-500 to-red-600 border border-red-500/60 text-white shadow-sm transition-all hover:from-red-600 hover:to-red-700 hover:shadow-md hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3 text-white" />
            </button>
          </TooltipAnchor>
        </div>
      </TableCell>
      
      <TableCell className="py-2">
        <div className="px-2 min-w-0 max-w-full overflow-hidden">
          <div className="mb-1 flex items-center gap-2 min-w-0">
            <TooltipAnchor description={workflow.name} side="top">
              <span className="truncate text-xs font-medium text-text-primary cursor-help flex-1 min-w-0">
                {workflow.name}
              </span>
            </TooltipAnchor>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getStatusColor(
                workflow.isActive,
                workflow.isDraft,
              )}`}
            >
              {getStatusText(workflow.isActive, workflow.isDraft)}
            </span>
          </div>
          
          {/* Description with tooltip */}
          <div className="text-xs text-text-secondary mb-1 min-w-0">
            <TooltipAnchor description={description} side="top">
              <span className="truncate block cursor-help">
                {description}
              </span>
            </TooltipAnchor>
          </div>
          
          {/* Additional details - only visible when sidebar is wider */}
          <div className="hidden lg:block space-y-1 min-w-0">
            <div className="text-xs text-text-secondary truncate">
              <span className="font-medium">Trigger:</span> {workflow.trigger.type}
            </div>
            <div className="text-xs text-text-secondary truncate">
              <span className="font-medium">Steps:</span> {getMainStepCount(workflow.steps)}
            </div>
            {workflow.next_run && (
              <div className="text-xs text-text-secondary truncate">
                <span className="font-medium">Next run:</span> {formatDate(workflow.next_run)}
              </div>
            )}
            {workflow.last_run && (
              <div className="text-xs text-text-secondary truncate">
                <span className="font-medium">Last run:</span> {formatDate(workflow.last_run)}
              </div>
            )}
          </div>
          
          {/* Medium width details - visible when sidebar is moderately wide */}
          <div className="hidden md:block lg:hidden min-w-0">
            <div className="text-xs text-text-secondary truncate">
              <span className="font-medium">Trigger:</span> {workflow.trigger.type} | 
              <span className="font-medium"> Steps:</span> {getMainStepCount(workflow.steps)}
            </div>
            {workflow.next_run && (
              <div className="text-xs text-text-secondary truncate">
                <span className="font-medium">Next:</span> {formatDate(workflow.next_run)}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default WorkflowsTableRow; 