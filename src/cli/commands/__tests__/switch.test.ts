import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-switch-cmd/test.db';
const testDataDir = '/tmp/tt-test-switch-cmd';

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

// Mock theme
jest.mock('../../../utils/theme', () => ({
  formatProject: (project: string) => `@${project}`,
  formatTags: (tags: string[]) => tags.map(t => `+${t}`).join(' '),
  formatDuration: (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  },
  formatEstimate: (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours > 0 && minutes > 0) return `~${hours}h${minutes}m`;
    if (hours > 0) return `~${hours}h`;
    return `~${minutes}m`;
  },
  formatState: (state: string) => state,
  formatRemark: (remark: string) => `# ${remark}`,
}));

// Mock config to use test paths
jest.mock('../../../utils/config', () => {
  const fs = require('fs');
  const testDbPath = '/tmp/tt-test-switch-cmd/test.db';
  const testDataDir = '/tmp/tt-test-switch-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { switchCommand } from '../switch';
import { TimeTrackerDB } from '../../../db/database';

describe('switch command', () => {
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
    it('should pause active task and start new task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create an active task
        const firstSessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'Previous task',
          project: 'oldProject',
          state: 'working',
        });

        // Use switch to pause it and start a new one
        switchCommand('New task', {});
        reopenDb();

        // Previous task should be paused (not completed)
        const previousTask = db.getSessionById(firstSessionId);
        expect(previousTask?.state).toBe('paused');
        expect(previousTask?.endTime).toBeDefined();

        // New task should be active
        const newTask = db.getActiveSession();
        expect(newTask).toBeDefined();
        expect(newTask?.description).toBe('New task');
        expect(newTask?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should work when no active task exists', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // No active task - just start a new one
        switchCommand('First task', {});
        reopenDb();

        const activeTask = db.getActiveSession();
        expect(activeTask).toBeDefined();
        expect(activeTask?.description).toBe('First task');
        expect(activeTask?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should support log notation syntax', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('Task @myProject +tag1 +tag2 ~2h', {});
        reopenDb();

        const activeTask = db.getActiveSession();
        expect(activeTask?.description).toBe('Task');
        expect(activeTask?.project).toBe('myProject');
        expect(activeTask?.tags).toContain('tag1');
        expect(activeTask?.tags).toContain('tag2');
        expect(activeTask?.estimateMinutes).toBe(120);
      } finally {
        console.log = originalLog;
      }
    });

    it('should support command-line options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('New task', {
          project: 'myProject',
          tags: 'code,urgent',
          estimate: '3h30m',
        });
        reopenDb();

        const activeTask = db.getActiveSession();
        expect(activeTask?.description).toBe('New task');
        expect(activeTask?.project).toBe('myProject');
        expect(activeTask?.tags).toContain('code');
        expect(activeTask?.tags).toContain('urgent');
        expect(activeTask?.estimateMinutes).toBe(210);
      } finally {
        console.log = originalLog;
      }
    });

    it('should override log notation with command-line options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('Task @logProject +logTag ~1h', {
          project: 'cliProject',
          tags: 'cliTag',
          estimate: '2h',
        });
        reopenDb();

        const activeTask = db.getActiveSession();
        expect(activeTask?.project).toBe('cliProject');
        expect(activeTask?.tags).toContain('cliTag');
        expect(activeTask?.estimateMinutes).toBe(120);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('--at flag (retroactive tracking)', () => {
    it('should support --at flag for backdating', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create active task
        db.insertSession({
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          description: 'Old task',
          state: 'working',
        });

        switchCommand('New task', { at: '-1h' });
        reopenDb();

        const newTask = db.getActiveSession();
        expect(newTask).toBeDefined();

        const startTime = new Date(newTask!.startTime);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(60, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should pause previous task at the --at time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const previousId = db.insertSession({
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          description: 'Old task',
          state: 'working',
        });

        switchCommand('New task', { at: '-1h' });
        reopenDb();

        const previousTask = db.getSessionById(previousId);
        expect(previousTask?.state).toBe('paused');
        expect(previousTask?.endTime).toBeDefined();

        const endTime = new Date(previousTask!.endTime!);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - endTime.getTime()) / 60000);
        expect(diffMinutes).toBeCloseTo(60, 0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('console output', () => {
    it('should display confirmation message', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('Test task', {});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('✓')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Started tracking: Test task')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display what was paused', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Previous task',
          state: 'working',
        });

        switchCommand('New task', {});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Paused: Previous task')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should not display paused message when no active task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('First task', {});

        const calls = (console.log as jest.Mock).mock.calls.map(call => call.join(' '));
        const hasPausedMessage = calls.some(call => call.includes('Paused:'));
        expect(hasPausedMessage).toBe(false);
      } finally {
        console.log = originalLog;
      }
    });

    it('should display project and tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('Task', {
          project: 'myProject',
          tags: 'code,urgent',
        });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('@myProject')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('+code +urgent')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display estimate', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('Task', { estimate: '2h30m' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('~2h30m')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error on empty description', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        switchCommand('', {});

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
        switchCommand('Task', { estimate: 'invalid' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid estimate format')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('state transitions', () => {
    it('should transition previous task to paused state', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const previousId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Old task',
          state: 'working',
        });

        switchCommand('New task', {});
        reopenDb();

        const previousTask = db.getSessionById(previousId);
        expect(previousTask?.state).toBe('paused');
      } finally {
        console.log = originalLog;
      }
    });

    it('should create new task in working state', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        switchCommand('New task', {});
        reopenDb();

        const newTask = db.getActiveSession();
        expect(newTask?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('integration with resume', () => {
    it('should allow paused tasks to be resumed later', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start first task
        const firstId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'First task',
          project: 'projectA',
          state: 'working',
        });
        db.insertSessionTags(firstId, ['code']);

        // Switch to second task (pauses first)
        switchCommand('Second task', {});
        reopenDb();

        // Verify first task is paused
        const firstTask = db.getSessionById(firstId);
        expect(firstTask?.state).toBe('paused');

        // Stop second task
        const secondTask = db.getActiveSession();
        db.updateSession(secondTask!.id!, {
          endTime: new Date(),
          state: 'completed',
        });

        // Resume first task should work
        const resumedId = db.insertSession({
          startTime: new Date(),
          description: firstTask!.description,
          project: firstTask!.project,
          state: 'working',
          continuesSessionId: firstId,
        });
        db.insertSessionTags(resumedId, firstTask!.tags);

        const resumedTask = db.getSessionById(resumedId);
        expect(resumedTask?.description).toBe('First task');
        expect(resumedTask?.continuesSessionId).toBe(firstId);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
