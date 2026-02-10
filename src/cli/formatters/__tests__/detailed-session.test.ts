import * as fs from 'fs';

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

import { TimeTrackerDB } from '../../../db/database';
import { formatDetailedSession } from '../detailed-session';

// Set up test database path
const testDbPath = '/tmp/tt-test-detailed-session/test.db';
const testDataDir = '/tmp/tt-test-detailed-session';

describe('formatDetailedSession', () => {
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
  });

  afterEach(() => {
    db.close();
  });

  describe('basic session display', () => {
    it('should display completed session with all fields', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Test task',
        project: 'testProject',
        estimateMinutes: 120,
        state: 'completed',
        endTime: new Date('2025-01-15T11:00:00'),
        remark: 'All done!',
      });

      db.insertSessionTags(sessionId, ['code', 'feature']);

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Session 1');
      expect(output).toContain('Test task');
      expect(output).toContain('✓ Completed');
      expect(output).toContain('Jan 15, 2025 09:00:00');
      expect(output).toContain('Jan 15, 2025 11:00:00');
      expect(output).toContain('testProject');
      expect(output).toContain('+code');
      expect(output).toContain('+feature');
      expect(output).toContain('2h');
      expect(output).toContain('All done!');
    });

    it('should display session without optional fields', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Simple task',
        state: 'completed',
        endTime: new Date('2025-01-15T10:00:00'),
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Simple task');
      expect(output).not.toContain('Project:');
      expect(output).not.toContain('Tags:');
      expect(output).not.toContain('Estimate:');
      expect(output).not.toContain('Remark:');
    });
  });

  describe('session states', () => {
    it('should display working state correctly', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Active task',
        state: 'working',
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('▶ Working');
      expect(output).toContain('(active');
      expect(output).toContain('elapsed)');
    });

    it('should display paused state correctly', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Paused task',
        state: 'paused',
        endTime: new Date('2025-01-15T10:00:00'),
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('⏸ Paused');
    });

    it('should display abandoned state correctly', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Abandoned task',
        state: 'abandoned',
        endTime: new Date('2025-01-15T10:00:00'),
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('✗ Abandoned');
    });
  });

  describe('interruptions', () => {
    it('should display session with single interruption', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Main task',
        state: 'completed',
        endTime: new Date('2025-01-15T11:00:00'),
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Quick meeting',
        state: 'completed',
        endTime: new Date('2025-01-15T10:15:00'),
        parentSessionId: parentId,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Gross time:    2h');
      expect(output).toContain('Interruptions: 15m (1 interruption)');
      expect(output).toContain('Net time:      1h 45m');
      expect(output).toContain('🔀 Interruptions');
      expect(output).toContain('Quick meeting');
      expect(output).toContain('(15m)');
    });

    it('should display session with nested interruptions', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Main task',
        state: 'completed',
        endTime: new Date('2025-01-15T12:00:00'),
      });

      const child1Id = db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'First interruption',
        state: 'completed',
        endTime: new Date('2025-01-15T10:30:00'),
        parentSessionId: parentId,
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:10:00'),
        description: 'Nested interruption',
        state: 'completed',
        endTime: new Date('2025-01-15T10:20:00'),
        parentSessionId: child1Id,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('First interruption');
      expect(output).toContain('Nested interruption');
      expect(output).toContain('Interruptions: 30m (1 interruption)');
    });

    it('should display session with multiple interruptions', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Main task',
        state: 'completed',
        endTime: new Date('2025-01-15T13:00:00'),
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Meeting 1',
        state: 'completed',
        endTime: new Date('2025-01-15T10:15:00'),
        parentSessionId: parentId,
      });

      db.insertSession({
        startTime: new Date('2025-01-15T11:00:00'),
        description: 'Meeting 2',
        state: 'completed',
        endTime: new Date('2025-01-15T11:30:00'),
        parentSessionId: parentId,
      });

      db.insertSession({
        startTime: new Date('2025-01-15T12:00:00'),
        description: 'Quick call',
        state: 'completed',
        endTime: new Date('2025-01-15T12:10:00'),
        parentSessionId: parentId,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Interruptions: 55m (3 interruptions)');
      expect(output).toContain('Meeting 1');
      expect(output).toContain('Meeting 2');
      expect(output).toContain('Quick call');
    });
  });

  describe('parent context', () => {
    it('should display parent context for interruption', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Main task',
        state: 'completed',
        endTime: new Date('2025-01-15T11:00:00'),
      });

      const childId = db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Interruption',
        state: 'completed',
        endTime: new Date('2025-01-15T10:15:00'),
        parentSessionId: parentId,
      });

      const session = db.getSessionById(childId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Interruption of Session 1');
      expect(output).toContain('Main task');
    });
  });

  describe('time calculations', () => {
    it('should handle session with explicit duration', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task with explicit duration',
        state: 'completed',
        explicitDurationMinutes: 90,
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Gross time:    1h 30m');
    });

    it('should calculate elapsed time for active session', () => {
      const sessionId = db.insertSession({
        startTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        description: 'Active task',
        state: 'working',
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('(active');
      expect(output).toContain('elapsed)');
      expect(output).toContain('Gross time:');
    });
  });

  describe('insights - estimation accuracy', () => {
    it('should show accurate estimate insight', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        estimateMinutes: 120,
        state: 'completed',
        endTime: new Date('2025-01-15T11:02:00'), // 122 minutes (within 5 min)
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('✓ Estimate was accurate');
    });

    it('should show over-estimate insight', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        estimateMinutes: 60,
        state: 'completed',
        endTime: new Date('2025-01-15T11:00:00'), // 120 minutes (100% over)
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('⚠ Task took 1h longer than estimated');
      expect(output).toContain('100% over');
    });

    it('should show under-estimate insight', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        estimateMinutes: 120,
        state: 'completed',
        endTime: new Date('2025-01-15T10:00:00'), // 60 minutes (50% under)
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('✓ Task finished 1h faster than estimated');
      expect(output).toContain('50% under');
    });
  });

  describe('insights - interruptions', () => {
    it('should show average interruption duration', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'completed',
        endTime: new Date('2025-01-15T12:00:00'),
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Meeting',
        state: 'completed',
        endTime: new Date('2025-01-15T10:30:00'),
        parentSessionId: parentId,
      });

      db.insertSession({
        startTime: new Date('2025-01-15T11:00:00'),
        description: 'Call',
        state: 'completed',
        endTime: new Date('2025-01-15T11:15:00'),
        parentSessionId: parentId,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      // Average of 30m + 15m = 22.5m, rounds to 23m
      expect(output).toContain('ℹ Average interruption duration: 23m');
    });

    it('should warn about high interruption count', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'completed',
        endTime: new Date('2025-01-15T17:00:00'),
      });

      // Create 5 interruptions
      for (let i = 0; i < 5; i++) {
        db.insertSession({
          startTime: new Date(`2025-01-15T${10 + i}:00:00`),
          description: `Interruption ${i + 1}`,
          state: 'completed',
          endTime: new Date(`2025-01-15T${10 + i}:15:00`),
          parentSessionId: parentId,
        });
      }

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('⚠ High interruption count (5)');
      expect(output).toContain('consider focusing strategies');
    });

    it('should show efficiency percentage', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'completed',
        endTime: new Date('2025-01-15T13:00:00'), // 4 hours
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Meeting',
        state: 'completed',
        endTime: new Date('2025-01-15T11:00:00'), // 1 hour interruption
        parentSessionId: parentId,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('ℹ Efficiency: 75%');
      expect(output).toContain('3h productive / 4h total');
    });

    it('should warn about low efficiency', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'completed',
        endTime: new Date('2025-01-15T13:00:00'), // 4 hours
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Long meeting',
        state: 'completed',
        endTime: new Date('2025-01-15T12:30:00'), // 2.5 hours interruption
        parentSessionId: parentId,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('⚠ Low efficiency');
      expect(output).toContain('interruptions took more than half the time');
    });
  });

  describe('insights - deep work', () => {
    it('should detect deep work session', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Deep work',
        state: 'completed',
        endTime: new Date('2025-01-15T11:00:00'), // 120 minutes
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('✓ Deep work session (≥90 minutes of focused time)');
    });

    it('should not show deep work for shorter sessions', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Short task',
        state: 'completed',
        endTime: new Date('2025-01-15T10:00:00'), // 60 minutes
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).not.toContain('Deep work session');
    });
  });

  describe('insights - active sessions', () => {
    it('should warn about long-running active session', () => {
      const sessionId = db.insertSession({
        startTime: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        description: 'Long active task',
        state: 'working',
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('⚠ Session has been active for 4h');
      expect(output).toContain('consider taking a break');
    });

    it('should not warn about short active sessions', () => {
      const sessionId = db.insertSession({
        startTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        description: 'Short active task',
        state: 'working',
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).not.toContain('consider taking a break');
    });
  });

  describe('edge cases', () => {
    it('should handle session with no insights', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        description: 'Simple completed task',
        state: 'completed',
        endTime: new Date('2025-01-15T09:30:00'),
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('No insights available for this session');
    });

    it('should handle zero-duration active session', () => {
      const sessionId = db.insertSession({
        startTime: new Date(),
        description: 'Just started',
        state: 'working',
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('0m elapsed');
      expect(output).toContain('Gross time:    0m');
    });

    it('should handle session with interruptions but zero gross time', () => {
      const parentId = db.insertSession({
        startTime: new Date(),
        description: 'Parent',
        state: 'paused',
      });

      db.insertSession({
        startTime: new Date(),
        description: 'Child',
        state: 'working',
        parentSessionId: parentId,
      });

      const session = db.getSessionById(parentId);
      const output = formatDetailedSession(session!, db);

      // Should not show efficiency with 0 gross time (avoid NaN)
      expect(output).not.toContain('NaN');
      expect(output).not.toContain('Efficiency: NaN');
    });
  });

  describe('continuation chains', () => {
    it('should display continuation chain for session in chain', () => {
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Feature work',
        project: 'project',
        estimateMinutes: 240,
        state: 'paused',
      });
      db.insertSessionTags(session1Id, ['code']);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T12:00:00'),
        description: 'Feature work',
        state: 'paused',
        continuesSessionId: session1Id,
      });
      db.insertSessionTags(session2Id, ['code']);

      const session3Id = db.insertSession({
        startTime: new Date('2025-01-15T13:00:00'),
        endTime: new Date('2025-01-15T14:30:00'),
        description: 'Feature work',
        state: 'completed',
        continuesSessionId: session1Id,
      });
      db.insertSessionTags(session3Id, ['code']);

      const session = db.getSessionById(session2Id);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('└─ Part of continuation chain (3 sessions)');
      expect(output).toContain('🔗 Continuation Chain');
      expect(output).toContain('This task spans 3 work sessions:');
      expect(output).toContain('Session 1:');
      expect(output).toContain('Session 2:');
      expect(output).toContain('Session 3:');
      expect(output).toContain('Chain Summary:');
      expect(output).toContain('Total time: 4h 30m');
      expect(output).toContain('Estimate: ~4h');
    });

    it('should highlight current session in chain', () => {
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'paused',
      });

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:00:00'),
        description: 'Task',
        state: 'completed',
        continuesSessionId: session1Id,
      });

      const session = db.getSessionById(session2Id);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('▶ Session 2:');
    });

    it('should not show chain section for standalone session', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-15T09:00:00'),
        endTime: new Date('2025-01-15T10:00:00'),
        description: 'Standalone task',
        state: 'completed',
      });

      const session = db.getSessionById(sessionId);
      const output = formatDetailedSession(session!, db);

      expect(output).not.toContain('🔗 Continuation Chain');
      expect(output).not.toContain('Part of continuation chain');
    });

    it('should show chain estimate accuracy', () => {
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        estimateMinutes: 120, // 2h estimate
        state: 'paused',
      });

      db.insertSession({
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:30:00'), // 1.5h, total 2.5h
        description: 'Task',
        state: 'completed',
        continuesSessionId: session1Id,
      });

      const session = db.getSessionById(session1Id);
      const output = formatDetailedSession(session!, db);

      expect(output).toContain('Total time: 2h 30m');
      expect(output).toContain('Estimate: ~2h');
      expect(output).toContain('⚠ Chain is 30m over estimate');
    });
  });
});
