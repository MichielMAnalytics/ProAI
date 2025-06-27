import React, { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  Switch,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '~/components/ui';
import { useLocalize } from '~/hooks';
import { CircleHelpIcon } from '~/components/svg';
import { ESide } from '~/common';

export default function Workflows() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue } = methods;

  const workflowsEnabled = useWatch({
    control,
    name: 'workflows' as any,
  });

  const handleWorkflowsChange = (value: boolean) => {
    setValue('workflows' as any, value, { shouldDirty: true });
  };

  const workflowsValue = useMemo(() => {
    return Boolean(workflowsEnabled);
  }, [workflowsEnabled]);

  return (
    <div className="w-full">
      <SwitchItem
        id="workflows"
        label={localize('com_ui_workflows')}
        checked={workflowsValue}
        onCheckedChange={handleWorkflowsChange}
        hoverCardText={localize('com_ui_workflows_agent_description')}
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