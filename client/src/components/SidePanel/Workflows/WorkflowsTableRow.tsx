import React from 'react';
import { Play, Pause, Trash2, TestTube } from 'lucide-react';
import type { TUserWorkflow } from 'librechat-data-provider';
import { Button, TableCell, TableRow } from '~/components/ui';
import {
  useDeleteWorkflowMutation,
  useToggleWorkflowMutation,
  useTestWorkflowMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';

interface WorkflowsTableRowProps {
  workflow: TUserWorkflow;
}

const WorkflowsTableRow: React.FC<WorkflowsTableRowProps> = ({ workflow }) => {
  const { showToast } = useToastContext();
  const toggleMutation = useToggleWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();
  const testMutation = useTestWorkflowMutation();

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

  const handleTest = () => {
    testMutation.mutate(workflow.id, {
      onSuccess: () => {
        showToast({
          message: 'Workflow test started successfully',
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

  const formatDate = (dateString?: string | Date) => {
    if (!dateString) return 'Not scheduled';
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      return date.toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusColor = (isActive: boolean, isDraft: boolean) => {
    if (isDraft) {
      return 'bg-orange-100 text-orange-700';
    }
    if (!isActive) {
      return 'bg-gray-100 text-gray-600';
    }
    return 'bg-green-100 text-green-700';
  };

  const getStatusText = (isActive: boolean, isDraft: boolean) => {
    if (isDraft) return 'draft';
    if (!isActive) return 'inactive';
    return 'active';
  };

  // Function to get description length based on sidebar width
  const getDescriptionLength = () => {
    return {
      narrow: 30,   // Very narrow sidebar (collapsed state)
      base: 50,     // Small sidebar
      md: 100,      // Medium sidebar
      lg: 150,      // Large sidebar  
      xl: 200,      // Extra large sidebar
    };
  };

  const descLengths = getDescriptionLength();
  const description = workflow.description || 'No description';

  return (
    <TableRow className="border-b border-border-light hover:bg-surface-hover">
      <TableCell className="py-2">
        <div className="px-2 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate text-xs font-medium text-text-primary" title={workflow.name}>
              {workflow.name}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getStatusColor(
                workflow.isActive,
                workflow.isDraft,
              )}`}
            >
              {getStatusText(workflow.isActive, workflow.isDraft)}
            </span>
          </div>
          
          {/* Responsive description - expands horizontally with sidebar */}
          <div className="text-xs text-text-secondary mb-1" title={description}>
            {/* Very narrow sidebar - minimal description */}
            <span className="truncate block sm:hidden">
              {description.length > descLengths.narrow ? `${description.substring(0, descLengths.narrow)}...` : description}
            </span>
            
            {/* Small sidebar */}
            <span className="truncate hidden sm:block md:hidden">
              {description.length > descLengths.base ? `${description.substring(0, descLengths.base)}...` : description}
            </span>
            
            {/* Medium size */}
            <span className="truncate hidden md:block lg:hidden">
              {description.length > descLengths.md ? `${description.substring(0, descLengths.md)}...` : description}
            </span>
            
            {/* Large size */}
            <span className="truncate hidden lg:block xl:hidden">
              {description.length > descLengths.lg ? `${description.substring(0, descLengths.lg)}...` : description}
            </span>
            
            {/* Extra large size */}
            <span className="truncate hidden xl:block">
              {description.length > descLengths.xl ? `${description.substring(0, descLengths.xl)}...` : description}
            </span>
          </div>
          
          {/* Additional details - only visible when sidebar is wider */}
          <div className="hidden lg:block space-y-1">
            <div className="text-xs text-text-secondary">
              <span className="font-medium">Trigger:</span> {workflow.trigger.type}
            </div>
            <div className="text-xs text-text-secondary">
              <span className="font-medium">Steps:</span> {workflow.steps.length}
            </div>
            {workflow.next_run && (
              <div className="text-xs text-text-secondary">
                <span className="font-medium">Next run:</span> {formatDate(workflow.next_run)}
              </div>
            )}
            {workflow.last_run && (
              <div className="text-xs text-text-secondary">
                <span className="font-medium">Last run:</span> {formatDate(workflow.last_run)}
              </div>
            )}
          </div>
          
          {/* Medium width details - visible when sidebar is moderately wide */}
          <div className="hidden md:block lg:hidden">
            <div className="text-xs text-text-secondary">
              <span className="font-medium">Trigger:</span> {workflow.trigger.type} | 
              <span className="font-medium"> Steps:</span> {workflow.steps.length}
            </div>
            {workflow.next_run && (
              <div className="text-xs text-text-secondary">
                <span className="font-medium">Next:</span> {formatDate(workflow.next_run)}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      
      <TableCell className="py-2 w-16 sm:w-20">
        <div className="flex flex-row gap-1 px-1 sm:px-2 items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTest}
            className="h-6 w-6 p-0 flex-shrink-0 flex items-center justify-center"
            title="Test workflow"
            disabled={workflow.isDraft}
          >
            <TestTube className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-6 w-6 p-0 flex-shrink-0 flex items-center justify-center"
            title={workflow.isActive ? 'Deactivate workflow' : 'Activate workflow'}
            disabled={workflow.isDraft}
          >
            {workflow.isActive ? (
              <Pause className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 flex-shrink-0 flex items-center justify-center"
            title="Delete workflow"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default WorkflowsTableRow; 