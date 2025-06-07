import React, { memo, useRef, useMemo, useCallback } from 'react';
import { Calendar } from 'lucide-react';
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

function SchedulerToggle({ conversationId }: { conversationId?: string | null }) {
  const triggerRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;

  const canUseScheduler = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.USE,
  });

  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  const setValue = useCallback(
    (isChecked: boolean) => {
      setEphemeralAgent((prev) => ({
        ...prev,
        scheduler: isChecked,
      }));
    },
    [setEphemeralAgent],
  );

  const [scheduler, setScheduler] = useLocalStorage<boolean>(
    `${LocalStorageKeys.LAST_SCHEDULER_TOGGLE_}${key}`,
    true, // Static default value - localStorage will override this if it exists
    setValue,
    storageCondition,
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, isChecked: boolean) => {
      setScheduler(isChecked);
    },
    [setScheduler],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  if (!canUseScheduler) {
    return null;
  }

  return (
    <CheckboxButton
      ref={triggerRef}
      className="max-w-fit"
      defaultChecked={scheduler}
      setValue={debouncedChange}
      label={localize('com_ui_schedules')}
      isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
      icon={<Calendar className="icon-md" />}
    />
  );
}

export default memo(SchedulerToggle); 