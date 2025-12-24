import { WeeklyReport } from '../types';

/**
 * Convert a Map to a plain object for JSON serialization
 */
function mapToObject<V>(map: Map<string, V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of map) {
    obj[key] = value;
  }
  return obj;
}

/**
 * Format weekly report as JSON
 */
export function formatJsonReport(report: WeeklyReport): string {
  const jsonData = {
    weekLabel: report.weekLabel,
    startDate: report.startDate.toISOString(),
    endDate: report.endDate.toISOString(),
    summary: {
      totalMinutes: report.summary.totalMinutes,
      byProject: mapToObject(report.summary.byProject),
      byTag: mapToObject(report.summary.byTag),
    },
    contextSwitches: {
      totalSwitches: report.contextSwitches.totalSwitches,
      hardSwitches: report.contextSwitches.hardSwitches,
      mediumSwitches: report.contextSwitches.mediumSwitches,
      softSwitches: report.contextSwitches.softSwitches,
      mostFragmentedDays: report.contextSwitches.mostFragmentedDays,
    },
    efficiency: {
      grossMinutes: report.efficiency.grossMinutes,
      interruptionMinutes: report.efficiency.interruptionMinutes,
      netProductiveMinutes: report.efficiency.netProductiveMinutes,
      efficiencyRatio: report.efficiency.efficiencyRatio,
    },
    focusBlocks: {
      totalDeepWorkMinutes: report.focusBlocks.totalDeepWorkMinutes,
      deepWorkSessionsCount: report.focusBlocks.deepWorkSessions.length,
      averageSessionLength: report.focusBlocks.averageSessionLength,
      deepWorkSessions: report.focusBlocks.deepWorkSessions.map((dws) => ({
        description: dws.session.description,
        project: dws.session.project,
        durationMinutes: dws.durationMinutes,
        startTime: dws.startTime.toISOString(),
        endTime: dws.endTime.toISOString(),
      })),
      morningFocusByDay: mapToObject(report.focusBlocks.morningFocusByDay),
    },
    estimateAccuracy: report.estimateAccuracy
      ? {
          averageError: report.estimateAccuracy.averageError,
          averageErrorPercent: report.estimateAccuracy.averageErrorPercent,
          totalEstimated: report.estimateAccuracy.totalEstimated,
          totalActual: report.estimateAccuracy.totalActual,
          worstMisses: report.estimateAccuracy.worstMisses.map((miss) => ({
            description: miss.session.description,
            estimateMinutes: miss.estimateMinutes,
            actualMinutes: miss.actualMinutes,
            errorPercent: miss.errorPercent,
          })),
        }
      : null,
    outliers: report.outliers.map((outlier) => ({
      description: outlier.session.description,
      durationMinutes: outlier.durationMinutes,
      deviationFromMean: outlier.deviationFromMean,
      remark: outlier.session.remark,
    })),
  };

  return JSON.stringify(jsonData, null, 2);
}
