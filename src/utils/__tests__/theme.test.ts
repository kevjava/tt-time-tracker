// Mock chalk to avoid ESM issues in Jest
jest.mock('chalk', () => {
  const mockFn = (str: string) => str;
  const mockChalk: any = {
    red: mockFn,
    yellow: mockFn,
    cyan: mockFn,
    gray: mockFn,
    green: mockFn,
    blue: mockFn,
    magenta: mockFn,
    white: mockFn,
    bold: {
      cyan: mockFn,
    },
    dim: mockFn,
    italic: mockFn,
  };

  // Add chaining support
  mockChalk.gray.italic = mockFn;
  mockChalk.bold.cyan = mockFn;

  return {
    __esModule: true,
    default: mockChalk,
  };
});

import {
  formatProject,
  formatTag,
  formatTags,
  formatDuration,
  formatEstimate,
  formatRemark,
  formatState,
  formatStateIcon,
  progressBar,
} from '../theme';

describe('theme', () => {
  describe('formatProject', () => {
    it('should include @ prefix', () => {
      expect(formatProject('myproject')).toContain('@myproject');
    });

    it('should handle empty project names', () => {
      expect(formatProject('')).toContain('@');
    });

    it('should handle special characters', () => {
      expect(formatProject('my-project_123')).toContain('@my-project_123');
    });
  });

  describe('formatTag', () => {
    it('should include + prefix', () => {
      expect(formatTag('coding')).toContain('+coding');
    });

    it('should handle empty tag names', () => {
      expect(formatTag('')).toContain('+');
    });
  });

  describe('formatTags', () => {
    it('should join multiple tags with spaces', () => {
      const result = formatTags(['tag1', 'tag2', 'tag3']);
      expect(result).toContain('+tag1');
      expect(result).toContain('+tag2');
      expect(result).toContain('+tag3');
    });

    it('should handle empty array', () => {
      expect(formatTags([])).toBe('');
    });

    it('should handle single tag', () => {
      const result = formatTags(['solo']);
      expect(result).toContain('+solo');
    });
  });

  describe('formatDuration', () => {
    it('should format minutes only', () => {
      expect(formatDuration(45)).toContain('45m');
    });

    it('should format hours only', () => {
      expect(formatDuration(120)).toContain('2h');
    });

    it('should format hours and minutes', () => {
      const result = formatDuration(150);
      expect(result).toContain('2h');
      expect(result).toContain('30m');
    });

    it('should round minutes', () => {
      expect(formatDuration(45.7)).toContain('46m');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toContain('0m');
    });
  });

  describe('formatEstimate', () => {
    it('should include ~ prefix', () => {
      expect(formatEstimate(60)).toContain('~');
    });

    it('should format minutes only', () => {
      const result = formatEstimate(45);
      expect(result).toContain('~');
      expect(result).toContain('45m');
    });

    it('should format hours only', () => {
      const result = formatEstimate(120);
      expect(result).toContain('~');
      expect(result).toContain('2h');
    });

    it('should format hours and minutes without space', () => {
      const result = formatEstimate(150);
      expect(result).toContain('~');
      expect(result).toContain('2h30m');
    });

    it('should handle zero estimate', () => {
      expect(formatEstimate(0)).toContain('~0m');
    });
  });

  describe('formatRemark', () => {
    it('should include # prefix', () => {
      expect(formatRemark('my remark')).toContain('# my remark');
    });

    it('should handle empty remarks', () => {
      expect(formatRemark('')).toContain('# ');
    });

    it('should handle special characters', () => {
      expect(formatRemark('fixed bug #123')).toContain('# fixed bug #123');
    });
  });

  describe('formatState', () => {
    it('should format working state with icon and text', () => {
      const result = formatState('working');
      expect(result).toContain('▶');
      expect(result).toContain('Working');
    });

    it('should format paused state with icon and text', () => {
      const result = formatState('paused');
      expect(result).toContain('⏸');
      expect(result).toContain('Paused');
    });

    it('should format completed state with icon and text', () => {
      const result = formatState('completed');
      expect(result).toContain('✓');
      expect(result).toContain('Completed');
    });

    it('should format abandoned state with icon and text', () => {
      const result = formatState('abandoned');
      expect(result).toContain('✗');
      expect(result).toContain('Abandoned');
    });
  });

  describe('formatStateIcon', () => {
    it('should return only icon for working state', () => {
      const result = formatStateIcon('working');
      expect(result).toContain('▶');
      expect(result).not.toContain('Working');
    });

    it('should return only icon for paused state', () => {
      const result = formatStateIcon('paused');
      expect(result).toContain('⏸');
      expect(result).not.toContain('Paused');
    });

    it('should return only icon for completed state', () => {
      const result = formatStateIcon('completed');
      expect(result).toContain('✓');
      expect(result).not.toContain('Completed');
    });

    it('should return only icon for abandoned state', () => {
      const result = formatStateIcon('abandoned');
      expect(result).toContain('✗');
      expect(result).not.toContain('Abandoned');
    });
  });

  describe('progressBar', () => {
    it('should create progress bar with default width', () => {
      const result = progressBar(50);
      expect(result).toContain('█');
      expect(result).toContain('░');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create progress bar with custom width', () => {
      const result = progressBar(50, 10);
      expect(result).toContain('█');
      expect(result).toContain('░');
    });

    it('should handle 0% progress', () => {
      const result = progressBar(0);
      expect(result).toContain('░');
    });

    it('should handle 100% progress', () => {
      const result = progressBar(100);
      expect(result).toContain('█');
    });
  });
});
