const mongoose = require('mongoose');
const { userIntegrationSchema } = require('@librechat/data-schemas');
 
module.exports = mongoose.model('UserIntegration', userIntegrationSchema); 