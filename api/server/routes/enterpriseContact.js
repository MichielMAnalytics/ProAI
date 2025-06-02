const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const {
  createEnterpriseContactController,
  getEnterpriseContactsController,
  getEnterpriseContactByIdController,
  updateEnterpriseContactController,
  deleteEnterpriseContactController,
} = require('~/server/controllers/EnterpriseContactController');

const router = express.Router();

// Public endpoint for creating enterprise contacts
router.post('/', createEnterpriseContactController);

// Admin-only endpoints for managing enterprise contacts
router.get('/', requireJwtAuth, checkAdmin, getEnterpriseContactsController);
router.get('/:contactId', requireJwtAuth, checkAdmin, getEnterpriseContactByIdController);
router.put('/:contactId', requireJwtAuth, checkAdmin, updateEnterpriseContactController);
router.delete('/:contactId', requireJwtAuth, checkAdmin, deleteEnterpriseContactController);

module.exports = router; 