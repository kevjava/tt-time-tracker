import * as fs from 'fs';
import * as path from 'path';

// Set up test database path
const testDbPath = '/tmp/tt-test-schedule-import-cmd/test.db';
const testDataDir = '/tmp/tt-test-schedule-import-cmd';
const fixturesDir = path.join(__dirname, '../../../parser/__tests__/fixtures');

// Mock process.exit to prevent actual exits
const mockExit = jest.fn();
jest.spyOn(process, 'exit').mockImplementation(mockExit as any);

// Mock chalk to avoid ESM import issues in Jest
jest.mock('chalk', () => {
  const mockFn = (s: string) => s;
  const mockChalk = {
    green: Object.assign(mockFn, { bold: mockFn }),
    gray: Object.assign(mockFn, { italic: mockFn }),
    red: Object.assign(mockFn, { bold: mockFn }),
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
  const testDbPath = '/tmp/tt-test-schedule-import-cmd/test.db';
  const testDataDir = '/tmp/tt-test-schedule-import-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { scheduleImportCommand } from '../schedule-import';
import { TimeTrackerDB } from '../../../db/database';

describe('schedule import command', () => {
  let db: TimeTrackerDB;
  let consoleLog: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;

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

    // Mock console methods
    consoleLog = jest.spyOn(console, 'log').mockImplementation();
    consoleError = jest.spyOn(console, 'error').mockImplementation();
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    // Clean up
    db.close();
    consoleLog.mockRestore();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  describe('basic functionality', () => {
    it('should import simple file with all metadata preserved', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-simple.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(5);

      // Check first task - morning emails
      const task1 = tasks.find(t => t.description === 'morning emails');
      expect(task1).toBeDefined();
      expect(task1!.project).toBe('admin');
      expect(task1!.tags).toEqual(['emails']);
      expect(task1!.estimateMinutes).toBe(15);
      expect(task1!.priority).toBe(5); // default
      expect(task1!.scheduledDateTime).toBeDefined();
      expect(task1!.scheduledDateTime!.getHours()).toBe(7);

      // Check task with priority - deep work session
      const task2 = tasks.find(t => t.description === 'deep work session');
      expect(task2).toBeDefined();
      expect(task2!.project).toBe('projectX');
      expect(task2!.tags).toEqual(['code']);
      expect(task2!.estimateMinutes).toBe(180); // 3h
      expect(task2!.priority).toBe(2);

      // Check tag-only entry - lunch
      const task3 = tasks.find(t => t.tags.includes('lunch'));
      expect(task3).toBeDefined();
      expect(task3!.project).toBeUndefined();
      expect(task3!.estimateMinutes).toBeUndefined();
    });

    it('should preserve exact scheduledDateTime from file', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-simple.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      const task = tasks.find(t => t.description === 'standup meeting');
      expect(task).toBeDefined();
      expect(task!.scheduledDateTime).toBeDefined();

      const dateTime = task!.scheduledDateTime!;
      expect(dateTime.getFullYear()).toBe(2026);
      expect(dateTime.getMonth()).toBe(0); // January (0-indexed)
      expect(dateTime.getDate()).toBe(10);
      expect(dateTime.getHours()).toBe(8);
      expect(dateTime.getMinutes()).toBe(0);
    });

    it('should use estimateMinutes, not explicitDurationMinutes', () => {
      // Create temporary test file with both estimate and explicit duration
      const testFile = path.join(testDataDir, 'test-durations.log');
      fs.writeFileSync(testFile, '2026-01-10 09:00 test task @project +tag ~1h (30m)');

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(1);

      // Should use estimate (~1h = 60m), not explicit duration (30m)
      expect(tasks[0].estimateMinutes).toBe(60);
    });

    it('should display success message with import count', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-simple.log');
      scheduleImportCommand(fixturePath, {});

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ Imported 5 scheduled task(s)')
      );
    });
  });

  describe('interruption flattening', () => {
    it('should import interruptions as separate scheduled tasks', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-interruptions.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(4);

      // All interruptions should become separate tasks
      const interruption1 = tasks.find(t => t.description === 'quick question from manager');
      expect(interruption1).toBeDefined();
      expect(interruption1!.project).toBe('admin');
      expect(interruption1!.tags).toEqual(['communication']);
      expect(interruption1!.scheduledDateTime!.getHours()).toBe(10);

      const interruption2 = tasks.find(t => t.description === 'coffee break');
      expect(interruption2).toBeDefined();
      expect(interruption2!.tags).toEqual(['break']);
    });

    it('should preserve metadata for indented entries', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-interruptions.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();

      // Check that interruption metadata is preserved
      const task = tasks.find(t => t.description === 'quick question from manager');
      expect(task).toBeDefined();
      expect(task!.project).toBe('admin');
      expect(task!.tags).toEqual(['communication']);

      // Note: explicit duration in parentheses should be ignored
      // (we use estimates, not explicit durations for scheduled tasks)
      expect(task!.estimateMinutes).toBeUndefined();
    });

    it('should have no parent-child relationships', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-interruptions.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      // Scheduled tasks don't have parent_session_id concept
      // Just verify all tasks are imported independently
      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(4);

      // Each task should be independent
      tasks.forEach(task => {
        expect(task.id).toBeDefined();
        expect(task.description).toBeTruthy();
      });
    });
  });

  describe('resume marker handling', () => {
    it('should resolve @prev markers using in-file context', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-resume-markers.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();

      // @prev should resolve to "task two" (the previous task)
      // Note: resume markers only copy the description, not project/tags
      const resolvedTask = tasks.find(t =>
        t.scheduledDateTime?.getHours() === 11 && t.description === 'task two'
      );
      expect(resolvedTask).toBeDefined();
      // Resume markers don't copy project/tags from original, only description
      expect(resolvedTask!.project).toBeUndefined();
      expect(resolvedTask!.tags).toEqual([]);
    });

    it('should resolve @N markers using in-file context', () => {
      const fixturePath = path.join(fixturesDir, 'schedule-import-resume-markers.log');
      scheduleImportCommand(fixturePath, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();

      // @1 should resolve to "task one" (first task in file)
      // Note: resume markers only copy the description, not project/tags
      const resolvedTask = tasks.find(t =>
        t.scheduledDateTime?.getHours() === 12 && t.description === 'task one'
      );
      expect(resolvedTask).toBeDefined();
      // Resume markers don't copy project/tags from original, only description
      expect(resolvedTask!.project).toBeUndefined();
      expect(resolvedTask!.tags).toEqual([]);
    });

    it('should skip @resume markers with warning', () => {
      // Create test file with @resume marker
      const testFile = path.join(testDataDir, 'test-resume.log');
      fs.writeFileSync(testFile, '2026-01-10 09:00 task one\n2026-01-10 10:00 @resume');

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();

      // Should only import the first task, skip @resume
      expect(tasks.length).toBe(1);
      expect(tasks[0].description).toBe('task one');

      // Should display skipped count
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 entry/entries')
      );
    });
  });

  describe('error handling', () => {
    it('should error when file not found', () => {
      scheduleImportCommand('/nonexistent/file.log', {});

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
    });

    it('should error when no file path provided', () => {
      scheduleImportCommand('', {});

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('File path required')
      );
    });

    it('should display parse errors and exit without importing', () => {
      const testFile = path.join(testDataDir, 'test-error.log');
      fs.writeFileSync(testFile, 'invalid log @@@ +++ ~~~ ^^^');

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(0); // Nothing imported

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('parsing error')
      );
    });

    it('should display parse warnings but continue importing', () => {
      // Create file with time going backward (without date, generates warning)
      const testFile = path.join(testDataDir, 'test-warning.log');
      fs.writeFileSync(testFile,
        '2026-01-10 20:00 task one\n' +
        '08:00 task two' // Time went backward, no date - triggers warning
      );

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(2); // Should still import

      // Warning should be displayed
      expect(consoleWarn).toHaveBeenCalled();
    });

    it('should handle empty file gracefully', () => {
      const testFile = path.join(testDataDir, 'test-empty.log');
      fs.writeFileSync(testFile, '');

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(0);

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No entries found')
      );
    });

    it('should handle comment-only file gracefully', () => {
      const testFile = path.join(testDataDir, 'test-comments.log');
      fs.writeFileSync(testFile, '# Just comments\n# Nothing else\n');

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(0);

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No entries found')
      );
    });

    it('should filter out state marker placeholders', () => {
      const testFile = path.join(testDataDir, 'test-markers.log');
      fs.writeFileSync(testFile,
        '2026-01-10 08:00 real task @project +tag\n' +
        '2026-01-10 09:00 @end # marker that creates __END__ placeholder'
      );

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();

      // Should import real task, filter out __END__ placeholder
      // @end marker creates an entry with description "__END__" which we filter
      expect(tasks.length).toBe(1);
      expect(tasks[0].description).toBe('real task');
      expect(tasks.some(t => t.description === '__END__')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should allow duplicate descriptions', () => {
      const testFile = path.join(testDataDir, 'test-duplicates.log');
      fs.writeFileSync(testFile,
        '2026-01-10 09:00 same task @project +tag\n' +
        '2026-01-10 10:00 same task @project +tag\n' +
        '2026-01-10 11:00 same task @project +tag'
      );

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(3);

      const sameTasks = tasks.filter(t => t.description === 'same task');
      expect(sameTasks.length).toBe(3);
    });

    it('should import tasks with missing estimates', () => {
      const testFile = path.join(testDataDir, 'test-no-estimate.log');
      fs.writeFileSync(testFile,
        '2026-01-10 09:00 task without estimate @project +tag'
      );

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(1);
      expect(tasks[0].estimateMinutes).toBeUndefined();
    });

    it('should handle large file efficiently', () => {
      const testFile = path.join(testDataDir, 'test-large.log');
      const lines: string[] = [];

      // Create file with 50 entries
      for (let i = 0; i < 50; i++) {
        const hour = 8 + (i % 10);
        lines.push(`2026-01-10 ${hour.toString().padStart(2, '0')}:00 task ${i} @project +tag ~30m`);
      }
      fs.writeFileSync(testFile, lines.join('\n'));

      scheduleImportCommand(testFile, {});
      reopenDb();

      const tasks = db.getAllScheduledTasks();
      expect(tasks.length).toBe(50);

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ Imported 50 scheduled task(s)')
      );
    });
  });
});
