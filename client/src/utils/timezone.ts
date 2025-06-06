/**
 * Timezone utility functions for user timezone support
 */

// Common timezone options for user selection
export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
}

/**
 * Get user's detected timezone from browser
 */
export function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('Failed to detect timezone, falling back to UTC:', error);
    return 'UTC';
  }
}

/**
 * Get timezone offset string for display (e.g., "GMT-5", "GMT+2")
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    
    const parts = formatter.formatToParts(now);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;
    
    if (timeZoneName && timeZoneName.startsWith('GMT')) {
      return timeZoneName;
    }
    
    // Fallback: calculate offset manually
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offset = (localDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
    
    if (offset === 0) return 'GMT+0';
    const sign = offset > 0 ? '+' : '';
    return `GMT${sign}${offset}`;
  } catch (error) {
    console.warn(`Failed to get offset for timezone ${timezone}:`, error);
    return 'GMT+0';
  }
}

/**
 * Popular timezone options for user selection
 */
export function getPopularTimezones(): TimezoneOption[] {
  const timezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver', 
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Rome',
    'Europe/Moscow',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland',
  ];

  return timezones.map(tz => ({
    value: tz,
    label: formatTimezoneLabel(tz),
    offset: getTimezoneOffset(tz),
  }));
}

/**
 * Format timezone label for display
 */
export function formatTimezoneLabel(timezone: string): string {
  if (timezone === 'UTC') return 'UTC (Coordinated Universal Time)';
  
  try {
    // Convert timezone identifier to readable format
    const city = timezone.split('/').pop()?.replace(/_/g, ' ') || timezone;
    const offset = getTimezoneOffset(timezone);
    return `${city} (${offset})`;
  } catch (error) {
    return timezone;
  }
}

/**
 * Validate timezone string
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  if (timezone === 'UTC') return true;
  
  try {
    // Test if timezone is valid by trying to format a date with it
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Convert UTC date to user's timezone
 */
export function convertToUserTimezone(utcDate: Date, userTimezone: string): Date {
  try {
    const utcTime = utcDate.getTime();
    const localOffset = new Date().getTimezoneOffset() * 60000; // Local timezone offset in ms
    const utcDateTime = utcTime + localOffset; // Get true UTC time
    
    // Create date in user's timezone
    const userDate = new Date(utcDateTime);
    const userOffset = getTimezoneOffsetMinutes(userTimezone);
    
    return new Date(utcDateTime + (userOffset * 60000));
  } catch (error) {
    console.warn(`Failed to convert date to timezone ${userTimezone}:`, error);
    return utcDate;
  }
}

/**
 * Convert user timezone date to UTC
 */
export function convertToUTC(localDate: Date, userTimezone: string): Date {
  try {
    // Get the offset for the user's timezone
    const userOffset = getTimezoneOffsetMinutes(userTimezone);
    
    // Convert to UTC by subtracting the offset
    return new Date(localDate.getTime() - (userOffset * 60000));
  } catch (error) {
    console.warn(`Failed to convert date from timezone ${userTimezone} to UTC:`, error);
    return localDate;
  }
}

/**
 * Get timezone offset in minutes
 */
function getTimezoneOffsetMinutes(timezone: string): number {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
  } catch (error) {
    return 0; // Default to UTC offset
  }
}

/**
 * Format time with timezone indicator
 */
export function formatTimeWithTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });
    
    return formatter.format(date);
  } catch (error) {
    console.warn(`Failed to format time for timezone ${timezone}:`, error);
    return date.toLocaleTimeString();
  }
}

/**
 * Format date in user's timezone (date only)
 */
export function formatDateInTimezone(dateInput: string | Date, timezone: string, isSmallScreen = false): string {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    if (isSmallScreen) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch (error) {
    console.warn(`Failed to format date for timezone ${timezone}:`, error);
    // Fallback to original formatDate behavior
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isSmallScreen) {
      return date.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
      });
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }
}

/**
 * Format full datetime in user's timezone
 */
export function formatDateTimeInTimezone(dateInput: string | Date, timezone: string, options?: {
  showSeconds?: boolean;
  showTimezone?: boolean;
  use24Hour?: boolean;
}): string {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: !options?.use24Hour,
    };

    if (options?.showSeconds) {
      formatOptions.second = '2-digit';
    }

    if (options?.showTimezone) {
      formatOptions.timeZoneName = 'short';
    }

    return new Intl.DateTimeFormat('en-US', formatOptions).format(date);
  } catch (error) {
    console.warn(`Failed to format datetime for timezone ${timezone}:`, error);
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return date.toLocaleString();
  }
}

