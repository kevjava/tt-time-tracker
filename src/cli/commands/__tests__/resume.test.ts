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

        resumeCommand({});
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

        resumeCommand({ remark: 'Interruption resolved' });
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

        resumeCommand({});
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

        resumeCommand({ at: '-30m' });
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
        resumeCommand({ at: resumeTimeStr });
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

        resumeCommand({ at: '-15m', remark: 'Back to main task' });
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
        resumeCommand({});

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

        resumeCommand({});

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
        resumeCommand({ at: '-1h' });

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

        resumeCommand({});

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

        resumeCommand({ at: '-30m' });

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

        resumeCommand({ remark: 'Issue resolved' });

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

        resumeCommand({});

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

        resumeCommand({});
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

        resumeCommand({});
        reopenDb();

        const parent = db.getSessionById(parentId);
        expect(parent?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });
  });
});
