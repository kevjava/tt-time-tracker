import { SessionWithTags, DeepWorkSession, FocusBlockMetrics } from '../types';
import { differenceInMinutes } from 'date-fns';
import { getDateKey } from '../../utils/date';

/**
 * Calculate duration of a session in minutes
 */
function getSessionDuration(session: SessionWithTags): number {
  if (!session.endTime) {
    return 0;
  }

  if (session.explicitDurationMinutes) {
    return session.explicitDurationMinutes;
  }

  return differenceInMinutes(session.endTime, session.startTime);
}

/**
 * Check if a session qualifies as deep work
 * - Duration >= 90 minutes
 * - No interruptions (no child sessions in the time window)
 * - Same project + activity throughout
 */
function isDeepWork(
  session: SessionWithTags,
  allSessions: SessionWithTags[]
): boolean {
  if (!session.endTime) {
    return false;
  }

  const duration = getSessionDuration(session);

  if (duration < 90) {
    return false;
  }

  // Check for interruptions (child sessions)
  const hasInterruptions = allSessions.some(
    (s) => s.parentSessionId === session.id
  );

  if (hasInterruptions) {
    return false;
  }

  return true;
}

/**
 * Calculate time to first context switch each day
 */
function calculateMorningFocus(sessions: SessionWithTags[]): Map<string, number> {
  const morningFocusByDay = new Map<string, number>();

  // Group sessions by day
  const sessionsByDay = new Map<string, SessionWithTags[]>();

  for (const session of sessions) {
    // Only top-level sessions
    if (session.parentSessionId) {
      continue;
    }

    const dayKey = getDateKey(session.startTime);
    if (!sessionsByDay.has(dayKey)) {
      sessionsByDay.set(dayKey, []);
    }
    sessionsByDay.get(dayKey)!.push(session);
  }

  // For each day, calculate time to first switch
  for (const [dayKey, daySessions] of sessionsByDay) {
    if (daySessions.length === 0) {
      continue;
    }

    // Sort by start time
    daySessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Find first context switch
    let focusMinutes = 0;

    for (let i = 0; i < daySessions.length; i++) {
      const session = daySessions[i];

      if (i === 0) {
        // First session - add its duration
        if (session.endTime) {
          focusMinutes += getSessionDuration(session);
        }
      } else {
        // Check if this is a context switch
        const prevSession = daySessions[i - 1];

        // Simple check: different project or different primary tag
        const isSameProject = session.project === prevSession.project;
        const hasSameTag = session.tags.some((tag) => prevSession.tags.includes(tag));

        if (!isSameProject || !hasSameTag) {
          // Context switch found
          break;
        }

        // Same context, add duration
        if (session.endTime) {
          focusMinutes += getSessionDuration(session);
        }
      }
    }

    morningFocusByDay.set(dayKey, focusMinutes);
  }

  return morningFocusByDay;
}

/**
 * Calculate focus block metrics
 */
export function calculateFocusBlocks(sessions: SessionWithTags[]): FocusBlockMetrics {
  const deepWorkSessions: DeepWorkSession[] = [];

  // Find deep work sessions
  for (const session of sessions) {
    if (!session.parentSessionId && isDeepWork(session, sessions)) {
      const durationMinutes = getSessionDuration(session);
      deepWorkSessions.push({
        session,
        durationMinutes,
        startTime: session.startTime,
        endTime: session.endTime!,
      });
    }
  }

  const totalDeepWorkMinutes = deepWorkSessions.reduce((sum, dws) => sum + dws.durationMinutes, 0);
  const averageSessionLength = deepWorkSessions.length > 0 ? totalDeepWorkMinutes / deepWorkSessions.length : 0;

  const morningFocusByDay = calculateMorningFocus(sessions);

  return {
    deepWorkSessions,
    totalDeepWorkMinutes,
    averageSessionLength,
    morningFocusByDay,
  };
}
