const cron = require('node-cron');
const { logger } = require('~/config');
const WorkflowService = require('./WorkflowService');
const { getActiveWorkflows } = require('~/models/UserWorkflow');

/**
 * WorkflowScheduler - Manages scheduled execution of workflows
 * 
 * This service handles:
 * - Integration with the existing scheduler system
 * - Cron-based workflow scheduling
 * - Scheduled workflow execution
 * - Schedule management and cleanup
 */
class WorkflowScheduler {
  constructor() {
    this.scheduledJobs = new Map(); // Map of workflow IDs to cron jobs
    this.workflowService = new WorkflowService();
    this.isInitialized = false;
  }

  /**
   * Initialize the workflow scheduler
   * This should be called during application startup
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('[WorkflowScheduler] Already initialized');
      return;
    }

    try {
      logger.info('[WorkflowScheduler] Initializing workflow scheduler');

      // Load and schedule all active workflows
      await this.loadActiveWorkflows();

      // Set up periodic refresh of workflows
      this.setupPeriodicRefresh();

      this.isInitialized = true;
      logger.info('[WorkflowScheduler] Workflow scheduler initialized successfully');
    } catch (error) {
      logger.error('[WorkflowScheduler] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load and schedule all active workflows
   */
  async loadActiveWorkflows() {
    try {
      logger.info('[WorkflowScheduler] Loading active workflows');

      const activeWorkflows = await getActiveWorkflows();
      
      logger.info(`[WorkflowScheduler] Found ${activeWorkflows.length} active workflows`);

      for (const workflow of activeWorkflows) {
        if (workflow.trigger.type === 'schedule') {
          await this.scheduleWorkflow(workflow);
        }
      }

      logger.info(`[WorkflowScheduler] Scheduled ${this.scheduledJobs.size} workflows`);
    } catch (error) {
      logger.error('[WorkflowScheduler] Error loading active workflows:', error);
      throw error;
    }
  }

