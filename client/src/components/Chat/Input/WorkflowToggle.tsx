import React, { memo, useRef, useMemo, useCallback } from 'react';
import { Workflow } from 'lucide-react';
import debounce from 'lodash/debounce';
import { useRecoilState } from 'recoil';
import {
  Tools,
  Constants,
  Permissions,
  PermissionTypes,
  LocalStorageKeys,
} from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import CheckboxButton from '~/components/ui/CheckboxButton';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { ephemeralAgentByConvoId } from '~/store';

const storageCondition = (value: unknown, rawCurrentValue?: string | null) => {
  if (rawCurrentValue) {
    try {
      const currentValue = rawCurrentValue?.trim() ?? '';
      if (currentValue === 'true' && value === false) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return value !== undefined && value !== null && value !== '' && value !== false;
};

function WorkflowToggle({ conversationId }: { conversationId?: string | null }) {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;

  const canUseWorkflows = useHasAccess({
    permissionType: PermissionTypes.WORKFLOWS,
    permission: Permissions.USE,
  });

  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const isWorkflowToggleEnabled = useMemo(() => {
    return ephemeralAgent?.workflow ?? false;
  }, [ephemeralAgent?.workflow]);

  const setValue = useCallback(
    (isChecked: boolean) => {
      setEphemeralAgent((prev) => ({
        ...prev,
        workflow: isChecked,
      }));
    },
    [setEphemeralAgent],
  );

  const [workflow, setWorkflow] = useLocalStorage<boolean>(
    `${LocalStorageKeys.LAST_WORKFLOW_TOGGLE_}${key}`,
    isWorkflowToggleEnabled,
    setValue,
    storageCondition,
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, isChecked: boolean) => {
      setWorkflow(isChecked);
    },
    [setWorkflow],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  if (!canUseWorkflows) {
    return null;
  }

  return (
    <CheckboxButton
      ref={triggerRef}
      className="max-w-fit"
      defaultChecked={workflow}
      setValue={debouncedChange}
      label={localize('com_ui_workflows')}
      isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
      icon={<Workflow className="icon-md" />}
    />
  );
}

export default memo(WorkflowToggle); 