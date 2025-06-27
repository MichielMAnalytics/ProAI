// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const {
  checkBan,
  logHeaders,
  loginLimiter,
  setBalanceConfig,
  checkDomainAllowed,
} = require('~/server/middleware');
const { setAuthTokens, setOpenIDAuthTokens } = require('~/server/services/AuthService');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

router.use(logHeaders);
router.use(loginLimiter);

// Simple in-memory store for OAuth timezone (for demo purposes)
// In production, you might want to use Redis or another storage
const oauthTimezoneStore = new Map();

// Function to get timezone from store
const getOAuthTimezone = (storeKey) => {
  if (!storeKey) return null;
  const timezone = oauthTimezoneStore.get(storeKey);
  if (timezone) {
    // Clean up after retrieval
    oauthTimezoneStore.delete(storeKey);
    logger.info(`[OAuth Store] Retrieved and cleaned up timezone: ${timezone}`);
  }
  return timezone;
};

const oauthHandler = async (req, res) => {
  try {
    await checkDomainAllowed(req, res);
    await checkBan(req, res);
    if (req.banned) {
      return;
    }
    
    // Extract timezone from OAuth state parameter if available
    if (req.query.state) {
      try {
        // Try to get timezone from our store using state as key
        const timezone = getOAuthTimezone(req.query.state);
        if (timezone) {
          req.oauthTimezone = timezone;
          logger.info(`[OAuth Callback] Extracted timezone from store: ${timezone}`);
        } else {
          logger.warn(`[OAuth Callback] No timezone found for state: ${req.query.state}`);
        }
      } catch (stateError) {
        logger.warn('[OAuth Callback] Failed to extract timezone from state:', stateError.message);
      }
    }
    
    if (
      req.user &&
      req.user.provider == 'openid' &&
      isEnabled(process.env.OPENID_REUSE_TOKENS) === true
    ) {
      setOpenIDAuthTokens(req.user.tokenset, res);
    } else {
      await setAuthTokens(req.user._id, res);
    }
    res.redirect(domains.client);
  } catch (err) {
    logger.error('Error in setting authentication tokens:', err);
  }
};

router.get('/error', (req, res) => {
  // A single error message is pushed by passport when authentication fails.
  logger.error('Error in OAuth authentication:', { message: req.session.messages.pop() });

  // Redirect to login page with auth_failed parameter to prevent infinite redirect loops
  res.redirect(`${domains.client}/login?redirect=false`);
});

/**
 * Google Routes
 */

router.get('/google', (req, res, next) => {
  // Store timezone temporarily with a unique key
  if (req.query.timezone) {
    const storeKey = `${Date.now()}-${Math.random()}`;
    oauthTimezoneStore.set(storeKey, req.query.timezone);
    
    // Clean up old entries (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key] of oauthTimezoneStore.entries()) {
      const timestamp = parseInt(key.split('-')[0]);
      if (timestamp < fiveMinutesAgo) {
        oauthTimezoneStore.delete(key);
      }
    }
    
    // Pass the store key as state parameter
    req.oauthTimezoneKey = storeKey;
    logger.info(`[OAuth Google] Stored timezone with key: ${storeKey}, timezone: ${req.query.timezone}`);
  } else {
    logger.warn('[OAuth Google] No timezone provided in query parameters');
  }
  
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
    state: req.oauthTimezoneKey || '',
  })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * Facebook Routes
 */
router.get('/facebook', (req, res, next) => {
  // Store timezone temporarily with a unique key
  if (req.query.timezone) {
    const storeKey = `${Date.now()}-${Math.random()}`;
    oauthTimezoneStore.set(storeKey, req.query.timezone);
    
    // Clean up old entries (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key] of oauthTimezoneStore.entries()) {
      const timestamp = parseInt(key.split('-')[0]);
      if (timestamp < fiveMinutesAgo) {
        oauthTimezoneStore.delete(key);
      }
    }
    
    // Pass the store key as state parameter
    req.oauthTimezoneKey = storeKey;
    logger.info(`[OAuth Facebook] Stored timezone with key: ${storeKey}, timezone: ${req.query.timezone}`);
  } else {
    logger.warn('[OAuth Facebook] No timezone provided in query parameters');
  }
  
  passport.authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
    state: req.oauthTimezoneKey || '',
  })(req, res, next);
});

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * OpenID Routes
 */
router.get('/openid', (req, res, next) => {
  return passport.authenticate('openid', {
    session: false,
    state: randomState(),
  })(req, res, next);
});

router.get(
  '/openid/callback',
  passport.authenticate('openid', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * GitHub Routes
 */
router.get('/github', (req, res, next) => {
  // Store timezone temporarily with a unique key
  if (req.query.timezone) {
    const storeKey = `${Date.now()}-${Math.random()}`;
    oauthTimezoneStore.set(storeKey, req.query.timezone);
    
    // Clean up old entries (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key] of oauthTimezoneStore.entries()) {
      const timestamp = parseInt(key.split('-')[0]);
      if (timestamp < fiveMinutesAgo) {
        oauthTimezoneStore.delete(key);
      }
    }
    
    // Pass the store key as state parameter
    req.oauthTimezoneKey = storeKey;
    logger.info(`[OAuth GitHub] Stored timezone with key: ${storeKey}, timezone: ${req.query.timezone}`);
  } else {
    logger.warn('[OAuth GitHub] No timezone provided in query parameters');
  }
  
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
    state: req.oauthTimezoneKey || '',
  })(req, res, next);
});

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * Discord Routes
 */
router.get(
  '/discord',
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * Apple Routes
 */
router.get(
  '/apple',
  passport.authenticate('apple', {
    session: false,
  }),
);

router.post(
  '/apple/callback',
  passport.authenticate('apple', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  setBalanceConfig,
  oauthHandler,
);

module.exports = router;
module.exports.getOAuthTimezone = getOAuthTimezone;
