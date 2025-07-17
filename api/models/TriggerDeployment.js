const mongoose = require('mongoose');

/**
 * Schema for storing Pipedream trigger deployment information
 */
const triggerDeploymentSchema = new mongoose.Schema({
  // User who deployed the trigger
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Workflow this trigger belongs to
  workflowId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  // Pipedream component information
  componentId: {
    type: String,
    required: true,
  },
  
  // Trigger key (e.g., 'new_email_received')
  triggerKey: {
    type: String,
    required: true,
  },
  
  // App slug (e.g., 'gmail')
  appSlug: {
    type: String,
    required: true,
  },
  
  // Generated webhook URL
  webhookUrl: {
    type: String,
    required: true,
  },
  
  // Pipedream deployment ID
  deploymentId: {
    type: String,
    required: true,
  },
  
  // Configured properties for the trigger
  configuredProps: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
  // Deployment status
  status: {
    type: String,
    enum: ['deployed', 'active', 'paused', 'failed', 'deleted'],
    default: 'deployed',
    index: true,
  },
  
  // Deployment timestamp
  deployedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Last update timestamp
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Error information (if deployment failed)
  error: {
    type: String,
    default: null,
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
triggerDeploymentSchema.index({ userId: 1, workflowId: 1 });
triggerDeploymentSchema.index({ status: 1, deployedAt: 1 });
triggerDeploymentSchema.index({ appSlug: 1, triggerKey: 1 });

const TriggerDeployment = mongoose.model('TriggerDeployment', triggerDeploymentSchema);

/**
 * Create a new trigger deployment
 * @param {Object} deploymentData - The deployment data
 * @returns {Promise<Object>} The created deployment document
 */
async function createTriggerDeployment(deploymentData) {
  try {
    return await TriggerDeployment.create(deploymentData);
  } catch (error) {
    throw new Error(`Error creating trigger deployment: ${error.message}`);
  }
}

/**
 * Get trigger deployment by workflow ID
 * @param {string} workflowId - The workflow ID
 * @returns {Promise<Object|null>} The deployment document or null if not found
 */
async function getTriggerDeploymentByWorkflow(workflowId) {
  try {
    return await TriggerDeployment.findOne({ workflowId }).lean();
  } catch (error) {
    throw new Error(`Error fetching trigger deployment: ${error.message}`);
  }
}

/**
 * Get trigger deployments by user
 * @param {string} userId - The user's ObjectId
 * @param {string} [status] - Optional status filter
 * @returns {Promise<Array>} Array of deployment documents
 */
async function getTriggerDeploymentsByUser(userId, status = null) {
  try {
    const query = { userId };
    if (status) {
      query.status = status;
    }
    return await TriggerDeployment.find(query).lean();
  } catch (error) {
    throw new Error(`Error fetching trigger deployments: ${error.message}`);
  }
}

/**
 * Update trigger deployment
 * @param {string} workflowId - The workflow ID
 * @param {Object} updateData - The data to update
 * @returns {Promise<Object|null>} The updated deployment document or null if not found
 */
async function updateTriggerDeployment(workflowId, updateData) {
  try {
    return await TriggerDeployment.findOneAndUpdate(
      { workflowId },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    ).lean();
  } catch (error) {
    throw new Error(`Error updating trigger deployment: ${error.message}`);
  }
}

/**
 * Update trigger deployment status
 * @param {string} workflowId - The workflow ID
 * @param {string} status - The new status
 * @returns {Promise<Object|null>} The updated deployment document or null if not found
 */
async function updateTriggerDeploymentStatus(workflowId, status) {
  try {
    return await TriggerDeployment.findOneAndUpdate(
      { workflowId },
      { status, updatedAt: new Date() },
      { new: true }
    ).lean();
  } catch (error) {
    throw new Error(`Error updating trigger deployment status: ${error.message}`);
  }
}

/**
 * Delete trigger deployment
 * @param {string} workflowId - The workflow ID
 * @returns {Promise<Object>} The result of the delete operation
 */
async function deleteTriggerDeployment(workflowId) {
  try {
    return await TriggerDeployment.deleteOne({ workflowId });
  } catch (error) {
    throw new Error(`Error deleting trigger deployment: ${error.message}`);
  }
}

/**
 * Delete trigger deployments by user
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<Object>} The result of the delete operation
 */
async function deleteTriggerDeploymentsByUser(userId) {
  try {
    return await TriggerDeployment.deleteMany({ userId });
  } catch (error) {
    throw new Error(`Error deleting trigger deployments: ${error.message}`);
  }
}

/**
 * Get active trigger deployments (for health checks)
 * @returns {Promise<Array>} Array of active deployment documents
 */
async function getActiveTriggerDeployments() {
  try {
    return await TriggerDeployment.find({ 
      status: { $in: ['deployed', 'active'] } 
    }).lean();
  } catch (error) {
    throw new Error(`Error fetching active trigger deployments: ${error.message}`);
  }
}

module.exports = {
  TriggerDeployment,
  createTriggerDeployment,
  getTriggerDeploymentByWorkflow,
  getTriggerDeploymentsByUser,
  updateTriggerDeployment,
  updateTriggerDeploymentStatus,
  deleteTriggerDeployment,
  deleteTriggerDeploymentsByUser,
  getActiveTriggerDeployments,
};