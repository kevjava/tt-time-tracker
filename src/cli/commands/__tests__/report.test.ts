import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-report-cmd/test.db';
const testDataDir = '/tmp/tt-test-report-cmd';

// Mock process.exit to prevent actual exits
const mockExit = jest.fn();
jest.spyOn(process, 'exit').mockImplementation(mockExit as any);

// Mock chalk to avoid ESM import issues in Jest
jest.mock('chalk', () => {
  const mockFn = (s: string) => s;
  const mockChalk = {
    green: Object.assign(mockFn, { bold: mockFn }),
    gray: mockFn,
    red: mockFn,
    yellow: Object.assign(mockFn, { bold: mockFn }),
    blue: mockFn,
    cyan: mockFn,
    bold: Object.assign(mockFn, {
      cyan: mockFn,
      yellow: mockFn,
      green: mockFn,
    }),
  };
  return {
    default: mockChalk,
    ...mockChalk,
  };
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    setVerbose: jest.fn(),
  },
}));

// Mock config to use test paths
jest.mock('../../../utils/config', () => {
  const fs = require('fs');
  const testDbPath = '/tmp/tt-test-report-cmd/test.db';
  const testDataDir = '/tmp/tt-test-report-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { reportCommand } from '../report';
import { TimeTrackerDB } from '../../../db/database';

describe('report command', () => {
  let db: TimeTrackerDB;

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Clean up any existing database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new TimeTrackerDB(testDbPath);

    // Clear mock calls
    mockExit.mockClear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    db.close();
  });

  describe('basic functionality', () => {
    it('should generate report for current week', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create some sessions this week - use today to ensure it's in range
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: 'Morning work',
          project: 'myApp',
          state: 'completed',
        });

        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Project name appears in TIME BY PROJECT section
        expect(output).toContain('TIME BY PROJECT');
        expect(output).toContain('myApp');
      } finally {
        console.log = originalLog;
      }
    });

    it('should generate report for last week', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create session from last week
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        lastWeek.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: lastWeek,
          endTime: new Date(lastWeek.getTime() + 7200000),
          description: 'Last week work',
          project: 'oldProject',
          state: 'completed',
        });

        reportCommand({ week: 'last' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('oldProject');
      } finally {
        console.log = originalLog;
      }
    });

    it('should generate report for custom date range', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create sessions in January
        const jan15 = new Date('2024-01-15T10:00:00');
        const jan16 = new Date('2024-01-16T10:00:00');

        db.insertSession({
          startTime: jan15,
          endTime: new Date(jan15.getTime() + 3600000),
          description: 'Jan 15 work',
          state: 'completed',
        });

        db.insertSession({
          startTime: jan16,
          endTime: new Date(jan16.getTime() + 3600000),
          description: 'Jan 16 work',
          state: 'completed',
        });

        reportCommand({ from: '2024-01-15', to: '2024-01-16' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Jan 15');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle only --from flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: yesterday,
          endTime: new Date(yesterday.getTime() + 3600000),
          description: 'Recent work',
          state: 'completed',
        });

        reportCommand({ from: 'yesterday' });

        expect(console.log).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle only --to flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const longAgo = new Date('2020-01-01T10:00:00');

        db.insertSession({
          startTime: longAgo,
          endTime: new Date(longAgo.getTime() + 3600000),
          description: 'Old work',
          state: 'completed',
        });

        reportCommand({ to: 'yesterday' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Check for non-zero time in report
        expect(output).toContain('Total Time: 1h');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('filters', () => {
    beforeEach(() => {
      // Create test sessions
      const today = new Date();
      today.setHours(10, 0, 0, 0);

      const session1Id = db.insertSession({
        startTime: today,
        endTime: new Date(today.getTime() + 3600000),
        description: 'Project A work',
        project: 'projectA',
        state: 'completed',
      });

      const session2Id = db.insertSession({
        startTime: new Date(today.getTime() + 3600000),
        endTime: new Date(today.getTime() + 7200000),
        description: 'Project B work',
        project: 'projectB',
        state: 'completed',
      });

      db.insertSessionTags(session1Id, ['code', 'feature']);
      db.insertSessionTags(session2Id, ['meeting', 'planning']);
    });

    it('should filter by project', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current', project: 'projectA' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('projectA');
        expect(output).not.toContain('projectB');
      } finally {
        console.log = originalLog;
      }
    });

    it('should filter by single tag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current', tag: 'meeting' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('meeting');
      } finally {
        console.log = originalLog;
      }
    });

    it('should filter by multiple tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current', tag: 'code,feature' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('code');
      } finally {
        console.log = originalLog;
      }
    });

    it('should combine project and tag filters', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current', project: 'projectA', tag: 'code' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('projectA');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('output formats', () => {
    beforeEach(() => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);

      db.insertSession({
        startTime: today,
        endTime: new Date(today.getTime() + 3600000),
        description: 'Test session',
        project: 'testProject',
        state: 'completed',
      });
    });

    it('should output terminal format by default', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Terminal format contains formatted text
        expect(output).toContain('testProject');
      } finally {
        console.log = originalLog;
      }
    });

    it('should output JSON format', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current', format: 'json' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls[0][0];

        // Should be valid JSON
        expect(() => JSON.parse(output)).not.toThrow();
        const parsed = JSON.parse(output);
        expect(parsed).toHaveProperty('summary');
        expect(parsed.summary).toHaveProperty('totalMinutes');
        expect(parsed).toHaveProperty('weekLabel');
      } finally {
        console.log = originalLog;
      }
    });

    it('should output CSV format', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current', format: 'csv' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls[0][0];

        // CSV should contain headers
        expect(output).toContain('Project,');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error on invalid --from date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        reportCommand({ from: 'invalid-date-string' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing --from date')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error on invalid --to date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        reportCommand({ to: 'not-a-real-date' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing --to date')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should handle no sessions found gracefully', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        reportCommand({ week: 'current' });

        expect(mockExit).toHaveBeenCalledWith(0);
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No sessions found')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle empty project filter result', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: 'Work',
          project: 'projectA',
          state: 'completed',
        });

        reportCommand({ week: 'current', project: 'nonExistentProject' });

        expect(mockExit).toHaveBeenCalledWith(0);
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No sessions found')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 1800000),
          description: 'Solo task',
          state: 'completed',
        });

        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Check for time in report
        expect(output).toContain('Total Time: 30m');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle sessions without projects', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: 'No project work',
          state: 'completed',
        });

        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Sessions without projects should still show time
        expect(output).toContain('Total Time: 1h');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle sessions with interruptions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        const parentId = db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 7200000),
          description: 'Main task',
          project: 'myApp',
          state: 'completed',
        });

        db.insertSession({
          startTime: new Date(today.getTime() + 1800000),
          endTime: new Date(today.getTime() + 3600000),
          description: 'Interruption',
          parentSessionId: parentId,
          state: 'completed',
        });

        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle large number of sessions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(9, 0, 0, 0);

        // Create 50 sessions
        for (let i = 0; i < 50; i++) {
          const start = new Date(today.getTime() + i * 3600000);
          db.insertSession({
            startTime: start,
            endTime: new Date(start.getTime() + 1800000),
            description: `Session ${i}`,
            project: `project${i % 3}`,
            state: 'completed',
          });
        }

        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle sessions spanning multiple days', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const monday = new Date();
        monday.setDate(monday.getDate() - monday.getDay() + 1); // Monday
        monday.setHours(9, 0, 0, 0);

        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        friday.setHours(17, 0, 0, 0);

        db.insertSession({
          startTime: monday,
          endTime: new Date(monday.getTime() + 3600000),
          description: 'Monday work',
          state: 'completed',
        });

        db.insertSession({
          startTime: friday,
          endTime: new Date(friday.getTime() + 3600000),
          description: 'Friday work',
          state: 'completed',
        });

        reportCommand({ week: 'current' });

        expect(console.log).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });
  });
});
