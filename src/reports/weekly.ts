import { SessionWithTags, WeeklyReport, TimeSummary, Outlier } from './types';
import { calculateContextSwitches } from './calculators/context-switches';
import { calculateEfficiency } from './calculators/efficiency';
import { calculateFocusBlocks } from './calculators/focus-blocks';
import { calculateEstimateAccuracy } from './calculators/estimate-accuracy';
import { getSessionDuration, getNetSessionDuration } from '../utils/duration';

/**
 * Calculate time summary (total, by project, by tag)
 */
function calculateSummary(sessions: SessionWithTags[]): TimeSummary {
  let totalMinutes = 0;
  const byProject = new Map<string, number>();
  const byTag = new Map<string, number>();

  for (const session of sessions) {
    // Only count top-level sessions (interruptions are tracked separately)
    if (session.parentSessionId) {
      continue;
    }

    const duration = getSessionDuration(session);
    totalMinutes += duration;

    // By project
    if (session.project) {
      byProject.set(session.project, (byProject.get(session.project) || 0) + duration);
    }

    // By tag
    for (const tag of session.tags) {
      byTag.set(tag, (byTag.get(tag) || 0) + duration);
    }
  }

  return {
    totalMinutes,
    byProject,
    byTag,
  };
}

/**
 * Calculate statistical outliers (tasks > 2σ from mean)
 * Uses net duration (actual work time minus interruptions)
 */
function calculateOutliers(sessions: SessionWithTags[]): Outlier[] {
  // Only consider top-level completed sessions
  const completedSessions = sessions.filter((s) => !s.parentSessionId && s.endTime);

  if (completedSessions.length === 0) {
    return [];
  }

  // Use net duration for more accurate outlier detection
  const durations = completedSessions.map(s => getNetSessionDuration(s, sessions));

  // Calculate mean
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;

  // Calculate standard deviation
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  // Find outliers (> 2σ from mean)
  const outliers: Outlier[] = [];

  for (let i = 0; i < completedSessions.length; i++) {
    const session = completedSessions[i];
    const duration = durations[i];
    const deviation = Math.abs(duration - mean);

    if (deviation > 2 * stdDev) {
      outliers.push({
        session,
        durationMinutes: duration,
        deviationFromMean: deviation / stdDev,
      });
    }
  }

  // Sort by deviation, descending
  outliers.sort((a, b) => b.deviationFromMean - a.deviationFromMean);

  return outliers;
}

/**
 * Generate a weekly report from sessions
 */
export function generateWeeklyReport(
  sessions: SessionWithTags[],
  weekLabel: string,
  startDate: Date,
  endDate: Date
): WeeklyReport {
  const summary = calculateSummary(sessions);
  const contextSwitches = calculateContextSwitches(sessions);
  const efficiency = calculateEfficiency(sessions);
  const focusBlocks = calculateFocusBlocks(sessions);
  const estimateAccuracy = calculateEstimateAccuracy(sessions);
  const outliers = calculateOutliers(sessions);

  return {
    weekLabel,
    startDate,
    endDate,
    summary,
    contextSwitches,
    efficiency,
    focusBlocks,
    estimateAccuracy,
    outliers,
  };
}
