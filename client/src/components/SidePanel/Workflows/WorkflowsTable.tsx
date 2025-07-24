import React, { useState } from 'react';
import type { TUserWorkflow, TConversation } from 'librechat-data-provider';
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
import WorkflowsTableRow from './WorkflowsTableRow';
import { useLocalize } from '~/hooks';
import { Plus } from 'lucide-react';
import { useWorkflowBuilder } from '~/hooks/useWorkflowBuilder';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import { useNavigateToConvo } from '~/hooks';
import { EModelEndpoint, Constants } from 'librechat-data-provider';

interface WorkflowsTableProps {
  workflows: TUserWorkflow[];
}

const WorkflowsTable: React.FC<WorkflowsTableProps> = ({ workflows }) => {
  const localize = useLocalize();
  const { openWorkflowBuilder } = useWorkflowBuilder();
  const { navigateToConvo } = useNavigateToConvo();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;

  const WORKFLOW_AGENT_ID = 'agent_mQT-2PApQWxqlveER8Myb';

  const filteredWorkflows = workflows.filter(
    (workflow) => workflow.name && workflow.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentWorkflows = filteredWorkflows.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize,
  );

  return (
    <div role="region" aria-label="User Workflows" className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter workflows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter workflows"
          className="flex-1"
        />
        <TooltipAnchor description="Create new workflow" side="top">
          <button
            onClick={() => {
              // Create a new conversation with the workflow agent
              const newConversation: TConversation = {
                conversationId: String(Constants.NEW_CONVO),
                title: '⚡ New Workflow',
                endpoint: EModelEndpoint.agents,
                endpointType: EModelEndpoint.agents,
                agent_id: WORKFLOW_AGENT_ID,
                model: null,
                user: undefined,
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              // Navigate to the new conversation with the workflow agent
              navigateToConvo(newConversation);

              // Then open the workflow builder for a new workflow (undefined = new workflow)
              setTimeout(() => openWorkflowBuilder(undefined), 100);
            }}
            className="btn btn-primary btn-icon"
          >
            <Plus className="h-4 w-4" />
          </button>
        </TooltipAnchor>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-20 sm:w-24" />
            <col className="w-auto" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b border-border-light">
              <TableHead className="bg-surface-secondary py-2 text-left text-xs font-medium text-text-secondary">
                <div className="px-1 sm:px-2">Actions</div>
              </TableHead>
              <TableHead className="bg-surface-secondary py-2 text-left text-xs font-medium text-text-secondary">
                <div className="px-2">Workflow Name</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentWorkflows.length ? (
              currentWorkflows.map((workflow) => (
                <WorkflowsTableRow key={workflow.id} workflow={workflow} />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="h-16 text-center text-xs text-text-secondary">
                  {searchQuery ? 'No workflows match your search' : 'No workflows created yet'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end">
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
            {`${pageIndex + 1} / ${Math.ceil(filteredWorkflows.length / pageSize)}`}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPageIndex((prev) =>
                (prev + 1) * pageSize < filteredWorkflows.length ? prev + 1 : prev,
              )
            }
            disabled={(pageIndex + 1) * pageSize >= filteredWorkflows.length}
            aria-label="Next page"
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowsTable;
