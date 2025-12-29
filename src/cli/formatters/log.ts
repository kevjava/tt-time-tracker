import { format, isSameDay } from 'date-fns';
import { Session, SessionState } from '../../types/session';
import { TimeTrackerDB } from '../../db/database';

/**
 * Format duration as ~2h, ~30m, ~1h30m
 */
function formatDurationString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) return `${hours}h${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Determine if state marker should replace description
 */
function getStateMarker(state: SessionState): string | null {
  if (state === 'paused') return '@pause';
  if (state === 'abandoned') return '@abandon';
  // Completed and working states use normal description
  return null;
}

/**
 * Format single session line with all components
 */
function formatSessionLine(
  session: Session & { tags: string[] },
  depth: number,
  useFullTimestamp: boolean
): string {
  const parts: string[] = [];

  // 1. Timestamp
  const timestamp = useFullTimestamp
    ? format(session.startTime, 'yyyy-MM-dd HH:mm')
    : format(session.startTime, 'HH:mm');
  parts.push(timestamp);

  // 2. State marker or description
  const stateMarker = getStateMarker(session.state);
  if (stateMarker) {
    parts.push(stateMarker);
  } else {
    parts.push(session.description);
  }

  // 3. Project
  if (session.project) {
    parts.push(`@${session.project}`);
  }

  // 4. Tags
  if (session.tags && session.tags.length > 0) {
    for (const tag of session.tags) {
      parts.push(`+${tag}`);
    }
  }

  // 5. Estimate
  if (session.estimateMinutes) {
    parts.push(`~${formatDurationString(session.estimateMinutes)}`);
  }

  // 6. Explicit duration
  if (session.explicitDurationMinutes) {
    parts.push(`(${formatDurationString(session.explicitDurationMinutes)})`);
  }

  // 7. Remark (must be last)
  if (session.remark) {
    parts.push(`# ${session.remark}`);
  }

  // Prepend indentation
  const indentation = depth > 0 ? '  '.repeat(depth) : '';
  return indentation + parts.join(' ');
}

/**
 * Recursively process session and its children
 */
function processSession(
  session: Session & { tags: string[] },
  depth: number,
  previousDate: { current?: Date },
  db: TimeTrackerDB,
  lines: string[]
): void {
  // Check if date changed to determine timestamp format
  const useFullTimestamp = !previousDate.current || !isSameDay(session.startTime, previousDate.current);

  // Update previous date tracker
  previousDate.current = session.startTime;

  // Build and emit line
  const line = formatSessionLine(session, depth, useFullTimestamp);
  lines.push(line);

  // Process children
  if (session.id) {
    const children = db.getChildSessions(session.id);
    for (const child of children) {
      processSession(child, depth + 1, previousDate, db, lines);
    }
  }
}

/**
 * Format sessions in log notation format
 */
export function formatSessionsAsLog(
  sessions: (Session & { tags: string[] })[],
  db: TimeTrackerDB
): string {
  const lines: string[] = [];
  const previousDate: { current?: Date } = {};

  // Process only root sessions (children are handled recursively)
  for (const session of sessions) {
    if (!session.parentSessionId) {
      processSession(session, 0, previousDate, db, lines);
    }
  }

  return lines.join('\n');
}
