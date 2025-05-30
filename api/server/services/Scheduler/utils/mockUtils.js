const { EModelEndpoint } = require('librechat-data-provider');

/**
 * Create a mock request object for client initialization
 * @param {Object} task - The scheduler task
 * @param {Object} additionalLocals - Additional app.locals to include
 * @returns {Object} Mock request object
 */
function createMockRequest(task, additionalLocals = {}) {
  return {
    user: { 
      id: task.user.toString() // Ensure user ID is a string, not ObjectId
    },
    body: {
      endpoint: task.endpoint || EModelEndpoint.openAI,
      model: task.ai_model || task.agent_id,
      userMessageId: null, // Not available in scheduler context
      parentMessageId: task.parent_message_id,
      conversationId: task.conversation_id,
      promptPrefix: task.prompt,
      ephemeralAgent: null, // Will be set if needed
    },
    app: {
      locals: {
        availableTools: {}, // Will be populated during initialization
        fileStrategy: global.fileStrategy || null,
        ...additionalLocals,
      }
    }
  };
}

/**
 * Create a mock response object for client initialization
 * @returns {Object} Mock response object
 */
function createMockResponse() {
  return {
    write: () => {},
    end: () => {},
    on: () => {},
    removeListener: () => {},
    status: () => this.createMockResponse(),
    json: () => this.createMockResponse(),
    send: () => this.createMockResponse(),
    setHeader: () => {},
    locals: {},
  };
}

/**
 * Create minimal mock response for agents client
 * @returns {Object} Minimal mock response for agent client initialization
 */
function createMinimalMockResponse() {
  return {
    write: () => {},
    end: () => {},
    on: () => {},
    removeListener: () => {},
    locals: {},
  };
}

/**
 * Update request body for ephemeral agent configuration
 * @param {Object} mockReq - The mock request object
 * @param {Object} task - The scheduler task
 * @param {Object} ephemeralAgent - Ephemeral agent configuration
 * @param {string} underlyingEndpoint - The underlying endpoint
 * @param {string} underlyingModel - The underlying model
 */
function updateRequestForEphemeralAgent(mockReq, task, ephemeralAgent, underlyingEndpoint, underlyingModel) {
  mockReq.body = {
    ...mockReq.body,
    text: task.prompt,
    endpoint: underlyingEndpoint,
    model: underlyingModel,
    conversationId: task.conversation_id,
    parentMessageId: task.parent_message_id,
    ephemeralAgent: ephemeralAgent,
    endpointOption: {
      endpoint: underlyingEndpoint,
      model: underlyingModel,
      model_parameters: { model: underlyingModel }
    }
  };
}

module.exports = {
  createMockRequest,
  createMockResponse,
  createMinimalMockResponse,
  updateRequestForEphemeralAgent,
}; 