import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-pause-cmd/test.db';
const testDataDir = '/tmp/tt-test-pause-cmd';

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
  const testDbPath = '/tmp/tt-test-pause-cmd/test.db';
  const testDataDir = '/tmp/tt-test-pause-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { pauseCommand } from '../pause';
import { TimeTrackerDB } from '../../../db/database';

describe('pause command', () => {
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
    it('should pause active session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session first
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'Active task',
          state: 'working',
        });

        pauseCommand({});
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('paused');
        expect(session?.endTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should pause with reason', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session first
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Active task',
          state: 'working',
        });

        pauseCommand({ reason: 'Going to lunch' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('paused');
        expect(session?.remark).toBe('Going to lunch');
        expect(session?.endTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should calculate duration correctly', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const startTime = new Date(Date.now() - 7200000); // 2 hours ago
        db.insertSession({
          startTime,
          description: 'Long task',
          state: 'working',
        });

        pauseCommand({});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].state).toBe('paused');

        // Check that duration message was logged
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('2h')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('--at flag (retroactive tracking)', () => {
    it('should pause at specified relative time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session 1 hour ago
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task to pause',
          state: 'working',
        });

        pauseCommand({ at: '-30m' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('paused');
        expect(session?.endTime).toBeDefined();

        // Verify the pause time is approximately 30 minutes ago
        const pauseTime = new Date(session!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - pauseTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(30, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should pause at specific time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Use full datetime format to avoid time-of-day parsing ambiguity
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86400000); // 1 day ago
        yesterday.setHours(9, 0, 0, 0);

        const sessionId = db.insertSession({
          startTime: yesterday,
          description: 'Yesterday task',
          state: 'working',
        });

        // Format as full datetime to be explicit
        const pauseTimeStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')} 10:30`;
        pauseCommand({ at: pauseTimeStr });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('paused');

        const pauseTime = new Date(session!.endTime!);
        expect(pauseTime.getHours()).toBe(10);
        expect(pauseTime.getMinutes()).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining --at with reason', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          state: 'working',
        });

        pauseCommand({ at: '-15m', reason: 'End of day' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('paused');
        expect(session?.remark).toBe('End of day');

        const pauseTime = new Date(session!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - pauseTime.getTime()) / 60000);
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
        pauseCommand({});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('No active task to pause')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error if pause time is before session start', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        // Start a session 30 minutes ago
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Recent task',
          state: 'working',
        });

        // Try to pause 1 hour ago (before start)
        pauseCommand({ at: '-1h' });

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
    it('should display pause confirmation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Test task',
          state: 'working',
        });

        pauseCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('⏸')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Paused task')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Test task')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display pause time when using --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          state: 'working',
        });

        pauseCommand({ at: '-30m' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Pause time:')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display reason when provided', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          state: 'working',
        });

        pauseCommand({ reason: 'Lunch break' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Reason: Lunch break')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });
});
