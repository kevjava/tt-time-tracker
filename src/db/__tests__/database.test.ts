import { TimeTrackerDB } from '../database';
import { Session } from '../../types/session';

describe('TimeTrackerDB', () => {
  let db: TimeTrackerDB;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new TimeTrackerDB(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('initialization', () => {
    it('should create database with schema', () => {
      // If we get here without errors, schema was created
      expect(db).toBeDefined();
    });

    it('should enable foreign keys', () => {
      // Try to insert a session with invalid parent_session_id
      const session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> = {
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'test task',
        state: 'working',
        parentSessionId: 99999, // Non-existent
      };

      // This should fail due to foreign key constraint
      expect(() => db.insertSession(session)).toThrow();
    });
  });

  describe('insertSession', () => {
    it('should insert a basic session', () => {
      const session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> = {
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'morning standup',
        state: 'working',
      };

      const id = db.insertSession(session);
      expect(id).toBeGreaterThan(0);
    });

    it('should insert session with all fields', () => {
      const session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> = {
        startTime: new Date('2024-12-24T09:00:00'),
        endTime: new Date('2024-12-24T10:00:00'),
        description: 'fix bug',
        project: 'projectX',
        estimateMinutes: 120,
        explicitDurationMinutes: 60,
        remark: 'took less time than expected',
        state: 'completed',
      };

      const id = db.insertSession(session);
      expect(id).toBeGreaterThan(0);

      const retrieved = db.getSessionById(id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.description).toBe('fix bug');
      expect(retrieved!.project).toBe('projectX');
      expect(retrieved!.estimateMinutes).toBe(120);
      expect(retrieved!.explicitDurationMinutes).toBe(60);
      expect(retrieved!.remark).toBe('took less time than expected');
      expect(retrieved!.state).toBe('completed');
    });

    it('should auto-increment IDs', () => {
      const session1: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> = {
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task 1',
        state: 'working',
      };

      const session2: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> = {
        startTime: new Date('2024-12-24T10:00:00'),
        description: 'task 2',
        state: 'working',
      };

      const id1 = db.insertSession(session1);
      const id2 = db.insertSession(session2);

      expect(id2).toBeGreaterThan(id1);
    });
  });

  describe('insertSessionTags', () => {
    it('should insert tags for a session', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'standup',
        state: 'working',
      });

      db.insertSessionTags(sessionId, ['meeting', 'daily']);

      const tags = db.getSessionTags(sessionId);
      expect(tags).toHaveLength(2);
      expect(tags).toContain('meeting');
      expect(tags).toContain('daily');
    });

    it('should handle empty tags array', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task',
        state: 'working',
      });

      db.insertSessionTags(sessionId, []);

      const tags = db.getSessionTags(sessionId);
      expect(tags).toHaveLength(0);
    });

    it('should cascade delete tags when session is deleted', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task',
        state: 'working',
      });

      db.insertSessionTags(sessionId, ['tag1', 'tag2']);

      // Verify tags exist
      expect(db.getSessionTags(sessionId)).toHaveLength(2);

      // Delete session
      db.deleteSession(sessionId);

      // Tags should be gone
      expect(db.getSessionTags(sessionId)).toHaveLength(0);
    });
  });

  describe('updateSession', () => {
    it('should update session fields', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task',
        state: 'working',
      });

      db.updateSession(sessionId, {
        endTime: new Date('2024-12-24T10:00:00'),
        state: 'completed',
        remark: 'finished early',
      });

      const updated = db.getSessionById(sessionId);
      expect(updated!.endTime).toEqual(new Date('2024-12-24T10:00:00'));
      expect(updated!.state).toBe('completed');
      expect(updated!.remark).toBe('finished early');
    });

    it('should update only specified fields', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'original description',
        project: 'projectX',
        state: 'working',
      });

      db.updateSession(sessionId, {
        description: 'updated description',
      });

      const updated = db.getSessionById(sessionId);
      expect(updated!.description).toBe('updated description');
      expect(updated!.project).toBe('projectX'); // Should remain unchanged
    });

    it('should handle empty updates', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task',
        state: 'working',
      });

      // Should not throw
      db.updateSession(sessionId, {});

      const session = db.getSessionById(sessionId);
      expect(session).toBeDefined();
    });
  });

  describe('getSessionById', () => {
    it('should retrieve session with tags', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task',
        project: 'projectX',
        state: 'working',
      });

      db.insertSessionTags(sessionId, ['code', 'urgent']);

      const session = db.getSessionById(sessionId);
      expect(session).toBeDefined();
      expect(session!.description).toBe('task');
      expect(session!.project).toBe('projectX');
      expect(session!.tags).toHaveLength(2);
      expect(session!.tags).toContain('code');
      expect(session!.tags).toContain('urgent');
    });

    it('should return null for non-existent session', () => {
      const session = db.getSessionById(99999);
      expect(session).toBeNull();
    });
  });

  describe('getActiveSession', () => {
    it('should return active session', () => {
      // Insert completed session
      db.insertSession({
        startTime: new Date('2024-12-24T08:00:00'),
        endTime: new Date('2024-12-24T09:00:00'),
        description: 'completed task',
        state: 'completed',
      });

      // Insert active session
      const activeId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'active task',
        state: 'working',
      });

      const active = db.getActiveSession();
      expect(active).toBeDefined();
      expect(active!.id).toBe(activeId);
      expect(active!.description).toBe('active task');
    });

    it('should return null when no active session', () => {
      db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        endTime: new Date('2024-12-24T10:00:00'),
        description: 'completed task',
        state: 'completed',
      });

      const active = db.getActiveSession();
      expect(active).toBeNull();
    });

    it('should return most recent active session', () => {
      db.insertSession({
        startTime: new Date('2024-12-24T08:00:00'),
        description: 'older active',
        state: 'working',
      });

      const latestId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'newer active',
        state: 'working',
      });

      const active = db.getActiveSession();
      expect(active!.id).toBe(latestId);
    });
  });

  describe('getSessionsByTimeRange', () => {
    beforeEach(() => {
      // Insert test data
      const id1 = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'morning task',
        project: 'projectX',
        state: 'completed',
      });
      db.insertSessionTags(id1, ['code', 'feature']);

      const id2 = db.insertSession({
        startTime: new Date('2024-12-24T14:00:00'),
        description: 'afternoon task',
        project: 'projectY',
        state: 'completed',
      });
      db.insertSessionTags(id2, ['meeting']);

      const id3 = db.insertSession({
        startTime: new Date('2024-12-25T09:00:00'),
        description: 'next day task',
        project: 'projectX',
        state: 'completed',
      });
      db.insertSessionTags(id3, ['code']);
    });

    it('should get sessions in time range', () => {
      const sessions = db.getSessionsByTimeRange(
        new Date('2024-12-24T00:00:00'),
        new Date('2024-12-25T00:00:00')
      );

      expect(sessions).toHaveLength(2);
      expect(sessions[0].description).toBe('morning task');
      expect(sessions[1].description).toBe('afternoon task');
    });

    it('should filter by project', () => {
      const sessions = db.getSessionsByTimeRange(
        new Date('2024-12-24T00:00:00'),
        new Date('2024-12-26T00:00:00'),
        { project: 'projectX' }
      );

      expect(sessions).toHaveLength(2);
      expect(sessions.every((s) => s.project === 'projectX')).toBe(true);
    });

    it('should filter by tags', () => {
      const sessions = db.getSessionsByTimeRange(
        new Date('2024-12-24T00:00:00'),
        new Date('2024-12-26T00:00:00'),
        { tags: ['code'] }
      );

      expect(sessions).toHaveLength(2);
      expect(sessions[0].tags).toContain('code');
      expect(sessions[1].tags).toContain('code');
    });

    it('should filter by state', () => {
      db.insertSession({
        startTime: new Date('2024-12-24T16:00:00'),
        description: 'working task',
        state: 'working',
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2024-12-24T00:00:00'),
        new Date('2024-12-25T00:00:00'),
        { state: 'working' }
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].description).toBe('working task');
    });

    it('should combine multiple filters', () => {
      const sessions = db.getSessionsByTimeRange(
        new Date('2024-12-24T00:00:00'),
        new Date('2024-12-26T00:00:00'),
        { project: 'projectX', tags: ['code'], state: 'completed' }
      );

      expect(sessions).toHaveLength(2);
    });
  });

  describe('getAllProjects', () => {
    it('should return all unique projects', () => {
      db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task 1',
        project: 'projectX',
        state: 'working',
      });

      db.insertSession({
        startTime: new Date('2024-12-24T10:00:00'),
        description: 'task 2',
        project: 'projectY',
        state: 'working',
      });

      db.insertSession({
        startTime: new Date('2024-12-24T11:00:00'),
        description: 'task 3',
        project: 'projectX',
        state: 'working',
      });

      const projects = db.getAllProjects();
      expect(projects).toHaveLength(2);
      expect(projects).toContain('projectX');
      expect(projects).toContain('projectY');
    });

    it('should return empty array when no projects', () => {
      const projects = db.getAllProjects();
      expect(projects).toHaveLength(0);
    });
  });

  describe('getAllTags', () => {
    it('should return all unique tags', () => {
      const id1 = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task 1',
        state: 'working',
      });
      db.insertSessionTags(id1, ['code', 'urgent']);

      const id2 = db.insertSession({
        startTime: new Date('2024-12-24T10:00:00'),
        description: 'task 2',
        state: 'working',
      });
      db.insertSessionTags(id2, ['meeting', 'code']);

      const tags = db.getAllTags();
      expect(tags).toHaveLength(3);
      expect(tags).toContain('code');
      expect(tags).toContain('urgent');
      expect(tags).toContain('meeting');
    });

    it('should return empty array when no tags', () => {
      const tags = db.getAllTags();
      expect(tags).toHaveLength(0);
    });
  });

  describe('deleteSession', () => {
    it('should delete session', () => {
      const sessionId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'task',
        state: 'working',
      });

      db.deleteSession(sessionId);

      const session = db.getSessionById(sessionId);
      expect(session).toBeNull();
    });
  });

  describe('parent-child relationships', () => {
    it('should support nested sessions', () => {
      const parentId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'main task',
        state: 'working',
      });

      const childId = db.insertSession({
        startTime: new Date('2024-12-24T10:00:00'),
        description: 'interruption',
        state: 'completed',
        parentSessionId: parentId,
      });

      const child = db.getSessionById(childId);
      expect(child!.parentSessionId).toBe(parentId);
    });

    it('should cascade delete child sessions', () => {
      const parentId = db.insertSession({
        startTime: new Date('2024-12-24T09:00:00'),
        description: 'main task',
        state: 'working',
      });

      const childId = db.insertSession({
        startTime: new Date('2024-12-24T10:00:00'),
        description: 'interruption',
        state: 'completed',
        parentSessionId: parentId,
      });

      // Delete parent
      db.deleteSession(parentId);

      // Child should be deleted too
      expect(db.getSessionById(childId)).toBeNull();
    });
  });
});
