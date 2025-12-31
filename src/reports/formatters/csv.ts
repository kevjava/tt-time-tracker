import { WeeklyReport } from '../types';

/**
 * Escape CSV field
 */
function escapeCSV(value: string | number | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }

  const str = String(value);

  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Format weekly report as CSV
 * Creates multiple CSV sections for different report aspects
 */
export function formatCsvReport(report: WeeklyReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`Week,${escapeCSV(report.weekLabel)}`);
  lines.push(`Start Date,${report.startDate.toISOString()}`);
  lines.push(`End Date,${report.endDate.toISOString()}`);
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push('Total Minutes,Value');
  lines.push(`${report.summary.totalMinutes}`);
  lines.push('');

  // By Project
  if (report.summary.byProject.size > 0) {
    lines.push('TIME BY PROJECT');
    lines.push('Project,Minutes,Percent');

    const projectEntries = Array.from(report.summary.byProject.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [project, minutes] of projectEntries) {
      const percent = (minutes / report.summary.totalMinutes) * 100;
      lines.push(`${escapeCSV(project)},${minutes},${percent.toFixed(2)}`);
    }
    lines.push('');
  }

  // By Tag
  if (report.summary.byTag.size > 0) {
    lines.push('TIME BY ACTIVITY');
    lines.push('Tag,Minutes,Percent');

    const tagEntries = Array.from(report.summary.byTag.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [tag, minutes] of tagEntries) {
      const percent = (minutes / report.summary.totalMinutes) * 100;
      lines.push(`${escapeCSV(tag)},${minutes},${percent.toFixed(2)}`);
    }
    lines.push('');
  }

  // Efficiency
  lines.push('EFFICIENCY');
  lines.push('Metric,Value');
  lines.push(`Total Tracked Minutes,${report.efficiency.grossMinutes}`);
  lines.push(`Break Minutes,${report.efficiency.breakMinutes}`);
  lines.push(`Working Minutes,${report.efficiency.workingMinutes}`);
  lines.push(`Interruption Minutes,${report.efficiency.interruptionMinutes}`);
  lines.push(`Net Uninterrupted Minutes,${report.efficiency.netUninterruptedMinutes}`);
  lines.push(`Efficiency Ratio,${(report.efficiency.efficiencyRatio * 100).toFixed(2)}`);
  lines.push('');

  // Context Switches
  lines.push('CONTEXT SWITCHING');
  lines.push('Type,Count');
  lines.push(`Total Switches,${report.contextSwitches.totalSwitches}`);
  lines.push(`Hard Switches,${report.contextSwitches.hardSwitches}`);
  lines.push(`Medium Switches,${report.contextSwitches.mediumSwitches}`);
  lines.push(`Soft Switches,${report.contextSwitches.softSwitches}`);
  lines.push('');

  // Deep Work
  lines.push('DEEP WORK');
  lines.push('Description,Duration Minutes,Start Time,End Time');
  for (const dws of report.focusBlocks.deepWorkSessions) {
    lines.push(
      `${escapeCSV(dws.session.description)},${dws.durationMinutes},` +
      `${dws.startTime.toISOString()},${dws.endTime.toISOString()}`
    );
  }
  lines.push('');

  // Estimate Accuracy
  if (report.estimateAccuracy) {
    lines.push('ESTIMATE ACCURACY');
    lines.push('Description,Estimated,Actual,Error Percent');
    for (const miss of report.estimateAccuracy.worstMisses) {
      lines.push(
        `${escapeCSV(miss.session.description)},${miss.estimateMinutes},` +
        `${miss.actualMinutes},${miss.errorPercent.toFixed(2)}`
      );
    }
    lines.push('');
  }

  // Outliers
  if (report.outliers.length > 0) {
    lines.push('OUTLIERS');
    lines.push('Description,Duration Minutes,Deviation (σ),Remark');
    for (const outlier of report.outliers) {
      lines.push(
        `${escapeCSV(outlier.session.description)},${outlier.durationMinutes},` +
        `${outlier.deviationFromMean.toFixed(2)},${escapeCSV(outlier.session.remark)}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
