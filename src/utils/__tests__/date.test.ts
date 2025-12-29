import { parseFuzzyDate } from '../date';

describe('parseFuzzyDate', () => {
  const referenceDate = new Date('2025-12-28T12:00:00.000Z'); // Sunday, Dec 28, 2025, noon UTC

  describe('ISO date format (YYYY-MM-DD)', () => {
    it('should parse ISO date format', () => {
      const result = parseFuzzyDate('2025-12-25', referenceDate);
      // ISO dates might be parsed with timezone offset, so check the date string representation
      const dateStr = result.toISOString().split('T')[0];
      expect(dateStr).toBe('2025-12-25');
    });

    it('should parse another ISO date', () => {
      const result = parseFuzzyDate('2024-01-15', referenceDate);
      const dateStr = result.toISOString().split('T')[0];
      expect(dateStr).toBe('2024-01-15');
    });
  });

  describe('natural language - relative days', () => {
    it('should parse "today"', () => {
      const result = parseFuzzyDate('today', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(28);
    });

    it('should parse "yesterday"', () => {
      const result = parseFuzzyDate('yesterday', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(27);
    });

    it('should parse "tomorrow"', () => {
      const result = parseFuzzyDate('tomorrow', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(29);
    });

    it('should parse "2 days ago"', () => {
      const result = parseFuzzyDate('2 days ago', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(26);
    });

    it('should parse "3 days ago"', () => {
      const result = parseFuzzyDate('3 days ago', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(25);
    });
  });

  describe('natural language - day names', () => {
    it('should parse "monday" (next Monday)', () => {
      // Reference is Sunday Dec 28, so "monday" resolves to next Monday (Dec 29)
      const result = parseFuzzyDate('monday', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(29);
    });

    it('should parse "last monday"', () => {
      const result = parseFuzzyDate('last monday', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(22);
    });

    it('should parse "last friday"', () => {
      // Reference is Sunday Dec 28, last Friday was Dec 26
      const result = parseFuzzyDate('last friday', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(26);
    });

    it('should parse "next monday"', () => {
      // Reference is Sunday Dec 28, next Monday is Dec 29
      const result = parseFuzzyDate('next monday', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(29);
    });
  });

  describe('natural language - weeks', () => {
    it('should parse "last week"', () => {
      const result = parseFuzzyDate('last week', referenceDate);
      // Should be around Dec 21 (7 days ago)
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(21);
    });

    it('should parse "2 weeks ago"', () => {
      const result = parseFuzzyDate('2 weeks ago', referenceDate);
      // Should be around Dec 14
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(14);
    });
  });

  describe('natural language - months', () => {
    it('should parse "last month"', () => {
      const result = parseFuzzyDate('last month', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(10); // November
      expect(result.getDate()).toBe(28);
    });

    it('should parse "2 months ago"', () => {
      const result = parseFuzzyDate('2 months ago', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(9); // October
      expect(result.getDate()).toBe(28);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid date string', () => {
      expect(() => parseFuzzyDate('not a date')).toThrow('Unable to parse date');
    });

    it('should throw error for empty string', () => {
      expect(() => parseFuzzyDate('')).toThrow('Unable to parse date');
    });

    it('should throw error for random text', () => {
      expect(() => parseFuzzyDate('xyzabc123')).toThrow('Unable to parse date');
    });
  });

  describe('case sensitivity', () => {
    it('should parse "Yesterday" (capitalized)', () => {
      const result = parseFuzzyDate('Yesterday', referenceDate);
      expect(result.getDate()).toBe(27);
    });

    it('should parse "TOMORROW" (uppercase)', () => {
      const result = parseFuzzyDate('TOMORROW', referenceDate);
      expect(result.getDate()).toBe(29);
    });
  });
});
