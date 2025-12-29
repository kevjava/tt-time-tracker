import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-interrupt-cmd/test.db';
const testDataDir = '/tmp/tt-test-interrupt-cmd';

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
  const testDbPath = '/tmp/tt-test-interrupt-cmd/test.db';
  const testDataDir = '/tmp/tt-test-interrupt-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { interruptCommand } from '../interrupt';
import { TimeTrackerDB } from '../../../db/database';

describe('interrupt command', () => {
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

    // Create an active session to interrupt
    const sessionId = db.insertSession({
      startTime: new Date(),
      description: 'Main task',
      state: 'working',
    });
    db.insertSessionTags(sessionId, ['main']);

    // Clear mock calls
    mockExit.mockClear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    db.close();
  });

  describe('plain description', () => {
    it('should create interruption with plain description', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Urgent customer call', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        const interruption = sessions.find((s) => s.description === 'Urgent customer call');
        expect(interruption).toBeDefined();
        expect(interruption!.state).toBe('working');
        expect(interruption!.parentSessionId).toBe(1);

        const parent = sessions.find((s) => s.description === 'Main task');
        expect(parent!.state).toBe('paused');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle variadic arguments', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand(['Quick', 'bug', 'fix', 'needed'], {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick bug fix needed');
        expect(interruption).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should apply command-line options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Code review', {
          project: 'teamWork',
          tags: 'review,urgent',
          estimate: '30m'
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Code review');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('teamWork');
        expect(interruption!.estimateMinutes).toBe(30);

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags.sort()).toEqual(['review', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('log notation parsing', () => {
    it('should parse log notation with timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('10:30 Production issue', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Production issue');
        expect(interruption).toBeDefined();

        const startTime = new Date(interruption!.startTime);
        expect(startTime.getHours()).toBe(10);
        expect(startTime.getMinutes()).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with project', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('11:00 Quick fix @hotfix', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick fix');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('hotfix');
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('14:00 Team meeting +meeting +standup', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Team meeting');
        expect(interruption).toBeDefined();

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags.sort()).toEqual(['meeting', 'standup'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with estimate', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('15:00 Client call ~15m', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Client call');
        expect(interruption).toBeDefined();
        expect(interruption!.estimateMinutes).toBe(15);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with all components', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('10:30 Bug fix @backend +urgent +bugfix ~45m', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Bug fix');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('backend');
        expect(interruption!.estimateMinutes).toBe(45);

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags.sort()).toEqual(['bugfix', 'urgent'].sort());

        const startTime = new Date(interruption!.startTime);
        expect(startTime.getHours()).toBe(10);
        expect(startTime.getMinutes()).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with full timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('2024-12-28 16:45 Emergency deploy @ops +critical', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Emergency deploy');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('ops');

        const startTime = new Date(interruption!.startTime);
        expect(startTime.getFullYear()).toBe(2024);
        expect(startTime.getMonth()).toBe(11); // December is month 11
        expect(startTime.getDate()).toBe(28);
        expect(startTime.getHours()).toBe(16);
        expect(startTime.getMinutes()).toBe(45);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('command-line options override log notation', () => {
    it('should override project from log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('10:00 Fix @ProjectA', { project: 'ProjectB' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Fix');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('ProjectB');
      } finally {
        console.log = originalLog;
      }
    });

    it('should override tags from log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('10:00 Review +code +review', { tags: 'urgent' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Review');
        expect(interruption).toBeDefined();

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags).toEqual(['urgent']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should override estimate from log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('10:00 Meeting ~1h', { estimate: '30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Meeting');
        expect(interruption).toBeDefined();
        expect(interruption!.estimateMinutes).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should preserve timestamp from log notation even with option overrides', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('11:15 Task @ProjectA', { project: 'ProjectB' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Task');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('ProjectB');

        const startTime = new Date(interruption!.startTime);
        expect(startTime.getHours()).toBe(11);
        expect(startTime.getMinutes()).toBe(15);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('interruption behavior', () => {
    it('should pause parent session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick task', {});
        reopenDb();

        const parent = db.getSessionById(1);
        expect(parent!.state).toBe('paused');
      } finally {
        console.log = originalLog;
      }
    });

    it('should set parent session ID', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick task', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick task');
        expect(interruption).toBeDefined();
        expect(interruption!.parentSessionId).toBe(1);
      } finally {
        console.log = originalLog;
      }
    });

    it('should allow multiple nested interruptions', () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        interruptCommand('First interruption', {});
        reopenDb();

        // Check if there was an error
        expect(mockExit).not.toHaveBeenCalled();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        // Get the active session (first interruption)
        const firstInterruption = db.getActiveSession();
        expect(firstInterruption!.description).toBe('First interruption');

        // Create second interruption
        interruptCommand('Second interruption', {});
        reopenDb();

        const allSessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(allSessions).toHaveLength(3);

        const secondInterruption = db.getActiveSession();
        expect(secondInterruption!.description).toBe('Second interruption');
        expect(secondInterruption!.parentSessionId).toBe(firstInterruption!.id);
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });

  describe('error handling', () => {
    it('should error if no active session', () => {
      const originalError = console.error;
      console.error = jest.fn();

      // Stop the active session first (ensure endTime is after startTime)
      const endTime = new Date();
      endTime.setHours(endTime.getHours() + 1); // Set to 1 hour in the future
      db.updateSession(1, { endTime, state: 'completed' });

      try {
        interruptCommand('Cannot interrupt', {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('No active task to interrupt')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error on empty description', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        interruptCommand('', {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Description cannot be empty')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error on invalid estimate format', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        interruptCommand('Task', { estimate: 'bad-format' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid estimate format')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('fallback behavior', () => {
    it('should treat malformed log notation as plain description', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('99:99 Invalid time format', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === '99:99 Invalid time format');
        expect(interruption).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle description that starts with numbers but is not a timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('911 emergency call', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === '911 emergency call');
        expect(interruption).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });
  });
});
