import { SessionWithTags, ContextSwitch, ContextSwitchMetrics, SwitchSeverity } from '../types';
import { getDateKey } from '../../utils/date';

/**
 * Determine if a tag indicates a break/non-work activity
 */
function isBreakTag(tag: string): boolean {
  const breakTags = ['lunch', 'break', 'downtime', 'coffee'];
  return breakTags.includes(tag.toLowerCase());
}

/**
 * Determine if a session is a break
 */
function isBreakSession(session: SessionWithTags): boolean {
  return session.tags.some(isBreakTag);
}

/**
 * Determine the severity of a context switch
 */
function calculateSwitchSeverity(from: SessionWithTags, to: SessionWithTags): SwitchSeverity {
  // Not a switch if either is a break
  if (isBreakSession(from) || isBreakSession(to)) {
    return 'none';
  }

  const fromProject = from.project || '';
  const toProject = to.project || '';

  const fromTags = new Set(from.tags.filter((tag) => !isBreakTag(tag)));
  const toTags = new Set(to.tags.filter((tag) => !isBreakTag(tag)));

  // Hard switch: different project AND different primary activity
  if (fromProject !== toProject) {
    // Check if tags overlap
    const hasCommonTag = [...fromTags].some((tag) => toTags.has(tag));
    if (!hasCommonTag) {
      return 'hard';
    }
  }

  // Medium switch: same project, different activity
  if (fromProject === toProject && fromProject !== '') {
    const hasCommonTag = [...fromTags].some((tag) => toTags.has(tag));
    if (!hasCommonTag && fromTags.size > 0 && toTags.size > 0) {
      return 'medium';
    }
  }

  // Soft switch: same project + same activity (or very minor change)
  return 'soft';
}

/**
 * Calculate context switching metrics
 */
export function calculateContextSwitches(sessions: SessionWithTags[]): ContextSwitchMetrics {
  // Filter to only top-level sessions (no interruptions)
  const topLevelSessions = sessions.filter((s) => !s.parentSessionId);

  const switches: ContextSwitch[] = [];
  const switchesByDay = new Map<string, number>();

  for (let i = 1; i < topLevelSessions.length; i++) {
    const from = topLevelSessions[i - 1];
    const to = topLevelSessions[i];

    const severity = calculateSwitchSeverity(from, to);

    if (severity !== 'none') {
      switches.push({
        from,
        to,
        severity,
        timestamp: to.startTime,
      });

      // Track switches by day
      const dayKey = getDateKey(to.startTime);
      switchesByDay.set(dayKey, (switchesByDay.get(dayKey) || 0) + 1);
    }
  }

  // Count by severity
  const hardSwitches = switches.filter((s) => s.severity === 'hard').length;
  const mediumSwitches = switches.filter((s) => s.severity === 'medium').length;
  const softSwitches = switches.filter((s) => s.severity === 'soft').length;

  // Find most fragmented days
  const mostFragmentedDays = Array.from(switchesByDay.entries())
    .map(([date, switches]) => ({ date, switches }))
    .sort((a, b) => b.switches - a.switches)
    .slice(0, 5);

  return {
    totalSwitches: switches.length,
    hardSwitches,
    mediumSwitches,
    softSwitches,
    switches,
    mostFragmentedDays,
  };
}
