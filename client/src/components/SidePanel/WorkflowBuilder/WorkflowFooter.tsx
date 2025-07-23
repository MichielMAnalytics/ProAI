import React from 'react';
import {
  Save,
  Trash2,
  Play,
  Pause,
  TestTube,
  Square,
  RefreshCw,
} from 'lucide-react';
import { TooltipAnchor } from '~/components/ui/Tooltip';

interface WorkflowFooterProps {
  currentWorkflowId?: string;
  workflowName: string;
  steps: any[];
  isSaving: boolean;
  isTesting: boolean;
  isWorkflowTesting: boolean;
  isWorkflowActive: boolean;
  canTest: boolean;
  canActivate: boolean;
  testMutation: any;
  stopMutation: any;
  toggleMutation: any;
  deleteMutation: any;
  getTestTooltip: (currentWorkflowId?: string) => string;
  getActivateTooltip: (currentWorkflowId?: string, isWorkflowActive?: boolean) => string;
  handleSave: (showNotification?: boolean) => Promise<void>;
  handleTestWorkflow: () => Promise<void>;
  handleToggleWorkflow: () => Promise<void>;
  handleDeleteWorkflow: () => void;
}

const WorkflowFooter: React.FC<WorkflowFooterProps> = ({
  currentWorkflowId,
  workflowName,
  steps,
  isSaving,
  isTesting,
  isWorkflowTesting,
  isWorkflowActive,
  canTest,
  canActivate,
  testMutation,
  stopMutation,
  toggleMutation,
  deleteMutation,
  getTestTooltip,
  getActivateTooltip,
  handleSave,
  handleTestWorkflow,
  handleToggleWorkflow,
  handleDeleteWorkflow,
}) => {
  return (
    <div className="flex-shrink-0 border-t border-border-medium bg-surface-primary-alt p-2 sm:p-3">
      <div className="flex flex-col gap-2">
        {/* Top Row - Test and Toggle */}
        <div className="flex gap-2">
          {/* Test/Stop Button */}
          <TooltipAnchor
            description={
              isWorkflowTesting
                ? 'Stop workflow test'
                : getTestTooltip(currentWorkflowId)
            }
            side="top"
            className="flex-1"
          >
            <button
              className={`btn flex h-9 w-full items-center justify-center gap-1 px-2 text-sm font-medium ${
                !currentWorkflowId || !canTest
                  ? 'border border-gray-300 bg-gray-100 text-gray-400'
                  : isWorkflowTesting
                    ? 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white hover:border-red-500 hover:from-red-600 hover:to-red-700'
                    : 'border border-blue-500/60 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:border-blue-500 hover:from-blue-600 hover:to-blue-700'
              }`}
              onClick={handleTestWorkflow}
              disabled={
                !currentWorkflowId ||
                !canTest ||
                (!isWorkflowTesting ? testMutation.isLoading : stopMutation.isLoading)
              }
            >
              {isWorkflowTesting ? (
                <>
                  <Square className="h-4 w-4" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <TestTube
                    className={`h-3 w-3 sm:h-4 sm:w-4 ${!currentWorkflowId ? 'text-gray-400' : 'text-white'}`}
                  />
                  <span>Test</span>
                </>
              )}
            </button>
          </TooltipAnchor>

          {/* Toggle Button */}
          <TooltipAnchor
            description={getActivateTooltip(currentWorkflowId, isWorkflowActive)}
            side="top"
            className="flex-1"
          >
            <button
              className={`btn flex h-9 w-full items-center justify-center gap-1 px-2 text-sm font-medium ${
                !currentWorkflowId || !canActivate
                  ? 'border border-gray-300 bg-gray-100 text-gray-400'
                  : isWorkflowActive
                    ? 'border border-amber-500/60 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:border-amber-500 hover:from-amber-600 hover:to-orange-700'
                    : 'border border-green-500/60 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:border-green-500 hover:from-green-600 hover:to-emerald-700'
              }`}
              onClick={handleToggleWorkflow}
              disabled={
                !currentWorkflowId ||
                !canActivate ||
                toggleMutation.isLoading ||
                isWorkflowTesting ||
                isTesting
              }
            >
              {toggleMutation.isLoading ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin sm:h-4 sm:w-4" />
                  <span>{isWorkflowActive ? 'Deactivating...' : 'Activating...'}</span>
                </>
              ) : isWorkflowActive ? (
                <>
                  <Pause className="h-4 w-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play
                    className={`h-3 w-3 sm:h-4 sm:w-4 ${!currentWorkflowId ? 'text-gray-400' : 'text-white'}`}
                  />
                  <span>Activate</span>
                </>
              )}
            </button>
          </TooltipAnchor>
        </div>

        {/* Bottom Row - Delete and Save */}
        <div className="flex gap-2">
          {/* Delete Button */}
          <TooltipAnchor
            description={
              !currentWorkflowId ? 'Save workflow first to delete' : 'Delete workflow'
            }
            side="top"
            className="flex-1"
          >
            <button
              className={`btn flex h-9 w-full items-center justify-center gap-1 px-2 text-sm font-medium ${
                !currentWorkflowId
                  ? 'border border-gray-300 bg-gray-100 text-gray-400'
                  : 'border border-red-500/60 bg-gradient-to-r from-red-500 to-red-600 text-white hover:border-red-500 hover:from-red-600 hover:to-red-700'
              }`}
              onClick={handleDeleteWorkflow}
              disabled={
                !currentWorkflowId ||
                deleteMutation.isLoading ||
                isWorkflowTesting ||
                isTesting
              }
            >
              <Trash2
                className={`h-3 w-3 sm:h-4 sm:w-4 ${!currentWorkflowId ? 'text-gray-400' : 'text-white'}`}
              />
              <span>Delete</span>
            </button>
          </TooltipAnchor>

          {/* Save button */}
          <div className="flex-1">
            <button
              onClick={() => handleSave()}
              disabled={isSaving || !workflowName || steps.length === 0 || isTesting}
              className="btn btn-primary flex h-9 w-full items-center justify-center gap-1 px-2 text-sm font-medium"
            >
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowFooter;