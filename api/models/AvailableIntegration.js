const mongoose = require('mongoose');
const { availableIntegrationSchema } = require('@librechat/data-schemas');

module.exports = mongoose.model('AvailableIntegration', availableIntegrationSchema);
