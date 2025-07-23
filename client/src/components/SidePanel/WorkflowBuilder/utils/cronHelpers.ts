import type { ScheduleType } from '../types';

export const generateCronExpression = (
  type: string,
  time: string,
  days: number[],
  date: number,
): string => {
  const [hour, minute] = time.split(':');

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
): { type: ScheduleType; time: string; days: number[]; date: number } => {
  const parts = cron.trim().split(' ');
  if (parts.length !== 5) {
    return { type: 'daily', time: '09:00', days: [1], date: 1 };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

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