/**
 * Format time only in user's timezone
 */
export function formatTimeInTimezone(dateInput: string | Date, timezone: string, options?: {
  showSeconds?: boolean;
  use24Hour?: boolean;
}): string {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return 'Invalid time';
    }

    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: !options?.use24Hour,
    };

    if (options?.showSeconds) {
      formatOptions.second = '2-digit';
    }

    return new Intl.DateTimeFormat('en-US', formatOptions).format(date);
  } catch (error) {
    console.warn(`Failed to format time for timezone ${timezone}:`, error);
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return date.toLocaleTimeString();
  }
}

/**
 * Format relative time with timezone context (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTimeInTimezone(dateInput: string | Date, timezone: string): string {
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    // Get current time in the user's timezone
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absSeconds = Math.abs(diff) / 1000;
    const absMinutes = absSeconds / 60;
    const absHours = absMinutes / 60;
    const absDays = absHours / 24;

    const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

    if (absSeconds < 60) {
      return rtf.format(Math.round(diff / 1000), 'second');
    } else if (absMinutes < 60) {
      return rtf.format(Math.round(diff / (1000 * 60)), 'minute');
    } else if (absHours < 24) {
      return rtf.format(Math.round(diff / (1000 * 60 * 60)), 'hour');
    } else if (absDays < 30) {
      return rtf.format(Math.round(diff / (1000 * 60 * 60 * 24)), 'day');
    } else {
      // For dates older than 30 days, show the actual date in user's timezone
      return formatDateTimeInTimezone(date, timezone);
    }
  } catch (error) {
    console.warn(`Failed to format relative time for timezone ${timezone}:`, error);
    return 'Unknown time';
  }
}

/**
 * Get timezone abbreviation (e.g., "PST", "EST", "CET")
 */
export function getTimezoneAbbreviation(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    
    const parts = formatter.formatToParts(now);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;
    
    return timeZoneName || timezone;
  } catch (error) {
    console.warn(`Failed to get timezone abbreviation for ${timezone}:`, error);
    return timezone;
  }
}

/**
 * Convert a time from user's timezone to UTC for cron expressions
 * @param hour - Hour in user's timezone (0-23)
 * @param minute - Minute (0-59)
 * @param userTimezone - User's timezone
 * @returns Object with UTC hour and minute
 */
export function convertTimeToUTC(hour: number, minute: number, userTimezone: string): { hour: number; minute: number } {
  try {
    // Create a date in the user's timezone for today at the specified time
    const today = new Date();
    const userDate = new Date();
    
    // Set the time in the user's timezone
    const userDateString = today.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const fullDateString = `${userDateString}T${timeString}:00`;
    
    // Create date in user's timezone
    const localDate = new Date(fullDateString);
    const utcTime = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const userTime = new Date(localDate.toLocaleString('en-US', { timeZone: userTimezone }));
    
    // Calculate the offset
    const offsetMs = userTime.getTime() - utcTime.getTime();
    const utcDate = new Date(localDate.getTime() - offsetMs);
    
    return {
      hour: utcDate.getHours(),
      minute: utcDate.getMinutes()
    };
  } catch (error) {
    console.warn(`Failed to convert time to UTC for timezone ${userTimezone}:`, error);
    return { hour, minute }; // Fallback to original time
  }
}

/**
 * Convert a time from UTC to user's timezone
 * @param hour - Hour in UTC (0-23)  
 * @param minute - Minute (0-59)
 * @param userTimezone - User's timezone
 * @returns Object with local hour and minute
 */
export function convertTimeFromUTC(hour: number, minute: number, userTimezone: string): { hour: number; minute: number } {
  try {
    // Create a UTC date for today at the specified time
    const today = new Date();
    const utcDate = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(), 
      today.getUTCDate(),
      hour,
      minute,
      0
    ));
    
    // Convert to user's timezone
    const userTimeString = utcDate.toLocaleString('en-US', { 
      timeZone: userTimezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const [userHour, userMinute] = userTimeString.split(':').map(Number);
    
    return {
      hour: userHour,
      minute: userMinute
    };
  } catch (error) {
    console.warn(`Failed to convert time from UTC for timezone ${userTimezone}:`, error);
    return { hour, minute }; // Fallback to original time
  }
}

