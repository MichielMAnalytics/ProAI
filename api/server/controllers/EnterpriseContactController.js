const logger = require('~/config/winston');
const {
  createEnterpriseContact,
  getEnterpriseContacts,
  getEnterpriseContactById,
  updateEnterpriseContact,
  deleteEnterpriseContact,
} = require('~/models/EnterpriseContact');

/**
 * Creates a new enterprise contact
 */
const createEnterpriseContactController = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      workEmail,
      phoneNumber,
      companyWebsite,
      problemToSolve,
      endUsersCount,
      currentTools,
      useCases = [],
      complianceNeeds = [],
      timeline,
      additionalInfo,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !workEmail) {
      return res.status(400).json({
        error: 'Missing required fields: firstName, lastName, and workEmail are required',
      });
    }

    // Check for existing contact with same email
    const existingContact = await getEnterpriseContactById(workEmail);
    if (existingContact) {
      logger.info(`Duplicate enterprise contact submission for email: ${workEmail}`);
      // Return success to avoid exposing existing contacts, but don't create duplicate
      return res.status(200).json({
        message: 'Contact submission received successfully',
        contactId: existingContact.contactId,
      });
    }

    const contactData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      workEmail: workEmail.trim().toLowerCase(),
      phoneNumber: phoneNumber?.trim(),
      companyWebsite: companyWebsite?.trim(),
      problemToSolve: problemToSolve?.trim(),
      endUsersCount: endUsersCount?.trim(),
      currentTools: currentTools?.trim(),
      useCases: Array.isArray(useCases) ? useCases : [],
      complianceNeeds: Array.isArray(complianceNeeds) ? complianceNeeds : [],
      timeline,
      additionalInfo: additionalInfo?.trim(),
    };

    const contact = await createEnterpriseContact(contactData);

    logger.info(`New enterprise contact created: ${contact.contactId} - ${workEmail}`);

    res.status(201).json({
      message: 'Contact submission received successfully',
      contactId: contact.contactId,
    });
  } catch (error) {
    logger.error('Error creating enterprise contact:', error);
    res.status(500).json({
      error: 'Internal server error while processing contact submission',
    });
  }
};

/**
 * Gets enterprise contacts (admin only)
 */
const getEnterpriseContactsController = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Build filter
    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { workEmail: { $regex: search, $options: 'i' } },
        { companyWebsite: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const result = await getEnterpriseContacts({
      filter,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting enterprise contacts:', error);
    res.status(500).json({
      error: 'Internal server error while fetching contacts',
    });
  }
};

/**
 * Gets a single enterprise contact by ID (admin only)
 */
const getEnterpriseContactByIdController = async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await getEnterpriseContactById(contactId);
    if (!contact) {
      return res.status(404).json({
        error: 'Contact not found',
      });
    }

    res.json(contact);
  } catch (error) {
    logger.error('Error getting enterprise contact:', error);
    res.status(500).json({
      error: 'Internal server error while fetching contact',
    });
  }
};

/**
 * Updates an enterprise contact (admin only)
 */
const updateEnterpriseContactController = async (req, res) => {
  try {
    const { contactId } = req.params;
    const updateData = req.body;

    // Remove read-only fields
    delete updateData.contactId;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // If status is being changed to 'contacted', set contactedAt
    if (updateData.status === 'contacted' && !updateData.contactedAt) {
      updateData.contactedAt = new Date();
    }

    const contact = await updateEnterpriseContact(contactId, updateData);
    if (!contact) {
      return res.status(404).json({
        error: 'Contact not found',
      });
    }

    logger.info(`Enterprise contact updated: ${contactId}`);
    res.json(contact);
  } catch (error) {
    logger.error('Error updating enterprise contact:', error);
    res.status(500).json({
      error: 'Internal server error while updating contact',
    });
  }
};

/**
 * Deletes an enterprise contact (admin only)
 */
const deleteEnterpriseContactController = async (req, res) => {
  try {
    const { contactId } = req.params;

    const deleted = await deleteEnterpriseContact(contactId);
    if (!deleted) {
      return res.status(404).json({
        error: 'Contact not found',
      });
    }

    logger.info(`Enterprise contact deleted: ${contactId}`);
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    logger.error('Error deleting enterprise contact:', error);
    res.status(500).json({
      error: 'Internal server error while deleting contact',
    });
  }
};

module.exports = {
  createEnterpriseContactController,
  getEnterpriseContactsController,
  getEnterpriseContactByIdController,
  updateEnterpriseContactController,
  deleteEnterpriseContactController,
};
