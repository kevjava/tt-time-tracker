import { formatSessionsAsLog } from '../log';
import { TimeTrackerDB } from '../../../db/database';

describe('formatSessionsAsLog', () => {
  let db: TimeTrackerDB;

  beforeEach(() => {
    db = new TimeTrackerDB(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('basic session formatting', () => {
    it('should format a simple session with minimal data', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Simple task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Simple task\n10:00 @end');
    });

    it('should format session with project', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Task with project',
        project: 'ProjectA',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task with project @ProjectA\n10:00 @end');
    });

    it('should format session with tags', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Task with tags',
        state: 'completed',
      });

      db.insertSessionTags(sessionId, ['dev', 'urgent']);

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task with tags +dev +urgent\n10:00 @end');
    });

    it('should format session with estimate', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Task with estimate',
        estimateMinutes: 120,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task with estimate ~2h\n10:00 @end');
    });

    it('should format session with explicit duration', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Task with duration',
        explicitDurationMinutes: 45,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task with duration (45m)\n10:00 @end');
    });

    it('should format session with remark', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Task with remark',
        remark: 'took longer than expected',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task with remark # took longer than expected\n10:00 @end');
    });

    it('should format session with all components', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Complete task',
        project: 'ProjectX',
        estimateMinutes: 90,
        explicitDurationMinutes: 60,
        remark: 'faster than expected',
        state: 'completed',
      });

      db.insertSessionTags(sessionId, ['dev', 'bugfix']);

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      // Check that output contains all expected components (tag order may vary)
      expect(output).toContain('2025-12-27 09:00 Complete task @ProjectX');
      expect(output).toContain('+dev');
      expect(output).toContain('+bugfix');
      expect(output).toContain('~1h30m');
      expect(output).toContain('(1h)');
      expect(output).toContain('# faster than expected');
      expect(output).toMatch(/\+dev \+bugfix|\+bugfix \+dev/);
    });
  });

  describe('date context and timestamp formatting', () => {
    it('should use full timestamp for first session', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'First task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 First task\n10:00 @end');
    });

    it('should not output @end marker when next session starts within same minute', () => {
      // Simulate real-world scenario where sessions end/start within the same minute
      // but with different millisecond timestamps
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00.000'),
        endTime: new Date('2025-12-27T10:00:19.065'),
        description: 'First task',
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T10:00:19.256'),
        endTime: new Date('2025-12-27T11:00:00.000'),
        description: 'Second task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      // Should NOT have @end between the sessions since they're in the same minute
      expect(lines[0]).toBe('2025-12-27 09:00 First task');
      expect(lines[1]).toBe('10:00 Second task');
      expect(lines[2]).toBe('11:00 @end');
      expect(lines.length).toBe(3);
    });

    it('should output @end marker when sessions have gaps greater than a minute', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00.000'),
        endTime: new Date('2025-12-27T10:00:00.000'),
        description: 'First task',
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T10:05:00.000'),
        endTime: new Date('2025-12-27T11:00:00.000'),
        description: 'Second task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      // Should have @end since there's a gap
      expect(lines[0]).toBe('2025-12-27 09:00 First task');
      expect(lines[1]).toBe('10:00 @end');
      expect(lines[2]).toBe('10:05 Second task');
      expect(lines[3]).toBe('11:00 @end');
      expect(lines.length).toBe(4);
    });

    it('should use time-only timestamp for sessions on same date', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'First task',
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T11:00:00'),
        endTime: new Date('2025-12-27T12:00:00'),
        description: 'Second task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 First task');
      expect(lines[1]).toBe('10:00 @end');
      expect(lines[2]).toBe('11:00 Second task');
      expect(lines[3]).toBe('12:00 @end');
    });

    it('should use full timestamp when date changes', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'First day task',
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-28T09:00:00'),
        endTime: new Date('2025-12-28T10:00:00'),
        description: 'Second day task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-28T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 First day task');
      expect(lines[1]).toBe('10:00 @end');
      expect(lines[2]).toBe('2025-12-28 09:00 Second day task');
      expect(lines[3]).toBe('10:00 @end');
    });
  });

  describe('interruptions and indentation', () => {
    it('should indent child sessions with 2 spaces', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T12:00:00'),
        description: 'Parent task',
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T10:00:00'),
        endTime: new Date('2025-12-27T10:30:00'),
        description: 'Interruption',
        parentSessionId: parentId,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 Parent task');
      expect(lines[1]).toBe('  10:00 Interruption (30m)');
      expect(lines[2]).toBe('12:00 @end');
    });

    it('should handle multiple interruptions', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T12:00:00'),
        description: 'Parent task',
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T10:00:00'),
        endTime: new Date('2025-12-27T10:15:00'),
        description: 'First interruption',
        parentSessionId: parentId,
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T10:30:00'),
        endTime: new Date('2025-12-27T10:45:00'),
        description: 'Second interruption',
        parentSessionId: parentId,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 Parent task');
      expect(lines[1]).toBe('  10:00 First interruption (15m)');
      expect(lines[2]).toBe('  10:30 Second interruption (15m)');
      expect(lines[3]).toBe('12:00 @end');
    });

    it('should handle nested interruptions with multiple indent levels', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T12:00:00'),
        description: 'Parent task',
        state: 'completed',
      });

      const childId = db.insertSession({
        startTime: new Date('2025-12-27T10:00:00'),
        endTime: new Date('2025-12-27T11:00:00'),
        description: 'Level 1 interruption',
        parentSessionId: parentId,
        state: 'completed',
      });

      db.insertSession({
        startTime: new Date('2025-12-27T10:15:00'),
        endTime: new Date('2025-12-27T10:30:00'),
        description: 'Level 2 interruption',
        parentSessionId: childId,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 Parent task');
      expect(lines[1]).toBe('  10:00 Level 1 interruption (1h)');
      expect(lines[2]).toBe('    10:15 Level 2 interruption (15m)');
      expect(lines[3]).toBe('12:00 @end');
    });
  });

  describe('state markers', () => {
    it('should output @pause marker for paused sessions', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        description: 'Paused task',
        state: 'paused',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 @pause');
    });

    it('should output @abandon marker for abandoned sessions', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        description: 'Abandoned task',
        state: 'abandoned',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 @abandon');
    });

    it('should preserve remark with state markers', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        description: 'Paused task',
        remark: 'waiting for review',
        state: 'paused',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 @pause # waiting for review');
    });

    it('should use normal description for completed sessions', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:00:00'),
        description: 'Completed task',
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Completed task\n10:00 @end');
    });

    it('should use normal description for working sessions', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        description: 'Active task',
        state: 'working',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Active task');
    });
  });

  describe('duration formatting', () => {
    it('should format hours-only duration', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T11:00:00'),
        description: 'Task',
        explicitDurationMinutes: 120,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task (2h)\n11:00 @end');
    });

    it('should format minutes-only duration', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T09:45:00'),
        description: 'Task',
        explicitDurationMinutes: 45,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task (45m)\n09:45 @end');
    });

    it('should format mixed hours and minutes duration', () => {
      db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T10:30:00'),
        description: 'Task',
        explicitDurationMinutes: 90,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('2025-12-27 09:00 Task (1h30m)\n10:30 @end');
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple sessions with various attributes across multiple days', () => {
      // Day 1
      const session1Id = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T11:00:00'),
        description: 'Morning task',
        project: 'ProjectA',
        explicitDurationMinutes: 120,
        state: 'completed',
      });
      db.insertSessionTags(session1Id, ['dev']);

      db.insertSession({
        startTime: new Date('2025-12-27T14:00:00'),
        endTime: new Date('2025-12-27T15:00:00'),
        description: 'Afternoon task',
        state: 'completed',
      });

      // Day 2
      const session3Id = db.insertSession({
        startTime: new Date('2025-12-28T09:00:00'),
        endTime: new Date('2025-12-28T12:00:00'),
        description: 'Next day task',
        project: 'ProjectB',
        estimateMinutes: 180,
        explicitDurationMinutes: 180,
        state: 'completed',
      });
      db.insertSessionTags(session3Id, ['planning', 'meeting']);

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-28T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 Morning task @ProjectA +dev (2h)');
      expect(lines[1]).toBe('11:00 @end');
      expect(lines[2]).toBe('14:00 Afternoon task');
      expect(lines[3]).toBe('15:00 @end');
      // Tag order may vary
      expect(lines[4]).toContain('2025-12-28 09:00 Next day task @ProjectB');
      expect(lines[4]).toContain('+planning');
      expect(lines[4]).toContain('+meeting');
      expect(lines[4]).toContain('~3h (3h)');
      expect(lines[5]).toBe('12:00 @end');
    });

    it('should handle parent with multiple interruptions and attributes', () => {
      const parentId = db.insertSession({
        startTime: new Date('2025-12-27T09:00:00'),
        endTime: new Date('2025-12-27T15:00:00'),
        description: 'Main development task',
        project: 'ProjectX',
        estimateMinutes: 360,
        explicitDurationMinutes: 360,
        remark: 'productive day',
        state: 'completed',
      });
      db.insertSessionTags(parentId, ['dev', 'feature']);

      const interrupt1Id = db.insertSession({
        startTime: new Date('2025-12-27T10:00:00'),
        endTime: new Date('2025-12-27T10:30:00'),
        description: 'Quick standup',
        parentSessionId: parentId,
        explicitDurationMinutes: 30,
        state: 'completed',
      });
      db.insertSessionTags(interrupt1Id, ['meeting']);

      db.insertSession({
        startTime: new Date('2025-12-27T12:00:00'),
        endTime: new Date('2025-12-27T13:00:00'),
        description: 'Lunch break',
        parentSessionId: parentId,
        explicitDurationMinutes: 60,
        state: 'completed',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);
      const lines = output.split('\n');

      expect(lines[0]).toBe('2025-12-27 09:00 Main development task @ProjectX +dev +feature ~6h (6h) # productive day');
      expect(lines[1]).toBe('  10:00 Quick standup +meeting (30m)');
      expect(lines[2]).toBe('  12:00 Lunch break (1h)');
      expect(lines[3]).toBe('15:00 @end');
    });

    it('should return empty string for empty session list', () => {
      const sessions = db.getSessionsByTimeRange(
        new Date('2025-12-27T00:00:00'),
        new Date('2025-12-27T23:59:59')
      );

      const output = formatSessionsAsLog(sessions, db);

      expect(output).toBe('');
    });
  });
});
