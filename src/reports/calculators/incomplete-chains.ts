import { SessionWithTags, IncompleteChain } from '../types';
import { getSessionDuration } from '../../utils/duration';

/**
 * Calculate incomplete continuation chains
 * Returns chains that have at least one paused or working session
 */
export function calculateIncompleteChains(sessions: SessionWithTags[]): IncompleteChain[] {
  const chains = groupSessionsByChain(sessions);
  const incompleteChains: IncompleteChain[] = [];

  for (const chain of chains) {
    // Check if chain has any incomplete sessions
    const incompleteSessions = chain.filter(
      (s) => s.state === 'paused' || s.state === 'working'
    );

    if (incompleteSessions.length > 0) {
      const rootSession = chain[0];

      // Calculate total time (only completed sessions)
      const totalMinutes = chain.reduce((sum, s) => {
        if (s.endTime) {
          return sum + getSessionDuration(s);
        }
        return sum;
      }, 0);

      incompleteChains.push({
        rootSession,
        sessions: chain,
        totalMinutes,
        estimateMinutes: rootSession.estimateMinutes,
        incompleteSessions,
      });
    }
  }

  // Sort by most recent incomplete session
  incompleteChains.sort((a, b) => {
    const aLatest = Math.max(
      ...a.incompleteSessions.map((s) => s.startTime.getTime())
    );
    const bLatest = Math.max(
      ...b.incompleteSessions.map((s) => s.startTime.getTime())
    );
    return bLatest - aLatest;
  });

  return incompleteChains;
}

/**
 * Group sessions into continuation chains
 */
function groupSessionsByChain(sessions: SessionWithTags[]): SessionWithTags[][] {
  const chainMap = new Map<number, SessionWithTags[]>();

  for (const session of sessions) {
    if (!session.id || session.parentSessionId) {
      // Skip sessions without IDs or interruptions
      continue;
    }

    // Get the chain root ID (either the session's continuesSessionId, or its own ID if it's a root)
    const chainRootId = session.continuesSessionId || session.id;

    // Add to the appropriate chain
    if (!chainMap.has(chainRootId)) {
      chainMap.set(chainRootId, []);
    }
    chainMap.get(chainRootId)!.push(session);
  }

  // Convert map to array and sort each chain by start time
  return Array.from(chainMap.values()).map((chain) =>
    chain.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  );
}