/**
 * Parse user-friendly schedule input and convert to UTC cron expression
 * @param input - User input like "daily at 9 AM", "every 5 minutes", etc.
 * @param userTimezone - User's timezone
 * @returns UTC cron expression or null if parsing fails
 */
export function parseScheduleToUTCCron(input: string, userTimezone: string): string | null {
  if (!input) return null;

  const cleanInput = input.toLowerCase().trim();
  
  // Pattern matchers with timezone conversion
  const patterns = [
    // "daily at 9 AM" or "daily at 9:30 AM"
    { 
      regex: /daily\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i, 
      handler: (match: RegExpMatchArray) => {
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2] || '0');
        const period = match[3]?.toLowerCase();
        
        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        
        // Convert to UTC
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hour, minute, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      }
    },
    
    // "at 2 PM" or "at 14:30"
    { 
      regex: /(?:^|\s)at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s|$)/i, 
      handler: (match: RegExpMatchArray) => {
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2] || '0');
        const period = match[3]?.toLowerCase();
        
        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        
        // Convert to UTC for daily schedule
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hour, minute, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      }
    },
    
    // "every X minutes"
    { 
      regex: /every\s+(\d+)\s+minutes?/i, 
      handler: (match: RegExpMatchArray) => {
        const minutes = parseInt(match[1]);
        return `*/${minutes} * * * *`;
      }
    },
    
    // "every hour"
    { 
      regex: /every\s+hour/i, 
      handler: () => '0 * * * *'
    },
    
    // "hourly"
    { 
      regex: /^hourly$/i, 
      handler: () => '0 * * * *'
    },
    
    // "every morning" (9 AM in user's timezone)
    { 
      regex: /every\s+morning/i, 
      handler: () => {
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(9, 0, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      }
    },
    
    // "every day" or "daily" (default to 9 AM in user's timezone)
    { 
      regex: /(?:every\s+day|^daily$)(?!\s+at)/i, 
      handler: () => {
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(9, 0, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      }
    },
    
    // "every X hours"
    { 
      regex: /every\s+(\d+)\s+hours?/i, 
      handler: (match: RegExpMatchArray) => {
        const hours = parseInt(match[1]);
        return `0 */${hours} * * *`;
      }
    },
    
    // "weekdays at 9 AM" (Monday-Friday)
    { 
      regex: /weekdays?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i, 
      handler: (match: RegExpMatchArray) => {
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2] || '0');
        const period = match[3]?.toLowerCase();
        
        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        
        // Convert to UTC
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hour, minute, userTimezone);
        return `${utcMinute} ${utcHour} * * 1-5`; // Monday-Friday
      }
    },
  ];

  for (const pattern of patterns) {
    const match = cleanInput.match(pattern.regex);
    if (match) {
      try {
        const cronExpr = pattern.handler(match);
        console.debug(`[timezone] Parsed schedule "${input}" -> "${cronExpr}" (UTC)`);
        return cronExpr;
      } catch (error) {
        console.warn(`[timezone] Failed to parse schedule "${input}":`, error);
        continue;
      }
    }
  }

  // If no patterns match, check if it's already a cron expression
  if (isCronExpression(cleanInput)) {
    console.debug(`[timezone] Input "${input}" appears to be a cron expression, returning as-is`);
    return cleanInput;
  }

  console.warn(`[timezone] Could not parse schedule input: "${input}"`);
  return null;
}

/**
 * Check if a string looks like a cron expression
 * @param input - Input string to check
 * @returns true if it looks like a cron expression
 */
export function isCronExpression(input: string): boolean {
  const cronPattern = /^(\*|[0-9,-/]+)\s+(\*|[0-9,-/]+)\s+(\*|[0-9,-/]+)\s+(\*|[0-9,-/]+)\s+(\*|[0-7,-/]+)$/;
  return cronPattern.test(input.trim());
}

/**
 * Convert a UTC cron expression to a human-readable description in user's timezone
 * @param cronExpression - UTC cron expression
 * @param userTimezone - User's timezone
 * @returns Human-readable description
 */
