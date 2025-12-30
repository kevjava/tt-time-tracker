import { SessionWithTags, EfficiencyMetrics } from '../types';
import { getSessionDuration } from '../../utils/duration';

/**
 * Calculate efficiency metrics
 * Gross time = all top-level time spent
 * Break time = all time spent on @break sessions (top-level + interruptions)
 * Working time = gross time - break time
 * Interruption time = time spent on interruptions
 * Net productive time = gross time - interruption time
 */
export function calculateEfficiency(sessions: SessionWithTags[]): EfficiencyMetrics {
  let grossMinutes = 0;
  let breakMinutes = 0;
  let interruptionMinutes = 0;

  for (const session of sessions) {
    const duration = getSessionDuration(session);

    // Track break time (all sessions with project = 'break')
    if (session.project === 'break') {
      breakMinutes += duration;
    }

    if (session.parentSessionId) {
      // This is an interruption
      interruptionMinutes += duration;
    } else {
      // Top-level session
      grossMinutes += duration;
    }
  }

  const workingMinutes = grossMinutes - breakMinutes;
  const netProductiveMinutes = grossMinutes - interruptionMinutes;
  const efficiencyRatio = grossMinutes > 0 ? netProductiveMinutes / grossMinutes : 0;

  return {
    grossMinutes,
    breakMinutes,
    workingMinutes,
    interruptionMinutes,
    netProductiveMinutes,
    efficiencyRatio,
  };
}
