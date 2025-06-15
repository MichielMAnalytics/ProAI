import { replaceSpecialVars } from '../src/parsers';
import { specialVariables } from '../src/config';
import type { TUser } from '../src/types';

// Mock dayjs module with consistent date/time values regardless of environment
jest.mock('dayjs', () => {
  // Create a mock implementation that returns fixed values
  const mockDayjs = () => ({
    format: (format: string) => {
      if (format === 'YYYY-MM-DD') {
        return '2024-04-29';
      }
      if (format === 'YYYY-MM-DD HH:mm:ss') {
        return '2024-04-29 12:34:56';
      }
      return format; // fallback
    },
    day: () => 1, // 1 = Monday
    toISOString: () => '2024-04-29T16:34:56.000Z',
  });

  // Add any static methods needed
  mockDayjs.extend = jest.fn();

  return mockDayjs;
});

// Mock Date constructor to return consistent values for timezone tests
const MOCK_DATE = new Date('2024-04-29T16:34:56.000Z'); // Fixed UTC time

// Store original Date methods
const OriginalDate = Date;

beforeAll(() => {
  // Mock Date constructor
  global.Date = jest.fn(() => MOCK_DATE) as any;
  global.Date.UTC = OriginalDate.UTC;
  global.Date.parse = OriginalDate.parse;
  global.Date.now = jest.fn(() => MOCK_DATE.getTime());
  
  // Mock Date prototype methods
  Object.setPrototypeOf(global.Date, OriginalDate);
  Object.getOwnPropertyNames(OriginalDate.prototype).forEach(name => {
    if (name !== 'constructor') {
      global.Date.prototype[name] = OriginalDate.prototype[name];
    }
  });
});

afterAll(() => {
  // Restore original Date
  global.Date = OriginalDate;
});

