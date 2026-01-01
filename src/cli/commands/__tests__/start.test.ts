import * as fs from 'fs';

// Set up test database path  - use fixed path for this test file
const testDbPath = '/tmp/tt-test-start-cmd/test.db';
const testDataDir = '/tmp/tt-test-start-cmd';

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
  const testDbPath = '/tmp/tt-test-start-cmd/test.db';
  const testDataDir = '/tmp/tt-test-start-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { startCommand } from '../start';
import { TimeTrackerDB } from '../../../db/database';

describe('start command', () => {
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

  describe('plain description', () => {
    it('should create session with plain description', () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        startCommand('Fix authentication bug', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Fix authentication bug');
        expect(sessions[0].project).toBeUndefined();
        expect(sessions[0].estimateMinutes).toBeUndefined();
        expect(sessions[0].state).toBe('working');
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it('should handle variadic arguments', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand(['Review', 'PR', '123', 'for', 'auth'], {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Review PR 123 for auth');
      } finally {
        console.log = originalLog;
      }
    });

    it('should apply command-line options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Implement feature', {
          project: 'myApp',
          tags: 'dev,urgent',
          estimate: '2h'
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement feature');
        expect(sessions[0].project).toBe('myApp');
        expect(sessions[0].estimateMinutes).toBe(120);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['dev', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('log notation parsing', () => {
    it('should support --at flag with time format', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Fix bug', { at: '-2h' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Fix bug');

        // Verify it was created approximately 2 hours ago
        const startTime = new Date(sessions[0].startTime);
        const now = new Date();
        const diffHours = Math.round((now.getTime() - startTime.getTime()) / 3600000);
        expect(diffHours).toBeCloseTo(2, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support project via command-line option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Implement feature', { project: 'ProjectX' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement feature');
        expect(sessions[0].project).toBe('ProjectX');
      } finally {
        console.log = originalLog;
      }
    });

    it('should support tags via command-line option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Code review', { tags: 'review,urgent' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Code review');

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['review', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should support estimate via command-line option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Write tests', { estimate: '1h30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Write tests');
        expect(sessions[0].estimateMinutes).toBe(90);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with all components', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Use a time in the past (1 hour ago) to avoid future timestamp issues
        const pastTime = new Date(Date.now() - 60 * 60 * 1000);
        const timeStr = `${String(pastTime.getHours()).padStart(2, '0')}:${String(pastTime.getMinutes()).padStart(2, '0')}`;

        startCommand(`${timeStr} Implement auth @myApp +code +backend ~2h`, {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement auth');
        expect(sessions[0].project).toBe('myApp');
        expect(sessions[0].estimateMinutes).toBe(120);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['backend', 'code'].sort());

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(pastTime.getHours());
        expect(startTime.getMinutes()).toBe(pastTime.getMinutes());
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with full timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('2024-12-25 14:30 Holiday coding @fun +personal', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Holiday coding');
        expect(sessions[0].project).toBe('fun');

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getFullYear()).toBe(2024);
        expect(startTime.getMonth()).toBe(11); // December is month 11
        expect(startTime.getDate()).toBe(25);
        expect(startTime.getHours()).toBe(14);
        expect(startTime.getMinutes()).toBe(30);
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
        startCommand('Backend stubs for 3436 @elms', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Backend stubs for 3436');
        expect(sessions[0].project).toBe('elms');
        expect(sessions[0].state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse tags from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Fix authentication bug +bug +urgent', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Fix authentication bug');

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['bug', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse project and tags from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Backend stubs for 3436 @elms +code', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Backend stubs for 3436');
        expect(sessions[0].project).toBe('elms');

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags).toEqual(['code']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse estimate from description without timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Implement new feature @myApp +code ~3h', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement new feature');
        expect(sessions[0].project).toBe('myApp');
        expect(sessions[0].estimateMinutes).toBe(180);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags).toEqual(['code']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should allow command-line options to override inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Task description @inlineProject +inlineTag', {
          project: 'commandProject',
          tags: 'commandTag'
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Task description');
        // Command-line options should override inline notation
        expect(sessions[0].project).toBe('commandProject');

        const tags = db.getSessionTags(sessions[0].id!);
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
        startCommand('Work on feature @myApp +code', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        // Start time should be current time, not 00:00
        const startTime = new Date(sessions[0].startTime);
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
    it('should support combining project with other options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Fix bug', { project: 'ProjectB', estimate: '1h' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].project).toBe('ProjectB');
        expect(sessions[0].estimateMinutes).toBe(60);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining tags with other options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Fix bug', { tags: 'urgent,critical', project: 'backend' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['critical', 'urgent'].sort());
        expect(sessions[0].project).toBe('backend');
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining estimate with other options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Fix bug', { estimate: '30m', tags: 'bugfix' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].estimateMinutes).toBe(30);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags).toEqual(['bugfix']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support combining --at with other options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Task', { at: '-3h', project: 'ProjectB', tags: 'test' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].project).toBe('ProjectB');

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags).toEqual(['test']);

        const startTime = new Date(sessions[0].startTime);
        const now = new Date();
        const diffHours = Math.round((now.getTime() - startTime.getTime()) / 3600000);
        expect(diffHours).toBeCloseTo(3, 0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error if session already active', () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        startCommand('First task', {});
        reopenDb(); // First command succeeds
        startCommand('Second task', {}); // Second command should fail

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Already tracking')
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it('should error on empty description', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        startCommand('', {});

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
        startCommand('Task', { estimate: 'invalid' });

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
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        // This looks like it might be log notation but isn't valid
        startCommand('99:99 Invalid time', {});

        // Check if process.exit was called
        if (mockExit.mock.calls.length > 0) {
          fail(`process.exit was called: ${JSON.stringify((console.error as jest.Mock).mock.calls)}`);
        }

        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        // Should treat the entire thing as description
        expect(sessions[0].description).toBe('99:99 Invalid time');
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it('should handle description that starts with numbers but is not a timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('123 Main Street analysis', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('123 Main Street analysis');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('--at flag (retroactive tracking)', () => {
    it('should start session at specified time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Task 1', { at: '09:00' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(9);
        expect(startTime.getMinutes()).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should prevent overlapping sessions', () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        // Start first session 2 hours ago
        startCommand('Task 1', { at: '-2h' });
        reopenDb();

        // Try to start second session 1 hour ago (should fail with overlap since first session is still active)
        startCommand('Task 2', { at: '-1h' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('overlap')
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it('should allow starting after previous session ended', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start and stop first session
        startCommand('Task 1', { at: '09:00' });
        reopenDb();

        const sessions1 = db.getSessionsByTimeRange(new Date(0), new Date());
        const firstSession = sessions1[0];

        // Set end time to 1 hour after start time
        const endTime = new Date(firstSession.startTime);
        endTime.setHours(endTime.getHours() + 1);

        db.updateSession(firstSession.id!, {
          endTime,
          state: 'completed',
        });
        reopenDb();

        // Start second session after first ends
        startCommand('Task 2', { at: '10:00' });
        reopenDb();

        const sessions2 = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions2).toHaveLength(2);
      } finally {
        console.log = originalLog;
      }
    });

    it('should combine --at with other options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('Task', {
          at: '09:00',
          project: 'myApp',
          tags: 'code,urgent',
          estimate: '2h',
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].project).toBe('myApp');
        expect(sessions[0].estimateMinutes).toBe(120);

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(9);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['code', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should override log notation timestamp with --at flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Log notation says 10:00, but --at says 09:00
        startCommand('10:00 Task @project', { at: '09:00' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(9); // Should use --at time
        expect(startTime.getMinutes()).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