export function cronToHumanReadable(cronExpression: string, userTimezone: string): string {
  if (!cronExpression) return 'Not scheduled';
  
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return cronExpression; // Invalid cron, return as is
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    // Handle common patterns
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      // Daily at specific time
      const utcHour = parseInt(hour);
      const utcMinute = parseInt(minute);
      
      if (!isNaN(utcHour) && !isNaN(utcMinute)) {
        const { hour: localHour, minute: localMinute } = convertTimeFromUTC(utcHour, utcMinute, userTimezone);
        const period = localHour >= 12 ? 'PM' : 'AM';
        const displayHour = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;
        const timeStr = `${displayHour}:${localMinute.toString().padStart(2, '0')} ${period}`;
        return `Daily at ${timeStr}`;
      }
    }
    
    // Handle minute-based schedules
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const intervalMinutes = parseInt(minute.substring(2));
      if (intervalMinutes === 1) {
        return 'Every minute';
      } else if (intervalMinutes < 60) {
        return `Every ${intervalMinutes} minutes`;
      }
    }
    
    // Handle hourly schedules
    if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every hour';
    }
    
    // Handle hour-based schedules
    if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const intervalHours = parseInt(hour.substring(2));
      return `Every ${intervalHours} hours`;
    }
    
    // Handle weekdays
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
      const utcHour = parseInt(hour);
      const utcMinute = parseInt(minute);
      
      if (!isNaN(utcHour) && !isNaN(utcMinute)) {
        const { hour: localHour, minute: localMinute } = convertTimeFromUTC(utcHour, utcMinute, userTimezone);
        const period = localHour >= 12 ? 'PM' : 'AM';
        const displayHour = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;
        const timeStr = `${displayHour}:${localMinute.toString().padStart(2, '0')} ${period}`;
        return `Weekdays at ${timeStr}`;
      }
    }
    
    return cronExpression; // Fallback to original if we can't parse it
  } catch (error) {
    console.warn(`Failed to convert cron to human readable for timezone ${userTimezone}:`, error);
    return cronExpression;
  }
}

/**
 * Get next run time for a cron expression in user's timezone
 * @param cronExpression - UTC cron expression
 * @param userTimezone - User's timezone 
 * @returns Next run date in user's timezone
 */
export function getNextRunInTimezone(cronExpression: string, userTimezone: string): Date | null {
  try {
    // Calculate next run in UTC (using same logic as backend)
    const nextRunUTC = calculateNextRunUTC(cronExpression);
    if (!nextRunUTC) return null;
    
    // Convert to user's timezone for display
    const userTimeString = nextRunUTC.toLocaleString('en-US', { timeZone: userTimezone });
    return new Date(userTimeString);
  } catch (error) {
    console.warn(`Failed to get next run in timezone ${userTimezone}:`, error);
    return null;
  }
}

/**
 * Calculate next run time for cron expression in UTC (client-side approximation)
 * Note: This is a simplified version for client-side preview. 
 * The authoritative calculation happens on the server.
 */
function calculateNextRunUTC(cronExpression: string): Date | null {
  try {
    // This is a basic implementation for common cron patterns
    // For production, you might want to use a proper cron library on the client side too
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    
    // Handle simple daily schedules
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const targetHour = parseInt(hour);
      const targetMinute = parseInt(minute);
      
      if (!isNaN(targetHour) && !isNaN(targetMinute)) {
        const nextRun = new Date(now);
        nextRun.setUTCHours(targetHour, targetMinute, 0, 0);
        
        // If the time has passed today, schedule for tomorrow
        if (nextRun <= now) {
          nextRun.setUTCDate(nextRun.getUTCDate() + 1);
        }
        
        return nextRun;
      }
    }
    
    // Handle minute intervals
    if (minute.startsWith('*/') && hour === '*') {
      const interval = parseInt(minute.substring(2));
      if (!isNaN(interval)) {
        const nextRun = new Date(now);
        const currentMinute = nextRun.getUTCMinutes();
        const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
        
        if (nextMinute >= 60) {
          nextRun.setUTCHours(nextRun.getUTCHours() + 1);
          nextRun.setUTCMinutes(nextMinute % 60);
        } else {
          nextRun.setUTCMinutes(nextMinute);
        }
        nextRun.setUTCSeconds(0, 0);
        
        return nextRun;
      }
    }
    
    // For complex patterns, return a rough estimate (1 hour from now)
    const estimate = new Date(now.getTime() + 60 * 60 * 1000);
    return estimate;
  } catch (error) {
    console.warn('Failed to calculate next run UTC:', error);
    return null;
  }
} 