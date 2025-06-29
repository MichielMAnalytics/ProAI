import React, { useState } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Calendar,
  User,
  Play,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useSchedulerExecutionsQuery } from '~/data-provider';
import type { TSchedulerExecution } from 'librechat-data-provider';

interface ExecutionDashboardProps {
  workflowId: string;
}

const ExecutionDashboard: React.FC<ExecutionDashboardProps> = ({ workflowId }) => {
  // Transform workflowId to match scheduler task_id format
  const taskId = workflowId ? `workflow_${workflowId.replace('workflow_', '')}` : '';

  // Use the real API query
  const {
    data: executions = [],
    isLoading: loading,
    error,
    refetch,
  } = useSchedulerExecutionsQuery(taskId, {
    enabled: !!taskId,
    refetchInterval: 30000, // Refetch every 30 seconds to get latest executions
  });

  // Track expanded executions for step details
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set());

  const toggleExecutionExpansion = (executionId: string) => {
    const newExpanded = new Set(expandedExecutions);
    if (newExpanded.has(executionId)) {
      newExpanded.delete(executionId);
    } else {
      newExpanded.add(executionId);
    }
    setExpandedExecutions(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'running':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'running':
        return 'Running';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'cancelled':
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
      case 'running':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const formatDate = (date: Date | { $date: string } | string) => {
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date && typeof date === 'object' && '$date' in date) {
      dateObj = new Date(date.$date);
    } else {
      dateObj = date as Date;
    }
    return (
      dateObj.toLocaleDateString() +
      ' ' +
      dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  const calculateDuration = (
    startTime: Date | { $date: string } | string,
    endTime?: Date | { $date: string } | string,
  ) => {
    let start: Date;
    let end: Date;

    if (typeof startTime === 'string') {
      start = new Date(startTime);
    } else if (startTime && typeof startTime === 'object' && '$date' in startTime) {
      start = new Date(startTime.$date);
    } else {
      start = startTime as Date;
    }

    if (endTime) {
      if (typeof endTime === 'string') {
        end = new Date(endTime);
      } else if (endTime && typeof endTime === 'object' && '$date' in endTime) {
        end = new Date(endTime.$date);
      } else {
        end = endTime as Date;
      }
    } else {
      end = new Date();
    }

    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Loading execution history...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <XCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Failed to load execution history'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-primary">
      {/* Header */}
      <div className="border-b border-border-medium bg-surface-primary-alt p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-text-primary">Execution History</h2>
          </div>
          <div className="text-sm text-text-secondary">
            {executions.length} execution{executions.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Executions List */}
      <div className="flex-1 overflow-auto p-4">
        {executions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Clock className="mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-600 dark:text-gray-400">
              No executions yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Run the workflow to see execution history here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {executions.map((execution) => (
              <div
                key={execution.id}
                className="overflow-hidden rounded-lg border border-border-medium bg-surface-secondary p-3 transition-colors hover:bg-surface-hover"
              >
                <div className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 flex-1 items-center space-x-3">
                      {getStatusIcon(execution.status)}
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(
                            execution.status,
                          )}`}
                        >
                          {getStatusText(execution.status)}
                        </span>
                        <span className="hidden text-xs text-text-secondary sm:block">
                          {formatDate(execution.start_time)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center space-x-4 text-xs text-text-secondary">
                      <div className="hidden items-center space-x-1 md:flex">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Duration: {calculateDuration(execution.start_time, execution.end_time)}
                        </span>
                      </div>
                      {execution.metadata?.isTest && (
                        <div className="flex items-center space-x-1">
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            Test Run
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex-1 px-5">
                    <div className="mb-2 block text-xs text-text-secondary sm:hidden">
                      {formatDate(execution.start_time)}
                    </div>
                    <div className="mb-2 flex items-center space-x-1 text-xs text-text-secondary md:hidden">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Duration: {calculateDuration(execution.start_time, execution.end_time)}
                      </span>
                    </div>

                    {execution.output && (
                      <div className="mt-2 rounded border border-green-200 bg-green-50 p-2 dark:border-green-700 dark:bg-green-900/20">
                        <div className="mb-1 text-xs font-medium text-green-600 dark:text-green-400">
                          Output:
                        </div>
                        <div className="overflow-hidden whitespace-pre-wrap break-all font-mono text-xs text-green-700 dark:text-green-300">
                          {execution.output}
                        </div>
                      </div>
                    )}

                    {execution.error && (
                      <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 dark:border-red-700 dark:bg-red-900/20">
                        <div className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
                          {execution.status === 'cancelled'
                            ? 'Cancellation Details:'
                            : 'Error Details:'}
                        </div>
                        <div className="font-mono text-xs text-red-700 dark:text-red-300">
                          {execution.error}
                        </div>
                      </div>
                    )}

                    {/* Step Details Toggle */}
                    {execution.metadata?.steps && execution.metadata.steps.length > 0 && (
                      <div className="mt-3 border-t border-border-light pt-2">
                        <button
                          onClick={() => toggleExecutionExpansion(execution.id)}
                          className="flex items-center space-x-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
                        >
                          {expandedExecutions.has(execution.id) ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <span>
                            {execution.metadata.steps.length} step
                            {execution.metadata.steps.length !== 1 ? 's' : ''}
                          </span>
                        </button>

                        {/* Step Details */}
                        {expandedExecutions.has(execution.id) && (
                          <div className="mt-2 space-y-2">
                            {execution.metadata.steps.map((step, index) => (
                              <div
                                key={step.id}
                                className="overflow-hidden rounded border border-border-light bg-surface-primary p-2"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex flex-1 items-start space-x-2">
                                    <span className="min-w-[20px] font-mono text-xs text-text-secondary">
                                      {index + 1}.
                                    </span>
                                    <div className="flex-1 pr-7">
                                      <div className="mb-1 flex items-center space-x-2">
                                        {getStatusIcon(step.status)}
                                        <span className="text-xs font-medium text-text-primary">
                                          {step.name}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${getStatusColor(
                                            step.status,
                                          )}`}
                                        >
                                          {getStatusText(step.status)}
                                        </span>
                                      </div>

                                      <div className="mb-1 text-xs text-text-secondary">
                                        Type: <span className="font-mono">{step.type}</span>
                                        {step.startTime && step.endTime && (
                                          <span className="ml-3">
                                            Duration:{' '}
                                            {calculateDuration(step.startTime, step.endTime)}
                                          </span>
                                        )}
                                      </div>

                                      {step.output && (
                                        <div className="mt-1 rounded border border-green-200 bg-green-50 p-1.5 dark:border-green-700 dark:bg-green-900/20">
                                          <div className="mb-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                                            Output:
                                          </div>
                                          <div className="overflow-hidden whitespace-pre-wrap break-all font-mono text-xs text-green-700 dark:text-green-300">
                                            {step.output}
                                          </div>
                                        </div>
                                      )}

                                      {step.error && (
                                        <div className="mt-1 rounded border border-red-200 bg-red-50 p-1.5 dark:border-red-700 dark:bg-red-900/20">
                                          <div className="mb-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                                            Error:
                                          </div>
                                          <div className="overflow-hidden whitespace-pre-wrap break-all font-mono text-xs text-red-700 dark:text-red-300">
                                            {step.error}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionDashboard;
