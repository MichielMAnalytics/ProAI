import React, { useState } from 'react';
import { X, Check, Copy, ChevronUp, ChevronDown } from 'lucide-react';

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

interface WorkflowTestingOverlayProps {
  workflowId: string;
  isTesting: boolean;
  isCancelling: boolean;
  isWorkflowTestingFromHook: (workflowId: string) => boolean;
  currentStep: StepData | null;
  resultData: ExecutionResult | null;
  onCloseResult: () => void;
}

const WorkflowTestingOverlay: React.FC<WorkflowTestingOverlayProps> = ({
  workflowId,
  isTesting,
  isCancelling,
  isWorkflowTestingFromHook,
  currentStep,
  resultData,
  onCloseResult,
}) => {
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Determine if we should show the result overlay
  const showingResult = !!(
    resultData &&
    !isTesting &&
    !isCancelling &&
    !isWorkflowTestingFromHook(workflowId)
  );

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

  // Don't render if not testing and no results to show
  if (!isTesting && !isCancelling && !isWorkflowTestingFromHook(workflowId) && !showingResult) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="absolute inset-0 bg-gray-900/50"></div>

      {/* Scanner Line Animation - Only show when testing or cancelling */}
      {(isTesting || isCancelling || isWorkflowTestingFromHook(workflowId)) && !showingResult && (
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
                                      const meaningfulContent = extractMeaningfulContent(
                                        step.result,
                                      );
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
                                title={isExpanded ? 'Collapse details' : 'Expand details'}
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
                                          const meaningfulContent = extractMeaningfulContent(
                                            step.result,
                                          );
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
                                            const meaningfulContent = extractMeaningfulContent(
                                              step.output,
                                            );
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
            onClick={onCloseResult}
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
                    : isWorkflowTestingFromHook(workflowId) && !isTesting
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
  );
};

export default WorkflowTestingOverlay;
