const express = require('express');
const { logger } = require('~/config');
const {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
} = require('~/server/controllers/AuthController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const {
  enable2FA,
  verify2FA,
  disable2FA,
  regenerateBackupCodes,
  confirm2FA,
} = require('~/server/controllers/TwoFactorController');
const {
  checkBan,
  logHeaders,
  loginLimiter,
  requireJwtAuth,
  checkInviteUser,
  registerLimiter,
  requireLdapAuth,
  setBalanceConfig,
  requireLocalAuth,
  resetPasswordLimiter,
  validateRegistration,
  validatePasswordReset,
} = require('~/server/middleware');
const { autoSetUserTimezone, isValidTimezone } = require('~/server/services/AuthService');

const router = express.Router();

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post(
  '/login',
  logHeaders,
  loginLimiter,
  checkBan,
  ldapAuth ? requireLdapAuth : requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', refreshController);
router.post(
  '/register',
  registerLimiter,
  checkBan,
  checkInviteUser,
  validateRegistration,
  registrationController,
);
router.post(
  '/requestPasswordReset',
  resetPasswordLimiter,
  checkBan,
  validatePasswordReset,
  resetPasswordRequestController,
);
router.post('/resetPassword', checkBan, validatePasswordReset, resetPasswordController);

router.get('/2fa/enable', requireJwtAuth, enable2FA);
router.post('/2fa/verify', requireJwtAuth, verify2FA);
router.post('/2fa/verify-temp', checkBan, verify2FAWithTempToken);
router.post('/2fa/confirm', requireJwtAuth, confirm2FA);
router.post('/2fa/disable', requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', requireJwtAuth, regenerateBackupCodes);

/**
 * Auto-set user timezone after login
 * @route POST /auth/enhance-profile
 * @desc Auto-detect and set user timezone if not already set
 * @access Private
 */
router.post('/enhance-profile', requireJwtAuth, async (req, res) => {
  try {
    const { timezone: detectedTimezone } = req.body;
    const userId = req.user.id;

    if (!detectedTimezone) {
      return res.status(400).json({
        message: 'Detected timezone is required',
        success: false,
      });
    }

    // Auto-set timezone for user
    await autoSetUserTimezone(userId, detectedTimezone);

    res.status(200).json({
      message: 'Profile enhanced successfully',
      success: true,
    });
  } catch (error) {
    logger.error('[AuthRoute] Error enhancing user profile:', error);
    res.status(500).json({
      message: 'Failed to enhance profile',
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
