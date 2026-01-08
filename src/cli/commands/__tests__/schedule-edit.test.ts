import * as fs from 'fs';

// Set up test database path
const testDbPath = '/tmp/tt-test-schedule-edit-cmd/test.db';
const testDataDir = '/tmp/tt-test-schedule-edit-cmd';

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
  const testDbPath = '/tmp/tt-test-schedule-edit-cmd/test.db';
  const testDataDir = '/tmp/tt-test-schedule-edit-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { scheduleEditCommand } from '../schedule-edit';
import { TimeTrackerDB } from '../../../db/database';

describe('schedule edit command', () => {
  let db: TimeTrackerDB;

  // Helper to reopen database after command execution
  const reopenDb = () => {
    db.close();
    db = new TimeTrackerDB(testDbPath);
  };

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

  describe('validation', () => {
    it('should reject invalid task ID (non-numeric)', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        scheduleEditCommand('abc', undefined, { description: 'New desc' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid task ID')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject non-existent task ID', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        scheduleEditCommand('999', undefined, { description: 'New desc' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('not found')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject when no updates provided', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        // Create a task
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('No updates provided')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid priority (out of range)', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, { priority: '10' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Priority must be between 1 and 9')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid estimate format', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, { estimate: 'invalid' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid estimate format')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid scheduled date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, { scheduled: 'not-a-date' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Unable to parse scheduled time')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('editing single fields', () => {
    it('should edit description', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Old description',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, {
          description: 'New description',
        });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.description).toBe('New description');
      } finally {
        console.log = originalLog;
      }
    });

    it('should edit project', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          project: 'oldProject',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, {
          project: 'newProject',
        });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.project).toBe('newProject');
      } finally {
        console.log = originalLog;
      }
    });

    it('should edit tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });
        db.insertScheduledTaskTags(taskId, ['oldTag']);

        scheduleEditCommand(taskId.toString(), undefined, {
          tags: 'newTag1,newTag2',
        });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.tags).toEqual(['newTag1', 'newTag2']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should clear tags with empty string', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });
        db.insertScheduledTaskTags(taskId, ['tag1', 'tag2']);

        scheduleEditCommand(taskId.toString(), undefined, { tags: '' });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.tags).toEqual([]);
      } finally {
        console.log = originalLog;
      }
    });

    it('should edit estimate', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          estimateMinutes: 60,
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, { estimate: '2h' });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.estimateMinutes).toBe(120);
      } finally {
        console.log = originalLog;
      }
    });

    it('should edit priority', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, { priority: '1' });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.priority).toBe(1);
      } finally {
        console.log = originalLog;
      }
    });

    it('should edit scheduled date', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, {
          scheduled: '2026-01-15 10:00',
        });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.scheduledDateTime).toBeDefined();
        expect(task?.scheduledDateTime?.toISOString()).toContain('2026-01-15');
      } finally {
        console.log = originalLog;
      }
    });

    it('should clear scheduled date with empty string', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Test task',
          scheduledDateTime: new Date('2026-01-10 10:00'),
          priority: 5,
        });

        scheduleEditCommand(taskId.toString(), undefined, { scheduled: '' });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.scheduledDateTime).toBeUndefined();
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('editing multiple fields', () => {
    it('should edit multiple fields at once', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Old task',
          project: 'oldProject',
          estimateMinutes: 30,
          priority: 5,
        });
        db.insertScheduledTaskTags(taskId, ['oldTag']);

        scheduleEditCommand(taskId.toString(), undefined, {
          description: 'New task',
          project: 'newProject',
          tags: 'newTag1,newTag2',
          estimate: '2h',
          priority: '2',
          scheduled: '2026-01-20 14:00',
        });
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.description).toBe('New task');
        expect(task?.project).toBe('newProject');
        expect(task?.tags).toEqual(['newTag1', 'newTag2']);
        expect(task?.estimateMinutes).toBe(120);
        expect(task?.priority).toBe(2);
        expect(task?.scheduledDateTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('log notation parsing', () => {
    it('should parse log notation and apply updates', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Old task',
          priority: 5,
        });

        scheduleEditCommand(
          taskId.toString(),
          'Updated task @newProject +tag1 +tag2 ~1h ^3',
          {}
        );
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.description).toBe('Updated task');
        expect(task?.project).toBe('newProject');
        expect(task?.tags).toEqual(['tag1', 'tag2']);
        expect(task?.estimateMinutes).toBe(60);
        expect(task?.priority).toBe(3);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with scheduled date', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Old task',
          priority: 5,
        });

        scheduleEditCommand(
          taskId.toString(),
          '2026-01-15 09:00 Morning meeting @team',
          {}
        );
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.description).toBe('Morning meeting');
        expect(task?.project).toBe('team');
        expect(task?.scheduledDateTime).toBeDefined();
        expect(task?.scheduledDateTime?.toISOString()).toContain('2026-01-15');
      } finally {
        console.log = originalLog;
      }
    });

    it('should allow flags to override log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Old task',
          priority: 5,
        });

        scheduleEditCommand(
          taskId.toString(),
          'Task from notation @oldProject +oldTag ^5',
          {
            project: 'newProject',
            tags: 'newTag',
            priority: '1',
          }
        );
        reopenDb();

        const task = db.getScheduledTaskById(taskId);
        expect(task?.description).toBe('Task from notation');
        expect(task?.project).toBe('newProject'); // Flag overrides notation
        expect(task?.tags).toEqual(['newTag']); // Flag overrides notation
        expect(task?.priority).toBe(1); // Flag overrides notation
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('display output', () => {
    it('should display current task details and changes', () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        const taskId = db.insertScheduledTask({
          description: 'Original task',
          project: 'oldProject',
          priority: 5,
        });
        db.insertScheduledTaskTags(taskId, ['oldTag']);

        scheduleEditCommand(taskId.toString(), undefined, {
          description: 'Updated task',
          priority: '2',
        });

        // Should show current task details
        expect(logs.some((log) => log.includes('Current scheduled task'))).toBe(true);
        expect(logs.some((log) => log.includes('Original task'))).toBe(true);

        // Should show changes
        expect(logs.some((log) => log.includes('updated successfully'))).toBe(true);
        expect(logs.some((log) => log.includes('Changes made'))).toBe(true);
        expect(logs.some((log) => log.includes('Updated task'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
