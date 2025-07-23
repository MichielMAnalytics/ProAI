import React from 'react';
import ControlCombobox from '~/components/ui/ControlCombobox';
import type { OptionWithIcon } from '~/common';
import type { TriggerOption } from '../types';

interface TriggerSelectProps {
  triggerType: string;
  handleTriggerTypeChange: (value: string) => void;
  getTriggerDisplayValue: () => string;
  getTriggerIcon: () => React.ReactNode;
  triggerOptions: TriggerOption[];
  isTesting: boolean;
}

const TriggerSelect: React.FC<TriggerSelectProps> = ({
  triggerType,
  handleTriggerTypeChange,
  getTriggerDisplayValue,
  getTriggerIcon,
  triggerOptions,
  isTesting,
}) => {
  return (
    <ControlCombobox
      isCollapsed={false}
      ariaLabel="Select trigger type"
      selectedValue={triggerType}
      setValue={handleTriggerTypeChange}
      selectPlaceholder="Select trigger type"
      searchPlaceholder="Search trigger types"
      items={triggerOptions as OptionWithIcon[]}
      displayValue={getTriggerDisplayValue()}
      SelectIcon={getTriggerIcon()}
      className={`h-8 w-full border-border-heavy text-sm sm:h-10 ${
        isTesting ? 'pointer-events-none opacity-50' : ''
      }`}
      disabled={isTesting}
    />
  );
};

export default TriggerSelect;