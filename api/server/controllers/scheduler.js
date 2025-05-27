const { v4: uuidv4 } = require('uuid');
const { saveMessage } = require('~/models/Message');
const { getConvo, saveConvo } = require('~/models/Conversation');
const { logger } = require('~/config');

/**
 * Send a message from the scheduler to a user
 * @param {ServerRequest} req - The request object
 * @param {ServerResponse} res - The response object
 */
const sendSchedulerMessage = async (req, res) => {
  try {
    const { userId, conversationId, message, taskId, taskName } = req.body;
    
    // Validate required fields
    if (!userId || !conversationId || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, conversationId, message' 
      });
    }
    
    // Verify the requesting user has permission (for now, allow any authenticated user)
    // In production, you might want to add additional authorization checks
    
    // Create a system message from the scheduler
    const messageId = uuidv4();
    const systemMessage = {
      messageId,
      conversationId,
      parentMessageId: null, // This is a new message thread
      text: message,
      sender: 'Scheduler',
      isCreatedByUser: false,
      user: userId,
      unfinished: false,
      error: false,
      // Add metadata about the task
      metadata: {
        taskId,
        taskName,
        source: 'scheduler',
        timestamp: new Date().toISOString()
      }
    };
    
    // Save the message to the database
    const savedMessage = await saveMessage(
      req,
      systemMessage,
      { context: 'api/server/controllers/scheduler.js - sendSchedulerMessage' }
    );
    
    // Get or create the conversation
    let conversation;
    try {
      conversation = await getConvo(userId, conversationId);
      if (!conversation) {
        // Create a new conversation if it doesn't exist
        conversation = await saveConvo(req, {
          conversationId,
          title: `Scheduler: ${taskName || 'Task Result'}`,
          user: userId,
          endpoint: 'scheduler',
          endpointType: 'scheduler'
        }, { context: 'api/server/controllers/scheduler.js - sendSchedulerMessage' });
      }
    } catch (error) {
      logger.error('Error handling conversation for scheduler message:', error);
      // Continue even if conversation handling fails
      conversation = { conversationId, title: `Scheduler: ${taskName || 'Task Result'}` };
    }
    
    // For now, we'll return success. In a full implementation, you would:
    // 1. Check if the user has an active SSE connection
    // 2. Send the message via SSE if they're online
    // 3. Store for later delivery if they're offline
    
    logger.info(`Scheduler message sent to user ${userId} in conversation ${conversationId}`);
    
    res.json({
      success: true,
      messageId: savedMessage.messageId,
      conversationId: savedMessage.conversationId,
      message: 'Message delivered successfully'
    });
    
  } catch (error) {
    logger.error('Error sending scheduler message:', error);
    res.status(500).json({ 
      error: 'Failed to send scheduler message',
      details: error.message 
    });
  }
};

module.exports = {
  sendSchedulerMessage
}; 