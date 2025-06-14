import { memo, useMemo } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  Switch,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '~/components/ui';
import { CircleHelpIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

function FileSearchCheckbox() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue } = methods;

  const fileSearchEnabled = useWatch({
    control,
    name: AgentCapabilities.file_search,
  });

  const handleFileSearchChange = (value: boolean) => {
    setValue(AgentCapabilities.file_search, value, { shouldDirty: true });
  };

  const fileSearchValue = useMemo(() => {
    return Boolean(fileSearchEnabled);
  }, [fileSearchEnabled]);

  return (
    <div className="flex flex-col gap-3">
      <SwitchItem
        id="file_search"
        label={localize('com_agents_enable_file_search')}
        checked={fileSearchValue}
        onCheckedChange={handleFileSearchChange}
        hoverCardText={localize('com_agents_file_search_info')}
      />
    </div>
  );
}

function SwitchItem({
  id,
  label,
  checked,
  onCheckedChange,
  hoverCardText,
  disabled = false,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  hoverCardText: string;
  disabled?: boolean;
}) {
  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={disabled ? 'text-text-tertiary' : ''}>{label}</div>
          <HoverCardTrigger>
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </HoverCardTrigger>
        </div>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">{hoverCardText}</p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="ml-4"
          data-testid={id}
          disabled={disabled}
        />
      </div>
    </HoverCard>
  );
}

export default memo(FileSearchCheckbox);
