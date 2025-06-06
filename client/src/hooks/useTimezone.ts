import { useCallback, useEffect } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useMutation } from '@tanstack/react-query';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';
import { logger } from '~/utils';
import { 
  getDetectedTimezone,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  formatTimeInTimezone,
  formatRelativeTimeInTimezone,
  getTimezoneAbbreviation
} from '~/utils/timezone';

interface UpdateTimezoneResponse {
  message: string;
  user: {
    timezone?: string;
    [key: string]: any;
  };
}

/**
 * Custom hook for managing user timezone preferences
 */
export const useTimezone = () => {
  const [timezone, setTimezone] = useRecoilState(store.timezone);
  const setUser = useSetRecoilState(store.user);
  const { user, token } = useAuthContext();

  // Initialize timezone from user data when available
  useEffect(() => {
    if (user?.timezone && timezone !== user.timezone) {
      // User has a timezone stored in database, use that
      setTimezone(user.timezone);
      localStorage.setItem('timezone', JSON.stringify(user.timezone));
      logger.debug(`Initialized timezone from user profile: ${user.timezone}`);
    } else if (!user?.timezone && !timezone) {
      // No user timezone and no local timezone, use browser detection
      const detectedTimezone = getDetectedTimezone();
      setTimezone(detectedTimezone);
      localStorage.setItem('timezone', JSON.stringify(detectedTimezone));
      logger.debug(`Initialized timezone from browser detection: ${detectedTimezone}`);
    }
  }, [user?.timezone, timezone, setTimezone]);

  // Mutation for updating timezone on the server
  const updateTimezoneMutation = useMutation({
    mutationFn: async (newTimezone: string): Promise<UpdateTimezoneResponse> => {
      const response = await fetch('/api/user/timezone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ timezone: newTimezone }),
      });

      if (!response.ok) {
        // Handle non-JSON error responses
        let errorMessage = 'Failed to update timezone';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          // Response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Update user context with new timezone
      if (user && data.user) {
        setUser({
          ...user,
          timezone: data.user.timezone,
        });
      }
      logger.log('Timezone updated successfully:', data.user.timezone);
    },
    onError: (error) => {
      logger.error('Failed to update timezone:', error);
      // Revert local state on error
      if (user?.timezone) {
        setTimezone(user.timezone);
        localStorage.setItem('timezone', JSON.stringify(user.timezone));
      }
    },
  });

  // Function to update timezone both locally and on server
  const updateTimezone = useCallback(
    async (newTimezone: string) => {
      // Validate the timezone before updating
      if (!newTimezone || typeof newTimezone !== 'string') {
        throw new Error('Invalid timezone provided');
      }

      // Update local state immediately for optimistic UI
      setTimezone(newTimezone);
      localStorage.setItem('timezone', JSON.stringify(newTimezone));

      // Update on server if user is authenticated
      if (user && token) {
        try {
          await updateTimezoneMutation.mutateAsync(newTimezone);
        } catch (error) {
          // Error handling is done in mutation onError
          throw error;
        }
      }
    },
    [setTimezone, user, token, updateTimezoneMutation],
  );

  // Get effective timezone (database > local > browser detection)
  const effectiveTimezone = user?.timezone || timezone || getDetectedTimezone();

  // Timezone-aware formatting functions
  const formatDate = useCallback((dateInput: string | Date, isSmallScreen = false) => {
    return formatDateInTimezone(dateInput, effectiveTimezone, isSmallScreen);
  }, [effectiveTimezone]);

  const formatDateTime = useCallback((dateInput: string | Date, options?: {
    showSeconds?: boolean;
    showTimezone?: boolean;
    use24Hour?: boolean;
  }) => {
    return formatDateTimeInTimezone(dateInput, effectiveTimezone, options);
  }, [effectiveTimezone]);

  const formatTime = useCallback((dateInput: string | Date, options?: {
    showSeconds?: boolean;
    use24Hour?: boolean;
  }) => {
    return formatTimeInTimezone(dateInput, effectiveTimezone, options);
  }, [effectiveTimezone]);

  const formatRelativeTime = useCallback((dateInput: string | Date) => {
    return formatRelativeTimeInTimezone(dateInput, effectiveTimezone);
  }, [effectiveTimezone]);

  const getTimezoneAbbr = useCallback(() => {
    return getTimezoneAbbreviation(effectiveTimezone);
  }, [effectiveTimezone]);

  return {
    timezone: effectiveTimezone,
    updateTimezone,
    isUpdating: updateTimezoneMutation.status === 'loading',
    error: updateTimezoneMutation.error,
    isError: updateTimezoneMutation.isError,
    // Formatting functions
    formatDate,
    formatDateTime,
    formatTime,
    formatRelativeTime,
    getTimezoneAbbr,
  };
}; 