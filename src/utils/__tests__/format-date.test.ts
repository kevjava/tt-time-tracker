import {
  formatDate,
  formatDateShort,
  formatDayDate,
  formatDayDateFull,
  formatTime,
  formatTimeSeconds,
  formatDateTime,
  formatDateTimeSeconds,
  formatDateShortTime,
  formatTimeRange,
  formatDateRange,
  resetFormatCache,
} from '../format-date';

// Mock loadConfig to control format settings
jest.mock('../config', () => ({
  loadConfig: jest.fn(() => ({
    dateFormat: 'MMM d, yyyy',
    dateFormatShort: 'MMM d',
    timeFormat: '24h',
    locale: '',
  })),
}));

const { loadConfig } = require('../config');

describe('format-date', () => {
  // Use a fixed date: Wed Jan 15, 2025 09:30:45
  const testDate = new Date(2025, 0, 15, 9, 30, 45);
  const testDate2 = new Date(2025, 0, 21, 16, 45, 0);

  beforeEach(() => {
    resetFormatCache();
    (loadConfig as jest.Mock).mockReturnValue({
      dateFormat: 'MMM d, yyyy',
      dateFormatShort: 'MMM d',
      timeFormat: '24h',
      locale: '',
    });
  });

  describe('with default config (24h)', () => {
    it('formatDate returns full date with year', () => {
      expect(formatDate(testDate)).toBe('Jan 15, 2025');
    });

    it('formatDateShort returns date without year', () => {
      expect(formatDateShort(testDate)).toBe('Jan 15');
    });

    it('formatDayDate returns day + short date', () => {
      expect(formatDayDate(testDate)).toBe('Wed, Jan 15');
    });

    it('formatDayDateFull returns day + full date', () => {
      expect(formatDayDateFull(testDate)).toBe('Wed, Jan 15, 2025');
    });

    it('formatTime returns 24h time', () => {
      expect(formatTime(testDate)).toBe('09:30');
    });

    it('formatTimeSeconds returns 24h time with seconds', () => {
      expect(formatTimeSeconds(testDate)).toBe('09:30:45');
    });

    it('formatDateTime returns full date + time', () => {
      expect(formatDateTime(testDate)).toBe('Jan 15, 2025 09:30');
    });

    it('formatDateTimeSeconds returns full date + time with seconds', () => {
      expect(formatDateTimeSeconds(testDate)).toBe('Jan 15, 2025 09:30:45');
    });

    it('formatDateShortTime returns short date + time', () => {
      expect(formatDateShortTime(testDate)).toBe('Jan 15, 09:30');
    });

    it('formatTimeRange returns formatted range', () => {
      expect(formatTimeRange(testDate, testDate2)).toBe('09:30-16:45');
    });

    it('formatDateRange returns formatted date range', () => {
      expect(formatDateRange(testDate, testDate2)).toBe('Jan 15 - Jan 21, 2025');
    });
  });

  describe('with 12h time format', () => {
    beforeEach(() => {
      resetFormatCache();
      (loadConfig as jest.Mock).mockReturnValue({
        dateFormat: 'MMM d, yyyy',
        dateFormatShort: 'MMM d',
        timeFormat: '12h',
        locale: '',
      });
    });

    it('formatTime returns 12h time', () => {
      expect(formatTime(testDate)).toBe('9:30 AM');
    });

    it('formatTime returns PM for afternoon', () => {
      expect(formatTime(testDate2)).toBe('4:45 PM');
    });

    it('formatTimeSeconds returns 12h time with seconds', () => {
      expect(formatTimeSeconds(testDate)).toBe('9:30:45 AM');
    });

    it('formatTimeRange uses 12h format', () => {
      expect(formatTimeRange(testDate, testDate2)).toBe('9:30 AM-4:45 PM');
    });

    it('formatDateTime uses 12h format', () => {
      expect(formatDateTime(testDate)).toBe('Jan 15, 2025 9:30 AM');
    });
  });

  describe('with custom date formats', () => {
    beforeEach(() => {
      resetFormatCache();
      (loadConfig as jest.Mock).mockReturnValue({
        dateFormat: 'yyyy-MM-dd',
        dateFormatShort: 'dd MMM',
        timeFormat: '24h',
        locale: '',
      });
    });

    it('formatDate uses custom format', () => {
      expect(formatDate(testDate)).toBe('2025-01-15');
    });

    it('formatDateShort uses custom short format', () => {
      expect(formatDateShort(testDate)).toBe('15 Jan');
    });

    it('formatDayDate uses custom short format with day', () => {
      expect(formatDayDate(testDate)).toBe('Wed, 15 Jan');
    });

    it('formatDateRange uses custom formats', () => {
      expect(formatDateRange(testDate, testDate2)).toBe('15 Jan - 2025-01-21');
    });
  });

  describe('cache behavior', () => {
    it('resetFormatCache clears cached values', () => {
      // First call with default config
      expect(formatDate(testDate)).toBe('Jan 15, 2025');

      // Change mock config
      (loadConfig as jest.Mock).mockReturnValue({
        dateFormat: 'yyyy-MM-dd',
        dateFormatShort: 'dd MMM',
        timeFormat: '24h',
        locale: '',
      });

      // Should still use cached config
      expect(formatDate(testDate)).toBe('Jan 15, 2025');

      // After reset, should use new config
      resetFormatCache();
      expect(formatDate(testDate)).toBe('2025-01-15');
    });
  });
});
