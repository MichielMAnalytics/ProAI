import { useSchedulerTasksQuery } from '~/data-provider';
import type { TUserWorkflow } from 'librechat-data-provider';
import WorkflowsTable from './WorkflowsTable';

const WorkflowsPanel = () => {
  const { data: schedulerTasks, isLoading, error } = useSchedulerTasksQuery('workflow');

  // Convert scheduler tasks to workflow format
  const workflows: TUserWorkflow[] = (schedulerTasks || []).map(task => {
    // Extract workflow ID from the prompt format "WORKFLOW_EXECUTION:workflowId:workflowName"
    const promptParts = task.prompt?.split(':') || [];
    const workflowId = promptParts[1] || task.id;
    const workflowName = promptParts.slice(2).join(':') || task.name.replace('Workflow: ', '');

    return {
      id: workflowId,
      name: workflowName,
      description: task.metadata?.description || '',
      trigger: task.metadata?.trigger || { type: 'schedule', config: { schedule: task.schedule } },
      steps: task.metadata?.steps || [],
      isActive: task.enabled,
      isDraft: task.metadata?.isDraft || false,
      user: task.user,
      conversation_id: task.conversation_id,
      parent_message_id: task.parent_message_id,
      endpoint: task.endpoint,
      ai_model: task.ai_model,
      agent_id: task.agent_id,
      last_run: task.last_run,
      next_run: task.next_run,
      run_count: 0, // Not tracked in scheduler tasks yet
      success_count: 0, // Not tracked in scheduler tasks yet
      failure_count: 0, // Not tracked in scheduler tasks yet
      version: task.metadata?.workflowVersion || 1,
      created_from_agent: task.metadata?.created_from_agent || false,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    } as TUserWorkflow;
  });

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

  return <WorkflowsTable workflows={workflows} />;
};

export default WorkflowsPanel; 