import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Session, SessionState, ScheduledTask } from '../types/session';
import { DatabaseError } from '../types/errors';

/**
 * Database wrapper for TT time tracker
 */
export class TimeTrackerDB {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    try {
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL'); // Safe for WAL, faster than FULL
      this.db.pragma('foreign_keys = ON');
      this.initialize();
    } catch (error) {
      throw new DatabaseError(`Failed to open database: ${error}`);
    }
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    } catch (error) {
      throw new DatabaseError(`Failed to initialize schema: ${error}`);
    }
  }

  /**
   * Insert a new session
   */
  insertSession(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (
          start_time, end_time, description, project,
          estimate_minutes, explicit_duration_minutes,
          remark, state, parent_session_id, continues_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        session.startTime.toISOString(),
        session.endTime?.toISOString() || null,
        session.description,
        session.project || null,
        session.estimateMinutes || null,
        session.explicitDurationMinutes || null,
        session.remark || null,
        session.state,
        session.parentSessionId || null,
        session.continuesSessionId || null
      );

      return result.lastInsertRowid as number;
    } catch (error) {
      throw new DatabaseError(`Failed to insert session: ${error}`);
    }
  }

  /**
   * Insert tags for a session
   */
  insertSessionTags(sessionId: number, tags: string[]): void {
    if (tags.length === 0) return;

    // Deduplicate tags to avoid UNIQUE constraint violations
    const uniqueTags = [...new Set(tags)];

    try {
      const stmt = this.db.prepare(`
        INSERT INTO session_tags (session_id, tag)
        VALUES (?, ?)
      `);

      const insertMany = this.db.transaction((sessionId: number, tags: string[]) => {
        for (const tag of tags) {
          stmt.run(sessionId, tag);
        }
      });

      insertMany(sessionId, uniqueTags);
    } catch (error) {
      throw new DatabaseError(`Failed to insert tags: ${error}`);
    }
  }

  /**
   * Update tags for a session (replaces all existing tags)
   */
  updateSessionTags(sessionId: number, tags: string[]): void {
    try {
      const updateTags = this.db.transaction((sessionId: number, tags: string[]) => {
        // Delete existing tags
        const deleteStmt = this.db.prepare('DELETE FROM session_tags WHERE session_id = ?');
        deleteStmt.run(sessionId);

        // Insert new tags
        if (tags.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO session_tags (session_id, tag)
            VALUES (?, ?)
          `);

          for (const tag of tags) {
            insertStmt.run(sessionId, tag);
          }
        }
      });

      updateTags(sessionId, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to update tags: ${error}`);
    }
  }

  /**
   * Update a session
   */
  updateSession(id: number, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.startTime !== undefined) {
      fields.push('start_time = ?');
      values.push(updates.startTime.toISOString());
    }
    if (updates.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.endTime?.toISOString() || null);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.project !== undefined) {
      fields.push('project = ?');
      values.push(updates.project || null);
    }
    if (updates.estimateMinutes !== undefined) {
      fields.push('estimate_minutes = ?');
      values.push(updates.estimateMinutes || null);
    }
    if (updates.explicitDurationMinutes !== undefined) {
      fields.push('explicit_duration_minutes = ?');
      values.push(updates.explicitDurationMinutes || null);
    }
    if (updates.remark !== undefined) {
      fields.push('remark = ?');
      values.push(updates.remark || null);
    }
    if (updates.state !== undefined) {
      fields.push('state = ?');
      values.push(updates.state);
    }
    if (updates.parentSessionId !== undefined) {
      fields.push('parent_session_id = ?');
      values.push(updates.parentSessionId || null);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    try {
      const stmt = this.db.prepare(`
        UPDATE sessions
        SET ${fields.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values, id);
    } catch (error) {
      throw new DatabaseError(`Failed to update session: ${error}`);
    }
  }

  /**
   * Get session by ID
   */
  getSessionById(id: number): (Session & { tags: string[] }) | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `);

      const row = stmt.get(id) as any;
      if (!row) return null;

      const tags = this.getSessionTags(id);

      return this.rowToSession(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get session: ${error}`);
    }
  }

  /**
   * Get tags for a session
   */
  getSessionTags(sessionId: number): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT tag FROM session_tags WHERE session_id = ?
      `);

      const rows = stmt.all(sessionId) as any[];
      return rows.map((row) => row.tag);
    } catch (error) {
      throw new DatabaseError(`Failed to get session tags: ${error}`);
    }
  }

  /**
   * Get active session (state = 'working' and end_time is NULL)
   */
  getActiveSession(): (Session & { tags: string[] }) | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE state = 'working' AND end_time IS NULL
        ORDER BY start_time DESC
        LIMIT 1
      `);

      const row = stmt.get() as any;
      if (!row) return null;

      const tags = this.getSessionTags(row.id);
      return this.rowToSession(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get active session: ${error}`);
    }
  }

  /**
   * Get all active sessions (end_time is NULL)
   */
  getAllActiveSessions(): (Session & { tags: string[] })[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE end_time IS NULL
        ORDER BY start_time ASC
      `);

      const rows = stmt.all() as any[];
      return rows.map((row) => {
        const tags = this.getSessionTags(row.id);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get all active sessions: ${error}`);
    }
  }

  /**
   * Get child sessions (interruptions) for a parent session
   */
  getChildSessions(parentSessionId: number): (Session & { tags: string[] })[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE parent_session_id = ?
        ORDER BY start_time ASC
      `);

      const rows = stmt.all(parentSessionId) as any[];
      return rows.map((row) => {
        const tags = this.getSessionTags(row.id);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get child sessions: ${error}`);
    }
  }

  /**
   * Find sessions that overlap with a given time range
   * Returns root sessions (those without parents) that overlap
   */
  getOverlappingSessions(startTime: Date, endTime: Date | null): (Session & { tags: string[] })[] {
    try {
      let query: string;
      let params: any[];

      if (endTime === null) {
        // New session is open-ended starting at startTime
        // It overlaps with existing sessions that:
        // 1. Start at or after startTime (they're in the future)
        // 2. Are open-ended and start at or before startTime (they extend into this time)
        // 3. End after startTime (they're still running when this starts)
        query = `
          SELECT * FROM sessions
          WHERE parent_session_id IS NULL
            AND (
              start_time >= ?
              OR end_time IS NULL
              OR end_time > ?
            )
          ORDER BY start_time ASC
        `;
        params = [startTime.toISOString(), startTime.toISOString()];
      } else {
        // Closed session: overlaps if ranges intersect
        // Two ranges [a1,a2] and [b1,b2] overlap if: a1 < b2 AND b1 < a2
        // For sessions: new_start < existing_end AND existing_start < new_end
        query = `
          SELECT * FROM sessions
          WHERE parent_session_id IS NULL
            AND (
              (start_time < ? AND (end_time IS NULL OR end_time > ?))
            )
          ORDER BY start_time ASC
        `;
        params = [endTime.toISOString(), startTime.toISOString()];
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map((row) => {
        const tags = this.getSessionTags(row.id);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get overlapping sessions: ${error}`);
    }
  }

  /**
   * Get sessions within a time range
   */
  getSessionsByTimeRange(
    startDate: Date,
    endDate: Date,
    options?: {
      project?: string;
      tags?: string[];
      state?: SessionState;
    }
  ): (Session & { tags: string[] })[] {
    try {
      let query = `
        SELECT DISTINCT s.* FROM sessions s
      `;

      const conditions: string[] = [];
      const params: any[] = [];

      // Add tag join if filtering by tags
      if (options?.tags && options.tags.length > 0) {
        query += `
          INNER JOIN session_tags st ON s.id = st.session_id
        `;
        conditions.push(`st.tag IN (${options.tags.map(() => '?').join(', ')})`);
        params.push(...options.tags);
      }

      // Time range filter
      conditions.push('s.start_time >= ?');
      conditions.push('s.start_time < ?');
      params.push(startDate.toISOString(), endDate.toISOString());

      // Project filter
      if (options?.project) {
        conditions.push('s.project = ?');
        params.push(options.project);
      }

      // State filter
      if (options?.state) {
        conditions.push('s.state = ?');
        params.push(options.state);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY s.start_time ASC';

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      return rows.map((row) => {
        const tags = this.getSessionTags(row.id);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get sessions by time range: ${error}`);
    }
  }

  /**
   * Search sessions by description text with optional filters
   * Uses case-insensitive substring matching on description
   */
  searchSessions(
    descriptionTerms: string[],
    options?: {
      project?: string;
      tags?: string[];
      state?: SessionState;
      startDate?: Date;
      endDate?: Date;
    }
  ): (Session & { tags: string[] })[] {
    try {
      let query = `
        SELECT DISTINCT s.* FROM sessions s
      `;

      const conditions: string[] = [];
      const params: any[] = [];
      let needsGroupBy = false;

      // Add tag join if filtering by tags (AND logic: session must have ALL specified tags)
      if (options?.tags && options.tags.length > 0) {
        query += `
          INNER JOIN session_tags st ON s.id = st.session_id
        `;
        conditions.push(`st.tag IN (${options.tags.map(() => '?').join(', ')})`);
        params.push(...options.tags);
        needsGroupBy = true;
      }

      // Description search (case-insensitive, all terms must match)
      if (descriptionTerms.length > 0) {
        for (const term of descriptionTerms) {
          conditions.push('LOWER(s.description) LIKE LOWER(?)');
          params.push(`%${term}%`);
        }
      }

      // Date range filter
      if (options?.startDate) {
        conditions.push('s.start_time >= ?');
        params.push(options.startDate.toISOString());
      }
      if (options?.endDate) {
        conditions.push('s.start_time < ?');
        params.push(options.endDate.toISOString());
      }

      // Project filter
      if (options?.project) {
        conditions.push('s.project = ?');
        params.push(options.project);
      }

      // State filter
      if (options?.state) {
        conditions.push('s.state = ?');
        params.push(options.state);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      // Add GROUP BY and HAVING for tag filtering with AND logic
      if (needsGroupBy) {
        query += ` GROUP BY s.id HAVING COUNT(DISTINCT st.tag) = ${options!.tags!.length}`;
      }

      query += ' ORDER BY s.start_time DESC';

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      const sessions = rows.map((row) => {
        const tags = this.getSessionTags(row.id);
        return this.rowToSession(row, tags);
      });

      // If any matching sessions are interruptions (have parent_session_id),
      // also include their parent sessions so users get full context
      const sessionIds = new Set(sessions.map(s => s.id));
      const parentsToAdd: (Session & { tags: string[] })[] = [];

      for (const session of sessions) {
        if (session.parentSessionId && !sessionIds.has(session.parentSessionId)) {
          // Fetch the parent session
          const parent = this.getSessionById(session.parentSessionId);
          if (parent) {
            sessionIds.add(parent.id!);
            parentsToAdd.push(parent);
          }
        }
      }

      // Combine and sort by start time
      const allSessions = [...sessions, ...parentsToAdd];
      allSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      return allSessions;
    } catch (error) {
      throw new DatabaseError(`Failed to search sessions: ${error}`);
    }
  }

  /**
   * Check if there are any sessions that overlap with the given time range
   * Excludes sessions with the given ID (useful when updating an existing session)
   */
  hasOverlappingSession(startTime: Date, endTime: Date | null = null, excludeSessionId?: number): boolean {
    try {
      // If no end time is provided, we're checking for a session that would start
      // while another session is active (end_time is NULL or end_time > startTime)
      let query = `
        SELECT COUNT(*) as count FROM sessions
        WHERE id != ?
      `;

      const params: any[] = [excludeSessionId ?? -1];

      if (endTime === null) {
        // Checking if starting a new session would overlap with an existing one
        // A new session starting at startTime conflicts if:
        // - There's an active session (end_time IS NULL) that started before startTime
        // - There's a completed session where startTime falls within [start_time, end_time)
        query += ` AND (
          (end_time IS NULL AND start_time < ?)
          OR (end_time IS NOT NULL AND start_time < ? AND end_time > ?)
        )`;
        params.push(startTime.toISOString(), startTime.toISOString(), startTime.toISOString());
      } else {
        // Checking if a time range [startTime, endTime] overlaps with any existing session
        // Two ranges [A1, A2] and [B1, B2] overlap if: A1 < B2 AND A2 > B1
        // For sessions: startTime < session.end_time AND endTime > session.start_time
        query += ` AND (
          (end_time IS NOT NULL AND start_time < ? AND end_time > ?)
          OR (end_time IS NULL AND start_time < ?)
        )`;
        params.push(endTime.toISOString(), startTime.toISOString(), endTime.toISOString());
      }

      const stmt = this.db.prepare(query);
      const result = stmt.get(...params) as any;

      return result.count > 0;
    } catch (error) {
      throw new DatabaseError(`Failed to check for overlapping sessions: ${error}`);
    }
  }

  /**
   * Get all projects
   */
  getAllProjects(): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT project FROM sessions
        WHERE project IS NOT NULL
        ORDER BY project
      `);

      const rows = stmt.all() as any[];
      return rows.map((row) => row.project);
    } catch (error) {
      throw new DatabaseError(`Failed to get projects: ${error}`);
    }
  }

  /**
   * Get all tags
   */
  getAllTags(): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT tag FROM session_tags
        ORDER BY tag
      `);

      const rows = stmt.all() as any[];
      return rows.map((row) => row.tag);
    } catch (error) {
      throw new DatabaseError(`Failed to get tags: ${error}`);
    }
  }

  /**
   * Delete a session and its tags
   */
  deleteSession(id: number): void {
    try {
      const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      throw new DatabaseError(`Failed to delete session: ${error}`);
    }
  }

  /**
   * Delete multiple sessions in a single transaction
   */
  deleteSessions(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }

    const deleteStmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');

    const transaction = this.db.transaction((sessionIds: number[]) => {
      for (const id of sessionIds) {
        deleteStmt.run(id);
      }
    });

    try {
      transaction(ids);
    } catch (error) {
      throw new DatabaseError(`Failed to delete sessions: ${error}`);
    }
  }

  /**
   * Find the most recent paused session matching criteria
   * Used by @resume to find which session to continue
   */
  findPausedSessionToResume(
    description?: string,
    project?: string,
    primaryTag?: string
  ): (Session & { tags: string[] }) | null {
    try {
      let query = `
        SELECT s.* FROM sessions s
        WHERE s.state = 'paused'
      `;
      const params: any[] = [];

      if (description) {
        query += ` AND s.description = ?`;
        params.push(description);
      }
      if (project) {
        query += ` AND s.project = ?`;
        params.push(project);
      }

      query += ` ORDER BY s.start_time DESC LIMIT 1`;

      const row = this.db.prepare(query).get(...params) as any;
      if (!row) return null;

      const tags = this.getSessionTags(row.id);

      // If primaryTag specified, check if it matches
      if (primaryTag && tags[0] !== primaryTag) {
        return null;
      }

      return this.rowToSession(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to find paused session: ${error}`);
    }
  }

  /**
   * Get all sessions in a continuation chain
   * Returns sessions in chronological order
   */
  getContinuationChain(sessionId: number): (Session & { tags: string[] })[] {
    try {
      // Find the root of the chain
      const root = this.getChainRoot(sessionId);
      if (!root || !root.id) {
        return [];
      }

      // Get all sessions in the chain (root + all sessions that point to root)
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE id = ? OR continues_session_id = ?
        ORDER BY start_time ASC
      `);
      const rows = stmt.all(root.id, root.id) as any[];

      // Convert rows to sessions with tags
      const chain: (Session & { tags: string[] })[] = [];
      for (const row of rows) {
        const session = this.rowToSession(row, []);
        const tags = this.getSessionTags(row.id);
        chain.push({ ...session, tags });
      }

      return chain;
    } catch (error) {
      throw new DatabaseError(`Failed to get continuation chain: ${error}`);
    }
  }

  /**
   * Find the root of a continuation chain (the first session with no continuesSessionId)
   * If the session is already the root, returns the session itself
   */
  getChainRoot(sessionId: number): Session | null {
    try {
      const session = this.getSessionById(sessionId);
      if (!session) return null;

      // If this session doesn't continue anything, it's the root
      if (!session.continuesSessionId) {
        return session;
      }

      // Otherwise, return the session it continues from (which is the root)
      return this.getSessionById(session.continuesSessionId);
    } catch (error) {
      throw new DatabaseError(`Failed to get chain root: ${error}`);
    }
  }

  /**
   * Check if a continuation chain is complete (all sessions completed or abandoned)
   */
  isChainComplete(chainRootId: number): boolean {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM sessions
        WHERE (id = ? OR continues_session_id = ?)
          AND state IN ('paused', 'working')
      `);
      const result = stmt.get(chainRootId, chainRootId) as { count: number };
      return result.count === 0;
    } catch (error) {
      throw new DatabaseError(`Failed to check chain completion: ${error}`);
    }
  }

  /**
   * Get all incomplete continuation chains (chains with paused or working sessions)
   * Returns the root session of each incomplete chain
   */
  getIncompleteChains(): (Session & { tags: string[] })[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT s1.*
        FROM sessions s1
        WHERE s1.continues_session_id IS NULL
          AND (
            s1.state IN ('paused', 'working')
            OR EXISTS (
              SELECT 1 FROM sessions s2
              WHERE s2.continues_session_id = s1.id
                AND s2.state IN ('paused', 'working')
            )
          )
        ORDER BY s1.start_time DESC
      `);
      const rows = stmt.all() as any[];

      const chains: (Session & { tags: string[] })[] = [];
      for (const row of rows) {
        const session = this.rowToSession(row, []);
        const tags = this.getSessionTags(row.id);
        chains.push({ ...session, tags });
      }

      return chains;
    } catch (error) {
      throw new DatabaseError(`Failed to get incomplete chains: ${error}`);
    }
  }

  /**
   * Convert database row to Session object
   */
  private rowToSession(row: any, tags: string[]): Session & { tags: string[] } {
    return {
      id: row.id,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      description: row.description,
      project: row.project || undefined,
      estimateMinutes: row.estimate_minutes || undefined,
      explicitDurationMinutes: row.explicit_duration_minutes || undefined,
      remark: row.remark || undefined,
      state: row.state as SessionState,
      parentSessionId: row.parent_session_id || undefined,
      continuesSessionId: row.continues_session_id || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      tags,
    };
  }

  /**
   * Insert a new scheduled task
   */
  insertScheduledTask(task: Omit<ScheduledTask, 'id' | 'createdAt'>): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO scheduled_tasks (
          description, project, estimate_minutes, priority, scheduled_date_time
        ) VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        task.description,
        task.project || null,
        task.estimateMinutes || null,
        task.priority,
        task.scheduledDateTime?.toISOString() || null
      );

      return result.lastInsertRowid as number;
    } catch (error) {
      throw new DatabaseError(`Failed to insert scheduled task: ${error}`);
    }
  }

  /**
   * Insert tags for a scheduled task
   */
  insertScheduledTaskTags(taskId: number, tags: string[]): void {
    if (tags.length === 0) return;

    const uniqueTags = [...new Set(tags)];

    try {
      const stmt = this.db.prepare(`
        INSERT INTO scheduled_task_tags (scheduled_task_id, tag)
        VALUES (?, ?)
      `);

      const insertMany = this.db.transaction((taskId: number, tags: string[]) => {
        for (const tag of tags) {
          stmt.run(taskId, tag);
        }
      });

      insertMany(taskId, uniqueTags);
    } catch (error) {
      throw new DatabaseError(`Failed to insert scheduled task tags: ${error}`);
    }
  }

  /**
   * Get all scheduled tasks with their tags
   */
  getAllScheduledTasks(): (ScheduledTask & { tags: string[] })[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks
        ORDER BY created_at ASC
      `);

      const rows = stmt.all() as any[];
      return rows.map((row) => {
        const tags = this.getScheduledTaskTags(row.id);
        return this.rowToScheduledTask(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled tasks: ${error}`);
    }
  }

  /**
   * Get scheduled task by ID
   */
  getScheduledTaskById(id: number): (ScheduledTask & { tags: string[] }) | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks WHERE id = ?
      `);

      const row = stmt.get(id) as any;
      if (!row) return null;

      const tags = this.getScheduledTaskTags(id);
      return this.rowToScheduledTask(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled task: ${error}`);
    }
  }

  /**
   * Get tags for a scheduled task
   */
  getScheduledTaskTags(taskId: number): string[] {
    try {
      const stmt = this.db.prepare(`
        SELECT tag FROM scheduled_task_tags WHERE scheduled_task_id = ?
      `);

      const rows = stmt.all(taskId) as any[];
      return rows.map((row) => row.tag);
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled task tags: ${error}`);
    }
  }

  /**
   * Update a scheduled task
   */
  updateScheduledTask(id: number, updates: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.project !== undefined) {
      fields.push('project = ?');
      values.push(updates.project || null);
    }
    if (updates.estimateMinutes !== undefined) {
      fields.push('estimate_minutes = ?');
      values.push(updates.estimateMinutes || null);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.scheduledDateTime !== undefined) {
      fields.push('scheduled_date_time = ?');
      values.push(updates.scheduledDateTime?.toISOString() || null);
    }

    if (fields.length === 0) return;

    try {
      const stmt = this.db.prepare(`
        UPDATE scheduled_tasks
        SET ${fields.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values, id);
    } catch (error) {
      throw new DatabaseError(`Failed to update scheduled task: ${error}`);
    }
  }

  /**
   * Update tags for a scheduled task (replaces all existing tags)
   */
  updateScheduledTaskTags(taskId: number, tags: string[]): void {
    try {
      const updateTags = this.db.transaction((taskId: number, tags: string[]) => {
        const deleteStmt = this.db.prepare('DELETE FROM scheduled_task_tags WHERE scheduled_task_id = ?');
        deleteStmt.run(taskId);

        if (tags.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO scheduled_task_tags (scheduled_task_id, tag)
            VALUES (?, ?)
          `);

          for (const tag of tags) {
            insertStmt.run(taskId, tag);
          }
        }
      });

      updateTags(taskId, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to update scheduled task tags: ${error}`);
    }
  }

  /**
   * Delete a scheduled task
   */
  deleteScheduledTask(id: number): void {
    try {
      const stmt = this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      throw new DatabaseError(`Failed to delete scheduled task: ${error}`);
    }
  }

  /**
   * Get scheduled tasks for interactive selection, organized by category
   */
  getScheduledTasksForSelection(): {
    oldest: (ScheduledTask & { tags: string[] })[];
    important: (ScheduledTask & { tags: string[] })[];
    urgent: (ScheduledTask & { tags: string[] })[];
  } {
    try {
      // Oldest: All tasks by creation date ascending (limit 10)
      const oldestStmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks
        ORDER BY created_at ASC
        LIMIT 10
      `);
      const oldestRows = oldestStmt.all() as any[];
      const oldest = oldestRows.map(row => {
        const tags = this.getScheduledTaskTags(row.id);
        return this.rowToScheduledTask(row, tags);
      });

      // Important: Tasks with priority set (not 5), ordered by priority asc then created date (limit 10)
      const importantStmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE priority != 5
        ORDER BY priority ASC, created_at ASC
        LIMIT 10
      `);
      const importantRows = importantStmt.all() as any[];
      const important = importantRows.map(row => {
        const tags = this.getScheduledTaskTags(row.id);
        return this.rowToScheduledTask(row, tags);
      });

      // Urgent: Tasks with scheduled date today or overdue, ordered by date ascending (limit 10)
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const urgentStmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE scheduled_date_time IS NOT NULL
          AND datetime(scheduled_date_time) <= datetime(?)
        ORDER BY scheduled_date_time ASC
        LIMIT 10
      `);
      const urgentRows = urgentStmt.all(endOfToday.toISOString()) as any[];
      const urgent = urgentRows.map(row => {
        const tags = this.getScheduledTaskTags(row.id);
        return this.rowToScheduledTask(row, tags);
      });

      return { oldest, important, urgent };
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled tasks for selection: ${error}`);
    }
  }

  /**
   * Convert database row to ScheduledTask object
   */
  private rowToScheduledTask(row: any, tags: string[]): ScheduledTask & { tags: string[] } {
    return {
      id: row.id,
      description: row.description,
      project: row.project || undefined,
      estimateMinutes: row.estimate_minutes || undefined,
      priority: row.priority,
      scheduledDateTime: row.scheduled_date_time ? new Date(row.scheduled_date_time) : undefined,
      createdAt: new Date(row.created_at),
      tags,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    // Checkpoint WAL to ensure all data is flushed to main database file
    // Uses RESTART mode to handle file system contention (e.g., VS Code extensions)
    // RESTART waits for locks and ensures complete checkpoint, unlike PASSIVE
    try {
      this.db.pragma('wal_checkpoint(RESTART)');
    } catch (error) {
      // Checkpoint might fail if no WAL exists (e.g., :memory: database)
      // Ignore errors - not critical to fail the close operation
    }
    this.db.close();
  }
}
