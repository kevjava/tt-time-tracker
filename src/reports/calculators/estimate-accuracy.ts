import { SessionWithTags, EstimateAccuracyMetrics } from '../types';
import { getNetSessionDuration } from '../../utils/duration';

/**
 * Calculate estimate accuracy metrics
 * Uses net duration (actual work time minus interruptions) for comparison
 */
export function calculateEstimateAccuracy(sessions: SessionWithTags[]): EstimateAccuracyMetrics | null {
  const estimatedSessions = sessions.filter((s) => s.estimateMinutes && s.endTime);

  if (estimatedSessions.length === 0) {
    return null;
  }

  let totalEstimated = 0;
  let totalActual = 0;
  let totalAbsoluteError = 0;

  const misses: Array<{
    session: SessionWithTags;
    estimateMinutes: number;
    actualMinutes: number;
    errorPercent: number;
  }> = [];

  for (const session of estimatedSessions) {
    const estimateMinutes = session.estimateMinutes!;
    // Use net duration to compare actual work time vs estimate
    const actualMinutes = getNetSessionDuration(session, sessions);

    totalEstimated += estimateMinutes;
    totalActual += actualMinutes;

    const error = actualMinutes - estimateMinutes;
    const errorPercent = estimateMinutes > 0 ? (error / estimateMinutes) * 100 : 0;

    totalAbsoluteError += Math.abs(error);

    misses.push({
      session,
      estimateMinutes,
      actualMinutes,
      errorPercent: Math.abs(errorPercent),
    });
  }

  const averageError = totalAbsoluteError / estimatedSessions.length;
  const averageErrorPercent = totalEstimated > 0 ? (totalAbsoluteError / totalEstimated) * 100 : 0;

  // Sort by error percent and take worst 5
  const worstMisses = misses
    .sort((a, b) => b.errorPercent - a.errorPercent)
    .slice(0, 5);

  return {
    averageError,
    averageErrorPercent,
    worstMisses,
    totalEstimated,
    totalActual,
  };
}
