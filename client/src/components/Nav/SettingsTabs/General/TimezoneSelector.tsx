import React, { useMemo } from 'react';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { useTimezone } from '~/hooks/useTimezone';
import { getPopularTimezones, getDetectedTimezone, formatTimezoneLabel } from '~/utils/timezone';

export const TimezoneSelector: React.FC = () => {
  const localize = useLocalize();
  const { timezone, updateTimezone, isUpdating, isError, error } = useTimezone();

  const timezoneOptions = useMemo(() => {
    const popularTimezones = getPopularTimezones();
    const detectedTimezone = getDetectedTimezone();

    // Add auto-detect option
    const options = [
      {
        value: 'auto',
        label: `${localize('com_nav_timezone_auto')} (${formatTimezoneLabel(detectedTimezone)})`,
      },
      { value: 'divider', label: '---', disabled: true },
      ...popularTimezones.map((tz) => ({
        value: tz.value,
        label: tz.label,
      })),
    ];

    return options;
  }, [localize]);

  const handleTimezoneChange = async (value: string) => {
    if (value === 'divider') return;

    try {
      if (value === 'auto') {
        // When auto is selected, use the detected timezone
        await updateTimezone(getDetectedTimezone());
      } else {
        await updateTimezone(value);
      }
    } catch (error) {
      console.error('Failed to update timezone:', error);
    }
  };

  // Show current timezone value, but if it matches detected timezone, show 'auto'
  const displayValue = useMemo(() => {
    const detectedTimezone = getDetectedTimezone();
    if (timezone === detectedTimezone) {
      return 'auto';
    }
    return timezone;
  }, [timezone]);

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-text-primary">{localize('com_nav_timezone')}</div>
        <div className="mt-1 text-xs text-text-secondary">
          {localize('com_nav_timezone_description')}
          {isError && (
            <div className="mt-1 text-red-500">
              {(error as Error)?.message || 'Failed to update timezone'}
            </div>
          )}
        </div>
      </div>

      <Dropdown
        value={displayValue}
        onChange={handleTimezoneChange}
        sizeClasses="[--anchor-max-height:300px] min-w-64"
        options={timezoneOptions}
        className="z-50"
      />
    </div>
  );
};
