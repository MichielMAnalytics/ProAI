import { useSchedulerTasksQuery } from '~/data-provider';
import SchedulesTable from './SchedulesTable';

const SchedulesPanel = () => {
  const { data: tasks, isLoading, error } = useSchedulerTasksQuery('task');

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-text-secondary">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-red-500">Error loading tasks</div>
      </div>
    );
  }

  return (
    <div className="h-auto max-w-full overflow-x-hidden">
      <SchedulesTable tasks={tasks || []} />
    </div>
  );
};

export default SchedulesPanel; 