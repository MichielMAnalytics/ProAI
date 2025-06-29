const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getUserWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  testWorkflow,
  stopWorkflow,
  executeWorkflow,
  getWorkflowExecutions,
  getSchedulerStatus,
} = require('~/server/controllers/WorkflowController');

const router = express.Router();

/**
 * Get all workflows for the authenticated user
 * @route GET /workflows
 * @returns {object} Array of user workflows
 */
router.get('/', requireJwtAuth, getUserWorkflows);

/**
 * Get workflow scheduler status
 * @route GET /workflows/scheduler/status
 * @returns {object} Scheduler status information
 */
router.get('/scheduler/status', requireJwtAuth, getSchedulerStatus);

/**
 * Get a specific workflow by ID
 * @route GET /workflows/:workflowId
 * @param {string} workflowId - The workflow ID
 * @returns {object} Workflow details
 */
router.get('/:workflowId', requireJwtAuth, getWorkflowById);

/**
 * Create a new workflow
 * @route POST /workflows
 * @returns {object} Created workflow
 */
router.post('/', requireJwtAuth, createWorkflow);

/**
 * Update a workflow
 * @route PUT /workflows/:workflowId
 * @param {string} workflowId - The workflow ID
 * @returns {object} Updated workflow
 */
router.put('/:workflowId', requireJwtAuth, updateWorkflow);

/**
 * Delete a workflow
 * @route DELETE /workflows/:workflowId
 * @param {string} workflowId - The workflow ID
 * @returns {object} Success response
 */
router.delete('/:workflowId', requireJwtAuth, deleteWorkflow);

/**
 * Activate a workflow
 * @route POST /workflows/:workflowId/activate
 * @param {string} workflowId - The workflow ID
 * @returns {object} Updated workflow
 */
router.post('/:workflowId/activate', requireJwtAuth, activateWorkflow);

/**
 * Deactivate a workflow
 * @route POST /workflows/:workflowId/deactivate
 * @param {string} workflowId - The workflow ID
 * @returns {object} Updated workflow
 */
router.post('/:workflowId/deactivate', requireJwtAuth, deactivateWorkflow);

/**
 * Test execute a workflow
 * @route POST /workflows/:workflowId/test
 * @param {string} workflowId - The workflow ID
 * @returns {object} Execution result
 */
router.post('/:workflowId/test', requireJwtAuth, testWorkflow);

/**
 * Stop a running workflow test/execution
 * @route POST /workflows/:workflowId/stop
 * @param {string} workflowId - The workflow ID
 * @returns {object} Success response
 */
router.post('/:workflowId/stop', requireJwtAuth, stopWorkflow);

/**
 * Execute a workflow immediately
 * @route POST /workflows/:workflowId/execute
 * @param {string} workflowId - The workflow ID
 * @returns {object} Execution result
 */
router.post('/:workflowId/execute', requireJwtAuth, executeWorkflow);

/**
 * Get workflow execution history
 * @route GET /workflows/:workflowId/executions
 * @param {string} workflowId - The workflow ID
 * @returns {object} Array of workflow executions
 */
router.get('/:workflowId/executions', requireJwtAuth, getWorkflowExecutions);

module.exports = router;
