import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Session, SessionState } from '../types/session';
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
          remark, state, parent_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        session.parentSessionId || null
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

      insertMany(sessionId, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to insert tags: ${error}`);
    }
  }

  /**
   * Update a session
   */
  updateSession(id: number, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): void {
    const fields: string[] = [];
    const values: any[] = [];

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
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      tags,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
