import React from 'react';
import { Play, Pause, Trash2 } from 'lucide-react';
import type { TSchedulerTask } from 'librechat-data-provider';
import { Button, TableCell, TableRow } from '~/components/ui';
import {
  useDeleteSchedulerTaskMutation,
  useToggleSchedulerTaskMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useTimezone } from '~/hooks/useTimezone';
import { TooltipAnchor } from '~/components/ui/Tooltip';

interface SchedulesTableRowProps {
  task: TSchedulerTask;
}

const SchedulesTableRow: React.FC<SchedulesTableRowProps> = ({ task }) => {
  const { showToast } = useToastContext();
  const { formatDateTime, getTimezoneAbbr } = useTimezone();
  const toggleMutation = useToggleSchedulerTaskMutation();
  const deleteMutation = useDeleteSchedulerTaskMutation();

  const handleToggle = () => {
    toggleMutation.mutate(
      { taskId: task.id, enabled: !task.enabled },
      {
        onSuccess: () => {
          showToast({
            message: `Task ${task.enabled ? 'disabled' : 'enabled'} successfully`,
            severity: NotificationSeverity.SUCCESS,
          });
        },
        onError: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showToast({
            message: `Failed to ${task.enabled ? 'disable' : 'enable'} task: ${errorMessage}`,
            severity: NotificationSeverity.ERROR,
          });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(task.id, {
      onSuccess: () => {
        showToast({
          message: 'Task deleted successfully',
          severity: NotificationSeverity.SUCCESS,
        });
      },
      onError: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          message: `Failed to delete task: ${errorMessage}`,
          severity: NotificationSeverity.ERROR,
        });
      },
    });
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

  const getStatusColor = (status: string, enabled: boolean) => {
    if (!enabled) {
      return 'bg-gray-100 text-gray-600';
    }
    
    switch (status) {
      case 'pending':
        return 'bg-blue-100 text-blue-700';
      case 'running':
        return 'bg-yellow-100 text-yellow-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
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

  return (
    <TableRow className="border-b border-border-light hover:bg-surface-hover">
      <TableCell className="py-2 w-16 sm:w-20">
        <div className="flex flex-row gap-1 px-1 sm:px-2 items-center justify-start">
          <TooltipAnchor description={task.enabled ? 'Disable task' : 'Enable task'} side="top">
            <button
              onClick={handleToggle}
              className={`flex h-6 w-6 items-center justify-center rounded-md shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                task.enabled 
                  ? 'bg-orange-600 text-white hover:bg-orange-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
              disabled={false}
            >
              {task.enabled ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </button>
          </TooltipAnchor>
          <TooltipAnchor description="Delete task" side="top">
            <button
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-red-600 text-white shadow-sm transition-all hover:bg-red-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </TooltipAnchor>
        </div>
      </TableCell>
      
      <TableCell className="py-2">
        <div className="px-2 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="truncate text-xs font-medium text-text-primary" title={task.name}>
              {task.name}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getStatusColor(
                task.status,
                task.enabled,
              )}`}
            >
              {task.enabled ? task.status : 'disabled'}
            </span>
          </div>
          
          {/* Responsive prompt description - expands horizontally with sidebar */}
          <div className="text-xs text-text-secondary mb-1" title={task.prompt}>
            {/* Very narrow sidebar - minimal description */}
            <span className="truncate block sm:hidden">
              {task.prompt.length > descLengths.narrow ? `${task.prompt.substring(0, descLengths.narrow)}...` : task.prompt}
            </span>
            
            {/* Small sidebar */}
            <span className="truncate hidden sm:block md:hidden">
              {task.prompt.length > descLengths.base ? `${task.prompt.substring(0, descLengths.base)}...` : task.prompt}
            </span>
            
            {/* Medium size */}
            <span className="truncate hidden md:block lg:hidden">
              {task.prompt.length > descLengths.md ? `${task.prompt.substring(0, descLengths.md)}...` : task.prompt}
            </span>
            
            {/* Large size */}
            <span className="truncate hidden lg:block xl:hidden">
              {task.prompt.length > descLengths.lg ? `${task.prompt.substring(0, descLengths.lg)}...` : task.prompt}
            </span>
            
            {/* Extra large size */}
            <span className="truncate hidden xl:block">
              {task.prompt.length > descLengths.xl ? `${task.prompt.substring(0, descLengths.xl)}...` : task.prompt}
            </span>
          </div>
          
          {/* Additional details - only visible when sidebar is wider */}
          <div className="hidden lg:block space-y-1">
            {task.next_run && (
              <div className="text-xs text-text-secondary">
                <span className="font-medium">Next run:</span> {formatDate(task.next_run)}
              </div>
            )}
            {task.last_run && (
              <div className="text-xs text-text-secondary">
                <span className="font-medium">Last run:</span> {formatDate(task.last_run)}
              </div>
            )}
          </div>
          
          {/* Medium width details - visible when sidebar is moderately wide */}
          <div className="hidden md:block lg:hidden">
            {task.next_run && (
              <div className="text-xs text-text-secondary">
                <span className="font-medium">Next:</span> {formatDate(task.next_run)}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default SchedulesTableRow; 