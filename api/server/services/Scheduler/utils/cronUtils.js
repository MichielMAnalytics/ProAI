const { logger } = require('~/config');

/**
 * Calculate next run time using cron expression in UTC
 * All cron expressions are treated as UTC-based for consistency
 * @param {string} cronExpression - The cron expression to parse
 * @returns {Date|null} Next execution date in UTC or null if invalid
 */
function calculateNextRun(cronExpression) {
  try {
    const { parseCronExpression } = require('cron-schedule');
    // Parse cron expression in UTC timezone
    const cron = parseCronExpression(cronExpression, { timezone: 'UTC' });
    const nextDate = cron.getNextDate();

    logger.debug(
      `[cronUtils] Calculated next run for cron "${cronExpression}": ${nextDate?.toISOString() || 'null'}`,
    );
    return nextDate;
  } catch (error) {
    logger.error(`[cronUtils] Failed to calculate next run for cron: ${cronExpression}`, error);
    return null;
  }
}

/**
 * Convert time from user timezone to UTC for cron expressions
 * @param {number} hour - Hour in user timezone (0-23)
 * @param {number} minute - Minute (0-59)
 * @param {string} userTimezone - User's timezone (IANA identifier)
 * @returns {Object} Object with UTC hour and minute
 */
function convertTimeToUTC(hour, minute, userTimezone) {
  try {
    // Create a date for today in the user's timezone
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();

    // Create date at the specified time in user's timezone
    const userDate = new Date();
    userDate.setFullYear(year, month, day);
    userDate.setHours(hour, minute, 0, 0);

    // Convert to UTC
    const utcTime = new Date(userDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const localTime = new Date(userDate.toLocaleString('en-US', { timeZone: userTimezone }));

    // Calculate offset
    const offsetMs = localTime.getTime() - utcTime.getTime();
    const utcDate = new Date(userDate.getTime() - offsetMs);

    return {
      hour: utcDate.getHours(),
      minute: utcDate.getMinutes(),
    };
  } catch (error) {
    logger.warn(`[cronUtils] Failed to convert time to UTC for timezone ${userTimezone}:`, error);
    return { hour, minute }; // Fallback to original time
  }
}

/**
 * Parse user-friendly schedule input and convert to UTC cron expression
 * @param {string} input - User input like "daily at 9 AM", "every 5 minutes", etc.
 * @param {string} userTimezone - User's timezone (IANA identifier)
 * @returns {string|null} UTC cron expression or null if parsing fails
 */
function parseScheduleToUTCCron(input, userTimezone = 'UTC') {
  if (!input) return null;

  const cleanInput = input.toLowerCase().trim();
  logger.debug(`[cronUtils] Parsing schedule input: "${input}" for timezone: ${userTimezone}`);

  // Pattern matchers with timezone conversion
  const patterns = [
    // "daily at 9 AM" or "daily at 9:30 AM"
    {
      regex: /daily\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
      handler: (match) => {
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2] || '0');
        const period = match[3]?.toLowerCase();

        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        // Convert to UTC
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hour, minute, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      },
    },

    // "at 2 PM" or "at 14:30"
    {
      regex: /(?:^|\s)at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s|$)/i,
      handler: (match) => {
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2] || '0');
        const period = match[3]?.toLowerCase();

        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        // Convert to UTC for daily schedule
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hour, minute, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      },
    },

    // "every X minutes"
    {
      regex: /every\s+(\d+)\s+minutes?/i,
      handler: (match) => {
        const minutes = parseInt(match[1]);
        return `*/${minutes} * * * *`;
      },
    },

    // "every hour"
    {
      regex: /every\s+hour/i,
      handler: () => '0 * * * *',
    },

    // "hourly"
    {
      regex: /^hourly$/i,
      handler: () => '0 * * * *',
    },

    // "every morning" (9 AM in user's timezone)
    {
      regex: /every\s+morning/i,
      handler: () => {
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(9, 0, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      },
    },

    // "every day" or "daily" (default to 9 AM in user's timezone)
    {
      regex: /(?:every\s+day|^daily$)(?!\s+at)/i,
      handler: () => {
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(9, 0, userTimezone);
        return `${utcMinute} ${utcHour} * * *`;
      },
    },

    // "every X hours"
    {
      regex: /every\s+(\d+)\s+hours?/i,
      handler: (match) => {
        const hours = parseInt(match[1]);
        return `0 */${hours} * * *`;
      },
    },

    // "weekdays at 9 AM" (Monday-Friday)
    {
      regex: /weekdays?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
      handler: (match) => {
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2] || '0');
        const period = match[3]?.toLowerCase();

        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        // Convert to UTC
        const { hour: utcHour, minute: utcMinute } = convertTimeToUTC(hour, minute, userTimezone);
        return `${utcMinute} ${utcHour} * * 1-5`; // Monday-Friday
      },
    },
  ];

  for (const pattern of patterns) {
    const match = cleanInput.match(pattern.regex);
    if (match) {
      try {
        const cronExpr = pattern.handler(match);
        logger.debug(`[cronUtils] Parsed schedule "${input}" -> "${cronExpr}" (UTC)`);
        return cronExpr;
      } catch (error) {
        logger.warn(`[cronUtils] Failed to parse schedule "${input}":`, error);
        continue;
      }
    }
  }

  // If no patterns match, check if it's already a cron expression
  if (isCronExpression(cleanInput)) {
    logger.debug(`[cronUtils] Input "${input}" appears to be a cron expression, returning as-is`);
    return cleanInput;
  }

  logger.warn(`[cronUtils] Could not parse schedule input: "${input}"`);
  return null;
}

