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

      // Handle skipped tasks (no retry needed)
      if (result && result.skipped) {
        logger.debug(`[SchedulerExecutionService] Task ${task.id} was skipped: ${result.error}`);
        return result;
      }

      return result;
    } catch (error) {
      const retryInfo = this.retryManager.handleTaskFailure(task, error, attempt);

      if (retryInfo.retry) {
        // Schedule retry
        this.queueManager.addRetryTask(
          () => this.executeTaskWithRetry(task, retryInfo.nextAttempt),
          task,
          retryInfo.delay,
          retryInfo.priority,
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
      },
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

    // Log detailed startup information
    await this.logStartupState();

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
   * Log detailed startup state information
   */
  async logStartupState() {
    try {
      const { getAllSchedulerTasks } = require('~/models/SchedulerTask');

      // Get all scheduler tasks for comprehensive overview
      let allTasks = [];
      try {
        allTasks = await getAllSchedulerTasks();

        logger.info('📊 [SchedulerExecutionService] Startup State Summary:');
        logger.info('='.repeat(60));

        if (allTasks.length === 0) {
          logger.info('📋 No scheduler tasks found in database');
          logger.info('   💡 This is normal for fresh installations');
          logger.info('   📝 Tasks and workflows will appear here once created');
          logger.info('='.repeat(60));
          return;
        }

        // Analyze tasks
        const taskStats = this.analyzeTaskStats(allTasks);

        // Log overall statistics
        logger.info(`📈 Overall Statistics:`);
        logger.info(`   Total Tasks: ${allTasks.length}`);
        logger.info(
          `   📋 Regular Tasks: ${taskStats.regularTasks.total} (${taskStats.regularTasks.enabled} enabled, ${taskStats.regularTasks.disabled} disabled)`,
        );
        logger.info(
          `   🔄 Workflow Tasks: ${taskStats.workflowTasks.total} (${taskStats.workflowTasks.enabled} enabled, ${taskStats.workflowTasks.disabled} disabled)`,
        );

        // Log status breakdown
        logger.info(`📊 Status Breakdown:`);
        logger.info(`   ✅ Pending: ${taskStats.statusCounts.pending}`);
        logger.info(`   🏃 Running: ${taskStats.statusCounts.running}`);
        logger.info(`   ❌ Failed: ${taskStats.statusCounts.failed}`);
        logger.info(`   ⏸️  Disabled: ${taskStats.statusCounts.disabled}`);
        logger.info(`   ✅ Completed: ${taskStats.statusCounts.completed || 0}`);

        // Log ready tasks
        const readyTasks = allTasks.filter((task) => {
          if (!task.enabled) return false;
          if (!task.next_run) return true; // Tasks without next_run are ready
          return new Date(task.next_run) <= new Date();
        });

        if (readyTasks.length > 0) {
          logger.info(`🚀 Ready for Execution: ${readyTasks.length} task(s)`);
          readyTasks.slice(0, 3).forEach((task, index) => {
            const taskType = task.metadata?.type === 'workflow' ? '🔄' : '📋';
            logger.info(`   ${index + 1}. ${taskType} ${task.name}`);
          });
          if (readyTasks.length > 3) {
            logger.info(`   ... and ${readyTasks.length - 3} more ready tasks`);
          }
        }

        // Log next executions
        if (taskStats.nextExecutions.length > 0) {
          logger.info(`⏰ Next Scheduled Executions:`);
          taskStats.nextExecutions.slice(0, 5).forEach((task, index) => {
            const timeUntil = this.getTimeUntilExecution(task.next_run);
            const taskType = task.metadata?.type === 'workflow' ? '🔄' : '📋';
            logger.info(`   ${index + 1}. ${taskType} ${task.name} - ${timeUntil}`);
          });
          if (taskStats.nextExecutions.length > 5) {
            logger.info(`   ... and ${taskStats.nextExecutions.length - 5} more scheduled`);
          }
        }

        // Log workflow details if any
        if (taskStats.workflowTasks.total > 0) {
          logger.info(`🔄 Workflow Details:`);
          const workflows = allTasks.filter((task) => task.metadata?.type === 'workflow');
          workflows.slice(0, 3).forEach((workflow, index) => {
            const status = workflow.enabled ? '✅ Active' : '⏸️  Paused';
            const schedule = workflow.schedule || 'No schedule';
            const description =
              workflow.metadata?.description || workflow.name.replace('Workflow: ', '');
            logger.info(`   ${index + 1}. ${description} (${status})`);
            logger.info(`      Schedule: ${schedule}`);
            if (workflow.metadata?.steps) {
              logger.info(`      Steps: ${workflow.metadata.steps.length}`);
            }
          });
          if (workflows.length > 3) {
            logger.info(`   ... and ${workflows.length - 3} more workflows`);
          }
        }

        // Log any overdue tasks
        const overdueTasks = allTasks.filter((task) => {
          if (!task.enabled || !task.next_run) return false;
          return new Date(task.next_run) < new Date() && task.status !== 'running';
        });

        if (overdueTasks.length > 0) {
          logger.warn(`⚠️  Overdue Tasks: ${overdueTasks.length}`);
          overdueTasks.slice(0, 3).forEach((task, index) => {
            const taskType = task.metadata?.type === 'workflow' ? '🔄' : '📋';
            const overdue = this.getTimeUntilExecution(task.next_run);
            logger.warn(`   ${index + 1}. ${taskType} ${task.name} - ${overdue}`);
          });
        }

        logger.info('='.repeat(60));
      } catch (error) {
        logger.warn(
          '[SchedulerExecutionService] Could not load comprehensive task state:',
          error.message,
        );

        // Fallback to ready tasks only
        try {
          const readyTasks = await this.getReadyTasks();
          if (readyTasks.length > 0) {
            logger.info(`📋 Ready Tasks Available: ${readyTasks.length}`);
            const workflows = readyTasks.filter(
              (task) =>
                task.metadata?.type === 'workflow' ||
                (task.prompt && task.prompt.startsWith('WORKFLOW_EXECUTION:')),
            );
            const regularTasks = readyTasks.length - workflows.length;
            logger.info(`   📋 Regular Tasks: ${regularTasks}`);
            logger.info(`   🔄 Workflow Tasks: ${workflows.length}`);
          } else {
            logger.info('📋 No tasks ready for immediate execution');
          }
        } catch (fallbackError) {
          logger.error(
            '[SchedulerExecutionService] Could not load even ready tasks:',
            fallbackError.message,
          );
        }
      }
    } catch (error) {
      logger.error('[SchedulerExecutionService] Error logging startup state:', error);
    }
  }

  /**
   * Analyze task statistics for startup logging
   * @param {Array} tasks - Array of scheduler tasks
   * @returns {Object} Task statistics
   */
  analyzeTaskStats(tasks) {
    const stats = {
      regularTasks: { total: 0, enabled: 0, disabled: 0 },
      workflowTasks: { total: 0, enabled: 0, disabled: 0 },
      statusCounts: { pending: 0, running: 0, failed: 0, disabled: 0, completed: 0 },
      nextExecutions: [],
    };

    tasks.forEach((task) => {
      // Categorize by type
      if (
        task.metadata?.type === 'workflow' ||
        (task.prompt && task.prompt.startsWith('WORKFLOW_EXECUTION:'))
      ) {
        stats.workflowTasks.total++;
        if (task.enabled) {
          stats.workflowTasks.enabled++;
        } else {
          stats.workflowTasks.disabled++;
        }
      } else {
        stats.regularTasks.total++;
        if (task.enabled) {
          stats.regularTasks.enabled++;
        } else {
          stats.regularTasks.disabled++;
        }
      }

      // Count by status (treat enabled/disabled separately from running status)
      if (!task.enabled) {
        stats.statusCounts.disabled++;
      } else {
        const status = task.status || 'pending';
        stats.statusCounts[status] = (stats.statusCounts[status] || 0) + 1;
      }

      // Collect next execution times for enabled tasks
      if (task.next_run && task.enabled) {
        stats.nextExecutions.push({
          name: task.name,
          next_run: task.next_run,
          metadata: task.metadata,
        });
      }
    });

    // Sort next executions by time
    stats.nextExecutions.sort((a, b) => new Date(a.next_run) - new Date(b.next_run));

    return stats;
  }

  /**
   * Get human-readable time until execution
   * @param {Date} nextRun - Next execution time
   * @returns {string} Human-readable time description
   */
  getTimeUntilExecution(nextRun) {
    const now = new Date();
    const diff = new Date(nextRun) - now;

    if (diff < 0) {
      return 'Overdue';
    }

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours} hour${hours > 1 ? 's' : ''} ${minutes % 60}min`;
    } else if (minutes > 0) {
      return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return 'in less than 1 minute';
    }
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
        logger.warn(
          '[SchedulerExecutionService] Queues did not empty within timeout, forcing shutdown',
        );
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
