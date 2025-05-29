import React, { useState } from 'react';
import type { TSchedulerTask } from 'librechat-data-provider';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';
import SchedulesTableRow from './SchedulesTableRow';
import { useLocalize } from '~/hooks';

interface SchedulesTableProps {
  tasks: TSchedulerTask[];
}

const SchedulesTable: React.FC<SchedulesTableProps> = ({ tasks }) => {
  const localize = useLocalize();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;

  const filteredTasks = tasks.filter(
    (task) => 
      task.name && task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.prompt && task.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentTasks = filteredTasks.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  return (
    <div role="region" aria-label="Scheduler Tasks" className="mt-2 space-y-2">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Filter tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter tasks"
        />
      </div>

      <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="border-b border-border-light">
              <TableHead className="bg-surface-secondary py-2 text-left text-xs font-medium text-text-secondary">
                <div className="px-2">Task Name</div>
              </TableHead>
              <TableHead className="bg-surface-secondary py-2 text-right text-xs font-medium text-text-secondary w-16 sm:w-20">
                <div className="px-1 sm:px-2">Actions</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentTasks.length ? (
              currentTasks.map((task) => (
                <SchedulesTableRow key={task.id} task={task} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="h-16 text-center text-xs text-text-secondary">
                  {searchQuery ? 'No tasks match your search' : 'No tasks created yet'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" role="navigation" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
            disabled={pageIndex === 0}
            aria-label="Previous page"
          >
            {localize('com_ui_prev')}
          </Button>
          <div aria-live="polite" className="text-sm">
            {`${pageIndex + 1} / ${Math.ceil(filteredTasks.length / pageSize)}`}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPageIndex((prev) =>
                (prev + 1) * pageSize < filteredTasks.length ? prev + 1 : prev,
              )
            }
            disabled={(pageIndex + 1) * pageSize >= filteredTasks.length}
            aria-label="Next page"
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SchedulesTable; 