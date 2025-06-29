import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Calendar, Info } from 'lucide-react';
import { Input, Label } from '~/components/ui';
import { useTimezone } from '~/hooks/useTimezone';
import {
  parseScheduleToUTCCron,
  cronToHumanReadable,
  getNextRunInTimezone,
  isCronExpression,
} from '~/utils/timezone';
import { cn } from '~/utils';

interface ScheduleInputProps {
  value?: string;
  onChange: (cronExpression: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  showTimezone?: boolean;
  className?: string;
}

interface SchedulePreset {
  label: string;
  value: string;
  description: string;
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: 'Every minute', value: 'every minute', description: 'Runs every minute' },
  { label: 'Every 5 minutes', value: 'every 5 minutes', description: 'Runs every 5 minutes' },
  { label: 'Every 15 minutes', value: 'every 15 minutes', description: 'Runs every 15 minutes' },
  { label: 'Every 30 minutes', value: 'every 30 minutes', description: 'Runs every 30 minutes' },
  { label: 'Every hour', value: 'every hour', description: 'Runs at the top of every hour' },
  { label: 'Every 6 hours', value: 'every 6 hours', description: 'Runs every 6 hours' },
  { label: 'Daily at 9 AM', value: 'daily at 9 AM', description: 'Runs every day at 9:00 AM' },
  { label: 'Daily at 2 PM', value: 'daily at 2 PM', description: 'Runs every day at 2:00 PM' },
  { label: 'Daily at 6 PM', value: 'daily at 6 PM', description: 'Runs every day at 6:00 PM' },
  {
    label: 'Weekdays at 9 AM',
    value: 'weekdays at 9 AM',
    description: 'Runs Monday-Friday at 9:00 AM',
  },
  { label: 'Every morning', value: 'every morning', description: 'Runs every day at 9:00 AM' },
];

export const ScheduleInput: React.FC<ScheduleInputProps> = ({
  value = '',
  onChange,
  onValidChange,
  placeholder = 'e.g., "daily at 9 AM", "every 5 minutes", "weekdays at 2 PM"',
  label = 'Schedule',
  disabled = false,
  showTimezone = true,
  className,
}) => {
  const { timezone: userTimezone, getTimezoneAbbr } = useTimezone();
  const [inputValue, setInputValue] = useState(value);
  const [showPresets, setShowPresets] = useState(false);

  // Parse the current input and generate preview
  const schedulePreview = useMemo(() => {
    if (!inputValue.trim()) {
      return {
        cronExpression: null,
        humanReadable: '',
        nextRun: null,
        isValid: false,
        error: null,
      };
    }

    try {
      // Try to parse as natural language first
      let cronExpression = parseScheduleToUTCCron(inputValue, userTimezone);

      // If parsing failed and it looks like a cron expression, use it directly
      if (!cronExpression && isCronExpression(inputValue)) {
        cronExpression = inputValue.trim();
      }

      if (cronExpression) {
        const humanReadable = cronToHumanReadable(cronExpression, userTimezone);
        const nextRun = getNextRunInTimezone(cronExpression, userTimezone);

        return {
          cronExpression,
          humanReadable,
          nextRun,
          isValid: true,
          error: null,
        };
      } else {
        return {
          cronExpression: null,
          humanReadable: '',
          nextRun: null,
          isValid: false,
          error: 'Could not parse schedule. Try "daily at 9 AM" or "every 5 minutes"',
        };
      }
    } catch (error) {
      return {
        cronExpression: null,
        humanReadable: '',
        nextRun: null,
        isValid: false,
        error: error instanceof Error ? error.message : 'Invalid schedule format',
      };
    }
  }, [inputValue, userTimezone]);

  // Notify parent of validation state changes
  useEffect(() => {
    onValidChange?.(schedulePreview.isValid);
  }, [schedulePreview.isValid, onValidChange]);

  // Notify parent of cron expression changes
  useEffect(() => {
    if (schedulePreview.isValid && schedulePreview.cronExpression) {
      onChange(schedulePreview.cronExpression);
    }
  }, [schedulePreview.cronExpression, schedulePreview.isValid, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
  };

  const handlePresetSelect = (preset: string) => {
    setInputValue(preset);
    setShowPresets(false);
  };

  const formatNextRun = (date: Date | null) => {
    if (!date) return 'Unknown';

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    let relativeTime = '';
    if (diffMinutes < 1) {
      relativeTime = 'in less than a minute';
    } else if (diffMinutes < 60) {
      relativeTime = `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      relativeTime = `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else {
      const diffDays = Math.round(diffHours / 24);
      relativeTime = `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }

    const timeStr = date.toLocaleString('en-US', {
      timeZone: userTimezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return `${timeStr} (${relativeTime})`;
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Label and Timezone Info */}
      <div className="flex items-center justify-between">
        <Label htmlFor="schedule-input" className="text-sm font-medium text-text-primary">
          {label}
        </Label>
        {showTimezone && (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Clock className="h-3 w-3" />
            <span>{getTimezoneAbbr()}</span>
          </div>
        )}
      </div>

      {/* Input Field */}
      <div className="relative">
        <Input
          id="schedule-input"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'pr-10',
            schedulePreview.isValid && 'border-green-500',
            schedulePreview.error && 'border-red-500',
          )}
        />

        {/* Preset Button */}
        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary transition-colors hover:text-text-primary"
          title="Choose from presets"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>

      {/* Presets Dropdown */}
      {showPresets && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border-light bg-surface-primary shadow-lg">
          {SCHEDULE_PRESETS.map((preset, index) => (
            <button
              key={index}
              onClick={() => handlePresetSelect(preset.value)}
              className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover"
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-xs text-text-secondary">{preset.description}</div>
            </button>
          ))}
        </div>
      )}

      {/* Preview and Validation */}
      {inputValue.trim() && (
        <div className="space-y-2 rounded-lg border border-border-light bg-surface-secondary p-3">
          {schedulePreview.isValid ? (
            <>
              {/* Human Readable Description */}
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-text-primary">
                    {schedulePreview.humanReadable}
                  </div>

                  {/* Next Run */}
                  {schedulePreview.nextRun && (
                    <div className="text-xs text-text-secondary">
                      <span className="font-medium">Next run:</span>{' '}
                      {formatNextRun(schedulePreview.nextRun)}
                    </div>
                  )}

                  {/* Cron Expression (for debugging/advanced users) */}
                  <div className="text-xs text-text-secondary">
                    <span className="font-medium">Cron:</span>{' '}
                    <code className="rounded bg-surface-tertiary px-1 py-0.5 text-xs">
                      {schedulePreview.cronExpression}
                    </code>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-red-500" />
              <div className="text-sm text-red-600">
                {schedulePreview.error || 'Invalid schedule format'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-text-secondary">
        <p>
          <strong>Examples:</strong> "daily at 9 AM", "every 5 minutes", "weekdays at 2 PM", "every
          hour"
        </p>
        <p className="mt-1">
          You can also use cron expressions like "0 9 * * *" for advanced scheduling.
          {showTimezone && ` Times are in your timezone (${getTimezoneAbbr()}).`}
        </p>
      </div>
    </div>
  );
};

export default ScheduleInput;
