const PQueue = require('p-queue').default;
const { logger } = require('~/config');
const { calculatePriority } = require('./utils/priorityUtils');

class SchedulerQueueManager {
  constructor() {
    // Initialize task queue with concurrency limits
    this.taskQueue = new PQueue({
      concurrency: parseInt(process.env.SCHEDULER_CONCURRENCY || '3'), // Max 3 concurrent executions by default
      timeout: parseInt(process.env.SCHEDULER_TASK_TIMEOUT || '300000'), // 5 minute timeout per task
      throwOnTimeout: true,
      intervalCap: 10, // Max 10 tasks per interval
      interval: 60000, // 1 minute interval
    });

    // Initialize retry queue with lower concurrency
    this.retryQueue = new PQueue({
      concurrency: parseInt(process.env.SCHEDULER_RETRY_CONCURRENCY || '1'), // More conservative for retries
      timeout: parseInt(process.env.SCHEDULER_TASK_TIMEOUT || '300000'),
      throwOnTimeout: true,
    });

    this.setupQueueHandlers();

    logger.info('[SchedulerQueueManager] Initialized with settings:', {
      taskConcurrency: this.taskQueue.concurrency,
      retryConcurrency: this.retryQueue.concurrency,
      taskTimeout: this.taskQueue.timeout,
    });
  }

  /**
   * Set up event handlers for both queues
   */
  setupQueueHandlers() {
    // Main queue handlers
    this.taskQueue.on('add', () => {
      logger.debug(
        `[SchedulerQueueManager] Task added to main queue. Size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`,
      );
    });

    this.taskQueue.on('active', () => {
      logger.debug(
        `[SchedulerQueueManager] Task started in main queue. Size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`,
      );
    });

    this.taskQueue.on('completed', (result) => {
      logger.debug(
        `[SchedulerQueueManager] Task completed in main queue. Size: ${this.taskQueue.size}, Pending: ${this.taskQueue.pending}`,
      );
    });

    this.taskQueue.on('error', (error, task) => {
      logger.error(`[SchedulerQueueManager] Main queue error:`, error);
    });

    // Retry queue handlers
    this.retryQueue.on('add', () => {
      logger.debug(
        `[SchedulerQueueManager] Task added to retry queue. Size: ${this.retryQueue.size}, Pending: ${this.retryQueue.pending}`,
      );
    });

    this.retryQueue.on('active', () => {
      logger.debug(
        `[SchedulerQueueManager] Task started in retry queue. Size: ${this.retryQueue.size}, Pending: ${this.retryQueue.pending}`,
      );
    });

    this.retryQueue.on('completed', (result) => {
      logger.debug(
        `[SchedulerQueueManager] Task completed in retry queue. Size: ${this.retryQueue.size}, Pending: ${this.retryQueue.pending}`,
      );
    });

    this.retryQueue.on('error', (error, task) => {
      logger.error(`[SchedulerQueueManager] Retry queue error:`, error);
    });
  }

  /**
   * Add a task to the main execution queue
   * @param {Function} taskFunction - The task function to execute
   * @param {Object} task - The scheduler task data
   * @returns {Promise} Queue promise
   */
  addTask(taskFunction, task) {
    const priority = calculatePriority(task);

    return this.taskQueue.add(taskFunction, {
      priority,
      meta: {
        taskId: task.id,
        taskName: task.name,
        userId: task.user,
        priority,
      },
    });
  }

  /**
   * Add a retry task to the retry queue with delay
   * @param {Function} taskFunction - The task function to execute
   * @param {Object} task - The scheduler task data
   * @param {number} delay - Delay in milliseconds before execution
   * @param {number} priority - Priority for the retry
   * @returns {void}
   */
  addRetryTask(taskFunction, task, delay, priority) {
    setTimeout(() => {
      this.retryQueue.add(taskFunction, {
        priority,
        meta: {
          taskId: task.id,
          taskName: task.name,
          userId: task.user,
          priority,
          isRetry: true,
        },
      });
    }, delay);
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status information
   */
  getQueueStatus() {
    return {
      main: {
        size: this.taskQueue.size,
        pending: this.taskQueue.pending,
        isPaused: this.taskQueue.isPaused,
      },
      retry: {
        size: this.retryQueue.size,
        pending: this.retryQueue.pending,
        isPaused: this.retryQueue.isPaused,
      },
    };
  }

  /**
   * Pause both queues
   */
  pause() {
    this.taskQueue.pause();
    this.retryQueue.pause();
    logger.info('[SchedulerQueueManager] Queues paused');
  }

  /**
   * Resume both queues
   */
  resume() {
    this.taskQueue.start();
    this.retryQueue.start();
    logger.info('[SchedulerQueueManager] Queues resumed');
  }

  /**
   * Clear all queues
   */
  clear() {
    this.taskQueue.clear();
    this.retryQueue.clear();
    logger.info('[SchedulerQueueManager] Queues cleared');
  }

  /**
   * Wait for all queues to empty
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} True if queues emptied, false if timeout
   */
  async waitForEmpty(timeout = 60000) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkQueues = () => {
        const isEmpty =
          this.taskQueue.size === 0 &&
          this.taskQueue.pending === 0 &&
          this.retryQueue.size === 0 &&
          this.retryQueue.pending === 0;

        if (isEmpty) {
          resolve(true);
        } else if (Date.now() - startTime >= timeout) {
          logger.warn(`[SchedulerQueueManager] Wait for empty timeout after ${timeout}ms`);
          resolve(false);
        } else {
          logger.debug(
            `[SchedulerQueueManager] Waiting for queues to empty: main(${this.taskQueue.size}/${this.taskQueue.pending}), retry(${this.retryQueue.size}/${this.retryQueue.pending})`,
          );
          setTimeout(checkQueues, 1000);
        }
      };
      checkQueues();
    });
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      main: {
        concurrency: this.taskQueue.concurrency,
        timeout: this.taskQueue.timeout,
        size: this.taskQueue.size,
        pending: this.taskQueue.pending,
        isPaused: this.taskQueue.isPaused,
      },
      retry: {
        concurrency: this.retryQueue.concurrency,
        timeout: this.retryQueue.timeout,
        size: this.retryQueue.size,
        pending: this.retryQueue.pending,
        isPaused: this.retryQueue.isPaused,
      },
    };
  }
}

module.exports = SchedulerQueueManager;
