import React from 'react';
import type { ScheduleType } from '../types';
import { getTimezoneAbbreviation } from '~/utils/timezone';

interface ScheduleTriggerProps {
  scheduleType: ScheduleType;
  setScheduleType: (type: ScheduleType) => void;
  scheduleTime: string;
  setScheduleTime: (time: string) => void;
  scheduleDays: number[];
  setScheduleDays: (days: number[]) => void;
  scheduleDate: number;
  setScheduleDate: (date: number) => void;
  scheduleConfig: string;
  setScheduleConfig: (config: string) => void;
  isTesting: boolean;
  userTimezone?: string;
}

const ScheduleTrigger: React.FC<ScheduleTriggerProps> = ({
  scheduleType,
  setScheduleType,
  scheduleTime,
  setScheduleTime,
  scheduleDays,
  setScheduleDays,
  scheduleDate,
  setScheduleDate,
  scheduleConfig,
  setScheduleConfig,
  isTesting,
  userTimezone,
}) => {
  const timezoneAbbr = userTimezone ? getTimezoneAbbreviation(userTimezone) : '';
  return (
    <div className="space-y-3">
      {/* Schedule Type Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">
          How often should this run?
        </label>
        <select
          value={scheduleType}
          onChange={(e) =>
            setScheduleType(
              e.target.value as ScheduleType
            )
          }
          disabled={isTesting}
          className={`w-full rounded-md border border-border-heavy bg-surface-primary p-2 text-sm text-text-primary focus:border-blue-500 focus:outline-none ${
            isTesting ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          <option value="daily">Every day</option>
          <option value="weekly">Weekly (specific days)</option>
          <option value="monthly">Monthly (specific date)</option>
          <option value="custom">Custom (cron expression)</option>
        </select>
      </div>

      {/* Time Selection */}
      {scheduleType !== 'custom' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            What time? {timezoneAbbr && <span className="text-xs text-text-secondary">({timezoneAbbr})</span>}
          </label>
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            disabled={isTesting}
            className={`w-full rounded-md border border-border-heavy bg-surface-primary p-2 text-sm text-text-primary focus:border-blue-500 focus:outline-none ${
              isTesting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          />
          {userTimezone && (
            <p className="mt-1 text-xs text-text-secondary">
              This workflow will run at {scheduleTime} in your timezone ({userTimezone})
            </p>
          )}
        </div>
      )}

      {/* Weekly Days Selection */}
      {scheduleType === 'weekly' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            Which days?
          </label>
          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
              (day, index) => {
                const dayValue = index + 1; // 1 = Monday, 7 = Sunday
                const isSelected = scheduleDays.includes(dayValue);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isTesting}
                    onClick={() => {
                      if (isSelected) {
                        setScheduleDays(
                          scheduleDays.filter((d) => d !== dayValue),
                        );
                      } else {
                        setScheduleDays([...scheduleDays, dayValue]);
                      }
                    }}
                    className={`rounded border p-2 text-xs ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-border-light bg-surface-secondary text-text-secondary'
                    } ${isTesting ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-400'}`}
                  >
                    {day}
                  </button>
                );
              },
            )}
          </div>
        </div>
      )}

      {/* Monthly Date Selection */}
      {scheduleType === 'monthly' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            On which day of the month?
          </label>
          <select
            value={scheduleDate}
            onChange={(e) => setScheduleDate(parseInt(e.target.value))}
            disabled={isTesting}
            className={`w-full rounded-md border border-border-heavy bg-surface-primary p-2 text-sm text-text-primary focus:border-blue-500 focus:outline-none ${
              isTesting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
                {day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of
                the month
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Cron Expression */}
      {scheduleType === 'custom' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            Cron expression (UTC)
          </label>
          <input
            type="text"
            value={scheduleConfig}
            onChange={(e) => setScheduleConfig(e.target.value)}
            disabled={isTesting}
            className={`w-full rounded-md border border-border-heavy bg-surface-primary p-2 text-sm text-text-primary focus:border-blue-500 focus:outline-none ${
              isTesting ? 'cursor-not-allowed opacity-50' : ''
            }`}
            placeholder="0 9 * * * (Every day at 9 AM)"
          />
          <p className="mt-1 text-xs text-text-secondary">
            Format: minute hour day month weekday
          </p>
        </div>
      )}
    </div>
  );
};

export default ScheduleTrigger;