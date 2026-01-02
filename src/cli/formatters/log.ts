import { format, isSameDay } from 'date-fns';
import { Session, SessionState } from '../../types/session';
import { TimeTrackerDB } from '../../db/database';

/**
 * Round a timestamp to minute precision (truncate seconds and milliseconds)
 */
function roundToMinute(date: Date): number {
  return Math.floor(date.getTime() / 60000) * 60000;
}

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
 * Get state suffix marker if needed
 * Only non-default terminal states get explicit markers
 */
function getStateSuffix(state: SessionState): string | null {
  if (state === 'paused') return '->paused';
  if (state === 'abandoned') return '->abandoned';
  // 'completed' and 'working' states don't need explicit markers
  // (completed is the default terminal state, working is indicated by absence of end time)
  return null;
}

/**
 * Format single session line with all components
 */
function formatSessionLine(
  session: Session & { tags: string[] },
  depth: number,
  useFullTimestamp: boolean,
  isInterruption: boolean
): string {
  const parts: string[] = [];

  // 1. Timestamp
  const timestamp = useFullTimestamp
    ? format(session.startTime, 'yyyy-MM-dd HH:mm')
    : format(session.startTime, 'HH:mm');
  parts.push(timestamp);

  // 2. Description (always included)
  parts.push(session.description);

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
  // For interruptions, always output calculated duration for round-trip compatibility
  if (isInterruption && session.endTime) {
    const durationMinutes = Math.floor(
      (session.endTime.getTime() - session.startTime.getTime()) / 60000
    );
    parts.push(`(${formatDurationString(durationMinutes)})`);
  } else if (session.explicitDurationMinutes) {
    // For top-level sessions, only output if explicitly set
    parts.push(`(${formatDurationString(session.explicitDurationMinutes)})`);
  }

  // 7. State suffix (->paused, ->completed, ->abandoned)
  const stateSuffix = getStateSuffix(session.state);
  if (stateSuffix) {
    parts.push(stateSuffix);
  }

  // 8. Remark (must be last)
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
  lines: string[],
  nextSiblingStart?: Date
): void {
  // Check if date changed to determine timestamp format
  const useFullTimestamp = !previousDate.current || !isSameDay(session.startTime, previousDate.current);

  // Update previous date tracker
  previousDate.current = session.startTime;

  // Build and emit line
  const isInterruption = depth > 0;
  const line = formatSessionLine(session, depth, useFullTimestamp, isInterruption);
  lines.push(line);

  // Process children
  if (session.id) {
    const children = db.getChildSessions(session.id);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const nextChild = children[i + 1];
      const nextChildStart = nextChild?.startTime;

      processSession(child, depth + 1, previousDate, db, lines, nextChildStart);
    }
  }

  // Only output @end markers for top-level sessions (depth === 0)
  // Interruptions use explicit durations instead
  if (depth === 0 && session.endTime) {
    // Compare at minute precision since log notation only has minute granularity
    // This prevents unnecessary @end markers when sessions end/start within the same minute
    const needsEndMarker = !nextSiblingStart ||
      roundToMinute(session.endTime) !== roundToMinute(nextSiblingStart);

    if (needsEndMarker) {
      // Determine timestamp format for @end marker
      const endUseFullTimestamp = !isSameDay(session.endTime, previousDate.current);
      const endTimestamp = endUseFullTimestamp
        ? format(session.endTime, 'yyyy-MM-dd HH:mm')
        : format(session.endTime, 'HH:mm');

      const endParts = [endTimestamp, '@end'];

      lines.push(endParts.join(' '));
      previousDate.current = session.endTime;
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

  // Get root sessions
  const rootSessions = sessions.filter(s => !s.parentSessionId);

  // Process only root sessions (children are handled recursively)
  for (let i = 0; i < rootSessions.length; i++) {
    const session = rootSessions[i];
    const nextSession = rootSessions[i + 1];
    const nextSiblingStart = nextSession?.startTime;

    processSession(session, 0, previousDate, db, lines, nextSiblingStart);
  }

  return lines.join('\n');
}
