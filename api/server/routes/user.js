const express = require('express');
const { requireJwtAuth, canDeleteAccount, verifyEmailLimiter } = require('~/server/middleware');
const {
  getUserController,
  deleteUserController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
  getTermsStatusController,
  acceptTermsController,
  updateUserTimezoneController,
} = require('~/server/controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.get('/terms', requireJwtAuth, getTermsStatusController);
router.post('/terms/accept', requireJwtAuth, acceptTermsController);
router.post('/timezone', requireJwtAuth, updateUserTimezoneController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, deleteUserController);
router.post('/verify', verifyEmailController);
router.post('/verify/resend', verifyEmailLimiter, resendVerificationController);

module.exports = router;
