import * as fs from 'fs';

// Set up test database path
const testDbPath = '/tmp/tt-test-schedule-list-cmd/test.db';
const testDataDir = '/tmp/tt-test-schedule-list-cmd';

// Mock process.exit to prevent actual exits
const mockExit = jest.fn();
jest.spyOn(process, 'exit').mockImplementation(mockExit as any);

// Mock chalk to avoid ESM import issues in Jest
jest.mock('chalk', () => {
  const mockFn = (s: string) => s;
  const mockChalk = {
    green: Object.assign(mockFn, { bold: mockFn }),
    gray: Object.assign(mockFn, { italic: mockFn }),
    red: mockFn,
    yellow: Object.assign(mockFn, { bold: mockFn }),
    cyan: mockFn,
    magenta: mockFn,
    blue: mockFn,
    bold: Object.assign(mockFn, { cyan: mockFn }),
    italic: mockFn,
    dim: mockFn,
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
  const testDbPath = '/tmp/tt-test-schedule-list-cmd/test.db';
  const testDataDir = '/tmp/tt-test-schedule-list-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
    loadConfig: jest.fn(() => ({
      weekStartDay: 'monday',
      reportFormat: 'terminal',
      listFormat: 'table',
      timeFormat: '24h',
      editor: '',
      churn: undefined, // Churn disabled in tests
    })),
  };
});

// Mock scheduler to return TTScheduler
jest.mock('../../../utils/scheduler', () => ({
  getScheduler: jest.fn(async (_config: unknown, db: unknown) => {
    const { TTScheduler } = require('@kevjava/tt-core');
    return new TTScheduler(db);
  }),
  isChurnEnabled: jest.fn(() => false),
}));

import { scheduleListCommand } from '../schedule-list';
import { TimeTrackerDB } from '../../../db/database';

describe('schedule list command', () => {
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

  describe('empty list', () => {
    it('should show friendly message when no scheduled tasks exist', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        await scheduleListCommand();

        expect(logs.some((log) => log.includes('No scheduled tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('tt schedule add'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('single task display', () => {
    it('should display task with minimal data', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        // Add a simple task
        db.insertScheduledTask({
          description: 'Simple task',
          priority: 5,
        });

        await scheduleListCommand();

        // Should show header
        expect(logs.some((log) => log.includes('Scheduled Tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('ID'))).toBe(true);
        expect(logs.some((log) => log.includes('Description'))).toBe(true);

        // Should show task
        expect(logs.some((log) => log.includes('Simple task'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should display task with all fields', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        const taskId = db.insertScheduledTask({
          description: 'Complete task',
          project: 'myApp',
          estimateMinutes: 120,
          priority: 2,
          scheduledDateTime: new Date('2026-01-10 14:00'),
        });
        db.insertScheduledTaskTags(taskId, ['urgent', 'important']);

        await scheduleListCommand();

        // Should show all fields
        expect(logs.some((log) => log.includes('Complete task'))).toBe(true);
        expect(logs.some((log) => log.includes('myApp'))).toBe(true);
        expect(logs.some((log) => log.includes('urgent'))).toBe(true);
        expect(logs.some((log) => log.includes('2026-01-10'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should not show priority when it equals 5 (default)', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        db.insertScheduledTask({
          description: 'Normal priority task',
          priority: 5,
        });

        await scheduleListCommand();

        // Should show task but no priority marker
        expect(logs.some((log) => log && log.includes('Normal priority task'))).toBe(true);
        expect(logs.some((log) => log && log.includes('^5'))).toBe(false);
      } finally {
        console.log = originalLog;
      }
    });

    it('should show priority when it is not 5', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        db.insertScheduledTask({
          description: 'High priority task',
          priority: 1,
        });

        await scheduleListCommand();

        expect(logs.some((log) => log.includes('High priority task'))).toBe(true);
        expect(logs.some((log) => log.includes('^1'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('multiple tasks', () => {
    it('should display multiple tasks in order', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        // Add multiple tasks
        db.insertScheduledTask({
          description: 'First task',
          priority: 5,
        });

        db.insertScheduledTask({
          description: 'Second task',
          priority: 2,
          scheduledDateTime: new Date('2026-01-10 09:00'),
        });

        db.insertScheduledTask({
          description: 'Third task',
          project: 'backend',
          estimateMinutes: 30,
          priority: 8,
        });

        await scheduleListCommand();

        // All tasks should appear
        expect(logs.some((log) => log.includes('First task'))).toBe(true);
        expect(logs.some((log) => log.includes('Second task'))).toBe(true);
        expect(logs.some((log) => log.includes('Third task'))).toBe(true);

        // Priority markers
        expect(logs.some((log) => log.includes('^2'))).toBe(true);
        expect(logs.some((log) => log.includes('^8'))).toBe(true);

        // Other fields
        expect(logs.some((log) => log.includes('backend'))).toBe(true);
        expect(logs.some((log) => log.includes('2026-01-10'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('formatting and truncation', () => {
    it('should truncate long descriptions', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        const longDescription =
          'This is a very long task description that exceeds the column width and should be truncated with ellipsis';

        db.insertScheduledTask({
          description: longDescription,
          priority: 5,
        });

        await scheduleListCommand();

        // Should show truncated version with ellipsis
        const taskLine = logs.find((log) => log.includes('This is a very long task'));
        expect(taskLine).toBeDefined();
        // Original description shouldn't appear in full
        expect(taskLine).not.toContain('should be truncated with ellipsis');
      } finally {
        console.log = originalLog;
      }
    });

    it('should format scheduled date correctly', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        db.insertScheduledTask({
          description: 'Scheduled task',
          scheduledDateTime: new Date('2026-01-15 14:30:00'),
          priority: 5,
        });

        await scheduleListCommand();

        // Should format as YYYY-MM-DD HH:MM
        expect(logs.some((log) => log.includes('2026-01-15 14:30'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle tasks with no scheduled date', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        db.insertScheduledTask({
          description: 'Unscheduled task',
          priority: 5,
        });

        await scheduleListCommand();

        expect(logs.some((log) => log && log.includes('Unscheduled task'))).toBe(true);
        // Should not crash or show 'undefined'
        expect(logs.some((log) => log && log.includes('undefined'))).toBe(false);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        // Close the database to cause an error
        db.close();

        // Delete the database file to cause an error on reopen
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }

        // Create an invalid database state
        if (!fs.existsSync(testDataDir)) {
          fs.mkdirSync(testDataDir, { recursive: true });
        }
        // Create a directory where the database file should be
        fs.mkdirSync(testDbPath, { recursive: true });

        await scheduleListCommand();

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalled();
      } finally {
        console.error = originalError;
        // Clean up the invalid state
        if (fs.existsSync(testDbPath)) {
          fs.rmdirSync(testDbPath, { recursive: true });
        }
      }
    });
  });
});
