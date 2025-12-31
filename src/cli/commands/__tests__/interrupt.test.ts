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

    // Create an active session to interrupt - use a time 1 hour ago to ensure it's in the past
    const startTime = new Date(Date.now() - 60 * 60 * 1000);

    const sessionId = db.insertSession({
      startTime,
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
    it('should support --at flag for retroactive interrupts', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Production issue', { at: '-30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Production issue');
        expect(interruption).toBeDefined();

        // Verify it was created approximately 30 minutes ago
        const startTime = new Date(interruption!.startTime);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(30, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support project via command-line option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick fix', { project: 'hotfix' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick fix');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('hotfix');
      } finally {
        console.log = originalLog;
      }
    });

    it('should support tags via command-line option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Team meeting', { tags: 'meeting,standup' });
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

    it('should support estimate via command-line option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Client call', { estimate: '15m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Client call');
        expect(interruption).toBeDefined();
        expect(interruption!.estimateMinutes).toBe(15);
      } finally {
        console.log = originalLog;
      }
    });

    it('should combine command-line options with --at flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Bug fix', {
          at: '-15m',
          project: 'backend',
          tags: 'urgent,bugfix',
          estimate: '45m'
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Bug fix');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('backend');
        expect(interruption!.estimateMinutes).toBe(45);

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags.sort()).toEqual(['bugfix', 'urgent'].sort());

        // Verify timestamp is approximately 15 minutes ago
        const startTime = new Date(interruption!.startTime);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(15, 0);
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

    it('should override log notation timestamp with --at flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Log notation says 10:00, but --at says -30m (30 minutes ago)
        interruptCommand('10:00 Production issue @ops', { at: '-30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Production issue');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('ops');

        // Verify it used --at time (30 minutes ago), not log notation time (10:00)
        const startTime = new Date(interruption!.startTime);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(30, 0);

        // Also verify it's NOT at exactly 10:00:00 (the log notation time)
        const logNotationTime = new Date();
        logNotationTime.setHours(10, 0, 0, 0);
        expect(startTime.getTime()).not.toBe(logNotationTime.getTime());
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('inline notation without timestamp', () => {
    it('should parse project from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick question @meetings', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick question');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('meetings');
        expect(interruption!.parentSessionId).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse tags from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick question +interruption +urgent', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick question');
        expect(interruption).toBeDefined();

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags.sort()).toEqual(['interruption', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse project and tags from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick question from colleague @meetings +interruption', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick question from colleague');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('meetings');

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags).toEqual(['interruption']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse estimate from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Quick call @phone +call ~15m', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick call');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('phone');
        expect(interruption!.estimateMinutes).toBe(15);

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags).toEqual(['call']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should allow command-line options to override inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Task @inlineProject +inlineTag', {
          project: 'commandProject',
          tags: 'commandTag'
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Task');
        expect(interruption).toBeDefined();
        // Command-line options should override inline notation
        expect(interruption!.project).toBe('commandProject');

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags).toEqual(['commandTag']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should not use timestamp from dummy parsing', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const beforeTime = new Date();
        interruptCommand('Quick task @project +tag', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Quick task');
        expect(interruption).toBeDefined();

        // Start time should be current time, not 00:00
        const startTime = new Date(interruption!.startTime);
        const afterTime = new Date();

        // Should be between beforeTime and afterTime (i.e., approximately now)
        expect(startTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(startTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());

        // Should NOT be at midnight
        expect(startTime.getHours()).not.toBe(0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('combining multiple options', () => {
    it('should support combining project with --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Fix', { at: '-20m', project: 'backend' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Fix');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('backend');
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining tags with --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Review', { at: '-10m', tags: 'urgent' });
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

    it('should support combining estimate with --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Meeting', { at: '-5m', estimate: '30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Meeting');
        expect(interruption).toBeDefined();
        expect(interruption!.estimateMinutes).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining project, tags, and estimate with --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('Task', {
          at: '-45m',
          project: 'frontend',
          tags: 'ui,bugfix',
          estimate: '1h'
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const interruption = sessions.find((s) => s.description === 'Task');
        expect(interruption).toBeDefined();
        expect(interruption!.project).toBe('frontend');
        expect(interruption!.estimateMinutes).toBe(60);

        const tags = db.getSessionTags(interruption!.id!);
        expect(tags.sort()).toEqual(['bugfix', 'ui'].sort());

        // Verify timestamp is approximately 45 minutes ago
        const startTime = new Date(interruption!.startTime);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(45, 0);
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

    it('should create nested parent-child relationships', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        interruptCommand('First interruption', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());

        const mainTask = sessions.find((s) => s.description === 'Main task');
        const interruption = sessions.find((s) => s.description === 'First interruption');

        expect(mainTask).toBeDefined();
        expect(interruption).toBeDefined();

        // Verify parent-child relationship
        expect(interruption!.parentSessionId).toBe(mainTask!.id);

        // Verify states
        expect(mainTask!.state).toBe('paused');
        expect(interruption!.state).toBe('working');
      } finally {
        console.log = originalLog;
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
