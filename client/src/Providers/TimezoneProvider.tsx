import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import { useTimezone } from '~/hooks';
import {
  formatDateInTimezone,
  formatTimeInTimezone,
  formatDateTimeInTimezone,
  formatRelativeTimeInTimezone,
  getTimezoneAbbreviation,
  getDetectedTimezone,
  isValidTimezone,
} from '~/utils/timezone';

interface TimezoneContextType {
  // Current timezone
  timezone: string;
  isUpdating: boolean;
  isError: boolean;
  error: Error | null;

  // Timezone management
  updateTimezone: (newTimezone: string) => Promise<void>;
  detectTimezone: () => string;
  validateTimezone: (timezone: string) => boolean;

  // Formatting functions with current timezone
  formatDate: (date: string | Date, isSmallScreen?: boolean) => string;
  formatTime: (
    date: string | Date,
    options?: { showSeconds?: boolean; use24Hour?: boolean },
  ) => string;
  formatDateTime: (
    date: string | Date,
    options?: { showSeconds?: boolean; showTimezone?: boolean; use24Hour?: boolean },
  ) => string;
  formatRelativeTime: (date: string | Date) => string;
  getTimezoneAbbr: () => string;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

interface TimezoneProviderProps {
  children: ReactNode;
}

/**
 * TimezoneProvider provides centralized timezone management and formatting functions
 * throughout the application. It wraps the useTimezone hook and provides convenient
 * formatting functions that automatically use the current user's timezone.
 */
export const TimezoneProvider: React.FC<TimezoneProviderProps> = ({ children }) => {
  const { timezone, updateTimezone, isUpdating, isError, error } = useTimezone();

  // Timezone management functions
  const detectTimezone = useCallback((): string => {
    return getDetectedTimezone();
  }, []);

  const validateTimezone = useCallback((tz: string): boolean => {
    return isValidTimezone(tz);
  }, []);

  // Formatting functions that automatically use current timezone
  const formatDate = useCallback(
    (date: string | Date, isSmallScreen?: boolean): string => {
      return formatDateInTimezone(date, timezone, isSmallScreen);
    },
    [timezone],
  );

  const formatTime = useCallback(
    (date: string | Date, options?: { showSeconds?: boolean; use24Hour?: boolean }): string => {
      return formatTimeInTimezone(date, timezone, options);
    },
    [timezone],
  );

  const formatDateTime = useCallback(
    (
      date: string | Date,
      options?: { showSeconds?: boolean; showTimezone?: boolean; use24Hour?: boolean },
    ): string => {
      return formatDateTimeInTimezone(date, timezone, options);
    },
    [timezone],
  );

  const formatRelativeTime = useCallback(
    (date: string | Date): string => {
      return formatRelativeTimeInTimezone(date, timezone);
    },
    [timezone],
  );

  const getTimezoneAbbr = useCallback((): string => {
    return getTimezoneAbbreviation(timezone);
  }, [timezone]);

  const contextValue: TimezoneContextType = {
    // Current timezone state
    timezone,
    isUpdating,
    isError,
    error,

    // Timezone management
    updateTimezone,
    detectTimezone,
    validateTimezone,

    // Formatting functions
    formatDate,
    formatTime,
    formatDateTime,
    formatRelativeTime,
    getTimezoneAbbr,
  };

  return <TimezoneContext.Provider value={contextValue}>{children}</TimezoneContext.Provider>;
};

/**
 * Hook to access the timezone context
 * @returns TimezoneContextType
 * @throws Error if used outside of TimezoneProvider
 */
export const useTimezoneContext = (): TimezoneContextType => {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error('useTimezoneContext must be used within a TimezoneProvider');
  }
  return context;
};

/**
 * HOC to wrap components with TimezoneProvider
 * @param Component - React component to wrap
 * @returns Wrapped component with TimezoneProvider
 */
export const withTimezone = <P extends object>(Component: React.ComponentType<P>): React.FC<P> => {
  const WrappedComponent: React.FC<P> = (props) => (
    <TimezoneProvider>
      <Component {...props} />
    </TimezoneProvider>
  );

  WrappedComponent.displayName = `withTimezone(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

export default TimezoneProvider;
