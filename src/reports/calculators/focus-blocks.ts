import { SessionWithTags, DeepWorkSession, FocusBlockMetrics } from '../types';
import { getDateKey } from '../../utils/date';
import { getSessionDuration, getNetSessionDuration } from '../../utils/duration';

/**
 * Check if a session qualifies as deep work
 * - Net duration (after subtracting interruptions) >= 90 minutes
 * - Must have an end time (completed session)
 */
function isDeepWork(
  session: SessionWithTags,
  allSessions: SessionWithTags[]
): boolean {
  if (!session.endTime) {
    return false;
  }

  // Use net duration (gross duration minus interruption time)
  const netDuration = getNetSessionDuration(session, allSessions);

  return netDuration >= 90;
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
      // Use net duration (gross minus interruptions) for tracking
      const durationMinutes = getNetSessionDuration(session, sessions);
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
