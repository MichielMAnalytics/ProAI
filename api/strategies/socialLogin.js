const { logger } = require('@librechat/data-schemas');
const { createSocialUser, handleExistingUser } = require('./process');
const { isEnabled } = require('~/server/utils');
const { findUser } = require('~/models');

const socialLogin =
  (provider, getProfileDetails) => async (req, accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken,
        profile,
      });

      const oldUser = await findUser({ email: email.trim() });
      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);

      if (oldUser) {
        await handleExistingUser(oldUser, avatarUrl);
        return cb(null, oldUser);
      }

      if (ALLOW_SOCIAL_REGISTRATION) {
        // Get timezone from OAuth session (captured during /oauth/google redirect)
        let timezone = 'UTC'; // Default fallback

        // Try to get timezone from OAuth temporary store via state parameter
        if (req && req.oauthTimezone) {
          // First check if timezone was already extracted in oauth handler
          timezone = req.oauthTimezone;
          logger.info(`[${provider}Login] Retrieved timezone from OAuth callback: ${timezone}`);
        } else if (req && req.query && req.query.state) {
          const stateKey = req.query.state;
          // Import the store from the oauth route
          const { getOAuthTimezone } = require('~/server/routes/oauth');
          const storedTimezone = getOAuthTimezone ? getOAuthTimezone(stateKey) : null;

          if (storedTimezone) {
            timezone = storedTimezone;
            logger.info(`[${provider}Login] Retrieved timezone from OAuth store: ${timezone}`);
          } else {
            logger.warn(`[${provider}Login] No timezone found in OAuth store for key: ${stateKey}`);
          }
        }

        if (timezone === 'UTC') {
          logger.warn(`[${provider}Login] Using UTC fallback timezone`);
        }

        const newUser = await createSocialUser({
          email,
          avatarUrl,
          provider,
          providerKey: `${provider}Id`,
          providerId: id,
          username,
          name,
          emailVerified,
          timezone,
        });

        logger.info(`[${provider}Login] Created new user with timezone: ${timezone}`);
        return cb(null, newUser);
      }
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
