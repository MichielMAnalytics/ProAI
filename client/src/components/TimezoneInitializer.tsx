import React, { useEffect, useRef } from 'react';
import { useAuthContext, useTimezone, getOAuthTimezone, clearOAuthTimezone } from '~/hooks';
import { getDetectedTimezone, isValidTimezone } from '~/utils/timezone';

/**
 * TimezoneInitializer component ensures that all authenticated users have a valid timezone set.
 * This component handles timezone initialization for both email registration and OAuth users.
 *
 * For OAuth users:
 * 1. Checks if timezone was captured during OAuth flow (stored in localStorage)
 * 2. Falls back to automatic detection if no OAuth timezone found
 *
 * For email users:
 * 1. Validates existing timezone in user profile
 * 2. Updates timezone if missing or invalid
 */
export const TimezoneInitializer: React.FC = () => {
  const { user, isAuthenticated } = useAuthContext();
  const { timezone, updateTimezone } = useTimezone();
  const initializationAttempted = useRef(false);

  useEffect(() => {
    // Only run once per session and only when authenticated
    if (!isAuthenticated || !user || initializationAttempted.current) {
      return;
    }

    const initializeTimezone = async () => {
      try {
        initializationAttempted.current = true;

        // Check if user already has a valid timezone from their profile
        if (user?.timezone && isValidTimezone(user.timezone)) {
          console.debug('[TimezoneInitializer] User already has valid timezone in profile:', user.timezone);
          // Clear any OAuth timezone storage since user is properly set up
          clearOAuthTimezone();
          return;
        }

        // Priority 1: Check for OAuth timezone (from social login)
        const oauthTimezone = getOAuthTimezone();
        if (oauthTimezone && isValidTimezone(oauthTimezone)) {
          console.debug(
            '[TimezoneInitializer] Found OAuth timezone, updating user:',
            oauthTimezone,
          );
          await updateTimezone(oauthTimezone);
          clearOAuthTimezone(); // Clean up after successful update
          return;
        }

        // Priority 2: Auto-detect timezone
        const detectedTimezone = getDetectedTimezone();
        if (isValidTimezone(detectedTimezone)) {
          console.debug(
            '[TimezoneInitializer] Auto-detected timezone, updating user:',
            detectedTimezone,
          );
          await updateTimezone(detectedTimezone);
          clearOAuthTimezone(); // Clean up any leftover OAuth timezone
          return;
        }

        // Fallback: Set UTC if all else fails
        console.warn('[TimezoneInitializer] Could not detect valid timezone, falling back to UTC');
        await updateTimezone('UTC');
        clearOAuthTimezone();
      } catch (error) {
        console.error('[TimezoneInitializer] Failed to initialize timezone:', error);
        // Clear OAuth timezone even on error to prevent infinite loops
        clearOAuthTimezone();

        // Try to set UTC as absolute fallback
        try {
          await updateTimezone('UTC');
        } catch (fallbackError) {
          console.error('[TimezoneInitializer] Even UTC fallback failed:', fallbackError);
        }
      }
    };

    // Small delay to ensure auth context is fully loaded
    const timeoutId = setTimeout(initializeTimezone, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAuthenticated, user, timezone, updateTimezone]);

  // This component doesn't render anything visible
  return null;
};

export default TimezoneInitializer;
