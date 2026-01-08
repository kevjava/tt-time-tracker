import * as fs from 'fs';

// Set up test database path
const testDbPath = '/tmp/tt-test-schedule-remove-cmd/test.db';
const testDataDir = '/tmp/tt-test-schedule-remove-cmd';

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
  const testDbPath = '/tmp/tt-test-schedule-remove-cmd/test.db';
  const testDataDir = '/tmp/tt-test-schedule-remove-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { scheduleRemoveCommand } from '../schedule-remove';
import { TimeTrackerDB } from '../../../db/database';

describe('schedule remove command', () => {
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
    it('should reject when task ID is not provided', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        await scheduleRemoveCommand('');

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Task ID required')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid task ID (non-numeric)', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        await scheduleRemoveCommand('abc');

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid task ID')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject non-existent task ID', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        await scheduleRemoveCommand('999');

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('not found')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('successful removal', () => {
    it('should remove task and show confirmation', async () => {
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = jest.fn((msg) => logs.push(msg));

      try {
        const taskId = db.insertScheduledTask({
          description: 'Task to remove',
          priority: 5,
        });

        await scheduleRemoveCommand(taskId.toString(), { yes: true });
        reopenDb();

        // Should show success message
        expect(logs.some((log) => log && log.includes('Removed scheduled task'))).toBe(true);
        expect(logs.some((log) => log && log.includes('Task to remove'))).toBe(true);

        // Task should be deleted
        const task = db.getScheduledTaskById(taskId);
        expect(task).toBeNull();
      } finally {
        console.log = originalLog;
      }
    });

    it('should cascade delete tags when removing task', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Task with tags',
          priority: 5,
        });
        db.insertScheduledTaskTags(taskId, ['tag1', 'tag2', 'tag3']);

        // Verify tags exist
        const tagsBeforeDelete = db.getScheduledTaskTags(taskId);
        expect(tagsBeforeDelete).toEqual(['tag1', 'tag2', 'tag3']);

        await scheduleRemoveCommand(taskId.toString(), { yes: true });
        reopenDb();

        // Task should be deleted
        const task = db.getScheduledTaskById(taskId);
        expect(task).toBeNull();

        // Tags should be cascade deleted (trying to get tags for deleted task)
        const tagsAfterDelete = db.getScheduledTaskTags(taskId);
        expect(tagsAfterDelete).toEqual([]);
      } finally {
        console.log = originalLog;
      }
    });

    it('should remove only the specified task (not others)', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId1 = db.insertScheduledTask({
          description: 'Task 1',
          priority: 5,
        });

        const taskId2 = db.insertScheduledTask({
          description: 'Task 2',
          priority: 5,
        });

        const taskId3 = db.insertScheduledTask({
          description: 'Task 3',
          priority: 5,
        });

        // Remove task 2
        await scheduleRemoveCommand(taskId2.toString(), { yes: true });
        reopenDb();

        // Task 2 should be deleted
        expect(db.getScheduledTaskById(taskId2)).toBeNull();

        // Tasks 1 and 3 should still exist
        expect(db.getScheduledTaskById(taskId1)).not.toBeNull();
        expect(db.getScheduledTaskById(taskId3)).not.toBeNull();

        const allTasks = db.getAllScheduledTasks();
        expect(allTasks).toHaveLength(2);
        expect(allTasks.map((t) => t.description)).toEqual(['Task 1', 'Task 3']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should remove task with all metadata fields', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const taskId = db.insertScheduledTask({
          description: 'Complex task',
          project: 'myProject',
          estimateMinutes: 120,
          priority: 2,
          scheduledDateTime: new Date('2026-01-10 14:00'),
        });
        db.insertScheduledTaskTags(taskId, ['important', 'urgent']);

        // Verify task exists with all data
        const taskBeforeDelete = db.getScheduledTaskById(taskId);
        expect(taskBeforeDelete?.description).toBe('Complex task');
        expect(taskBeforeDelete?.project).toBe('myProject');
        expect(taskBeforeDelete?.estimateMinutes).toBe(120);
        expect(taskBeforeDelete?.priority).toBe(2);
        expect(taskBeforeDelete?.tags).toEqual(['important', 'urgent']);

        await scheduleRemoveCommand(taskId.toString(), { yes: true });
        reopenDb();

        // Task should be completely deleted
        const taskAfterDelete = db.getScheduledTaskById(taskId);
        expect(taskAfterDelete).toBeNull();
      } finally {
        console.log = originalLog;
      }
    });
  });
});
