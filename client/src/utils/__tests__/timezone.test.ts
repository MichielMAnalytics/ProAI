import {
  getDetectedTimezone,
  isValidTimezone,
  sanitizeTimezone,
  getPopularTimezones,
  formatTimezoneLabel,
  getTimezoneOffset,
} from '../timezone';

// Mock console methods for tests
const mockConsoleWarn = jest.fn();
const mockConsoleDebug = jest.fn();
const mockConsoleError = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  console.warn = mockConsoleWarn;
  console.debug = mockConsoleDebug;
  console.error = mockConsoleError;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Timezone Utilities', () => {
  describe('getDetectedTimezone', () => {
    it('should return a valid timezone string', () => {
      const timezone = getDetectedTimezone();
      expect(typeof timezone).toBe('string');
      expect(timezone.length).toBeGreaterThan(0);
    });

    it('should return UTC as fallback when detection fails', () => {
      // Mock Intl.DateTimeFormat to throw error
      const originalIntl = global.Intl;
      global.Intl = {
        ...originalIntl,
        DateTimeFormat: jest.fn().mockImplementation(() => {
          throw new Error('Mock error');
        }),
      };

      const timezone = getDetectedTimezone();
      expect(timezone).toBe('UTC');

      global.Intl = originalIntl;
    });
  });

  describe('isValidTimezone', () => {
    it('should return true for valid timezones', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    });

    it('should return false for invalid timezones', () => {
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('invalid_timezone')).toBe(false);
      expect(isValidTimezone('America/Invalid')).toBe(false);
      expect(isValidTimezone(null as any)).toBe(false);
      expect(isValidTimezone(undefined as any)).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(isValidTimezone(123 as any)).toBe(false);
      expect(isValidTimezone({} as any)).toBe(false);
      expect(isValidTimezone([] as any)).toBe(false);
    });
  });

  describe('sanitizeTimezone', () => {
    it('should return UTC for null/undefined/empty inputs', () => {
      expect(sanitizeTimezone('')).toBe('UTC');
      expect(sanitizeTimezone(null as any)).toBe('UTC');
      expect(sanitizeTimezone(undefined as any)).toBe('UTC');
    });

    it('should return valid timezone as-is', () => {
      expect(sanitizeTimezone('America/New_York')).toBe('America/New_York');
      expect(sanitizeTimezone('UTC')).toBe('UTC');
    });

    it('should fix common timezone abbreviations', () => {
      expect(sanitizeTimezone('utc')).toBe('UTC');
      expect(sanitizeTimezone('gmt')).toBe('UTC');
      expect(sanitizeTimezone('est')).toBe('America/New_York');
      expect(sanitizeTimezone('pst')).toBe('America/Los_Angeles');
    });

    it('should trim whitespace', () => {
      expect(sanitizeTimezone('  UTC  ')).toBe('UTC');
      expect(sanitizeTimezone(' America/New_York ')).toBe('America/New_York');
    });

    it('should fallback to UTC for invalid inputs', () => {
      expect(sanitizeTimezone('invalid_timezone')).toBe('UTC');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'Could not sanitize timezone "invalid_timezone", using UTC',
      );
    });
  });

  describe('getPopularTimezones', () => {
    it('should return an array of timezone options', () => {
      const timezones = getPopularTimezones();
      expect(Array.isArray(timezones)).toBe(true);
      expect(timezones.length).toBeGreaterThan(0);
    });

    it('should include UTC as the first option', () => {
      const timezones = getPopularTimezones();
      expect(timezones[0].value).toBe('UTC');
    });

    it('should have proper structure for each option', () => {
      const timezones = getPopularTimezones();
      timezones.forEach((tz) => {
        expect(tz).toHaveProperty('value');
        expect(tz).toHaveProperty('label');
        expect(tz).toHaveProperty('offset');
        expect(typeof tz.value).toBe('string');
        expect(typeof tz.label).toBe('string');
        expect(typeof tz.offset).toBe('string');
      });
    });
  });

  describe('formatTimezoneLabel', () => {
    it('should format UTC correctly', () => {
      const label = formatTimezoneLabel('UTC');
      expect(label).toBe('UTC (Coordinated Universal Time)');
    });

    it('should format timezone identifiers correctly', () => {
      const label = formatTimezoneLabel('America/New_York');
      expect(label).toContain('New York');
      expect(label).toContain('GMT');
    });

    it('should handle invalid timezones gracefully', () => {
      const label = formatTimezoneLabel('invalid_timezone');
      expect(label).toBe('invalid_timezone');
    });
  });

  describe('getTimezoneOffset', () => {
    it('should return an offset string for valid timezones', () => {
      const offset = getTimezoneOffset('UTC');
      expect(offset).toMatch(/GMT[+-]\d/);
    });

    it('should handle invalid timezones gracefully', () => {
      const offset = getTimezoneOffset('invalid_timezone');
      expect(offset).toBe('GMT+0');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        'Failed to get offset for timezone invalid_timezone:',
        expect.any(Error),
      );
    });
  });
});

describe('Timezone Integration', () => {
  it('should handle complete timezone detection and validation flow', () => {
    const detected = getDetectedTimezone();
    expect(isValidTimezone(detected)).toBe(true);

    const sanitized = sanitizeTimezone(detected);
    expect(isValidTimezone(sanitized)).toBe(true);

    const label = formatTimezoneLabel(sanitized);
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('should provide consistent timezone options', () => {
    const options = getPopularTimezones();
    options.forEach((option) => {
      expect(isValidTimezone(option.value)).toBe(true);
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.offset.length).toBeGreaterThan(0);
    });
  });
});
