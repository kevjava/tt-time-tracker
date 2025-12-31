import { SessionWithTags, EstimateAccuracyMetrics } from '../types';
import { getNetSessionDuration } from '../../utils/duration';

/**
 * Group sessions into continuation chains
 * Sessions with continuesSessionId are grouped with their predecessors
 */
function groupByContinuationChain(sessions: SessionWithTags[]): SessionWithTags[][] {
  const chains: SessionWithTags[][] = [];
  const processed = new Set<number>();

  for (const session of sessions) {
    if (!session.id || processed.has(session.id)) continue;

    // Find start of chain (session with no continuesSessionId)
    let current = session;
    while (current.continuesSessionId) {
      const prev = sessions.find((s) => s.id === current.continuesSessionId);
      if (!prev) break;
      current = prev;
    }

    // Build chain forward from start
    const chain: SessionWithTags[] = [current];
    processed.add(current.id!);

    let next = sessions.find((s) => s.continuesSessionId === current.id);
    while (next) {
      chain.push(next);
      processed.add(next.id!);
      current = next;
      next = sessions.find((s) => s.continuesSessionId === current.id);
    }

    chains.push(chain);
  }

  return chains;
}

/**
 * Calculate estimate accuracy metrics
 * Uses net duration (actual work time minus interruptions) for comparison
 * Aggregates continuation chains so multi-session tasks are compared against a single estimate
 */
export function calculateEstimateAccuracy(sessions: SessionWithTags[]): EstimateAccuracyMetrics | null {
  // Group into continuation chains first
  const chains = groupByContinuationChain(sessions);

  // Only process chains that have estimates (first session has estimate) and all sessions have end times
  const estimatedChains = chains.filter(
    (chain) => chain[0].estimateMinutes && chain.every((s) => s.endTime)
  );

  if (estimatedChains.length === 0) {
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

  for (const chain of estimatedChains) {
    const estimateMinutes = chain[0].estimateMinutes!;  // From first session in chain

    // Sum net duration across all sessions in chain
    const actualMinutes = chain.reduce(
      (sum, s) => sum + getNetSessionDuration(s, sessions),
      0
    );

    totalEstimated += estimateMinutes;
    totalActual += actualMinutes;

    const error = actualMinutes - estimateMinutes;
    const errorPercent = estimateMinutes > 0 ? (error / estimateMinutes) * 100 : 0;

    totalAbsoluteError += Math.abs(error);

    misses.push({
      session: chain[0],  // Report using first session in chain
      estimateMinutes,
      actualMinutes,
      errorPercent: Math.abs(errorPercent),
    });
  }

  const averageError = totalAbsoluteError / estimatedChains.length;
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
