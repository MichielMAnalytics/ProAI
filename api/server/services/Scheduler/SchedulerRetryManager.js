const { logger } = require('~/config');
const { calculateRetryPriority } = require('./utils/priorityUtils');

class SchedulerRetryManager {
  constructor(maxRetries = 3) {
    this.maxRetries = parseInt(process.env.SCHEDULER_MAX_RETRIES || maxRetries.toString());
    logger.debug(`[SchedulerRetryManager] Initialized with max retries: ${this.maxRetries}`);
  }

  /**
   * Determine if an error is retriable
   * @param {Error} error - The error to check
   * @returns {boolean} True if the error should be retried
   */
  isRetriableError(error) {
    const nonRetriablePatterns = [
      /authentication/i,
      /unauthorized/i,
      /forbidden/i,
      /not found/i,
      /invalid.*key/i,
      /invalid.*token/i,
      /malformed/i,
      /syntax.*error/i,
      /quota.*exceeded/i,
      /rate.*limit/i,
    ];
    
    const errorMessage = error.message || error.toString();
    return !nonRetriablePatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Calculate retry delay using exponential backoff
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attempt) {
    // Exponential backoff: 2^attempt * 1000ms with jitter
    const baseDelay = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(baseDelay + jitter, 60000); // Cap at 1 minute
  }

  /**
   * Determine if a task should be retried
   * @param {Object} task - The scheduler task
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {boolean} True if task should be retried
   */
  shouldRetry(task, error, attempt) {
    if (attempt >= this.maxRetries) {
      logger.debug(`[SchedulerRetryManager] Max retries (${this.maxRetries}) reached for task ${task.id}`);
      return false;
    }

    if (!this.isRetriableError(error)) {
      logger.debug(`[SchedulerRetryManager] Non-retriable error for task ${task.id}: ${error.message}`);
      return false;
    }

    logger.debug(`[SchedulerRetryManager] Task ${task.id} eligible for retry (attempt ${attempt}/${this.maxRetries})`);
    return true;
  }

  /**
   * Create retry execution info
   * @param {Object} task - The scheduler task
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {Object} Retry execution info
   */
  createRetryInfo(task, error, attempt) {
    const delay = this.calculateRetryDelay(attempt);
    const priority = calculateRetryPriority(task, attempt);
    
    return {
      success: false,
      retry: true,
      attempt,
      maxRetries: this.maxRetries,
      error: error.message,
      delay,
      priority,
      nextAttempt: attempt + 1,
    };
  }

  /**
   * Handle task execution failure and determine retry strategy
   * @param {Object} task - The scheduler task
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {Object} Execution result with retry information
   */
  handleTaskFailure(task, error, attempt) {
    logger.error(`[SchedulerRetryManager] Task ${task.id} failed on attempt ${attempt}:`, error.message);
    
    if (this.shouldRetry(task, error, attempt)) {
      const retryInfo = this.createRetryInfo(task, error, attempt);
      logger.info(`[SchedulerRetryManager] Scheduling retry for task ${task.id} in ${retryInfo.delay}ms (attempt ${retryInfo.nextAttempt}/${this.maxRetries})`);
      return retryInfo;
    } else {
      logger.error(`[SchedulerRetryManager] Task ${task.id} failed permanently after ${attempt} attempts:`, error.message);
      throw error;
    }
  }

  /**
   * Get retry statistics
   * @returns {Object} Retry statistics
   */
  getRetryStats() {
    return {
      maxRetries: this.maxRetries,
    };
  }
}

module.exports = SchedulerRetryManager; 