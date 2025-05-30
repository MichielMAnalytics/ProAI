const { getOverdueTime } = require('./cronUtils');

/**
 * Calculate priority for task execution
 * Higher priority = executed sooner
 * @param {Object} task - The scheduler task
 * @returns {number} Priority score
 */
function calculatePriority(task) {
  const overdue = getOverdueTime(task.next_run);
  
  // Base priority: more overdue = higher priority
  let priority = Math.floor(overdue / 60000); // 1 point per minute overdue
  
  // Boost priority for one-time tasks
  if (task.do_only_once) {
    priority += 100;
  }
  
  // Lower priority for tasks that have failed recently
  if (task.status === 'failed') {
    priority -= 50;
  }
  
  // Higher priority for tasks that haven't run in a while
  if (task.last_run) {
    const daysSinceLastRun = (new Date() - new Date(task.last_run)) / (1000 * 60 * 60 * 24);
    if (daysSinceLastRun > 7) {
      priority += 20;
    }
  }
  
  return priority;
}

/**
 * Calculate retry priority (lower than original execution)
 * @param {Object} task - The scheduler task
 * @param {number} attempt - Current retry attempt number
 * @returns {number} Retry priority score
 */
function calculateRetryPriority(task, attempt) {
  const basePriority = calculatePriority(task);
  // Lower priority for retries, even lower for higher attempt numbers
  return basePriority - (attempt * 10);
}

module.exports = {
  calculatePriority,
  calculateRetryPriority,
}; 