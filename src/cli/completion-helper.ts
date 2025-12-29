#!/usr/bin/env node

/**
 * Completion helper for shell completions
 * Provides dynamic data for tab completion (projects, tags, etc.)
 *
 * Usage:
 *   tt-completion-helper projects  - List recent projects
 *   tt-completion-helper tags      - List recent tags
 */

import { TimeTrackerDB } from '../db/database';
import { ensureDataDir, getDatabasePath } from '../utils/config';

function getRecentProjects(): string[] {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Get projects from sessions in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stmt = db['db'].prepare(`
        SELECT DISTINCT project
        FROM sessions
        WHERE project IS NOT NULL
          AND project != ''
          AND start_time >= ?
        ORDER BY start_time DESC
        LIMIT 20
      `);

      const rows = stmt.all(thirtyDaysAgo.toISOString()) as any[];
      return rows.map(row => row.project);
    } finally {
      db.close();
    }
  } catch (error) {
    return [];
  }
}

function getRecentTags(): string[] {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Get tags from sessions in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stmt = db['db'].prepare(`
        SELECT DISTINCT st.tag
        FROM session_tags st
        JOIN sessions s ON s.id = st.session_id
        WHERE s.start_time >= ?
        ORDER BY s.start_time DESC
        LIMIT 30
      `);

      const rows = stmt.all(thirtyDaysAgo.toISOString()) as any[];
      return rows.map(row => row.tag);
    } finally {
      db.close();
    }
  } catch (error) {
    return [];
  }
}

// Main entry point
const command = process.argv[2];

switch (command) {
  case 'projects':
    console.log(getRecentProjects().join('\n'));
    break;
  case 'tags':
    console.log(getRecentTags().join('\n'));
    break;
  default:
    // Silent failure for unknown commands
    break;
}
