import { TTDatabase, SessionWithTags, TTScheduledTaskWithTags, SessionState, DatabaseError } from '@kevjava/tt-core';
import Database from 'better-sqlite3';

/**
 * Mapping between TT sessions and Churn tasks.
 * Used to track when a TT session was started from a Churn task,
 * so we can complete the Churn task with actual time when the session stops.
 */
export interface ChurnTaskMapping {
  sessionId: number;
  churnTaskId: number;
  createdAt: Date;
}

/**
 * Extended database class for tt-time-tracker that adds methods not in tt-core.
 * These methods are specific to tt-time-tracker features like:
 * - Overlap detection for session validation
 * - Interruption hierarchies (child sessions)
 * - Full-text search for the find command
 * - Shell completion helpers (getAllProjects, getAllTags)
 */
export class ExtendedTTDatabase extends TTDatabase {
  /**
   * Get access to the underlying better-sqlite3 database for advanced operations.
   * This is needed for tt-time-tracker specific queries that aren't in tt-core.
   */
  protected getDb(): Database.Database {
    // Access the private db field via any - this is a controlled extension pattern
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).db;
  }

  /**
   * Get child sessions (interruptions) for a parent session
   */
  getChildSessions(parentSessionId: number): SessionWithTags[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT * FROM sessions
        WHERE parent_session_id = ?
        ORDER BY start_time ASC
      `);

      const rows = stmt.all(parentSessionId) as Record<string, unknown>[];
      return rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSessionWithTags(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get child sessions: ${error}`);
    }
  }

  /**
   * Find sessions that overlap with a given time range
   * Returns root sessions (those without parents) that overlap
   */
  getOverlappingSessions(startTime: Date, endTime: Date | null): SessionWithTags[] {
    try {
      const db = this.getDb();
      let query: string;
      let params: unknown[];

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

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as Record<string, unknown>[];

      return rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSessionWithTags(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get overlapping sessions: ${error}`);
    }
  }

  /**
   * Check if there are any sessions that overlap with the given time range
   * Excludes sessions with the given ID (useful when updating an existing session)
   */
  hasOverlappingSession(startTime: Date, endTime: Date | null = null, excludeSessionId?: number): boolean {
    try {
      const db = this.getDb();
      // If no end time is provided, we're checking for a session that would start
      // while another session is active (end_time is NULL or end_time > startTime)
      let query = `
        SELECT COUNT(*) as count FROM sessions
        WHERE id != ?
      `;

      const params: unknown[] = [excludeSessionId ?? -1];

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

      const stmt = db.prepare(query);
      const result = stmt.get(...params) as { count: number };

      return result.count > 0;
    } catch (error) {
      throw new DatabaseError(`Failed to check for overlapping sessions: ${error}`);
    }
  }

  /**
   * Get the session that overlaps with the given time range (if any)
   * Returns the overlapping session or null if no overlap exists
   * Excludes sessions with the given ID (useful when updating an existing session)
   */
  getOverlappingSession(
    startTime: Date,
    endTime: Date | null = null,
    excludeSessionId?: number
  ): SessionWithTags | null {
    try {
      const db = this.getDb();
      let query = `
        SELECT * FROM sessions
        WHERE id != ?
      `;

      const params: unknown[] = [excludeSessionId ?? -1];

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

      // Order by end_time descending to get the most recent completed session first
      // This is important for the auto-adjustment logic
      query += ' ORDER BY end_time DESC NULLS FIRST LIMIT 1';

      const stmt = db.prepare(query);
      const row = stmt.get(...params) as Record<string, unknown> | undefined;

      if (!row) {
        return null;
      }

      const tags = this.getSessionTags(row.id as number);
      return this.rowToSessionWithTags(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get overlapping session: ${error}`);
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
  ): SessionWithTags[] {
    try {
      const db = this.getDb();
      let query = `
        SELECT DISTINCT s.* FROM sessions s
      `;

      const conditions: string[] = [];
      const params: unknown[] = [];
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

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as Record<string, unknown>[];

      const sessions = rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSessionWithTags(row, tags);
      });

      // If any matching sessions are interruptions (have parent_session_id),
      // also include their parent sessions so users get full context
      const sessionIds = new Set(sessions.map(s => s.id));
      const parentsToAdd: SessionWithTags[] = [];

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
   * Get all projects
   */
  getAllProjects(): string[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT DISTINCT project FROM sessions
        WHERE project IS NOT NULL
        ORDER BY project
      `);

      const rows = stmt.all() as { project: string }[];
      return rows.map((row) => row.project);
    } catch (error) {
      throw new DatabaseError(`Failed to get projects: ${error}`);
    }
  }

  /**
   * Get all scheduled tasks with their tags, sorted by scheduled date and priority.
   * This overrides tt-core's method which sorts by created_at to maintain
   * tt-time-tracker's expected behavior.
   */
  getAllScheduledTasks(): TTScheduledTaskWithTags[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT * FROM scheduled_tasks
        ORDER BY
          scheduled_date_time IS NULL,
          scheduled_date_time ASC,
          priority ASC
      `);

      const rows = stmt.all() as Record<string, unknown>[];
      return rows.map((row) => {
        const tags = this.getScheduledTaskTags(row.id as number);
        return this.rowToScheduledTaskWithTags(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled tasks: ${error}`);
    }
  }

  /**
   * Get all tags
   */
  getAllTags(): string[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT DISTINCT tag FROM session_tags
        ORDER BY tag
      `);

      const rows = stmt.all() as { tag: string }[];
      return rows.map((row) => row.tag);
    } catch (error) {
      throw new DatabaseError(`Failed to get tags: ${error}`);
    }
  }

  /**
   * Delete multiple sessions in a single transaction
   */
  deleteSessions(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }

    const db = this.getDb();
    const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?');

    const transaction = db.transaction((sessionIds: number[]) => {
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
   * Check if a continuation chain is complete (all sessions completed or abandoned)
   */
  isChainComplete(chainRootId: number): boolean {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
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
   * Get incomplete continuation chains for interactive selection
   * Returns chains where the most recent session is paused or working (limit 10)
   */
  getIncompleteContinuationChainsForSelection(): (SessionWithTags & {
    totalMinutes?: number;
    chainSessionCount?: number;
  })[] {
    try {
      const db = this.getDb();
      // Get all paused sessions (exclude working/active sessions)
      const stmt = db.prepare(`
        SELECT * FROM sessions
        WHERE state = 'paused'
          AND parent_session_id IS NULL
        ORDER BY start_time DESC
      `);
      const rows = stmt.all() as Record<string, unknown>[];

      // Group sessions by continuation chain and filter to incomplete chains
      const chainMap = new Map<number, SessionWithTags[]>();

      for (const row of rows) {
        const session = this.rowToSessionWithTags(row, []);
        const tags = this.getSessionTags(row.id as number);
        const sessionWithTags = { ...session, tags };

        if (!session.id) continue;

        // Get the chain root ID
        const chainRootId = session.continuesSessionId || session.id;

        if (!chainMap.has(chainRootId)) {
          chainMap.set(chainRootId, []);
        }
        chainMap.get(chainRootId)!.push(sessionWithTags);
      }

      // For each chain, check if the most recent session is incomplete
      const incompleteTasks: (SessionWithTags & {
        totalMinutes?: number;
        chainSessionCount?: number;
      })[] = [];

      for (const [chainRootId] of chainMap.entries()) {
        // Get all sessions in the chain (to calculate total time)
        const fullChain = this.getContinuationChain(chainRootId);

        if (fullChain.length === 0) continue;

        // Get the most recent session in the chain
        const mostRecent = fullChain[fullChain.length - 1];

        // Only include if the chain is paused (not working/active)
        if (mostRecent.state === 'paused') {
          // Calculate total time from completed sessions
          let totalMinutes = 0;
          for (const session of fullChain) {
            if (session.endTime) {
              const duration = (session.endTime.getTime() - session.startTime.getTime()) / 60000;
              totalMinutes += duration;
            }
          }

          // Add to incomplete tasks (use most recent paused session as representative)
          incompleteTasks.push({
            ...mostRecent,
            totalMinutes,
            chainSessionCount: fullChain.length,
          });
        }
      }

      // Sort by most recent start time and limit to 10
      incompleteTasks.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      return incompleteTasks.slice(0, 10);
    } catch (error) {
      throw new DatabaseError(`Failed to get incomplete continuation chains: ${error}`);
    }
  }

  /**
   * Convert database row to SessionWithTags object
   */
  private rowToSessionWithTags(row: Record<string, unknown>, tags: string[]): SessionWithTags {
    return {
      id: row.id as number,
      startTime: new Date(row.start_time as string),
      endTime: row.end_time ? new Date(row.end_time as string) : undefined,
      description: row.description as string,
      project: (row.project as string) || undefined,
      estimateMinutes: (row.estimate_minutes as number) || undefined,
      explicitDurationMinutes: (row.explicit_duration_minutes as number) || undefined,
      remark: (row.remark as string) || undefined,
      state: row.state as SessionState,
      parentSessionId: (row.parent_session_id as number) || undefined,
      continuesSessionId: (row.continues_session_id as number) || undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      tags,
    };
  }

  /**
   * Convert database row to TTScheduledTaskWithTags object
   */
  private rowToScheduledTaskWithTags(row: Record<string, unknown>, tags: string[]): TTScheduledTaskWithTags {
    return {
      id: row.id as number,
      description: row.description as string,
      project: (row.project as string) || undefined,
      estimateMinutes: (row.estimate_minutes as number) || undefined,
      priority: row.priority as number,
      scheduledDateTime: row.scheduled_date_time
        ? new Date(row.scheduled_date_time as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      tags,
    };
  }

  // ==================== Churn Task Mapping ====================

  /**
   * Ensure the churn_task_mappings table exists
   */
  ensureChurnMappingTable(): void {
    try {
      const db = this.getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS churn_task_mappings (
          session_id INTEGER PRIMARY KEY,
          churn_task_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `);
    } catch (error) {
      throw new DatabaseError(`Failed to create churn_task_mappings table: ${error}`);
    }
  }

  /**
   * Store a mapping between a TT session and a Churn task
   */
  setChurnTaskMapping(sessionId: number, churnTaskId: number): void {
    try {
      this.ensureChurnMappingTable();
      const db = this.getDb();
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO churn_task_mappings (session_id, churn_task_id)
        VALUES (?, ?)
      `);
      stmt.run(sessionId, churnTaskId);
    } catch (error) {
      throw new DatabaseError(`Failed to set churn task mapping: ${error}`);
    }
  }

  /**
   * Get the Churn task ID associated with a TT session
   */
  getChurnTaskId(sessionId: number): number | null {
    try {
      this.ensureChurnMappingTable();
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT churn_task_id FROM churn_task_mappings WHERE session_id = ?
      `);
      const row = stmt.get(sessionId) as { churn_task_id: number } | undefined;
      return row?.churn_task_id ?? null;
    } catch (error) {
      throw new DatabaseError(`Failed to get churn task ID: ${error}`);
    }
  }

  /**
   * Remove the Churn task mapping for a session
   */
  removeChurnTaskMapping(sessionId: number): void {
    try {
      this.ensureChurnMappingTable();
      const db = this.getDb();
      const stmt = db.prepare(`
        DELETE FROM churn_task_mappings WHERE session_id = ?
      `);
      stmt.run(sessionId);
    } catch (error) {
      throw new DatabaseError(`Failed to remove churn task mapping: ${error}`);
    }
  }
}
