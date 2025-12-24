import { SessionWithTags, EfficiencyMetrics } from '../types';
import { differenceInMinutes } from 'date-fns';

/**
 * Calculate duration of a session in minutes
 */
function getSessionDuration(session: SessionWithTags): number {
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
 * Calculate efficiency metrics
 * Gross time = all time spent
 * Interruption time = time spent on interruptions
 * Net productive time = gross time - interruption time
 */
export function calculateEfficiency(sessions: SessionWithTags[]): EfficiencyMetrics {
  let grossMinutes = 0;
  let interruptionMinutes = 0;

  for (const session of sessions) {
    const duration = getSessionDuration(session);

    if (session.parentSessionId) {
      // This is an interruption
      interruptionMinutes += duration;
    } else {
      // Top-level session
      grossMinutes += duration;
    }
  }

  const netProductiveMinutes = grossMinutes - interruptionMinutes;
  const efficiencyRatio = grossMinutes > 0 ? netProductiveMinutes / grossMinutes : 0;

  return {
    grossMinutes,
    interruptionMinutes,
    netProductiveMinutes,
    efficiencyRatio,
  };
}
