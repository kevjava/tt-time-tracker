import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-status-cmd/test.db';
const testDataDir = '/tmp/tt-test-status-cmd';

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
    yellow: mockFn,
    bold: mockFn,
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
  const testDbPath = '/tmp/tt-test-status-cmd/test.db';
  const testDataDir = '/tmp/tt-test-status-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

import { statusCommand } from '../status';
import { TimeTrackerDB } from '../../../db/database';

describe('status command', () => {
  let db: TimeTrackerDB;

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
    it('should display active working session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'Active task',
          state: 'working',
        });

        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Active Timers')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Active task')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('▶')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display paused session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          description: 'Paused task',
          state: 'paused',
        });

        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Paused task')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('⏸')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display elapsed time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create session 90 minutes ago
        db.insertSession({
          startTime: new Date(Date.now() - 5400000),
          description: 'Long task',
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Should show elapsed time in hours and minutes
        expect(output).toMatch(/1h\s+\d+m/);
      } finally {
        console.log = originalLog;
      }
    });

    it('should not display completed sessions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          endTime: new Date(Date.now() - 3600000),
          description: 'Completed task',
          state: 'completed',
        });

        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No active timers')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display abandoned sessions (no end_time)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Abandoned task',
          state: 'abandoned',
        });

        statusCommand({});

        // Abandoned sessions are still "active" (no end_time set)
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Abandoned task')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('no active sessions', () => {
    it('should display message when no active sessions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No active timers')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should show help text when called as default command', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        statusCommand({ isDefault: true });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No active timers')
        );
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('tt help')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('metadata display', () => {
    it('should display project', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Feature work',
          project: 'myApp',
          state: 'working',
        });

        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Project: myApp')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Development task',
          state: 'working',
        });

        db.insertSessionTags(sessionId, ['code', 'feature']);

        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Tags: code, feature')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display estimate', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Estimated task',
          estimateMinutes: 120,
          state: 'working',
        });

        statusCommand({});

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Estimate: 2h')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should display all metadata together', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Complex task',
          project: 'myProject',
          estimateMinutes: 90,
          state: 'working',
        });

        db.insertSessionTags(sessionId, ['urgent', 'bug']);

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Complex task');
        expect(output).toContain('Project: myProject');
        expect(output).toContain('Tags: bug, urgent'); // Tags are sorted alphabetically
        expect(output).toContain('Estimate: 1h30m');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('interruption hierarchy', () => {
    it('should display single interruption', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          description: 'Main task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 1800000), // 30 minutes ago
          description: 'Quick interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Main task');
        expect(output).toContain('⏸');
        expect(output).toContain('Interrupted by:');
        expect(output).toContain('Quick interruption');
        expect(output).toContain('▶');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display nested interruptions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Level 0: Main task
        const mainId = db.insertSession({
          startTime: new Date(Date.now() - 10800000), // 3 hours ago
          description: 'Main task',
          state: 'paused',
        });

        // Level 1: First interruption
        const interruption1Id = db.insertSession({
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          description: 'First interruption',
          state: 'paused',
          parentSessionId: mainId,
        });

        // Level 2: Second interruption
        db.insertSession({
          startTime: new Date(Date.now() - 1800000), // 30 minutes ago
          description: 'Second interruption',
          state: 'working',
          parentSessionId: interruption1Id,
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Main task');
        expect(output).toContain('First interruption');
        expect(output).toContain('Second interruption');
        // Should show nested structure
        expect(output).toContain('Interrupted by:');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display multiple interruptions of same parent', () => {
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
          endTime: new Date(Date.now() - 1800000),
          description: 'First interruption',
          state: 'completed',
          parentSessionId: parentId,
        });

        db.insertSession({
          startTime: new Date(Date.now() - 900000),
          description: 'Second interruption',
          state: 'working',
          parentSessionId: parentId,
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Main task');
        // Should only show active interruption (second one)
        expect(output).toContain('Second interruption');
        // Should not show completed interruption
        expect(output).not.toContain('First interruption');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('multiple active sessions', () => {
    it('should display multiple root sessions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Task 1',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task 2',
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Task 1');
        expect(output).toContain('Task 2');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle sessions with parent and independent sessions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create parent-child relationship
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          description: 'Parent task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Child task',
          state: 'working',
          parentSessionId: parentId,
        });

        // Create independent session
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Independent task',
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Should display both parent-child hierarchy and independent session
        expect(output).toContain('Parent task');
        expect(output).toContain('Child task');
        expect(output).toContain('Independent task');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle child with inactive parent', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create completed parent
        const parentId = db.insertSession({
          startTime: new Date(Date.now() - 7200000),
          endTime: new Date(Date.now() - 3600000),
          description: 'Completed parent',
          state: 'completed',
        });

        // Create active child
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Active child',
          state: 'working',
          parentSessionId: parentId,
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Should display child as root since parent is inactive
        expect(output).toContain('Active child');
        expect(output).not.toContain('Completed parent');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('console output', () => {
    it('should show help text when called with isDefault flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Active task',
          state: 'working',
        });

        statusCommand({ isDefault: true });

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('tt help')
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should not show help text without isDefault flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Active task',
          state: 'working',
        });

        statusCommand({});

        const helpCalls = (console.log as jest.Mock).mock.calls.filter((call: any[]) =>
          call.some((arg: any) => typeof arg === 'string' && arg.includes('tt help'))
        );
        expect(helpCalls).toHaveLength(0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('edge cases', () => {
    it('should handle session with no metadata', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Simple task',
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Simple task');
        // Should not crash, just not display project/tags/estimate sections
        expect(output).not.toContain('Project:');
        expect(output).not.toContain('Tags:');
        expect(output).not.toContain('Estimate:');
      } finally {
        console.log = originalLog;
      }
    });

    it('should format short elapsed time (< 1 hour)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Session 30 minutes ago
        db.insertSession({
          startTime: new Date(Date.now() - 1800000),
          description: 'Quick task',
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Should show just minutes, no hours
        expect(output).toMatch(/30m\)/);
      } finally {
        console.log = originalLog;
      }
    });

    it('should format estimate with only hours', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          estimateMinutes: 60, // Exactly 1 hour
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Estimate: 1h');
      } finally {
        console.log = originalLog;
      }
    });

    it('should format estimate with hours and minutes', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        db.insertSession({
          startTime: new Date(Date.now() - 3600000),
          description: 'Task',
          estimateMinutes: 75, // 1h 15m
          state: 'working',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Estimate: 1h15m');
      } finally {
        console.log = originalLog;
      }
    });
  });
});
