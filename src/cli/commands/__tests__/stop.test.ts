import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-stop-cmd/test.db';
const testDataDir = '/tmp/tt-test-stop-cmd';

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
  const testDbPath = '/tmp/tt-test-stop-cmd/test.db';
  const testDataDir = '/tmp/tt-test-stop-cmd';

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
      churn: undefined,
    })),
  };
});

// Mock scheduler
jest.mock('../../../utils/scheduler', () => ({
  getScheduler: jest.fn(async (_config: unknown, db: unknown) => {
    const { TTScheduler } = require('@kevjava/tt-core');
    return new TTScheduler(db);
  }),
  isChurnEnabled: jest.fn(() => false),
}));

import { stopCommand } from '../stop';
import { TimeTrackerDB } from '../../../db/database';

describe('stop command', () => {
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
    it('should stop active session', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session first
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'Active task',
          state: 'working',
        });

        await stopCommand({});
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');
        expect(session?.endTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should stop with remark', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session first
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Active task',
          state: 'working',
        });

        await stopCommand({ remark: 'Completed successfully' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');
        expect(session?.remark).toBe('Completed successfully');
        expect(session?.endTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should calculate duration correctly', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const startTime = new Date(Date.now() - 7200000); // 2 hours ago
        db.insertSession({
          startTime,
          description: 'Long task',
          state: 'working',
        });

        await stopCommand({});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].state).toBe('completed');

        // Check that duration message was logged
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('2h')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle multiple start/stop cycles', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // First session
        const session1Id = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Task 1',
          state: 'working',
        });

        await stopCommand({});
        reopenDb();

        let session1 = db.getSessionById(session1Id);
        expect(session1?.state).toBe('completed');

        // Second session
        const session2Id = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task 2',
          state: 'working',
        });

        await stopCommand({});
        reopenDb();

        session1 = db.getSessionById(session1Id);
        const session2 = db.getSessionById(session2Id);

        expect(session1?.state).toBe('completed');
        expect(session2?.state).toBe('completed');
        expect(session1?.endTime).toBeDefined();
        expect(session2?.endTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('--at flag (retroactive tracking)', () => {
    it('should stop at specified relative time', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session 1 hour ago
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task to stop',
          state: 'working',
        });

        await stopCommand({ at: '-30m' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');
        expect(session?.endTime).toBeDefined();

        // Verify the stop time is approximately 30 minutes ago
        const stopTime = new Date(session!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - stopTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(30, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should stop at specific time', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start a session earlier today
        const yesterday = new Date(Date.now() - 86400000); // 1 day ago
        yesterday.setHours(9, 0, 0, 0);

        const sessionId = db.insertSession({
          startTime: yesterday,
          description: 'Yesterday task',
          state: 'working',
        });

        // Format as full datetime to be explicit
        const stopTimeStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')} 10:30`;
        await stopCommand({ at: stopTimeStr });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');

        const stopTime = new Date(session!.endTime!);
        expect(stopTime.getHours()).toBe(10);
        expect(stopTime.getMinutes()).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining --at with remark', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          state: 'working',
        });

        await stopCommand({ at: '-15m', remark: 'Finished early' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');
        expect(session?.remark).toBe('Finished early');

        const stopTime = new Date(session!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - stopTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(15, 0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error if no active session', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        await stopCommand({});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('No active task to stop')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error if stop time is before session start', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        // Start a session 30 minutes ago
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Recent task',
          state: 'working',
        });

        // Try to stop 1 hour ago (before start)
        await stopCommand({ at: '-1h' });

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
    it('should display stop confirmation', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Test task',
          state: 'working',
        });

        await stopCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Stopped tracking')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Test task')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display stop time when using --at', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          state: 'working',
        });

        await stopCommand({ at: '-30m' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Stop time:')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display remark when provided', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          state: 'working',
        });

        await stopCommand({ remark: 'All done!' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Remark: # All done!')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('edge cases', () => {
    it('should stop session with project and tags', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Feature development',
          project: 'myApp',
          state: 'working',
        });

        db.insertSessionTags(sessionId, ['feature', 'code']);

        await stopCommand({ remark: 'Feature complete' });
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');
        expect(session?.project).toBe('myApp');
        expect(session?.remark).toBe('Feature complete');

        const tags = db.getSessionTags(sessionId);
        expect(tags.sort()).toEqual(['code', 'feature'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should preserve estimate when stopping', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Estimated task',
          estimateMinutes: 120,
          state: 'working',
        });

        await stopCommand({});
        reopenDb();

        const session = db.getSessionById(sessionId);
        expect(session?.state).toBe('completed');
        expect(session?.estimateMinutes).toBe(120);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
