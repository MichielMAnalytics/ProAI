/* Memories */
import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { matchSorter } from 'match-sorter';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TUserMemory } from 'librechat-data-provider';
import {
  Table,
  Input,
  Label,
  Button,
  Switch,
  TableRow,
  OGDialog,
  TableHead,
  TableBody,
  TableCell,
  TableHeader,
  TooltipAnchor,
  OGDialogTrigger,
} from '~/components/ui';
import {
  useGetUserQuery,
  useMemoriesQuery,
  useDeleteMemoryMutation,
  useUpdateMemoryPreferencesMutation,
} from '~/data-provider';
import { useLocalize, useAuthContext, useHasAccess } from '~/hooks';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { EditIcon, TrashIcon } from '~/components/svg';
import MemoryCreateDialog from './MemoryCreateDialog';
import MemoryEditDialog from './MemoryEditDialog';
import Spinner from '~/components/svg/Spinner';
import { useToastContext } from '~/Providers';
import AdminSettings from './AdminSettings';

export default function MemoryViewer() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: userData } = useGetUserQuery();
  const { data: memData, isLoading } = useMemoriesQuery();
  const { mutate: deleteMemory } = useDeleteMemoryMutation();
  const { showToast } = useToastContext();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_preferences_updated'),
        status: 'success',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_error_updating_preferences'),
        status: 'error',
      });
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  useEffect(() => {
    if (userData?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(userData.personalization.memories);
    }
  }, [userData?.personalization?.memories]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const hasReadAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });

  const hasUpdateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.UPDATE,
  });

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const hasOptOutAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const memories: TUserMemory[] = useMemo(() => memData?.memories ?? [], [memData]);

  const filteredMemories = useMemo(() => {
    return matchSorter(memories, searchQuery, {
      keys: ['key', 'value'],
    });
  }, [memories, searchQuery]);

  const currentRows = useMemo(() => {
    return filteredMemories.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredMemories, pageIndex]);

  const getProgressBarColor = (percentage: number): string => {
    if (percentage > 90) {
      return 'stroke-red-500';
    }
    if (percentage > 75) {
      return 'stroke-yellow-500';
    }
    return 'stroke-green-500';
  };

  const EditMemoryButton = ({ memory }: { memory: TUserMemory }) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(!open);
      }
    };

    // Only show edit button if user has UPDATE permission
    if (!hasUpdateAccess) {
      return null;
    }

    return (
      <MemoryEditDialog
        open={open}
        memory={memory}
        onOpenChange={setOpen}
        triggerRef={triggerRef as React.MutableRefObject<HTMLButtonElement | null>}
      >
        <OGDialogTrigger asChild>
          <TooltipAnchor
            ref={triggerRef}
            role="button"
            aria-label={localize('com_ui_edit')}
            description={localize('com_ui_edit')}
            tabIndex={0}
            onClick={() => setOpen(!open)}
            className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
            onKeyDown={handleKeyDown}
          >
            <EditIcon />
          </TooltipAnchor>
        </OGDialogTrigger>
      </MemoryEditDialog>
    );
  };

  const DeleteMemoryButton = ({ memory }: { memory: TUserMemory }) => {
    const [open, setOpen] = useState(false);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(!open);
      }
    };

    if (!hasUpdateAccess) {
      return null;
    }

    const confirmDelete = async () => {
      setDeletingKey(memory.key);
      deleteMemory(memory.key, {
        onSuccess: () => {
          showToast({
            message: localize('com_ui_deleted'),
            status: 'success',
          });
          setOpen(false);
        },
        onError: () =>
          showToast({
            message: localize('com_ui_error'),
            status: 'error',
          }),
        onSettled: () => setDeletingKey(null),
      });
    };

    return (
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <TooltipAnchor
            role="button"
            aria-label={localize('com_ui_delete')}
            description={localize('com_ui_delete')}
            className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
            tabIndex={0}
            onClick={() => setOpen(!open)}
            onKeyDown={handleKeyDown}
          >
            {deletingKey === memory.key ? (
              <Spinner className="size-4 animate-spin" />
            ) : (
              <TrashIcon className="size-4" />
            )}
          </TooltipAnchor>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_memory')}
          className="w-11/12 max-w-lg"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_delete_confirm')} &quot;{memory.key}&quot;?
            </Label>
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  if (!hasReadAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary">{localize('com_ui_no_read_access')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div role="region" aria-label={localize('com_ui_memories')} className="mt-2 space-y-2">
        <div className="flex items-center gap-4">
          <Input
            placeholder={localize('com_ui_memories_filter')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={localize('com_ui_memories_filter')}
            className="flex-1"
          />
          {/* Memory Toggle */}
          {hasOptOutAccess && (
            <div className="flex items-center gap-2 text-xs">
              <span>{localize('com_ui_use_memory')}</span>
              <Switch
                checked={referenceSavedMemories}
                onCheckedChange={handleMemoryToggle}
                aria-label={localize('com_ui_reference_saved_memories')}
                disabled={updateMemoryPreferencesMutation.isLoading}
              />
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="border-b border-border-light hover:bg-surface-secondary">
                {hasUpdateAccess && (
                  <TableHead className="w-[25%] bg-surface-secondary py-2 text-center text-xs font-medium text-text-secondary">
                    <div className="px-1 sm:px-2">{localize('com_assistants_actions')}</div>
                  </TableHead>
                )}
                <TableHead
                  className={`${
                    hasUpdateAccess ? 'w-[75%]' : 'w-[100%]'
                  } bg-surface-secondary py-2 text-left text-xs font-medium text-text-secondary`}
                >
                  <div className="px-2">{localize('com_ui_memory')}</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.length ? (
                currentRows.map((memory: TUserMemory, idx: number) => (
                  <TableRow
                    key={idx}
                    className="border-b border-border-light hover:bg-surface-secondary"
                  >
                    {hasUpdateAccess && (
                      <TableCell className="w-[25%] px-4 py-4">
                        <div className="flex justify-center gap-2">
                          <EditMemoryButton memory={memory} />
                          <DeleteMemoryButton memory={memory} />
                        </div>
                      </TableCell>
                    )}
                    <TableCell className={`${hasUpdateAccess ? 'w-[75%]' : 'w-[100%]'} px-4 py-4`}>
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                        title={memory.value}
                      >
                        {memory.value}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={hasUpdateAccess ? 2 : 1}
                    className="h-24 text-center text-sm text-text-secondary"
                  >
                    {localize('com_ui_no_data')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls */}
        {filteredMemories.length > pageSize && (
          <div
            className="flex items-center justify-end gap-2"
            role="navigation"
            aria-label="Pagination"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
              disabled={pageIndex === 0}
              aria-label={localize('com_ui_prev')}
            >
              {localize('com_ui_prev')}
            </Button>
            <div className="text-sm" aria-live="polite">
              {`${pageIndex + 1} / ${Math.ceil(filteredMemories.length / pageSize)}`}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPageIndex((prev) =>
                  (prev + 1) * pageSize < filteredMemories.length ? prev + 1 : prev,
                )
              }
              disabled={(pageIndex + 1) * pageSize >= filteredMemories.length}
              aria-label={localize('com_ui_next')}
            >
              {localize('com_ui_next')}
            </Button>
          </div>
        )}

        {/* Admin Settings */}
        {user?.role === SystemRoles.ADMIN && (
          <div className="mt-4">
            <AdminSettings />
          </div>
        )}
      </div>
    </div>
  );
}
