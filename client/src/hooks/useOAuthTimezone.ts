import { useEffect } from 'react';
import { getDetectedTimezone, isValidTimezone } from '~/utils/timezone';

/**
 * Hook to capture and store user timezone during OAuth authentication flow.
 * This ensures timezone is available when OAuth users are created on the server.
 */
export const useOAuthTimezone = () => {
  useEffect(() => {
    const captureTimezone = () => {
      try {
        // Get the user's detected timezone
        const detectedTimezone = getDetectedTimezone();

        // Validate the timezone before storing
        if (!isValidTimezone(detectedTimezone)) {
          console.warn(
            '[useOAuthTimezone] Invalid timezone detected, using UTC fallback:',
            detectedTimezone,
          );
          localStorage.setItem('oauth_timezone', 'UTC');
          return;
        }

        // Store timezone in localStorage for OAuth callback to use
        localStorage.setItem('oauth_timezone', detectedTimezone);

        console.debug('[useOAuthTimezone] Timezone captured for OAuth:', detectedTimezone);
      } catch (error) {
        console.error('[useOAuthTimezone] Failed to capture timezone:', error);
        // Fallback to UTC if detection fails
        localStorage.setItem('oauth_timezone', 'UTC');
      }
    };

    // Capture timezone immediately when hook is used
    captureTimezone();
  }, []);

  /**
   * Get the stored OAuth timezone and clean up localStorage
   * @returns The stored timezone or null if not found
   */
  const getAndClearOAuthTimezone = (): string | null => {
    try {
      const timezone = localStorage.getItem('oauth_timezone');
      if (timezone) {
        // Clean up the temporary storage
        localStorage.removeItem('oauth_timezone');
        return timezone;
      }
      return null;
    } catch (error) {
      console.error('[useOAuthTimezone] Failed to retrieve OAuth timezone:', error);
      return null;
    }
  };

  /**
   * Ensure timezone is captured for OAuth flow
   * Call this before initiating OAuth login
   */
  const ensureTimezoneForOAuth = (): string => {
    try {
      const detectedTimezone = getDetectedTimezone();

      if (!isValidTimezone(detectedTimezone)) {
        console.warn('[useOAuthTimezone] Invalid timezone for OAuth, using UTC:', detectedTimezone);
        localStorage.setItem('oauth_timezone', 'UTC');
        return 'UTC';
      }

      localStorage.setItem('oauth_timezone', detectedTimezone);
      console.debug('[useOAuthTimezone] Timezone ensured for OAuth:', detectedTimezone);
      return detectedTimezone;
    } catch (error) {
      console.error('[useOAuthTimezone] Failed to ensure timezone for OAuth:', error);
      localStorage.setItem('oauth_timezone', 'UTC');
      return 'UTC';
    }
  };

  return {
    getAndClearOAuthTimezone,
    ensureTimezoneForOAuth,
  };
};

/**
 * Utility function to get OAuth timezone without using the hook
 * Useful for components that need timezone but don't use the hook
 */
export const getOAuthTimezone = (): string | null => {
  try {
    return localStorage.getItem('oauth_timezone');
  } catch (error) {
    console.error('[getOAuthTimezone] Failed to get OAuth timezone:', error);
    return null;
  }
};

/**
 * Utility function to clear OAuth timezone storage
 * Useful for cleanup after OAuth completion
 */
export const clearOAuthTimezone = (): void => {
  try {
    localStorage.removeItem('oauth_timezone');
    console.debug('[clearOAuthTimezone] OAuth timezone storage cleared');
  } catch (error) {
    console.error('[clearOAuthTimezone] Failed to clear OAuth timezone:', error);
  }
};
