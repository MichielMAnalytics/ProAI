import { useWorkflowsQuery } from '~/data-provider';
import type { TUserWorkflow } from 'librechat-data-provider';
import WorkflowsTable from './WorkflowsTable';

const WorkflowsPanel = () => {
  const { data: workflows, isLoading, error } = useWorkflowsQuery();

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-text-secondary">Loading workflows...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-red-500">Error loading workflows</div>
      </div>
    );
  }

  return <WorkflowsTable workflows={workflows || []} />;
};

export default WorkflowsPanel;
