const mongoose = require('mongoose');
const { appComponentsSchema } = require('@librechat/data-schemas');

module.exports = mongoose.model('AppComponents', appComponentsSchema);