describe('replaceSpecialVars', () => {
  // Create a partial user object for testing
  const mockUser = {
    name: 'Test User',
    id: 'user123',
  } as TUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return the original text if text is empty', () => {
    expect(replaceSpecialVars({ text: '' })).toBe('');
    expect(replaceSpecialVars({ text: null as unknown as string })).toBe(null);
    expect(replaceSpecialVars({ text: undefined as unknown as string })).toBe(undefined);
  });

  test('should replace {{current_date}} with the current date', () => {
    const result = replaceSpecialVars({ text: 'Today is {{current_date}}' });
    // dayjs().day() returns 1 for Monday (April 29, 2024 is a Monday)
    expect(result).toBe('Today is 2024-04-29 (1)');
  });

  test('should replace {{current_datetime}} with the current datetime', () => {
    const result = replaceSpecialVars({ text: 'Now is {{current_datetime}}' });
    expect(result).toBe('Now is 2024-04-29 12:34:56 (1)');
  });

  test('should replace {{iso_datetime}} with the ISO datetime', () => {
    const result = replaceSpecialVars({ text: 'ISO time: {{iso_datetime}}' });
    expect(result).toBe('ISO time: 2024-04-29T16:34:56.000Z');
  });

  test('should replace {{current_user}} with the user name if provided', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}!',
      user: mockUser,
    });
    expect(result).toBe('Hello Test User!');
  });

  test('should not replace {{current_user}} if user is not provided', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}!',
    });
    expect(result).toBe('Hello {{current_user}}!');
  });

  test('should not replace {{current_user}} if user has no name', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}!',
      user: { id: 'user123' } as TUser,
    });
    expect(result).toBe('Hello {{current_user}}!');
  });

  test('should handle multiple replacements in the same text', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}! Today is {{current_date}} and the time is {{current_datetime}}. ISO: {{iso_datetime}}',
      user: mockUser,
    });
    expect(result).toBe(
      'Hello Test User! Today is 2024-04-29 (1) and the time is 2024-04-29 12:34:56 (1). ISO: 2024-04-29T16:34:56.000Z',
    );
  });

  test('should be case-insensitive when replacing variables', () => {
    const result = replaceSpecialVars({
      text: 'Date: {{CURRENT_DATE}}, User: {{Current_User}}',
      user: mockUser,
    });
    expect(result).toBe('Date: 2024-04-29 (1), User: Test User');
  });

  test('should replace {{mcp_servers}} with the MCP servers list if provided', () => {
    const mockMcpServers = ['notion', 'trello', 'google_sheets'];
    const result = replaceSpecialVars({
      text: 'Available MCP servers: {{mcp_servers}}',
      mcp_servers: mockMcpServers,
    });
    expect(result).toBe('Available MCP servers: notion, trello, google_sheets');
  });

  test('should not replace {{mcp_servers}} if mcp_servers is not provided', () => {
    const result = replaceSpecialVars({
      text: 'Available MCP servers: {{mcp_servers}}',
    });
    expect(result).toBe('Available MCP servers: {{mcp_servers}}');
  });

  test('should not replace {{mcp_servers}} if mcp_servers is empty', () => {
    const result = replaceSpecialVars({
      text: 'Available MCP servers: {{mcp_servers}}',
      mcp_servers: [],
    });
    expect(result).toBe('Available MCP servers: {{mcp_servers}}');
  });

  test('should replace {{tools}} with the tools list if provided', () => {
    const mockTools = ['notion-update-page_mcp_pipedream-notion', 'trello-create-card_mcp_pipedream-trello'];
    const result = replaceSpecialVars({
      text: 'Available tools: {{tools}}',
      tools: mockTools,
    });
    expect(result).toBe('Available tools: notion-update-page_mcp_pipedream-notion, trello-create-card_mcp_pipedream-trello');
  });

  test('should not replace {{tools}} if tools is not provided', () => {
    const result = replaceSpecialVars({
      text: 'Available tools: {{tools}}',
    });
    expect(result).toBe('Available tools: {{tools}}');
  });

  test('should not replace {{tools}} if tools is empty', () => {
    const result = replaceSpecialVars({
      text: 'Available tools: {{tools}}',
      tools: [],
    });
    expect(result).toBe('Available tools: {{tools}}');
  });

  test('should handle mcp_servers and tools together', () => {
    const mockMcpServers = ['notion', 'trello'];
    const mockTools = ['notion-update-page_mcp_pipedream-notion', 'trello-create-card_mcp_pipedream-trello'];
    const result = replaceSpecialVars({
      text: 'MCP servers: {{mcp_servers}}, Tools: {{tools}}',
      mcp_servers: mockMcpServers,
      tools: mockTools,
    });
    expect(result).toBe('MCP servers: notion, trello, Tools: notion-update-page_mcp_pipedream-notion, trello-create-card_mcp_pipedream-trello');
  });

  test('should confirm all specialVariables from config.ts get parsed', () => {
    // Create a text that includes all special variables
    const specialVarsText = Object.keys(specialVariables)
      .map((key) => `{{${key}}}`)
      .join(' ');

    const mockMcpServers = ['notion', 'trello'];
    const mockTools = ['notion-create-page_mcp_pipedream-notion'];

    const result = replaceSpecialVars({
      text: specialVarsText,
      user: mockUser,
      mcp_servers: mockMcpServers,
      tools: mockTools,
    });

    // Verify none of the original variable placeholders remain in the result
    Object.keys(specialVariables).forEach((key) => {
      const placeholder = `{{${key}}}`;
      expect(result).not.toContain(placeholder);
    });

    // Verify the expected replacements
    expect(result).toContain('2024-04-29 (1)'); // current_date
    expect(result).toContain('2024-04-29 12:34:56 (1)'); // current_datetime
    expect(result).toContain('2024-04-29T16:34:56.000Z'); // iso_datetime
    expect(result).toContain('Test User'); // current_user
    expect(result).toContain('notion, trello'); // mcp_servers
    expect(result).toContain('notion-create-page_mcp_pipedream-notion'); // tools
  });

  describe('timezone support', () => {
    // Mock Intl.DateTimeFormat for timezone tests
    const mockDateTimeFormat = jest.fn();
    const originalDateTimeFormat = Intl.DateTimeFormat;

    beforeAll(() => {
      // Mock Intl.DateTimeFormat
      (Intl as any).DateTimeFormat = mockDateTimeFormat;
    });

    afterAll(() => {
      // Restore original Intl.DateTimeFormat
      (Intl as any).DateTimeFormat = originalDateTimeFormat;
    });

    beforeEach(() => {
      mockDateTimeFormat.mockClear();
    });

    test('should use timezone-aware formatting when timezone is provided', () => {
      // Mock formatter for date formatting
      mockDateTimeFormat.mockImplementation((locale, options) => {
        if (options?.timeZone === 'America/New_York') {
          return {
            format: () => '2024-04-29',
            formatToParts: () => [
              { type: 'year', value: '2024' },
              { type: 'month', value: '04' },
              { type: 'day', value: '29' },
              { type: 'hour', value: '12' },
              { type: 'minute', value: '34' },
              { type: 'second', value: '56' }
            ]
          };
        }
        return originalDateTimeFormat(locale, options);
      });

      // Mock toLocaleDateString for day calculation
      const mockToLocaleDateString = jest.fn(() => '2024-04-29');
      Object.defineProperty(Date.prototype, 'toLocaleDateString', {
        value: mockToLocaleDateString,
        writable: true
      });

      const result = replaceSpecialVars({
        text: 'Current date: {{current_date}}, Current datetime: {{current_datetime}}',
        timezone: 'America/New_York'
      });

      expect(result).toContain('2024-04-29');
      expect(mockDateTimeFormat).toHaveBeenCalledWith('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    });

    test('should fallback to server timezone when timezone formatting fails', () => {
      // Mock formatter that throws an error on formatToParts
      mockDateTimeFormat.mockImplementation(() => ({
        format: () => '2024-04-29',
        formatToParts: () => {
          throw new Error('Invalid timezone');
        }
      }));

      const result = replaceSpecialVars({
        text: 'Current datetime: {{current_datetime}}',
        timezone: 'Invalid/Timezone'
      });

      // Should fallback to dayjs formatting
      expect(result).toBe('Current datetime: 2024-04-29 12:34:56 (1)');
    });

    test('should use user timezone from user object when timezone param not provided', () => {
      const userWithTimezone = {
        ...mockUser,
        timezone: 'Europe/London'
      } as TUser;

      mockDateTimeFormat.mockImplementation((locale, options) => {
        if (options?.timeZone === 'Europe/London') {
          return {
            format: () => '2024-04-29',
            formatToParts: () => [
              { type: 'year', value: '2024' },
              { type: 'month', value: '04' },
              { type: 'day', value: '29' },
              { type: 'hour', value: '17' },
              { type: 'minute', value: '34' },
              { type: 'second', value: '56' }
            ]
          };
        }
        return originalDateTimeFormat(locale, options);
      });

      // Mock toLocaleDateString for day calculation
      const mockToLocaleDateString = jest.fn(() => '2024-04-29');
      Object.defineProperty(Date.prototype, 'toLocaleDateString', {
        value: mockToLocaleDateString,
        writable: true
      });

      const result = replaceSpecialVars({
        text: 'Current datetime: {{current_datetime}}',
        user: userWithTimezone
      });

      expect(mockDateTimeFormat).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeZone: 'Europe/London'
        })
      );
      expect(result).toContain('2024-04-29');
    });

    test('should prioritize timezone parameter over user timezone', () => {
      const userWithTimezone = {
        ...mockUser,
        timezone: 'Europe/London'
      } as TUser;

      mockDateTimeFormat.mockImplementation((locale, options) => {
        if (options?.timeZone === 'Asia/Tokyo') {
          return {
            format: () => '2024-04-30',
            formatToParts: () => [
              { type: 'year', value: '2024' },
              { type: 'month', value: '04' },
              { type: 'day', value: '30' },
              { type: 'hour', value: '01' },
              { type: 'minute', value: '34' },
              { type: 'second', value: '56' }
            ]
          };
        }
        return originalDateTimeFormat(locale, options);
      });

      // Mock toLocaleDateString for day calculation
      const mockToLocaleDateString = jest.fn(() => '2024-04-30');
      Object.defineProperty(Date.prototype, 'toLocaleDateString', {
        value: mockToLocaleDateString,
        writable: true
      });

      const result = replaceSpecialVars({
        text: 'Current date: {{current_date}}',
        user: userWithTimezone,
        timezone: 'Asia/Tokyo'
      });

      expect(mockDateTimeFormat).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeZone: 'Asia/Tokyo'
        })
      );
      expect(result).toContain('2024-04-30');
    });

    test('should fall back to dayjs when no timezone is provided', () => {
      const result = replaceSpecialVars({
        text: 'Current date: {{current_date}}, Current datetime: {{current_datetime}}'
      });

      expect(result).toBe('Current date: 2024-04-29 (1), Current datetime: 2024-04-29 12:34:56 (1)');
    });
  });
});