/**
 * Check if a string looks like a cron expression
 * @param {string} input - Input string to check
 * @returns {boolean} true if it looks like a cron expression
 */
function isCronExpression(input) {
  const cronPattern =
    /^(\*|[0-9,-/]+)\s+(\*|[0-9,-/]+)\s+(\*|[0-9,-/]+)\s+(\*|[0-9,-/]+)\s+(\*|[0-7,-/]+)$/;
  return cronPattern.test(input.trim());
}

/**
 * Validate cron expression in UTC
 * @param {string} cronExpression - The cron expression to validate
 * @returns {{ valid: boolean, nextRun?: Date, error?: string }}
 */
function validateCronExpression(cronExpression) {
  try {
    const { parseCronExpression } = require('cron-schedule');
    // Validate cron expression in UTC timezone
    const cron = parseCronExpression(cronExpression, { timezone: 'UTC' });
    const nextRun = cron.getNextDate();

    logger.debug(
      `[cronUtils] Validated cron "${cronExpression}": valid=true, next run=${nextRun?.toISOString()}`,
    );
    return { valid: true, nextRun };
  } catch (error) {
    logger.debug(
      `[cronUtils] Validated cron "${cronExpression}": valid=false, error=${error.message}`,
    );
    return { valid: false, error: error.message };
  }
}

/**
 * Check if a task is overdue based on its next_run time (UTC)
 * @param {Date|string} nextRun - The scheduled next run time
 * @returns {number} Milliseconds overdue (0 if not overdue)
 */
function getOverdueTime(nextRun) {
  const now = new Date(); // Current UTC time
  const scheduledTime = new Date(nextRun);
  const overdueMs = Math.max(0, now - scheduledTime);

  if (overdueMs > 0) {
    logger.debug(
      `[cronUtils] Task overdue by ${overdueMs}ms (${Math.floor(overdueMs / 60000)} minutes)`,
    );
  }

  return overdueMs;
}

/**
 * Calculate time until next execution (UTC)
 * @param {Date|string} nextRun - The scheduled next run time
 * @returns {number} Milliseconds until execution (negative if overdue)
 */
function getTimeUntilExecution(nextRun) {
  const now = new Date(); // Current UTC time
  const scheduledTime = new Date(nextRun);
  const timeUntilMs = scheduledTime - now;

  logger.debug(
    `[cronUtils] Time until execution: ${timeUntilMs}ms (${Math.floor(timeUntilMs / 60000)} minutes)`,
  );
  return timeUntilMs;
}

module.exports = {
  calculateNextRun,
  validateCronExpression,
  getOverdueTime,
  getTimeUntilExecution,
  parseScheduleToUTCCron,
  isCronExpression,
};
