const { logger } = require('~/config');
const SchedulerExecutionService = require('./SchedulerExecutionService');

/**
 * Global scheduler manager for providing access to the shared SchedulerExecutionService instance
 * This ensures webhooks and scheduled tasks use the same queue system for load management
 */
class SchedulerManager {
  constructor() {
    this.schedulerService = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the scheduler service
   * Should be called once during application startup
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('[SchedulerManager] Scheduler service is already initialized');
      return;
    }

    try {
      logger.info('[SchedulerManager] Initializing shared scheduler service...');
      this.schedulerService = new SchedulerExecutionService();
      await this.schedulerService.startScheduler();
      this.isInitialized = true;
      logger.info('[SchedulerManager] Shared scheduler service initialized successfully');
    } catch (error) {
      logger.error('[SchedulerManager] Failed to initialize scheduler service:', error);
      throw error;
    }
  }

  /**
   * Get the shared scheduler service instance
   * @returns {SchedulerExecutionService|null} The scheduler service instance or null if not initialized
   */
  getSchedulerService() {
    if (!this.isInitialized) {
      logger.warn('[SchedulerManager] Scheduler service not initialized, returning null');
      return null;
    }
    return this.schedulerService;
  }

  /**
   * Add a webhook-triggered task to the execution queue
   * This ensures webhooks respect the same concurrency and rate limits as scheduled tasks
   * @param {Object} options - Webhook execution options
   * @param {string} options.workflowId - Workflow ID
   * @param {string} options.triggerKey - Trigger key
   * @param {Object} options.triggerEvent - Event data from webhook
   * @param {string} options.userId - User ID
   * @param {string} options.deploymentId - Deployment ID
   * @returns {Promise<Object>} Queue promise for execution result
   */
  async addWebhookTask(options) {
    if (!this.schedulerService) {
      throw new Error('Scheduler service not initialized - cannot process webhook tasks');
    }

    const { workflowId, triggerKey, triggerEvent, userId, deploymentId } = options;

    logger.info(`[SchedulerManager] Adding webhook task to queue for workflow ${workflowId}`);

    // Create a task function that wraps the webhook execution
    const webhookTaskFunction = async () => {
      const { SchedulerTaskExecutor } = require('./');
      const taskExecutor = new SchedulerTaskExecutor();
      
      return await taskExecutor.executeWorkflowFromWebhook({
        workflowId,
        triggerKey,
        triggerEvent,
        userId,
        deploymentId,
      });
    };

    // Create a pseudo-task object for priority calculation and queue metadata
    const pseudoTask = {
      id: workflowId,
      name: `Webhook: ${triggerKey}`,
      user: userId,
      type: 'workflow',
      trigger: {
        type: 'webhook',
        key: triggerKey,
      },
      // High priority for webhooks to ensure responsiveness
      next_run: new Date(), // Current time = ready now
      status: 'pending',
      do_only_once: false,
      enabled: true,
    };

    // Add to the queue using the existing queue manager
    return this.schedulerService.queueManager.addTask(webhookTaskFunction, pseudoTask);
  }

  /**
   * Get the current status of the scheduler service
   * @returns {Object|null} Service status or null if not initialized
   */
  getStatus() {
    if (!this.schedulerService) {
      return null;
    }

    return {
      isInitialized: this.isInitialized,
      healthStatus: this.schedulerService.getHealthStatus(),
      queueStatus: this.schedulerService.getQueueStatus(),
      stats: this.schedulerService.getStats(),
    };
  }

  /**
   * Shutdown the scheduler service
   * Should be called during application shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this.schedulerService) {
      logger.info('[SchedulerManager] No scheduler service to shut down');
      return;
    }

    try {
      logger.info('[SchedulerManager] Shutting down scheduler service...');
      await this.schedulerService.stopScheduler();
      this.schedulerService = null;
      this.isInitialized = false;
      logger.info('[SchedulerManager] Scheduler service shut down successfully');
    } catch (error) {
      logger.error('[SchedulerManager] Error during scheduler shutdown:', error);
      throw error;
    }
  }
}

// Create singleton instance
const schedulerManager = new SchedulerManager();

module.exports = schedulerManager;