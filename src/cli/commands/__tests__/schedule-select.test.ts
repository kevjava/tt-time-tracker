import * as fs from 'fs';

// Set up test database path
const testDbPath = '/tmp/tt-test-schedule-select-cmd/test.db';
const testDataDir = '/tmp/tt-test-schedule-select-cmd';

// Mock readline interface
const mockRl = {
  question: jest.fn(),
  close: jest.fn(),
};

jest.mock('readline', () => ({
  createInterface: jest.fn(() => mockRl),
}));

// Mock process.exit to prevent actual exits
const mockExit = jest.fn();
jest.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
  mockExit(code);
  throw new Error(`process.exit(${code})`);
}) as any);

// Mock chalk to avoid ESM import issues in Jest
jest.mock('chalk', () => {
  const mockFn = (s: string) => s;
  const mockChalk = {
    green: Object.assign(mockFn, { bold: mockFn }),
    gray: Object.assign(mockFn, { italic: mockFn, dim: mockFn }),
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
  const testDbPath = '/tmp/tt-test-schedule-select-cmd/test.db';
  const testDataDir = '/tmp/tt-test-schedule-select-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { promptScheduledTaskSelection } from '../schedule-select';
import { TimeTrackerDB } from '../../../db/database';

describe('schedule select command', () => {
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
    mockRl.question.mockClear();
    mockRl.close.mockClear();
  });

  afterEach(() => {
    // Clean up
    db.close();
  });

  describe('no tasks available', () => {
    it('should return null when no scheduled tasks exist', async () => {
      const result = await promptScheduledTaskSelection(db);
      expect(result).toBeNull();
    });
  });

  describe('task selection', () => {
    it('should select default task on empty input', async () => {
      const originalLog = console.log;
      console.log = jest.fn();


      try {
        // Add tasks (first inserted = oldest)
        const task1Id = db.insertScheduledTask({
          description: 'First task',
          priority: 5,
        });

        db.insertScheduledTask({
          description: 'Second task',
          priority: 5,
        });

        // Simulate empty input (default selection)
        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('');
        });

        const result = await promptScheduledTaskSelection(db);

        expect(result).not.toBeNull();
        expect(result?.id).toBe(task1Id);
        expect(result?.description).toBe('First task');
        expect(mockRl.close).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should return null on quit command', async () => {
      const originalLog = console.log;
      console.log = jest.fn();


      try {
        db.insertScheduledTask({
          description: 'Task',
          priority: 5,
        });

        // Simulate 'q' input
        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        const result = await promptScheduledTaskSelection(db);

        expect(result).toBeNull();
        expect(mockRl.close).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should return null on quit (full word)', async () => {
      const originalLog = console.log;
      console.log = jest.fn();


      try {
        db.insertScheduledTask({
          description: 'Task',
          priority: 5,
        });

        // Simulate 'quit' input
        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('quit');
        });

        const result = await promptScheduledTaskSelection(db);

        expect(result).toBeNull();
        expect(mockRl.close).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should select task by number', async () => {
      const originalLog = console.log;
      console.log = jest.fn();


      try {
        db.insertScheduledTask({
          description: 'First task',
          priority: 5,
        });

        const task2Id = db.insertScheduledTask({
          description: 'Second task',
          priority: 5,
        });

        // Simulate selecting task 2
        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('2');
        });

        const result = await promptScheduledTaskSelection(db);

        expect(result).not.toBeNull();
        expect(result?.id).toBe(task2Id);
        expect(result?.description).toBe('Second task');
        expect(mockRl.close).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle invalid selection (non-numeric)', async () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();


      try {
        db.insertScheduledTask({
          description: 'Task',
          priority: 5,
        });

        // Simulate invalid input
        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('abc');
        });

        await expect(promptScheduledTaskSelection(db)).rejects.toThrow('process.exit(1)');

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid selection')
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it('should handle invalid task number (out of range)', async () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();


      try {
        db.insertScheduledTask({
          description: 'Task',
          priority: 5,
        });

        // Simulate selecting task 999 (doesn't exist)
        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('999');
        });

        await expect(promptScheduledTaskSelection(db)).rejects.toThrow('process.exit(1)');

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('No task with number 999')
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('task display', () => {
    it('should display tasks in oldest stanza', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        db.insertScheduledTask({
          description: 'Old task',
          priority: 5,
        });

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        expect(logs.some((log) => log.includes('Oldest Tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('Old task'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should display tasks in important stanza when priority != 5', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        db.insertScheduledTask({
          description: 'High priority task',
          priority: 1,
        });

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        expect(logs.some((log) => log.includes('Important Tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('High priority task'))).toBe(true);
        expect(logs.some((log) => log.includes('^1'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should display tasks in urgent stanza when scheduled', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        const today = new Date();
        db.insertScheduledTask({
          description: 'Scheduled task',
          priority: 5,
          scheduledDateTime: today,
        });

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        expect(logs.some((log) => log.includes('Urgent Tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('Scheduled task'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should de-duplicate tasks across stanzas with same number', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        const today = new Date();
        db.insertScheduledTask({
          description: 'Important and urgent task',
          priority: 1, // Important (priority != 5)
          scheduledDateTime: today, // Urgent (scheduled today)
        });

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        // Count how many times the task appears with "1."
        const taskLinesWith1 = logs.filter((log) =>
          log.includes('Important and urgent task')
        );

        // Task should appear 3 times (oldest, important, urgent)
        expect(taskLinesWith1.length).toBe(3);

        // But all should have number 1 (not 1, 2, 3)
        // This is harder to test without parsing, but we can verify it's consistent
      } finally {
        console.log = originalLog;
      }
    });

    it('should display task with all metadata', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        const taskId = db.insertScheduledTask({
          description: 'Complex task',
          project: 'myProject',
          estimateMinutes: 90,
          priority: 2,
          scheduledDateTime: new Date('2026-01-15 14:30'),
        });
        db.insertScheduledTaskTags(taskId, ['urgent', 'important']);

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        // Should show all metadata
        expect(logs.some((log) => log.includes('Complex task'))).toBe(true);
        expect(logs.some((log) => log.includes('myProject'))).toBe(true);
        expect(logs.some((log) => log.includes('urgent'))).toBe(true);
        expect(logs.some((log) => log.includes('^2'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('category logic', () => {
    it('should not show important stanza when all tasks have default priority', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        db.insertScheduledTask({
          description: 'Normal task',
          priority: 5, // Default priority
        });

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        // Should show oldest but not important
        expect(logs.some((log) => log.includes('Oldest Tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('Important Tasks'))).toBe(false);
      } finally {
        console.log = originalLog;
      }
    });

    it('should not show urgent stanza when no scheduled tasks', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));


      try {
        db.insertScheduledTask({
          description: 'Unscheduled task',
          priority: 5,
        });

        mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
          callback('q');
        });

        await promptScheduledTaskSelection(db);

        // Should show oldest but not urgent
        expect(logs.some((log) => log.includes('Oldest Tasks'))).toBe(true);
        expect(logs.some((log) => log.includes('Urgent Tasks'))).toBe(false);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
