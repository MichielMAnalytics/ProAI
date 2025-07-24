import type { ScheduleType } from '../types';
import { convertTimeToUTC, convertTimeFromUTC } from '~/utils/timezone';

export const generateCronExpression = (
  type: string,
  time: string,
  days: number[],
  date: number,
  userTimezone?: string,
): string => {
  const [localHour, localMinute] = time.split(':').map(Number);
  
  // Convert local time to UTC if timezone is provided
  let hour = localHour;
  let minute = localMinute;
  
  if (userTimezone) {
    const utcTime = convertTimeToUTC(localHour, localMinute, userTimezone);
    hour = utcTime.hour;
    minute = utcTime.minute;
  }

  switch (type) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      const cronDays = days.map((day) => (day === 7 ? 0 : day)).join(','); // Convert Sunday from 7 to 0
      return `${minute} ${hour} * * ${cronDays}`;
    case 'monthly':
      return `${minute} ${hour} ${date} * *`;
    default:
      return '0 9 * * *'; // Default fallback
  }
};

export const parseCronExpression = (
  cron: string,
  userTimezone?: string,
): { type: ScheduleType; time: string; days: number[]; date: number } => {
  const parts = cron.trim().split(' ');
  if (parts.length !== 5) {
    return { type: 'daily', time: '09:00', days: [1], date: 1 };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // Parse UTC time from cron
  let displayHour = parseInt(hour) || 0;
  let displayMinute = parseInt(minute) || 0;
  
  // Convert UTC time to user's local time if timezone is provided
  if (userTimezone) {
    const localTime = convertTimeFromUTC(displayHour, displayMinute, userTimezone);
    displayHour = localTime.hour;
    displayMinute = localTime.minute;
  }
  
  const time = `${displayHour.toString().padStart(2, '0')}:${displayMinute.toString().padStart(2, '0')}`;

  if (dayOfWeek !== '*') {
    // Weekly schedule
    const days = dayOfWeek
      .split(',')
      .map((d) => (d === '0' ? 7 : parseInt(d)))
      .filter((d) => !isNaN(d));
    return { type: 'weekly', time, days, date: 1 };
  } else if (dayOfMonth !== '*') {
    // Monthly schedule
    const date = parseInt(dayOfMonth) || 1;
    return { type: 'monthly', time, days: [1], date };
  } else {
    // Daily schedule
    return { type: 'daily', time, days: [1], date: 1 };
  }
};