import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-next-cmd/test.db';
const testDataDir = '/tmp/tt-test-next-cmd';

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
  const testDbPath = '/tmp/tt-test-next-cmd/test.db';
  const testDataDir = '/tmp/tt-test-next-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { nextCommand } from '../next';
import { TimeTrackerDB } from '../../../db/database';

describe('next command', () => {
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
    it('should stop active task and start new task', () => {
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

        // Use next to stop it and start a new one
        nextCommand('New task', {});
        reopenDb();

        // Verify previous task was stopped
        const firstSession = db.getSessionById(firstSessionId);
        expect(firstSession?.state).toBe('completed');
        expect(firstSession?.endTime).toBeDefined();

        // Verify new task was started
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        const newSession = sessions.find(s => s.description === 'New task');
        expect(newSession).toBeDefined();
        expect(newSession?.state).toBe('working');
        expect(newSession?.endTime).toBeUndefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should work when no active task exists', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // No active task - should just start a new one
        nextCommand('First task', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('First task');
        expect(sessions[0].state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle variadic arguments', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand(['Review', 'PR', '123', 'for', 'auth'], {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Review PR 123 for auth');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle multiple next calls in sequence', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start first task
        db.insertSession({
          startTime: new Date(),
          description: 'Task 1',
          project: 'ProjectA',
          state: 'working',
        });

        //Close and reopen to ensure data is committed
        reopenDb();

        // Use next to switch to Task 2
        nextCommand('Task 2', { project: 'ProjectB' });
        reopenDb();

        // Use next to switch to Task 3
        nextCommand('Task 3', { project: 'ProjectC' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(3);

        // First two should be completed
        const task1 = sessions.find(s => s.description === 'Task 1');
        const task2 = sessions.find(s => s.description === 'Task 2');
        const task3 = sessions.find(s => s.description === 'Task 3');

        expect(task1?.state).toBe('completed');
        expect(task1?.endTime).toBeDefined();

        expect(task2?.state).toBe('completed');
        expect(task2?.endTime).toBeDefined();

        // Last one should be working
        expect(task3?.state).toBe('working');
        expect(task3?.endTime).toBeUndefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should set correct end time on previous task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start first task
        const firstSessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'First task',
          state: 'working',
        });

        const beforeNext = new Date();

        // Next to second task
        nextCommand('Second task', {});
        reopenDb();

        const afterNext = new Date();

        const firstSession = db.getSessionById(firstSessionId);
        expect(firstSession?.endTime).toBeDefined();

        const endTime = new Date(firstSession!.endTime!);
        expect(endTime.getTime()).toBeGreaterThanOrEqual(beforeNext.getTime() - 1000);
        expect(endTime.getTime()).toBeLessThanOrEqual(afterNext.getTime() + 1000);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('command-line options', () => {
    it('should apply project option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Implement feature', { project: 'myApp' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Implement feature');
        expect(sessions[0].project).toBe('myApp');
      } finally {
        console.log = originalLog;
      }
    });

    it('should apply tags option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Code review', { tags: 'review,urgent' });
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

    it('should apply estimate option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Write tests', { estimate: '1h30m' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Write tests');
        expect(sessions[0].estimateMinutes).toBe(90);
      } finally {
        console.log = originalLog;
      }
    });

    it('should apply all options together', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Implement feature', {
          project: 'myApp',
          tags: 'dev,urgent',
          estimate: '2h',
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
    it('should parse project from inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Backend stubs for 3436 @elms', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('Backend stubs for 3436');
        expect(sessions[0].project).toBe('elms');
      } finally {
        console.log = originalLog;
      }
    });

    it('should parse tags from inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Fix authentication bug +bug +urgent', {});
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

    it('should parse project and tags from inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Backend stubs for 3436 @elms +code', {});
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

    it('should parse estimate from inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Implement new feature @myApp +code ~3h', {});
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

    it('should parse log notation with timestamp', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Use a time in the past (1 hour ago) to avoid future timestamp issues
        const pastTime = new Date(Date.now() - 60 * 60 * 1000);
        const timeStr = `${String(pastTime.getHours()).padStart(2, '0')}:${String(pastTime.getMinutes()).padStart(2, '0')}`;

        nextCommand(`${timeStr} Implement auth @myApp +code +backend ~2h`, {});
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

    it('should allow command-line options to override inline notation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task description @inlineProject +inlineTag', {
          project: 'commandProject',
          tags: 'commandTag',
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
  });

  describe('--at flag (retroactive tracking)', () => {
    it('should stop previous task and start new task at specified time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create active task 2 hours ago
        const firstSessionId = db.insertSession({
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          description: 'First task',
          state: 'working',
        });

        // Next to new task 1 hour ago
        nextCommand('Second task', { at: '-1h' });
        reopenDb();

        // First task should be stopped at -1h
        const firstSession = db.getSessionById(firstSessionId);
        expect(firstSession?.state).toBe('completed');
        expect(firstSession?.endTime).toBeDefined();

        const firstEndTime = new Date(firstSession!.endTime!);
        const now = new Date();
        const diffHours = Math.round((now.getTime() - firstEndTime.getTime()) / 3600000);
        expect(diffHours).toBeCloseTo(1, 0);

        // Second task should start at -1h
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const secondSession = sessions.find(s => s.description === 'Second task');
        expect(secondSession).toBeDefined();

        const secondStartTime = new Date(secondSession!.startTime);
        const startDiffHours = Math.round((now.getTime() - secondStartTime.getTime()) / 3600000);
        expect(startDiffHours).toBeCloseTo(1, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should work with --at when no active task exists', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task', { at: '-2h' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        const startTime = new Date(sessions[0].startTime);
        const now = new Date();
        const diffHours = Math.round((now.getTime() - startTime.getTime()) / 3600000);
        expect(diffHours).toBeCloseTo(2, 0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should combine --at with other options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task', {
          at: '-1h',
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
        const now = new Date();
        const diffHours = Math.round((now.getTime() - startTime.getTime()) / 3600000);
        expect(diffHours).toBeCloseTo(1, 0);

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
        // Log notation says specific time, but --at says -2h
        const pastTime = new Date(Date.now() - 60 * 60 * 1000);
        const timeStr = `${String(pastTime.getHours()).padStart(2, '0')}:${String(pastTime.getMinutes()).padStart(2, '0')}`;

        nextCommand(`${timeStr} Task @project`, { at: '-2h' });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);

        const startTime = new Date(sessions[0].startTime);
        const now = new Date();
        const diffHours = Math.round((now.getTime() - startTime.getTime()) / 3600000);
        expect(diffHours).toBeCloseTo(2, 0); // Should use --at time, not log notation time
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
        nextCommand('', {});

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
        nextCommand('Task', { estimate: 'invalid' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid estimate format')
        );
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('edge cases', () => {
    it('should handle next after manually stopped task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create and stop a task manually
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Completed task',
          state: 'completed',
          endTime: new Date(Date.now() - 3600000),
        });

        // Next should just start a new task
        nextCommand('New task', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        // Old task should still be completed
        const oldTask = db.getSessionById(sessionId);
        expect(oldTask?.state).toBe('completed');

        // New task should be working
        const newTask = sessions.find(s => s.description === 'New task');
        expect(newTask?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should preserve tags and project from previous task when using next', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start first task with project and tags
        const firstSessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'First task',
          project: 'ProjectA',
          state: 'working',
        });
        db.insertSessionTags(firstSessionId, ['tag1', 'tag2']);

        // Next to second task with different project/tags
        nextCommand('Second task @ProjectB +tag3', {});
        reopenDb();

        // First task should still have its original project and tags
        const firstSession = db.getSessionById(firstSessionId);
        expect(firstSession?.project).toBe('ProjectA');

        const firstTags = db.getSessionTags(firstSessionId);
        expect(firstTags.sort()).toEqual(['tag1', 'tag2'].sort());

        // Second task should have new project and tags
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const secondSession = sessions.find(s => s.description === 'Second task');
        expect(secondSession?.project).toBe('ProjectB');

        const secondTags = db.getSessionTags(secondSession!.id!);
        expect(secondTags).toEqual(['tag3']);
      } finally {
        console.log = originalLog;
      }
    });

    it('should not error when next is called twice quickly', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Start first task directly
        db.insertSession({
          startTime: new Date(),
          description: 'Task 1',
          state: 'working',
        });
        reopenDb();

        // Call next to switch to Task 2
        nextCommand('Task 2', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        const task1 = sessions.find(s => s.description === 'Task 1');
        const task2 = sessions.find(s => s.description === 'Task 2');

        expect(task1?.state).toBe('completed');
        expect(task2?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle paused task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a paused task
        const pausedSessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Paused task',
          state: 'paused',
          endTime: new Date(Date.now() - 1800000),
        });

        // Next should just start a new task (paused task is not "active")
        nextCommand('New task', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        // Paused task should still be paused
        const pausedTask = db.getSessionById(pausedSessionId);
        expect(pausedTask?.state).toBe('paused');

        // New task should be working
        const newTask = sessions.find(s => s.description === 'New task');
        expect(newTask?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle abandoned task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create an abandoned task
        const abandonedSessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Abandoned task',
          state: 'abandoned',
          endTime: new Date(Date.now() - 1800000),
        });

        // Next should just start a new task
        nextCommand('New task', {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2);

        // Abandoned task should still be abandoned
        const abandonedTask = db.getSessionById(abandonedSessionId);
        expect(abandonedTask?.state).toBe('abandoned');

        // New task should be working
        const newTask = sessions.find(s => s.description === 'New task');
        expect(newTask?.state).toBe('working');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('console output', () => {
    it('should display start confirmation for new task', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Test task', {});

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

    it('should display project when provided', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task', { project: 'myApp' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Project: myApp')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display tags when provided', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task', { tags: 'code,urgent' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Tags: code, urgent')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display estimate when provided', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task', { estimate: '2h30m' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Estimate: 2h30m')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display start time when using --at', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        nextCommand('Task', { at: '-1h' });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Start time:')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('session ID as template', () => {
    it('should duplicate metadata from existing session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a template session
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 3600000); // 1 hour later
        const templateId = db.insertSession({
          startTime,
          endTime,
          description: 'Daily standup',
          project: 'team',
          estimateMinutes: 30,
          state: 'completed',
        });
        db.insertSessionTags(templateId, ['meeting', 'recurring']);

        // Start a new session using the template
        nextCommand([templateId.toString()], {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(2); // Template + new session

        const newSession = sessions.find(s => s.id !== templateId);
        expect(newSession).toBeDefined();
        expect(newSession!.description).toBe('Daily standup');
        expect(newSession!.project).toBe('team');
        expect(newSession!.estimateMinutes).toBe(30);
        expect(newSession!.state).toBe('working');

        const tags = db.getSessionTags(newSession!.id!);
        expect(tags.sort()).toEqual(['meeting', 'recurring'].sort());
      } finally {
        console.log = originalLog;
      }
    });

    it('should stop active session before starting from template', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create an active session
        const activeId = db.insertSession({
          startTime: new Date(),
          description: 'Active task',
          state: 'working',
        });

        // Create a template session
        const templateStartTime = new Date();
        const templateEndTime = new Date(templateStartTime.getTime() + 3600000); // 1 hour later
        const templateId = db.insertSession({
          startTime: templateStartTime,
          endTime: templateEndTime,
          description: 'Template task',
          project: 'team',
          state: 'completed',
        });

        // Use next with template ID
        nextCommand([templateId.toString()], {});
        reopenDb();

        // Check that active session was stopped
        const stoppedSession = db.getSessionById(activeId);
        expect(stoppedSession!.state).toBe('completed');
        expect(stoppedSession!.endTime).toBeDefined();

        // Check that new session was created from template
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const newSession = sessions.find(s => s.id !== activeId && s.id !== templateId);
        expect(newSession).toBeDefined();
        expect(newSession!.description).toBe('Template task');
        expect(newSession!.project).toBe('team');
      } finally {
        console.log = originalLog;
      }
    });

    it('should allow overriding template metadata with options', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a template session
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 3600000); // 1 hour later
        const templateId = db.insertSession({
          startTime,
          endTime,
          description: 'Team meeting',
          project: 'oldProject',
          estimateMinutes: 60,
          state: 'completed',
        });
        db.insertSessionTags(templateId, ['meeting']);

        // Start a new session using the template but override some fields
        nextCommand([templateId.toString()], {
          project: 'newProject',
          tags: 'standup,quick',
          estimate: '15m',
        });
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        const newSession = sessions.find(s => s.id !== templateId);

        expect(newSession!.description).toBe('Team meeting'); // From template
        expect(newSession!.project).toBe('newProject'); // Overridden
        expect(newSession!.estimateMinutes).toBe(15); // Overridden

        const tags = db.getSessionTags(newSession!.id!);
        expect(tags.sort()).toEqual(['quick', 'standup'].sort()); // Overridden
      } finally {
        console.log = originalLog;
      }
    });

    it('should error on non-existent session ID', () => {
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      try {
        nextCommand(['9999'], {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Session 9999 not found')
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it('should treat multi-word arguments as description, not session ID', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // This should be treated as a description, not a session ID
        nextCommand(['123', 'and', 'more', 'words'], {});
        reopenDb();

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date());
        expect(sessions).toHaveLength(1);
        expect(sessions[0].description).toBe('123 and more words');
      } finally {
        console.log = originalLog;
      }
    });

    it('should show template source in output', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a template session
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 3600000); // 1 hour later
        const templateId = db.insertSession({
          startTime,
          endTime,
          description: 'Recurring task',
          state: 'completed',
        });

        nextCommand([templateId.toString()], {});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(`Template: Session ${templateId}`)
        );
      } finally {
        console.log = originalLog;
      }
    });
  });
});
