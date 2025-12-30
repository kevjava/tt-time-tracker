import { differenceInMinutes } from 'date-fns';

/**
 * Session interface with tags (minimal interface for duration calculations)
 */
export interface SessionWithDuration {
  id?: number;
  startTime: Date;
  endTime?: Date;
  explicitDurationMinutes?: number;
  parentSessionId?: number;
}

/**
 * Calculate gross duration of a session in minutes.
 * Uses explicit duration if provided, otherwise calculates from start/end times.
 */
export function getSessionDuration(session: SessionWithDuration): number {
  if (!session.endTime) {
    return 0;
  }

  // Use explicit duration if provided
  if (session.explicitDurationMinutes) {
    return session.explicitDurationMinutes;
  }

  return differenceInMinutes(session.endTime, session.startTime);
}

/**
 * Calculate net duration of a session in minutes (gross duration minus interruptions).
 *
 * For sessions with interruptions (child sessions), this subtracts the total time
 * spent on interruptions from the gross duration to get actual productive time.
 *
 * @param session - The session to calculate net duration for
 * @param allSessions - All sessions in context (to find child sessions)
 * @returns Net duration in minutes (never negative)
 */
export function getNetSessionDuration(
  session: SessionWithDuration,
  allSessions: SessionWithDuration[]
): number {
  const grossDuration = getSessionDuration(session);

  if (!session.id || grossDuration === 0) {
    return grossDuration;
  }

  // Find all interruptions (child sessions) for this session
  const interruptions = allSessions.filter(s => s.parentSessionId === session.id);

  // Sum up time spent on interruptions
  const interruptionTime = interruptions.reduce(
    (sum, child) => sum + getSessionDuration(child),
    0
  );

  // Net duration is gross minus interruptions (never negative)
  return Math.max(0, grossDuration - interruptionTime);
}
