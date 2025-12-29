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
    it('should parse log notation with timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('09:30 Fix bug', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Fix bug');

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(9);
        expect(startTime.getMinutes()).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with project', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('09:30 Implement feature @ProjectX', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement feature');
        expect(sessions[0].project).toBe('ProjectX');
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('10:00 Code review +review +urgent', {});
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

    it('should parse log notation with estimate', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('11:00 Write tests ~1h30m', {});
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
        startCommand('09:00 Implement auth @myApp +code +backend ~2h', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement auth');
        expect(sessions[0].project).toBe('myApp');
        expect(sessions[0].estimateMinutes).toBe(120);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['backend', 'code'].sort());

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(9);
        expect(startTime.getMinutes()).toBe(0);
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

  describe('command-line options override log notation', () => {
    it('should override project from log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('10:00 Fix bug @ProjectA', { project: 'ProjectB' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].project).toBe('ProjectB');
      } finally {
        console.log = originalLog;
      }
    });

    it('should override tags from log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('10:00 Fix bug +bugfix +low', { tags: 'urgent,critical' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        const tags = db.getSessionTags(sessions[0].id!);
        expect(tags.sort()).toEqual(['critical', 'urgent'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should override estimate from log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('10:00 Fix bug ~2h', { estimate: '30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].estimateMinutes).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should preserve timestamp from log notation even with option overrides', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        startCommand('09:30 Task @ProjectA', { project: 'ProjectB' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].project).toBe('ProjectB');

        const startTime = new Date(sessions[0].startTime);
        expect(startTime.getHours()).toBe(9);
        expect(startTime.getMinutes()).toBe(30);
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
      console.log = jest.fn();

      try {
        // This looks like it might be log notation but isn't valid
        startCommand('99:99 Invalid time', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        // Should treat the entire thing as description
        expect(sessions[0].description).toBe('99:99 Invalid time');
      } finally {
        console.log = originalLog;
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
});
