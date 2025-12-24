import { parseDuration, formatDuration } from '../duration';
import { ParseError } from '../../types/errors';

describe('parseDuration', () => {
  describe('valid formats', () => {
    it('should parse hours only', () => {
      expect(parseDuration('2h')).toBe(120);
      expect(parseDuration('1h')).toBe(60);
      expect(parseDuration('10h')).toBe(600);
    });

    it('should parse minutes only', () => {
      expect(parseDuration('30m')).toBe(30);
      expect(parseDuration('1m')).toBe(1);
      expect(parseDuration('45m')).toBe(45);
    });

    it('should parse hours and minutes', () => {
      expect(parseDuration('1h30m')).toBe(90);
      expect(parseDuration('2h15m')).toBe(135);
      expect(parseDuration('10h5m')).toBe(605);
    });

    it('should handle whitespace', () => {
      expect(parseDuration(' 2h ')).toBe(120);
      expect(parseDuration(' 1h30m ')).toBe(90);
    });
  });

  describe('invalid formats', () => {
    it('should reject empty string', () => {
      expect(() => parseDuration('')).toThrow(ParseError);
      expect(() => parseDuration('   ')).toThrow(ParseError);
    });

    it('should reject invalid format', () => {
      expect(() => parseDuration('2')).toThrow(ParseError);
      expect(() => parseDuration('h')).toThrow(ParseError);
      expect(() => parseDuration('m')).toThrow(ParseError);
      expect(() => parseDuration('2.5h')).toThrow(ParseError);
      expect(() => parseDuration('1hour')).toThrow(ParseError);
      expect(() => parseDuration('30 minutes')).toThrow(ParseError);
    });

    it('should reject zero duration', () => {
      expect(() => parseDuration('0h')).toThrow(ParseError);
      expect(() => parseDuration('0m')).toThrow(ParseError);
      expect(() => parseDuration('0h0m')).toThrow(ParseError);
    });

    it('should reject negative values', () => {
      expect(() => parseDuration('-1h')).toThrow(ParseError);
      expect(() => parseDuration('-30m')).toThrow(ParseError);
    });

    it('should reject minutes >= 60', () => {
      expect(() => parseDuration('60m')).toThrow(ParseError);
      expect(() => parseDuration('1h60m')).toThrow(ParseError);
      expect(() => parseDuration('90m')).toThrow(ParseError);
    });

    it('should reject wrong order', () => {
      expect(() => parseDuration('30m2h')).toThrow(ParseError);
    });

    it('should reject null or undefined', () => {
      expect(() => parseDuration(null as any)).toThrow(ParseError);
      expect(() => parseDuration(undefined as any)).toThrow(ParseError);
    });
  });

  describe('error messages', () => {
    it('should provide helpful error messages', () => {
      expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
      expect(() => parseDuration('90m')).toThrow('Minutes must be less than 60');
      expect(() => parseDuration('0h')).toThrow('Duration must specify hours and/or minutes');
    });
  });
});

describe('formatDuration', () => {
  it('should format hours only', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(600)).toBe('10h');
  });

  it('should format minutes only', () => {
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(1)).toBe('1m');
    expect(formatDuration(45)).toBe('45m');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h30m');
    expect(formatDuration(135)).toBe('2h15m');
    expect(formatDuration(605)).toBe('10h5m');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('should reject negative values', () => {
    expect(() => formatDuration(-1)).toThrow();
  });
});
