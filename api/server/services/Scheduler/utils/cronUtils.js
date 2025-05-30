const { logger } = require('~/config');

/**
 * Calculate next run time using cron expression
 * @param {string} cronExpression - The cron expression to parse
 * @returns {Date|null} Next execution date or null if invalid
 */
function calculateNextRun(cronExpression) {
  try {
    const { parseCronExpression } = require('cron-schedule');
    const cron = parseCronExpression(cronExpression);
    return cron.getNextDate();
  } catch (error) {
    logger.error(`[cronUtils] Failed to calculate next run for cron: ${cronExpression}`, error);
    return null;
  }
}

/**
 * Validate cron expression
 * @param {string} cronExpression - The cron expression to validate
 * @returns {{ valid: boolean, nextRun?: Date, error?: string }}
 */
function validateCronExpression(cronExpression) {
  try {
    const { parseCronExpression } = require('cron-schedule');
    const cron = parseCronExpression(cronExpression);
    const nextRun = cron.getNextDate();
    return { valid: true, nextRun };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Check if a task is overdue based on its next_run time
 * @param {Date|string} nextRun - The scheduled next run time
 * @returns {number} Milliseconds overdue (0 if not overdue)
 */
function getOverdueTime(nextRun) {
  const now = new Date();
  const scheduledTime = new Date(nextRun);
  return Math.max(0, now - scheduledTime);
}

/**
 * Calculate time until next execution
 * @param {Date|string} nextRun - The scheduled next run time
 * @returns {number} Milliseconds until execution (negative if overdue)
 */
function getTimeUntilExecution(nextRun) {
  const now = new Date();
  const scheduledTime = new Date(nextRun);
  return scheduledTime - now;
}

module.exports = {
  calculateNextRun,
  validateCronExpression,
  getOverdueTime,
  getTimeUntilExecution,
}; 