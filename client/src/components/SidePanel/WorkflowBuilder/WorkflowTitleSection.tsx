import React, { useEffect, useRef } from 'react';

interface WorkflowTitleSectionProps {
  workflowName: string;
  setWorkflowName: (name: string) => void;
  currentWorkflowId?: string;
  isWorkflowActive: boolean;
  isDraft: boolean;
  isTesting: boolean;
}

const WorkflowTitleSection: React.FC<WorkflowTitleSectionProps> = ({
  workflowName,
  setWorkflowName,
  currentWorkflowId,
  isWorkflowActive,
  isDraft,
  isTesting,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on new workflows
  useEffect(() => {
    if (!currentWorkflowId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [currentWorkflowId]);

  // Status helper functions
  const getStatusColor = (isActive: boolean, isDraft: boolean) => {
    if (isActive) {
      return 'bg-green-100 text-green-700';
    }
    if (isDraft) {
      return 'bg-orange-100 text-orange-700';
    }
    return 'bg-gray-100 text-gray-600';
  };

  const getStatusText = (isActive: boolean, isDraft: boolean) => {
    if (isActive) return 'active';
    if (isDraft) return 'draft';
    return 'inactive';
  };

  return (
    <div className="border-b border-border-medium px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
        {/* Workflow Name Input */}
        <input
          ref={inputRef}
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          disabled={isTesting}
          className={`w-full flex-1 border-0 bg-transparent px-3 py-1.5 text-center text-base font-medium text-text-primary transition-colors placeholder:text-text-tertiary focus:outline-none focus:ring-0 sm:text-lg ${
            isTesting ? 'cursor-not-allowed opacity-50' : ''
          }`}
          placeholder="Enter workflow name..."
        />
        
        {/* Status Badge - only show if editing existing workflow */}
        {currentWorkflowId && (
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-md px-3 py-1.5 font-inter text-sm font-medium sm:px-3.5 sm:py-1.5 ${getStatusColor(
              isWorkflowActive,
              isDraft,
            )}`}
          >
            {isWorkflowActive && (
              <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
            )}
            {getStatusText(isWorkflowActive, isDraft)}
          </span>
        )}
      </div>
    </div>
  );
};

export default WorkflowTitleSection;