import React from 'react';
import { X } from 'lucide-react';

interface WorkflowHeaderProps {
  currentWorkflowId?: string;
  isTesting: boolean;
  showDashboard: boolean;
  setShowDashboard: (show: boolean) => void;
  onClose: () => void;
}

const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  currentWorkflowId,
  isTesting,
  showDashboard,
  setShowDashboard,
  onClose,
}) => {
  return (
    <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2 sm:p-3">
      {/* Left: Close button */}
      <button
        onClick={onClose}
        disabled={isTesting}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:h-8 sm:w-8 ${
          isTesting ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        <X className="h-4 w-4" />
      </button>

      {/* Center: Title */}
      <div className="flex flex-1 items-center justify-center">
        <h2 className="text-base font-semibold text-text-primary sm:text-lg">
          Workflow Builder
        </h2>
      </div>

      {/* Right: Builder/Runs toggle */}
      <div className="flex items-center">
        <div className="flex rounded-md border border-border-medium bg-surface-secondary p-0.5">
          <button
            onClick={() => setShowDashboard(false)}
            disabled={isTesting}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
              !showDashboard
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            } ${isTesting ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            Builder
          </button>
          <button
            onClick={() => setShowDashboard(true)}
            disabled={isTesting || !currentWorkflowId}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
              showDashboard
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            } ${isTesting || !currentWorkflowId ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            Runs
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowHeader;