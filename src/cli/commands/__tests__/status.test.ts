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
    cyan: mockFn,
    white: mockFn,
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
        expect(output).toContain('Estimate: 1h 30m');
        expect(output).toContain('remaining'); // Should show time remaining
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

        // With the enhanced status command showing summary, help text appears at the end
        const allCalls = (console.log as jest.Mock).mock.calls.flat().join(' ');
        expect(allCalls).toContain('tt help');
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
        expect(output).toContain('Estimate: 1h 15m');
        expect(output).toContain('remaining'); // Should show time remaining
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('today\'s summary calculations', () => {
    it('should use net duration for project breakdown with nested interruptions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const now = Date.now();
        const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000);

        // Main task @project1: Started 3 hours ago (still active)
        const mainId = db.insertSession({
          startTime: threeHoursAgo,
          description: 'Main task',
          project: 'project1',
          state: 'working', // Active session (no endTime)
        });

        // Interruption A @project2: 30 minutes gross (completed)
        const interruptionAId = db.insertSession({
          startTime: new Date(threeHoursAgo.getTime() + 30 * 60 * 1000), // 30 min after main task started
          endTime: new Date(threeHoursAgo.getTime() + 60 * 60 * 1000), // Ended after 30 min
          description: 'Interruption A',
          project: 'project2',
          parentSessionId: mainId,
          state: 'completed',
        });

        // Nested interruption B @project3: 10 minutes (completed)
        db.insertSession({
          startTime: new Date(threeHoursAgo.getTime() + 40 * 60 * 1000), // 10 min after interruption A started
          endTime: new Date(threeHoursAgo.getTime() + 50 * 60 * 1000), // Ended after 10 min
          description: 'Nested interruption B',
          project: 'project3',
          parentSessionId: interruptionAId,
          state: 'completed',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');

        // Verify total time is ~3h (gross time of top-level session)
        expect(output).toMatch(/Total time: 3h/);

        // Verify project breakdown uses net duration:
        // project1: 3h - 30m = 2h 30m net
        expect(output).toMatch(/project1: 2h 30m/);

        // project2: 30m - 10m = 20m net (NOT 30m gross!)
        expect(output).toMatch(/project2: 20m/);

        // project3: 10m (no children)
        expect(output).toMatch(/project3: 10m/);

        // Verify sum: 2h 30m + 20m + 10m = 3h (equals total time, no double counting)
      } finally {
        console.log = originalLog;
      }
    });

    it('should use net duration for longest session calculation', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const now = Date.now();

        // Task started 3h ago with 1h of interruptions = 2h net (still active)
        const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000);
        const longTaskId = db.insertSession({
          startTime: threeHoursAgo,
          description: 'Long task',
          project: 'project1',
          state: 'working', // Active (no endTime)
        });

        db.insertSession({
          startTime: new Date(threeHoursAgo.getTime() + 30 * 60 * 1000),
          endTime: new Date(threeHoursAgo.getTime() + 90 * 60 * 1000), // 1 hour interruption
          description: 'Interruption',
          project: 'project2',
          parentSessionId: longTaskId,
          state: 'completed',
        });

        // Shorter task with no interruptions: started 2h 15m ago
        const twoHours15MinAgo = new Date(now - 2.25 * 60 * 60 * 1000);
        db.insertSession({
          startTime: twoHours15MinAgo,
          description: 'Shorter uninterrupted task',
          project: 'project3',
          state: 'working', // Active (no endTime)
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');

        // Longest session should be 2h 15m (uninterrupted), not 2h (long task net)
        expect(output).toMatch(/Deep work: 2h 15m \(longest session\)/);
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle interruptions with same project as parent', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const now = Date.now();

        // Main task @project1: Started 2h ago (still active)
        const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
        const mainId = db.insertSession({
          startTime: twoHoursAgo,
          description: 'Main task',
          project: 'project1',
          state: 'working', // Active (no endTime)
        });

        // Interruption also @project1: 30m (completed)
        db.insertSession({
          startTime: new Date(twoHoursAgo.getTime() + 30 * 60 * 1000),
          endTime: new Date(twoHoursAgo.getTime() + 60 * 60 * 1000),
          description: 'Interruption same project',
          project: 'project1',
          parentSessionId: mainId,
          state: 'completed',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');

        // Total time: 2h (gross of top-level)
        expect(output).toMatch(/Total time: 2h/);

        // project1 gets: (2h - 30m) + 30m = 2h total
        // Main contributes 1h 30m net, interruption contributes 30m net
        expect(output).toMatch(/project1: 2h/);
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle active sessions with interruptions correctly', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const now = Date.now();
        const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000);

        // Active main task started 2h ago
        const mainId = db.insertSession({
          startTime: twoHoursAgo,
          description: 'Active task',
          project: 'project1',
          state: 'working',
        });

        // Completed interruption that lasted 30 min
        db.insertSession({
          startTime: oneHourAgo,
          endTime: new Date(now - 30 * 60 * 1000),
          description: 'Interruption',
          project: 'project2',
          parentSessionId: mainId,
          state: 'completed',
        });

        statusCommand({});

        const output = (console.log as jest.Mock).mock.calls.join('\n');

        // Total time should be ~2h (gross of active top-level session)
        expect(output).toMatch(/Total time: 2h/);

        // project1 should get net time: ~2h - 30m = ~1h 30m
        expect(output).toMatch(/project1: 1h 30m/);

        // project2 should get interruption time: 30m
        expect(output).toMatch(/project2: 30m/);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
