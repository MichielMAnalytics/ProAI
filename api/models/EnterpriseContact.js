const mongoose = require('mongoose');
const { enterpriseContactSchema } = require('@librechat/data-schemas');

const EnterpriseContact = mongoose.models.EnterpriseContact || 
  mongoose.model('EnterpriseContact', enterpriseContactSchema);

/**
 * Creates a new enterprise contact
 * @param {Object} contactData - The contact data
 * @returns {Promise<Object>} The created contact
 */
const createEnterpriseContact = async (contactData) => {
  try {
    const contact = new EnterpriseContact(contactData);
    return await contact.save();
  } catch (error) {
    throw new Error(`Error creating enterprise contact: ${error.message}`);
  }
};

/**
 * Gets enterprise contacts with optional filtering and pagination
 * @param {Object} options - Query options
 * @param {Object} options.filter - Filter criteria
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.limit - Items per page
 * @param {Object} options.sort - Sort criteria
 * @returns {Promise<Object>} Paginated results
 */
const getEnterpriseContacts = async ({ 
  filter = {}, 
  page = 1, 
  limit = 20, 
  sort = { createdAt: -1 } 
} = {}) => {
  try {
    const skip = (page - 1) * limit;
    
    const [contacts, total] = await Promise.all([
      EnterpriseContact.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      EnterpriseContact.countDocuments(filter)
    ]);

    return {
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    throw new Error(`Error getting enterprise contacts: ${error.message}`);
  }
};

/**
 * Gets a single enterprise contact by ID
 * @param {string} contactId - The contact ID
 * @returns {Promise<Object|null>} The contact or null
 */
const getEnterpriseContactById = async (contactId) => {
  try {
    return await EnterpriseContact.findOne({ contactId }).lean();
  } catch (error) {
    throw new Error(`Error getting enterprise contact: ${error.message}`);
  }
};

/**
 * Updates an enterprise contact
 * @param {string} contactId - The contact ID
 * @param {Object} updateData - The update data
 * @returns {Promise<Object|null>} The updated contact or null
 */
const updateEnterpriseContact = async (contactId, updateData) => {
  try {
    return await EnterpriseContact.findOneAndUpdate(
      { contactId },
      updateData,
      { new: true, runValidators: true }
    ).lean();
  } catch (error) {
    throw new Error(`Error updating enterprise contact: ${error.message}`);
  }
};

/**
 * Deletes an enterprise contact
 * @param {string} contactId - The contact ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
const deleteEnterpriseContact = async (contactId) => {
  try {
    const result = await EnterpriseContact.findOneAndDelete({ contactId });
    return !!result;
  } catch (error) {
    throw new Error(`Error deleting enterprise contact: ${error.message}`);
  }
};

module.exports = {
  EnterpriseContact,
  createEnterpriseContact,
  getEnterpriseContacts,
  getEnterpriseContactById,
  updateEnterpriseContact,
  deleteEnterpriseContact,
}; 