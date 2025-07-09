import React from 'react';
import { Trash2, Eye } from 'lucide-react';
import type { TUserWorkflow } from 'librechat-data-provider';
import { Button, TableCell, TableRow } from '~/components/ui';
import { useDeleteWorkflowMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useNavigateToConvo } from '~/hooks';
import { useTimezone } from '~/hooks/useTimezone';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import { useLocalize } from '~/hooks';
import { useWorkflowBuilder } from '~/hooks/useWorkflowBuilder';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';

interface WorkflowsTableRowProps {
  workflow: TUserWorkflow;
}

const WorkflowsTableRow: React.FC<WorkflowsTableRowProps> = ({ workflow }) => {
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const { openWorkflowBuilder, closeWorkflowBuilder, workflowId: currentOpenWorkflowId } = useWorkflowBuilder();
  const { formatDateTime, getTimezoneAbbr } = useTimezone();
  const { navigateToConvo } = useNavigateToConvo();
  const queryClient = useQueryClient();

  // Workflow mutations
  const deleteMutation = useDeleteWorkflowMutation();


  const handleDelete = () => {
    deleteMutation.mutate(workflow.id, {
      onSuccess: () => {
        // If this workflow is currently open in the builder, close it
        if (currentOpenWorkflowId === workflow.id) {
          closeWorkflowBuilder();
        }
        
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

  const handleView = async () => {
    console.log('Opening workflow in builder for:', workflow);
    
    // If the workflow has an associated conversation, navigate to it
    if (workflow.conversation_id) {
      try {
        console.log('Fetching conversation:', workflow.conversation_id);
        // Fetch the conversation data
        const conversation = await queryClient.fetchQuery(
          [QueryKeys.conversation, workflow.conversation_id],
          () => dataService.getConversationById(workflow.conversation_id as string)
        );
        
        if (conversation) {
          console.log('Navigating to workflow conversation:', conversation);
          // Navigate to the conversation first
          navigateToConvo(conversation);
        }
      } catch (error) {
        console.error('Error fetching conversation:', error);
        // If we can't fetch the conversation, just open the workflow builder
      }
    }
    
    // Open the workflow builder with this specific workflow ID for editing
    openWorkflowBuilder(workflow.id);
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
    if (isDraft) return 'draft'; // Inactive drafts are "draft"
    return 'inactive'; // Inactive non-drafts are "inactive"
  };

  // Function to count only main workflow steps (excluding error/success handlers)
  const getMainStepCount = (steps: TUserWorkflow['steps']) => {
    return steps.filter((step) => {
      const isErrorStep =
        step.name.toLowerCase().includes('error') ||
        step.name.toLowerCase().includes('handler') ||
        step.id.toLowerCase().includes('error');
      const isSuccessStep =
        step.name.toLowerCase().includes('success') || step.id.toLowerCase().includes('success');
      return !isErrorStep && !isSuccessStep;
    }).length;
  };

  const description = workflow.description || 'No description';

  return (
    <TableRow className="border-b border-border-light hover:bg-surface-hover">
      <TableCell className="py-2">
        <div className="flex flex-row items-center justify-start gap-1 px-1 sm:px-2">
          <TooltipAnchor description="View workflow" side="top">
            <button
              onClick={handleView}
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-300 bg-gray-100 text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-600"
              disabled={false}
            >
              <Eye className="h-3 w-3" />
            </button>
          </TooltipAnchor>
          <TooltipAnchor description="Delete workflow" side="top">
            <button
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm transition-all hover:border-red-500 hover:from-red-600 hover:to-red-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              disabled={deleteMutation.isLoading}
            >
              <Trash2 className="h-3 w-3 text-white" />
            </button>
          </TooltipAnchor>
        </div>
      </TableCell>

      <TableCell className="py-2">
        <div className="min-w-0 max-w-full overflow-hidden px-2">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <TooltipAnchor description={workflow.name} side="top">
              <span className="min-w-0 flex-1 cursor-help truncate text-xs font-medium text-text-primary">
                {workflow.name}
              </span>
            </TooltipAnchor>
            <span
              className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
                workflow.isActive,
                workflow.isDraft,
              )}`}
            >
              {getStatusText(workflow.isActive, workflow.isDraft)}
            </span>
          </div>

          {/* Description with tooltip */}
          <div className="mb-1 min-w-0 text-xs text-text-secondary">
            <TooltipAnchor description={description} side="top">
              <span className="block cursor-help truncate">{description}</span>
            </TooltipAnchor>
          </div>

          {/* Additional details - only visible when sidebar is wider */}
          <div className="hidden min-w-0 space-y-1 lg:block">
            <div className="truncate text-xs text-text-secondary">
              <span className="font-medium">Trigger:</span> {workflow.trigger.type}
            </div>
            <div className="truncate text-xs text-text-secondary">
              <span className="font-medium">Steps:</span> {getMainStepCount(workflow.steps)}
            </div>
            {workflow.next_run && (
              <div className="truncate text-xs text-text-secondary">
                <span className="font-medium">Next run:</span> {formatDate(workflow.next_run)}
              </div>
            )}
            {workflow.last_run && (
              <div className="truncate text-xs text-text-secondary">
                <span className="font-medium">Last run:</span> {formatDate(workflow.last_run)}
              </div>
            )}
          </div>

          {/* Medium width details - visible when sidebar is moderately wide */}
          <div className="hidden min-w-0 md:block lg:hidden">
            <div className="truncate text-xs text-text-secondary">
              <span className="font-medium">Trigger:</span> {workflow.trigger.type} |
              <span className="font-medium"> Steps:</span> {getMainStepCount(workflow.steps)}
            </div>
            {workflow.next_run && (
              <div className="truncate text-xs text-text-secondary">
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
