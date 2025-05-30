const { logger } = require('~/config');
const { getReadySchedulerTasks } = require('~/models/SchedulerTask');
const SchedulerQueueManager = require('./SchedulerQueueManager');
const SchedulerTaskExecutor = require('./SchedulerTaskExecutor');
const SchedulerRetryManager = require('./SchedulerRetryManager');

class SchedulerExecutionService {
  constructor() {
    logger.debug('[SchedulerExecutionService] Constructor called');
    
    // Initialize service components
    this.queueManager = new SchedulerQueueManager();
    this.taskExecutor = new SchedulerTaskExecutor();
    this.retryManager = new SchedulerRetryManager();
    
    this.isRunning = false;
    this.schedulerInterval = null;
    this.shutdownTimeout = null;
    
    logger.info('[SchedulerExecutionService] Initialized with components:', {
      queueManager: !!this.queueManager,
      taskExecutor: !!this.taskExecutor,
      retryManager: !!this.retryManager,
      maxRetries: this.retryManager.maxRetries,
    });
  }

  /**
   * Execute task with retry logic
   * @param {Object} task - The scheduler task
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {Promise<Object>} Execution result
   */
  async executeTaskWithRetry(task, attempt = 1) {
    try {
      const result = await this.taskExecutor.executeTask(task);
      return result;
    } catch (error) {
      const retryInfo = this.retryManager.handleTaskFailure(task, error, attempt);
      
      if (retryInfo.retry) {
        // Schedule retry
        this.queueManager.addRetryTask(
          () => this.executeTaskWithRetry(task, retryInfo.nextAttempt),
          task,
          retryInfo.delay,
          retryInfo.priority
        );
        return retryInfo;
      } else {
        // No more retries, let the error bubble up
        throw error;
      }
    }
  }

  /**
   * Get tasks that are ready for execution
   * @returns {Promise<Array>} Array of ready tasks
   */
  async getReadyTasks() {
    try {
      return await getReadySchedulerTasks();
    } catch (error) {
      logger.error('[SchedulerExecutionService] Error fetching ready tasks:', error);
      return [];
    }
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status information
   */
  getQueueStatus() {
    return this.queueManager.getQueueStatus();
  }

  /**
   * Get comprehensive service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      queue: this.queueManager.getStats(),
      retry: this.retryManager.getRetryStats(),
      scheduler: {
        intervalActive: !!this.schedulerInterval,
        shutdownInProgress: !!this.shutdownTimeout,
      }
    };
  }

  /**
   * Start the scheduler
   */
  async startScheduler() {
    if (this.isRunning) {
      logger.warn('[SchedulerExecutionService] Scheduler is already running');
      return;
    }

    logger.info('[SchedulerExecutionService] Starting scheduler...');
    this.isRunning = true;

    const schedulerLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const readyTasks = await this.getReadyTasks();
        
        if (readyTasks.length > 0) {
          logger.info(`[SchedulerExecutionService] Found ${readyTasks.length} ready tasks`);
          
          for (const task of readyTasks) {
            this.queueManager.addTask(() => this.executeTaskWithRetry(task), task);
          }
        } else {
          logger.debug('[SchedulerExecutionService] No ready tasks found');
        }
      } catch (error) {
        logger.error('[SchedulerExecutionService] Error in scheduler loop:', error);
      }
    };

    // Run immediately, then every 30 seconds
    await schedulerLoop();
    this.schedulerInterval = setInterval(schedulerLoop, 30000);
    
    logger.info('[SchedulerExecutionService] Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  async stopScheduler() {
    logger.info('[SchedulerExecutionService] Stopping scheduler...');
    this.isRunning = false;
    
    // Clear the interval
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    // Wait for current tasks to complete or timeout
    const shutdownTimeout = parseInt(process.env.SCHEDULER_SHUTDOWN_TIMEOUT || '60000');
    
    this.shutdownTimeout = setTimeout(() => {
      logger.warn('[SchedulerExecutionService] Shutdown timeout reached, forcing stop');
      this.queueManager.clear();
    }, shutdownTimeout);

    try {
      const emptied = await this.queueManager.waitForEmpty(shutdownTimeout);
      if (!emptied) {
        logger.warn('[SchedulerExecutionService] Queues did not empty within timeout, forcing shutdown');
        this.queueManager.clear();
      }
    } finally {
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }
    }

    logger.info('[SchedulerExecutionService] Scheduler stopped successfully');
  }

  /**
   * Pause the scheduler (stop processing new tasks but keep existing ones)
   */
  pause() {
    logger.info('[SchedulerExecutionService] Pausing scheduler...');
    this.queueManager.pause();
  }

  /**
   * Resume the scheduler
   */
  resume() {
    logger.info('[SchedulerExecutionService] Resuming scheduler...');
    this.queueManager.resume();
  }

  /**
   * Clear all queues (emergency stop)
   */
  clearQueues() {
    logger.warn('[SchedulerExecutionService] Clearing all queues (emergency stop)');
    this.queueManager.clear();
  }

  /**
   * Get health status of the scheduler
   * @returns {Object} Health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const queueStatus = this.getQueueStatus();
    
    return {
      healthy: this.isRunning && !stats.scheduler.shutdownInProgress,
      isRunning: this.isRunning,
      components: {
        queueManager: !queueStatus.main.isPaused && !queueStatus.retry.isPaused,
        taskExecutor: true, // Stateless, always healthy
        retryManager: true, // Stateless, always healthy
      },
      queues: queueStatus,
      uptime: this.isRunning ? 'running' : 'stopped',
    };
  }
}

module.exports = SchedulerExecutionService; 