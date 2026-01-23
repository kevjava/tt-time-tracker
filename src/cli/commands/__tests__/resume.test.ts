import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-resume-cmd/test.db';
const testDataDir = '/tmp/tt-test-resume-cmd';

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
  const testDbPath = '/tmp/tt-test-resume-cmd/test.db';
  const testDataDir = '/tmp/tt-test-resume-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { resumeCommand } from '../resume';
import { TimeTrackerDB } from '../../../db/database';

describe('resume command', () => {
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

  describe('basic functionality', () => {
    it('should resume from interruption', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create parent session (paused)
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          description: 'Main task',
          state: 'paused',
        });

        // Create interruption (working)
        const interruptionId = db.insertSession({
          startTime: new Date(Date.now() - 1800000), // 30 minutes ago
          description: 'Quick interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, {});
        reopenDb();

        const parent = db.getSessionById(parentId);
        const interruption = db.getSessionById(interruptionId);

        expect(parent?.state).toBe('working');
        expect(interruption?.state).toBe('completed');
        expect(interruption?.endTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should resume with remark', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create parent session
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        // Create interruption
        const interruptionId = db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Quick interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, { remark: 'Interruption resolved' });
        reopenDb();

        const interruption = db.getSessionById(interruptionId);
        expect(interruption?.state).toBe('completed');
        expect(interruption?.remark).toBe('Interruption resolved');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle nested interruptions (resume from level 2 to level 1)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create level 0 (main task)
        const mainId = db.insertSession({
          startTime: new Date(Date.now() - 10800000), // 3 hours ago
          description: 'Main task',
          state: 'paused',
        });

        // Create level 1 (first interruption)
        const interruption1Id = db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'First interruption',
          state: 'paused',
          parentSessionId: mainId,
        });

        // Create level 2 (second interruption)
        const interruption2Id = db.insertSession({
          startTime: new Date(Date.now() - 1800000), // 30 minutes ago
          description: 'Second interruption',
          state: 'working',
          parentSessionId: interruption1Id,
        });

        resumeCommand(undefined, {});
        reopenDb();

        const main = db.getSessionById(mainId);
        const interruption1 = db.getSessionById(interruption1Id);
        const interruption2 = db.getSessionById(interruption2Id);

        expect(main?.state).toBe('paused'); // Still paused
        expect(interruption1?.state).toBe('working'); // Resumed
        expect(interruption2?.state).toBe('completed'); // Completed
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('--at flag (retroactive tracking)', () => {
    it('should resume at specified relative time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create parent and interruption
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        const interruptionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, { at: '-30m' });
        reopenDb();

        const interruption = db.getSessionById(interruptionId);
        expect(interruption?.state).toBe('completed');
        expect(interruption?.endTime).toBeDefined();

        // Verify the resume time is approximately 30 minutes ago
        const resumeTime = new Date(interruption!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - resumeTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(30, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should resume at specific time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create sessions from yesterday
        const yesterday = new Date(Date.now() - 86400000);
        yesterday.setHours(9, 0, 0, 0);

        const parentId = db.insertSession({
          startTime: yesterday,
          description: 'Main task',
          state: 'paused',
        });

        const interruption = new Date(yesterday);
        interruption.setHours(10, 0, 0, 0);

        const interruptionId = db.insertSession({
          startTime: interruption,
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        // Resume at 10:30
        const resumeTimeStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')} 10:30`;
        resumeCommand(undefined, { at: resumeTimeStr });
        reopenDb();

        const interruptionSession = db.getSessionById(interruptionId);
        expect(interruptionSession?.state).toBe('completed');

        const resumeTime = new Date(interruptionSession!.endTime!);
        expect(resumeTime.getHours()).toBe(10);
        expect(resumeTime.getMinutes()).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining --at with remark', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        const interruptionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, { at: '-15m', remark: 'Back to main task' });
        reopenDb();

        const interruption = db.getSessionById(interruptionId);
        expect(interruption?.state).toBe('completed');
        expect(interruption?.remark).toBe('Back to main task');

        const resumeTime = new Date(interruption!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - resumeTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(15, 0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error if no active session', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        resumeCommand(undefined, {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('No active task to resume from')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error if current task is not an interruption', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        // Create a normal working session (not an interruption)
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Main task',
          state: 'working',
        });

        resumeCommand(undefined, {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Current task is not an interruption')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error if resume time is before interruption start', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 1800000), // 30 minutes ago
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        // Try to resume 1 hour ago (before interruption start)
        resumeCommand(undefined, { at: '-1h' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('must be after start time')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('console output', () => {
    it('should display resume confirmation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Quick interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, {});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Completed interruption')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('▶')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Resumed: Main task')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display resume time when using --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, { at: '-30m' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Resume time:')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display remark when provided', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, { remark: 'Issue resolved' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Remark: Issue resolved')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display parent project and tags when resuming', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          project: 'myApp',
          state: 'paused',
        });

        db.insertSessionTags(parentId, ['feature', 'code']);

        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, {});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Project: myApp')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Tags: code, feature')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('state transitions', () => {
    it('should transition interruption from working to completed', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        const interruptionId = db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, {});
        reopenDb();

        const interruption = db.getSessionById(interruptionId);
        expect(interruption?.state).toBe('completed');
      } finally {
        console.log = originalLog;
      }
    });

    it('should transition parent from paused to working', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Main task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        resumeCommand(undefined, {});
        reopenDb();

        const parent = db.getSessionById(parentId);
        expect(parent?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('resume paused task by ID', () => {
    it('should resume paused task and create continuation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create paused task
        const pausedId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Feature work',
          project: 'myApp',
          state: 'paused',
        });
        db.insertSessionTags(pausedId, ['code', 'feature']);

        resumeCommand(String(pausedId), {});
        reopenDb();

        // Should create new working session
        const activeSession = db.getActiveSession();
        expect(activeSession).toBeDefined();
        expect(activeSession?.description).toBe('Feature work');
        expect(activeSession?.project).toBe('myApp');
        expect(activeSession?.state).toBe('working');
        expect(activeSession?.continuesSessionId).toBe(pausedId);

        // Tags should be copied
        expect(activeSession?.tags).toContain('code');
        expect(activeSession?.tags).toContain('feature');

        // Original should still be paused
        const original = db.getSessionById(pausedId);
        expect(original?.state).toBe('paused');
      } finally {
        console.log = originalLog;
      }
    });

    it('should resume paused task with remark', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const pausedId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Bug fix',
          state: 'paused',
        });

        resumeCommand(String(pausedId), { remark: 'Continuing after lunch' });
        reopenDb();

        const activeSession = db.getActiveSession();
        expect(activeSession?.remark).toBe('Continuing after lunch');
        expect(activeSession?.continuesSessionId).toBe(pausedId);
      } finally {
        console.log = originalLog;
      }
    });

    it('should resume paused task at specific time with --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const pausedId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          endTime: new Date(Date.now() - 3600000), // Ended 1 hour ago
          description: 'Task',
          state: 'paused',
        });

        resumeCommand(String(pausedId), { at: '-30m' });
        reopenDb();

        const activeSession = db.getActiveSession();
        expect(activeSession).toBeDefined();

        const startTime = new Date(activeSession!.startTime);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(30, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should error if session ID does not exist', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        resumeCommand('999', {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Session 999 not found')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error if session ID is invalid', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        resumeCommand('abc', {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid session ID')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should resume completed session when --yes flag is provided', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const completedId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          endTime: new Date(Date.now() - 1800000),
          description: 'Completed task',
          state: 'completed',
        });

        await resumeCommand(String(completedId), { yes: true });
        reopenDb();

        // Original session should now be paused
        const originalSession = db.getSessionById(completedId);
        expect(originalSession?.state).toBe('paused');

        // New working session should be created
        const activeSession = db.getActiveSession();
        expect(activeSession).not.toBeNull();
        expect(activeSession?.description).toBe('Completed task');
        expect(activeSession?.continuesSessionId).toBe(completedId);
      } finally {
        console.log = originalLog;
      }
    });

    it('should error if session is abandoned', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        const abandonedId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          endTime: new Date(Date.now() - 1800000),
          description: 'Abandoned task',
          state: 'abandoned',
        });

        await resumeCommand(String(abandonedId), { yes: true });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('is not paused')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error if already tracking another task', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        // Create paused task
        const pausedId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Paused task',
          state: 'paused',
        });

        // Create active task
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Current task',
          state: 'working',
        });

        resumeCommand(String(pausedId), {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Already tracking')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should display confirmation with continuation info', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const pausedId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Feature work',
          project: 'myApp',
          state: 'paused',
        });
        db.insertSessionTags(pausedId, ['code']);

        resumeCommand(String(pausedId), {});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('▶')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Resumed: Feature work')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Project: myApp')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Tags: code')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(`Continuing from session ${pausedId}`)
        );
      } finally {
        console.log = originalLog;
      }
    });
  });
});