  /**
   * Schedule a workflow for execution
   * @param {Object} workflow - Workflow to schedule
   * @returns {Promise<boolean>} Success status
   */
  async scheduleWorkflow(workflow) {
    const workflowId = workflow.id;

    try {
      // Validate that this is a scheduled workflow
      if (workflow.trigger.type !== 'schedule') {
        logger.warn(`[WorkflowScheduler] Workflow ${workflowId} is not a scheduled workflow`);
        return false;
      }

      // Safely access schedule configuration
      const schedule = workflow.trigger.config?.schedule;
      if (!schedule) {
        logger.warn(`[WorkflowScheduler] Workflow ${workflowId} missing schedule configuration`);
        return false;
      }

      // Unschedule existing job if exists
      await this.unscheduleWorkflow(workflowId);

      // Validate cron expression
      if (!cron.validate(schedule)) {
        logger.error(`[WorkflowScheduler] Invalid cron expression for workflow ${workflowId}: ${schedule}`);
        return false;
      }

      // Create and start the cron job
      const job = cron.schedule(schedule, async () => {
        await this.executeScheduledWorkflow(workflow);
      }, {
        scheduled: true,
        name: `workflow_${workflowId}`,
      });

      // Store the job reference
      this.scheduledJobs.set(workflowId, {
        job,
        workflow,
        schedule,
        scheduledAt: new Date(),
      });

      logger.info(`[WorkflowScheduler] Scheduled workflow ${workflowId} with cron: ${schedule}`);
      return true;
    } catch (error) {
      logger.error(`[WorkflowScheduler] Error scheduling workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Unschedule a workflow
   * @param {string} workflowId - Workflow ID to unschedule
   * @returns {Promise<boolean>} Success status
   */
  async unscheduleWorkflow(workflowId) {
    try {
      const scheduledJob = this.scheduledJobs.get(workflowId);
      
      if (scheduledJob) {
        scheduledJob.job.stop();
        scheduledJob.job.destroy();
        this.scheduledJobs.delete(workflowId);
        
        logger.info(`[WorkflowScheduler] Unscheduled workflow ${workflowId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`[WorkflowScheduler] Error unscheduling workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Execute a scheduled workflow
   * @param {Object} workflow - Workflow to execute
   */
  async executeScheduledWorkflow(workflow) {
    const workflowId = workflow.id;
    const userId = workflow.user;

    try {
      logger.info(`[WorkflowScheduler] Executing scheduled workflow: ${workflowId}`);

      // Create execution context for scheduled run
      const context = {
        trigger: {
          type: 'schedule',
          source: 'scheduler',
          timestamp: new Date().toISOString(),
        },
        scheduler: {
          executedAt: new Date(),
          workflowId,
        },
      };

      // Execute the workflow
      const result = await this.workflowService.executeWorkflow(
        workflowId, 
        userId, 
        context, 
        false // Not a test execution
      );

      if (result.success) {
        logger.info(`[WorkflowScheduler] Scheduled workflow ${workflowId} completed successfully`);
      } else {
        logger.error(`[WorkflowScheduler] Scheduled workflow ${workflowId} failed:`, result.error);
      }

      // If this is a one-time workflow, unschedule it
      if (workflow.do_only_once) {
        logger.info(`[WorkflowScheduler] Unscheduling one-time workflow ${workflowId}`);
        await this.unscheduleWorkflow(workflowId);
        
        // Deactivate the workflow
        await this.workflowService.toggleWorkflow(workflowId, userId, false);
      }

    } catch (error) {
      logger.error(`[WorkflowScheduler] Error executing scheduled workflow ${workflowId}:`, error);
    }
  }

  /**
   * Refresh workflow schedules
   * This method can be called when workflows are updated
   */
  async refreshSchedules() {
    try {
      logger.info('[WorkflowScheduler] Refreshing workflow schedules');

      // Get current active workflows
      const activeWorkflows = await getActiveWorkflows();
      const activeWorkflowIds = new Set(activeWorkflows.map(w => w.id));

      // Remove schedules for workflows that are no longer active
      for (const [workflowId] of this.scheduledJobs) {
        if (!activeWorkflowIds.has(workflowId)) {
          logger.info(`[WorkflowScheduler] Removing schedule for inactive workflow: ${workflowId}`);
          await this.unscheduleWorkflow(workflowId);
        }
      }

      // Add or update schedules for active workflows
      for (const workflow of activeWorkflows) {
        if (workflow.trigger.type === 'schedule') {
          const existingJob = this.scheduledJobs.get(workflow.id);
          
          // Safely check if schedule configuration exists and needs to be updated
          const currentSchedule = workflow.trigger.config?.schedule;
          if (currentSchedule && (!existingJob || existingJob.schedule !== currentSchedule)) {
            logger.info(`[WorkflowScheduler] Updating schedule for workflow: ${workflow.id}`);
            await this.scheduleWorkflow(workflow);
          } else if (!currentSchedule) {
            logger.warn(`[WorkflowScheduler] Workflow ${workflow.id} has schedule trigger but missing schedule config`);
          }
        }
      }

      logger.info(`[WorkflowScheduler] Schedule refresh completed. Active schedules: ${this.scheduledJobs.size}`);
    } catch (error) {
      logger.error('[WorkflowScheduler] Error refreshing schedules:', error);
    }
  }

  /**
   * Set up periodic refresh of workflow schedules
   * This ensures the scheduler stays in sync with database changes
   */
  setupPeriodicRefresh() {
    // Refresh schedules every 5 minutes
    const refreshInterval = 5 * 60 * 1000; // 5 minutes

    setInterval(async () => {
      try {
        await this.refreshSchedules();
      } catch (error) {
        logger.error('[WorkflowScheduler] Error in periodic refresh:', error);
      }
    }, refreshInterval);

    logger.info(`[WorkflowScheduler] Set up periodic refresh every ${refreshInterval / 1000} seconds`);
  }

  /**
   * Get information about scheduled workflows
   * @returns {Array} Array of scheduled workflow information
   */
  getScheduledWorkflows() {
    return Array.from(this.scheduledJobs.entries()).map(([workflowId, jobData]) => ({
      workflowId,
      workflowName: jobData.workflow.name,
      schedule: jobData.schedule,
      scheduledAt: jobData.scheduledAt,
      isRunning: jobData.job.getStatus() === 'scheduled',
    }));
  }

  /**
   * Get scheduler statistics
   * @returns {Object} Scheduler statistics
   */
  getStats() {
    const scheduledWorkflows = this.getScheduledWorkflows();
    
    return {
      totalScheduledWorkflows: scheduledWorkflows.length,
      activeJobs: scheduledWorkflows.filter(w => w.isRunning).length,
      inactiveJobs: scheduledWorkflows.filter(w => !w.isRunning).length,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Stop all scheduled workflows
   * This should be called during application shutdown
   */
  async shutdown() {
    try {
      logger.info('[WorkflowScheduler] Shutting down workflow scheduler');

      // Stop all cron jobs
      for (const [workflowId, jobData] of this.scheduledJobs) {
        try {
          jobData.job.stop();
          jobData.job.destroy();
          logger.debug(`[WorkflowScheduler] Stopped job for workflow: ${workflowId}`);
        } catch (error) {
          logger.warn(`[WorkflowScheduler] Error stopping job for workflow ${workflowId}:`, error);
        }
      }

      // Clear all job references
      this.scheduledJobs.clear();
      this.isInitialized = false;

      logger.info('[WorkflowScheduler] Workflow scheduler shutdown completed');
    } catch (error) {
      logger.error('[WorkflowScheduler] Error during shutdown:', error);
    }
  }

  /**
   * Force execute a workflow immediately (outside of schedule)
   * @param {string} workflowId - Workflow ID to execute
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflowNow(workflowId, userId) {
    try {
      logger.info(`[WorkflowScheduler] Force executing workflow: ${workflowId}`);

      const context = {
        trigger: {
          type: 'manual',
          source: 'force_execute',
          timestamp: new Date().toISOString(),
        },
        scheduler: {
          forceExecuted: true,
          executedAt: new Date(),
          workflowId,
        },
      };

      const result = await this.workflowService.executeWorkflow(
        workflowId, 
        userId, 
        context, 
        false
      );

      logger.info(`[WorkflowScheduler] Force execution of workflow ${workflowId} ${result.success ? 'completed' : 'failed'}`);
      return result;
    } catch (error) {
      logger.error(`[WorkflowScheduler] Error force executing workflow ${workflowId}:`, error);
      throw error;
    }
  }
}

// Create singleton instance
let workflowSchedulerInstance = null;

/**
 * Get the singleton WorkflowScheduler instance
 * @returns {WorkflowScheduler} Scheduler instance
 */
function getWorkflowScheduler() {
  if (!workflowSchedulerInstance) {
    workflowSchedulerInstance = new WorkflowScheduler();
  }
  return workflowSchedulerInstance;
}

module.exports = {
  WorkflowScheduler,
  getWorkflowScheduler,
}; 