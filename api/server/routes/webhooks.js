const express = require('express');
const { logger } = require('~/config');
const { SchedulerTaskExecutor } = require('~/server/services/Scheduler');
const { TriggerDeployment } = require('~/models');

const router = express.Router();

/**
 * Handle incoming webhook for trigger events
 * 
 * @route POST /api/webhooks/trigger/:workflowId/:triggerKey
 * @param {string} workflowId - Workflow ID
 * @param {string} triggerKey - Trigger key (e.g., 'new_email_received')
 * @description Receives webhook events from Pipedream triggers and routes them to the scheduler
 */
router.post('/trigger/:workflowId/:triggerKey', async (req, res) => {
  const { workflowId, triggerKey } = req.params;
  const webhookPayload = req.body;
  
  logger.info(`Webhook received for workflow ${workflowId}, trigger ${triggerKey}`);
  logger.debug(`Webhook payload:`, webhookPayload);

  try {
    // Validate webhook signature (if configured)
    if (process.env.WEBHOOK_SECRET) {
      const isValid = await validateWebhookSignature(req, process.env.WEBHOOK_SECRET);
      if (!isValid) {
        logger.warn(`Invalid webhook signature for workflow ${workflowId}`);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    // Get trigger deployment info
    const deployment = await TriggerDeployment.findOne({ workflowId }).lean();
    if (!deployment) {
      logger.warn(`No trigger deployment found for workflow ${workflowId}`);
      return res.status(404).json({ error: 'Trigger deployment not found' });
    }

    // Check if trigger is active
    if (deployment.status !== 'deployed' && deployment.status !== 'active') {
      logger.warn(`Trigger for workflow ${workflowId} is not active (status: ${deployment.status})`);
      return res.status(200).json({ message: 'Trigger is not active', status: deployment.status });
    }

    // Execute the workflow via scheduler
    const executor = new SchedulerTaskExecutor();
    const result = await executor.executeWorkflowFromWebhook({
      workflowId,
      triggerKey,
      triggerEvent: webhookPayload,
      userId: deployment.userId,
      deploymentId: deployment.deploymentId,
    });

    logger.info(`Webhook execution completed for workflow ${workflowId}:`, result);

    // Return success response
    res.status(200).json({
      success: true,
      workflowId,
      executionId: result.executionId,
      message: 'Webhook processed successfully',
    });

  } catch (error) {
    logger.error(`Webhook processing failed for workflow ${workflowId}:`, error.message);
    
    // Return error response but don't expose internal details
    res.status(500).json({
      success: false,
      workflowId,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Processing failed',
    });
  }
});

/**
 * Health check endpoint for webhook service
 * 
 * @route GET /api/webhooks/health
 * @description Simple health check for webhook service
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'webhook',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get webhook status for a specific workflow
 * 
 * @route GET /api/webhooks/status/:workflowId
 * @param {string} workflowId - Workflow ID
 * @description Returns webhook deployment status for a workflow
 */
router.get('/status/:workflowId', async (req, res) => {
  const { workflowId } = req.params;
  
  try {
    const deployment = await TriggerDeployment.findOne({ workflowId }).lean();
    
    if (!deployment) {
      return res.status(404).json({ 
        error: 'Webhook deployment not found',
        workflowId 
      });
    }

    res.status(200).json({
      workflowId,
      status: deployment.status,
      triggerKey: deployment.triggerKey,
      appSlug: deployment.appSlug,
      webhookUrl: deployment.webhookUrl,
      deployedAt: deployment.deployedAt,
      updatedAt: deployment.updatedAt,
    });

  } catch (error) {
    logger.error(`Failed to get webhook status for workflow ${workflowId}:`, error.message);
    res.status(500).json({
      error: 'Failed to get webhook status',
      workflowId,
    });
  }
});

/**
 * Validate webhook signature using HMAC
 * 
 * @param {Object} req - Express request object
 * @param {string} secret - Webhook secret
 * @returns {Promise<boolean>} Whether signature is valid
 */
async function validateWebhookSignature(req, secret) {
  try {
    const crypto = require('crypto');
    const signature = req.headers['x-webhook-signature'] || req.headers['x-pipedream-signature'];
    
    if (!signature) {
      logger.warn('No webhook signature provided');
      return false;
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Compare signatures securely
    const providedSignature = signature.replace('sha256=', '');
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );

    if (!isValid) {
      logger.warn('Webhook signature validation failed');
    }

    return isValid;
  } catch (error) {
    logger.error('Error validating webhook signature:', error.message);
    return false;
  }
}

module.exports = router;