import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-list-cmd/test.db';
const testDataDir = '/tmp/tt-test-list-cmd';

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
    cyan: mockFn,
    magenta: mockFn,
    blue: mockFn,
    italic: mockFn,
    dim: mockFn,
    bold: Object.assign(mockFn, {
      cyan: mockFn,
      yellow: mockFn,
      green: mockFn,
    }),
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
  const testDbPath = '/tmp/tt-test-list-cmd/test.db';
  const testDataDir = '/tmp/tt-test-list-cmd';

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
    })),
  };
});

import { listCommand } from '../list';
import { TimeTrackerDB } from '../../../db/database';

describe('list command', () => {
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
    it('should list sessions for current week', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: 'Test task',
          project: 'myApp',
          state: 'completed',
        });

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Test task');
        expect(output).toContain('myApp');
      } finally {
        console.log = originalLog;
      }
    });

    it('should list sessions for last week', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        lastWeek.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: lastWeek,
          endTime: new Date(lastWeek.getTime() + 3600000),
          description: 'Old task',
          state: 'completed',
        });

        listCommand(undefined, { week: 'last' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Old task');
      } finally {
        console.log = originalLog;
      }
    });

    it('should list sessions for custom date range', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const jan15 = new Date('2024-01-15T10:00:00');
        const jan16 = new Date('2024-01-16T10:00:00');

        db.insertSession({
          startTime: jan15,
          endTime: new Date(jan15.getTime() + 3600000),
          description: 'Jan 15 work',
          state: 'completed',
        });

        db.insertSession({
          startTime: jan16,
          endTime: new Date(jan16.getTime() + 3600000),
          description: 'Jan 16 work',
          state: 'completed',
        });

        listCommand(undefined, { from: '2024-01-15', to: '2024-01-16' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Jan 15 work');
        expect(output).toContain('Jan 16 work');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle only --from flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create session 2 hours ago to ensure it's in range
        const twoHoursAgo = new Date(Date.now() - 7200000);

        db.insertSession({
          startTime: twoHoursAgo,
          endTime: new Date(twoHoursAgo.getTime() + 3600000),
          description: 'Recent work',
          state: 'completed',
        });

        // Use --from with a date that includes the session
        const fromDate = new Date(twoHoursAgo);
        fromDate.setHours(0, 0, 0, 0);
        const fromStr = fromDate.toISOString().split('T')[0];

        listCommand(undefined, { from: fromStr });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Recent work');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle only --to flag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const longAgo = new Date('2020-01-01T10:00:00');

        db.insertSession({
          startTime: longAgo,
          endTime: new Date(longAgo.getTime() + 3600000),
          description: 'Old work',
          state: 'completed',
        });

        listCommand(undefined, { to: 'yesterday' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Old work');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('filters', () => {
    beforeEach(() => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);

      const session1Id = db.insertSession({
        startTime: today,
        endTime: new Date(today.getTime() + 3600000),
        description: 'Project A work',
        project: 'projectA',
        state: 'completed',
      });

      const session2Id = db.insertSession({
        startTime: new Date(today.getTime() + 3600000),
        endTime: new Date(today.getTime() + 7200000),
        description: 'Project B work',
        project: 'projectB',
        state: 'working',
      });

      db.insertSession({
        startTime: new Date(today.getTime() + 7200000),
        endTime: new Date(today.getTime() + 10800000),
        description: 'Paused work',
        state: 'paused',
      });

      db.insertSessionTags(session1Id, ['code', 'feature']);
      db.insertSessionTags(session2Id, ['meeting', 'planning']);
    });

    it('should filter by project', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current', project: 'projectA' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Project A work');
        expect(output).not.toContain('Project B work');
      } finally {
        console.log = originalLog;
      }
    });

    it('should filter by tag', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current', tag: 'meeting' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Project B work');
        expect(output).not.toContain('Project A work');
      } finally {
        console.log = originalLog;
      }
    });

    it('should filter by state', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current', state: 'completed' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Project A work');
        expect(output).not.toContain('Project B work');
        expect(output).not.toContain('Paused work');
      } finally {
        console.log = originalLog;
      }
    });

    it('should combine filters', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current', project: 'projectA', tag: 'code', state: 'completed' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Project A work');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('output formats', () => {
    beforeEach(() => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);

      db.insertSession({
        startTime: today,
        endTime: new Date(today.getTime() + 3600000),
        description: 'Test session',
        project: 'testProject',
        state: 'completed',
      });
    });

    it('should output table format by default', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Table format contains headers
        expect(output).toContain('ID');
        expect(output).toContain('Date');
        expect(output).toContain('Time');
        expect(output).toContain('Description');
        expect(output).toContain('Test session');
      } finally {
        console.log = originalLog;
      }
    });

    it('should output log format', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current', format: 'log' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Log format uses special notation
        expect(output).toContain('Test session');
        expect(output).toContain('@testProject');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error on invalid --from date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        listCommand(undefined, { from: 'invalid-date-string' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing --from date')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error on invalid --to date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        listCommand(undefined, { to: 'not-a-real-date' });

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing --to date')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should handle no sessions found gracefully', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        listCommand(undefined, { week: 'current' });

        expect(mockExit).toHaveBeenCalledWith(0);
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('No sessions found')
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('edge cases', () => {
    it('should display active sessions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          description: 'Active task',
          state: 'working',
        });

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Active task');
        expect(output).toContain('active');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display sessions with interruptions (hierarchical)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        const parentId = db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 7200000),
          description: 'Main task',
          project: 'myApp',
          state: 'completed',
        });

        db.insertSession({
          startTime: new Date(today.getTime() + 1800000),
          endTime: new Date(today.getTime() + 3600000),
          description: 'Interruption',
          parentSessionId: parentId,
          state: 'completed',
        });

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Main task');
        expect(output).toContain('Interruption');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display sessions with explicit duration', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          description: 'Task with explicit duration',
          explicitDurationMinutes: 90,
          state: 'completed',
        });

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Task with explicit duration');
        expect(output).toContain('1h 30m');
      } finally {
        console.log = originalLog;
      }
    });

    it('should truncate long descriptions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        const longDescription = 'A'.repeat(100);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: longDescription,
          state: 'completed',
        });

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Description should be truncated with ...
        expect(output).toContain('...');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle multiple tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        const sessionId = db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: 'Tagged task',
          state: 'completed',
        });

        db.insertSessionTags(sessionId, ['tag1', 'tag2', 'tag3']);

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('tag1');
        expect(output).toContain('tag2');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display all session states correctly', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const today = new Date();
        today.setHours(10, 0, 0, 0);

        db.insertSession({
          startTime: today,
          endTime: new Date(today.getTime() + 3600000),
          description: 'Completed task',
          state: 'completed',
        });

        db.insertSession({
          startTime: new Date(today.getTime() + 3600000),
          description: 'Working task',
          state: 'working',
        });

        db.insertSession({
          startTime: new Date(today.getTime() + 7200000),
          description: 'Paused task',
          state: 'paused',
        });

        db.insertSession({
          startTime: new Date(today.getTime() + 10800000),
          endTime: new Date(today.getTime() + 14400000),
          description: 'Abandoned task',
          state: 'abandoned',
        });

        listCommand(undefined, { week: 'current' });

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Completed task');
        expect(output).toContain('Working task');
        expect(output).toContain('Paused task');
        expect(output).toContain('Abandoned task');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('detailed session view', () => {
    it('should display detailed view for specific session ID', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date('2025-01-15T09:00:00'),
          endTime: new Date('2025-01-15T11:00:00'),
          description: 'Test task for details',
          project: 'testProject',
          estimateMinutes: 120,
          state: 'completed',
        });
        db.insertSessionTags(sessionId, ['code', 'feature']);

        listCommand(sessionId.toString(), {});

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain(`Session ${sessionId}`);
        expect(output).toContain('Test task for details');
        expect(output).toContain('✓ Completed');
        expect(output).toContain('testProject');
        expect(output).toContain('+code');
        expect(output).toContain('+feature');
        expect(output).toContain('⏱  Time Breakdown');
        expect(output).toContain('📊 Insights');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display detailed view with interruptions', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date('2025-01-15T09:00:00'),
          endTime: new Date('2025-01-15T12:00:00'),
          description: 'Main task',
          state: 'completed',
        });

        db.insertSession({
          startTime: new Date('2025-01-15T10:00:00'),
          endTime: new Date('2025-01-15T10:30:00'),
          description: 'Quick meeting',
          state: 'completed',
          parentSessionId: parentId,
        });

        listCommand(parentId.toString(), {});

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Main task');
        expect(output).toContain('Gross time:');
        expect(output).toContain('Interruptions:');
        expect(output).toContain('Net time:');
        expect(output).toContain('🔀 Interruptions');
        expect(output).toContain('Quick meeting');
      } finally {
        console.log = originalLog;
      }
    });

    it('should display parent context for interruption', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const parentId = db.insertSession({
          startTime: new Date('2025-01-15T09:00:00'),
          endTime: new Date('2025-01-15T11:00:00'),
          description: 'Parent task',
          state: 'completed',
        });

        const childId = db.insertSession({
          startTime: new Date('2025-01-15T10:00:00'),
          endTime: new Date('2025-01-15T10:15:00'),
          description: 'Interruption',
          state: 'completed',
          parentSessionId: parentId,
        });

        listCommand(childId.toString(), {});

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Interruption of Session');
        expect(output).toContain('Parent task');
      } finally {
        console.log = originalLog;
      }
    });

    it('should error on invalid session ID', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        listCommand('not-a-number', {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid session ID')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should error on session not found', () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        listCommand('999', {});

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Session 999 not found')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should display active session with elapsed time', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          description: 'Active task',
          state: 'working',
        });

        listCommand(sessionId.toString(), {});

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('▶ Working');
        expect(output).toContain('(active');
        expect(output).toContain('elapsed)');
      } finally {
        console.log = originalLog;
      }
    });

    it('should show estimation insights', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date('2025-01-15T09:00:00'),
          endTime: new Date('2025-01-15T11:00:00'),
          description: 'Task with estimate',
          estimateMinutes: 60, // Estimated 1h, took 2h
          state: 'completed',
        });

        listCommand(sessionId.toString(), {});

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('⚠ Task took');
        expect(output).toContain('longer than estimated');
      } finally {
        console.log = originalLog;
      }
    });

    it('should detect deep work session', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const sessionId = db.insertSession({
          startTime: new Date('2025-01-15T09:00:00'),
          endTime: new Date('2025-01-15T11:00:00'), // 120 minutes
          description: 'Deep work',
          state: 'completed',
        });

        listCommand(sessionId.toString(), {});

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('✓ Deep work session');
      } finally {
        console.log = originalLog;
      }
    });
  });
});
