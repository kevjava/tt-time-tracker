import * as fs from 'fs';

// Set up test database path
const testDbPath = '/tmp/tt-test-schedule-add-cmd/test.db';
const testDataDir = '/tmp/tt-test-schedule-add-cmd';

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
  const testDbPath = '/tmp/tt-test-schedule-add-cmd/test.db';
  const testDataDir = '/tmp/tt-test-schedule-add-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { scheduleAddCommand } from '../schedule-add';
import { TimeTrackerDB } from '../../../db/database';

describe('schedule add command', () => {
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
    it('should add scheduled task with plain description', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Review pull requests'], {});
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].description).toBe('Review pull requests');
        expect(tasks[0].priority).toBe(5); // default
        expect(tasks[0].project).toBeUndefined();
        expect(tasks[0].tags).toEqual([]);
      } finally {
        console.log = originalLog;
      }
    });

    it('should add scheduled task with project and tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Deploy to production'], {
          project: 'backend',
          tags: 'deploy,ops',
        });
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].description).toBe('Deploy to production');
        expect(tasks[0].project).toBe('backend');
        expect(tasks[0].tags).toEqual(['deploy', 'ops']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should add scheduled task with estimate', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Write documentation'], {
          estimate: '2h',
        });
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].estimateMinutes).toBe(120);
      } finally {
        console.log = originalLog;
      }
    });

    it('should add scheduled task with priority', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Fix critical bug'], {
          priority: '1',
        });
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].priority).toBe(1);
      } finally {
        console.log = originalLog;
      }
    });

    it('should add scheduled task with scheduled date', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Team meeting'], {
          scheduled: '2026-01-10 14:00',
        });
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].scheduledDateTime).toBeDefined();
        expect(tasks[0].scheduledDateTime?.toISOString()).toContain('2026-01-10');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('log notation parsing', () => {
    it('should parse log notation with project and tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Code review @myApp +review ~30m'], {});
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].description).toBe('Code review');
        expect(tasks[0].project).toBe('myApp');
        expect(tasks[0].tags).toEqual(['review']);
        expect(tasks[0].estimateMinutes).toBe(30);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with priority', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Fix auth bug @backend +urgent ~1h ^2'], {});
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].description).toBe('Fix auth bug');
        expect(tasks[0].project).toBe('backend');
        expect(tasks[0].tags).toEqual(['urgent']);
        expect(tasks[0].estimateMinutes).toBe(60);
        expect(tasks[0].priority).toBe(2);
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse log notation with scheduled date', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['2026-01-10 14:00 Team standup @team +meeting'], {});
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].description).toBe('Team standup');
        expect(tasks[0].project).toBe('team');
        expect(tasks[0].tags).toEqual(['meeting']);
        expect(tasks[0].scheduledDateTime).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should allow command-line flags to override log notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Task @oldProject +oldTag ^5'], {
          project: 'newProject',
          tags: 'newTag',
          priority: '1',
        });
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].project).toBe('newProject');
        expect(tasks[0].tags).toEqual(['newTag']);
        expect(tasks[0].priority).toBe(1);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('validation', () => {
    it('should reject empty description', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        scheduleAddCommand([], {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Description required')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid priority', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        scheduleAddCommand(['Task'], {
          priority: '10',
        });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Priority must be between 1 and 9')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid estimate format', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        scheduleAddCommand(['Task'], {
          estimate: 'invalid',
        });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid estimate format')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should reject invalid scheduled date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        scheduleAddCommand(['Task'], {
          scheduled: 'not-a-date',
        });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid scheduled date')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('multiple tasks', () => {
    it('should add multiple scheduled tasks', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        scheduleAddCommand(['Task 1'], {});
        reopenDb();

        scheduleAddCommand(['Task 2'], { priority: '2' });
        reopenDb();

        scheduleAddCommand(['Task 3'], { priority: '8' });
        reopenDb();

        const tasks = db.getAllScheduledTasks();
        expect(tasks).toHaveLength(3);
        expect(tasks[0].description).toBe('Task 1');
        expect(tasks[1].description).toBe('Task 2');
        expect(tasks[2].description).toBe('Task 3');
      } finally {
        console.log = originalLog;
      }
    });
  });
});
