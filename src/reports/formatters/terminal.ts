import chalk from 'chalk';
import { WeeklyReport } from '../types';
import { formatDateRange } from '../../utils/date';

/**
 * Format minutes as hours and minutes
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins}m`;
  }

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

/**
 * Format percentage
 */
function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Create a progress bar
 */
function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

/**
 * Format duration change with trend indicator
 */
function formatDurationChange(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return '';

  const indicator = delta > 0 ? chalk.green('↑') : chalk.red('↓');
  const sign = delta > 0 ? '+' : '';
  return ` ${indicator} ${sign}${formatDuration(Math.abs(delta))}`;
}

/**
 * Format count change with trend indicator
 */
function formatCountChange(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return '';

  const indicator = delta > 0 ? chalk.green('↑') : chalk.red('↓');
  const sign = delta > 0 ? '+' : '';
  return ` ${indicator} ${sign}${delta}`;
}

/**
 * Format weekly report for terminal display
 */
export function formatTerminalReport(report: WeeklyReport, previousReport?: WeeklyReport | null): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold.cyan('═'.repeat(80)));
  lines.push(chalk.bold.cyan(`  TIME TRACKING REPORT - ${report.weekLabel}`));
  lines.push(chalk.bold.cyan(`  ${formatDateRange(report.startDate, report.endDate)}`));
  if (previousReport) {
    lines.push(chalk.bold.cyan(`  Comparing to: ${previousReport.weekLabel}`));
  }
  lines.push(chalk.bold.cyan('═'.repeat(80)));
  lines.push('');

  // 1. Summary
  lines.push(chalk.bold.yellow('📊 SUMMARY'));
  lines.push(chalk.gray('─'.repeat(80)));
  const totalTimeChange = previousReport
    ? formatDurationChange(report.summary.totalMinutes, previousReport.summary.totalMinutes)
    : '';
  lines.push(`  Total Time: ${chalk.bold(formatDuration(report.summary.totalMinutes))}${totalTimeChange}`);
  lines.push('');

  // 2. By Project
  if (report.summary.byProject.size > 0) {
    lines.push(chalk.bold.yellow('📁 TIME BY PROJECT'));
    lines.push(chalk.gray('─'.repeat(80)));

    const projectEntries = Array.from(report.summary.byProject.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [project, minutes] of projectEntries) {
      const percent = (minutes / report.summary.totalMinutes) * 100;
      lines.push(
        `  ${chalk.bold(project.padEnd(20))} ` +
        `${formatDuration(minutes).padEnd(10)} ` +
        `${progressBar(percent)} ${formatPercent(percent)}`
      );
    }
    lines.push('');
  }

  // 3. By Activity (Tags)
  if (report.summary.byTag.size > 0) {
    lines.push(chalk.bold.yellow('🏷️  TIME BY ACTIVITY'));
    lines.push(chalk.gray('─'.repeat(80)));

    const tagEntries = Array.from(report.summary.byTag.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 tags

    for (const [tag, minutes] of tagEntries) {
      const percent = (minutes / report.summary.totalMinutes) * 100;
      lines.push(
        `  ${chalk.bold(tag.padEnd(20))} ` +
        `${formatDuration(minutes).padEnd(10)} ` +
        `${progressBar(percent)} ${formatPercent(percent)}`
      );
    }
    lines.push('');
  }

  // 4. Estimates vs Actuals
  if (report.estimateAccuracy) {
    lines.push(chalk.bold.yellow('🎯 ESTIMATE ACCURACY'));
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push(`  Average Error: ${chalk.bold(formatDuration(report.estimateAccuracy.averageError))}`);
    lines.push(`  Average Error %: ${chalk.bold(formatPercent(report.estimateAccuracy.averageErrorPercent))}`);
    lines.push(`  Total Estimated: ${formatDuration(report.estimateAccuracy.totalEstimated)}`);
    lines.push(`  Total Actual: ${formatDuration(report.estimateAccuracy.totalActual)}`);

    if (report.estimateAccuracy.worstMisses.length > 0) {
      lines.push('');
      lines.push(chalk.gray('  Worst Misses:'));
      for (const miss of report.estimateAccuracy.worstMisses.slice(0, 3)) {
        const overUnder = miss.actualMinutes > miss.estimateMinutes ? 'over' : 'under';
        lines.push(
          `    ${chalk.cyan(miss.session.description.substring(0, 40))} - ` +
          `${formatPercent(miss.errorPercent)} ${overUnder}`
        );
      }
    }
    lines.push('');
  }

  // 5. Efficiency
  lines.push(chalk.bold.yellow('⚡ EFFICIENCY'));
  lines.push(chalk.gray('─'.repeat(80)));
  lines.push(`  Gross Time: ${formatDuration(report.efficiency.grossMinutes)}`);
  lines.push(`  Interruption Time: ${formatDuration(report.efficiency.interruptionMinutes)}`);
  lines.push(`  Net Productive Time: ${chalk.bold.green(formatDuration(report.efficiency.netProductiveMinutes))}`);
  lines.push(`  Efficiency Ratio: ${chalk.bold(formatPercent(report.efficiency.efficiencyRatio * 100))}`);
  lines.push('');

  // 6. Context Switching
  lines.push(chalk.bold.yellow('🔀 CONTEXT SWITCHING'));
  lines.push(chalk.gray('─'.repeat(80)));
  const totalSwitchesChange = previousReport
    ? formatCountChange(report.contextSwitches.totalSwitches, previousReport.contextSwitches.totalSwitches)
    : '';
  lines.push(`  Total Switches: ${chalk.bold(report.contextSwitches.totalSwitches)}${totalSwitchesChange}`);
  lines.push(`    Hard Switches: ${chalk.red(report.contextSwitches.hardSwitches)}`);
  lines.push(`    Medium Switches: ${chalk.yellow(report.contextSwitches.mediumSwitches)}`);
  lines.push(`    Soft Switches: ${chalk.green(report.contextSwitches.softSwitches)}`);

  if (report.contextSwitches.mostFragmentedDays.length > 0) {
    lines.push('');
    lines.push(chalk.gray('  Most Fragmented Days:'));
    for (const day of report.contextSwitches.mostFragmentedDays.slice(0, 3)) {
      lines.push(`    ${day.date}: ${chalk.bold(day.switches)} switches`);
    }
  }
  lines.push('');

  // 7. Deep Work Sessions
  lines.push(chalk.bold.yellow('🧠 DEEP WORK SESSIONS'));
  lines.push(chalk.gray('─'.repeat(80)));
  const deepWorkChange = previousReport
    ? formatDurationChange(report.focusBlocks.totalDeepWorkMinutes, previousReport.focusBlocks.totalDeepWorkMinutes)
    : '';
  const deepWorkSessionsChange = previousReport
    ? formatCountChange(report.focusBlocks.deepWorkSessions.length, previousReport.focusBlocks.deepWorkSessions.length)
    : '';
  lines.push(`  Total Deep Work: ${chalk.bold.green(formatDuration(report.focusBlocks.totalDeepWorkMinutes))}${deepWorkChange}`);
  lines.push(`  Sessions: ${report.focusBlocks.deepWorkSessions.length}${deepWorkSessionsChange}`);

  if (report.focusBlocks.deepWorkSessions.length > 0) {
    lines.push(`  Average Length: ${formatDuration(report.focusBlocks.averageSessionLength)}`);
    lines.push('');
    lines.push(chalk.gray('  Deep Work Sessions:'));
    for (const dws of report.focusBlocks.deepWorkSessions) {
      lines.push(
        `    ${chalk.cyan(dws.session.description.substring(0, 50))} - ` +
        `${formatDuration(dws.durationMinutes)}`
      );
    }
  }
  lines.push('');

  // 8. Morning Focus
  if (report.focusBlocks.morningFocusByDay.size > 0) {
    lines.push(chalk.bold.yellow('🌅 MORNING FOCUS'));
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push(chalk.gray('  Time to first context switch each day:'));

    const sortedDays = Array.from(report.focusBlocks.morningFocusByDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [date, minutes] of sortedDays) {
      lines.push(`    ${date}: ${chalk.bold(formatDuration(minutes))}`);
    }
    lines.push('');
  }

  // 9. Outliers
  if (report.outliers.length > 0) {
    lines.push(chalk.bold.yellow('📈 OUTLIERS (>2σ from mean)'));
    lines.push(chalk.gray('─'.repeat(80)));

    for (const outlier of report.outliers.slice(0, 5)) {
      const remarkText = outlier.session.remark ? ` - ${outlier.session.remark}` : '';
      lines.push(
        `  ${chalk.cyan(outlier.session.description.substring(0, 40))} - ` +
        `${formatDuration(outlier.durationMinutes)} ` +
        `(${outlier.deviationFromMean.toFixed(1)}σ)${remarkText}`
      );
    }
    lines.push('');
  }

  // Footer
  lines.push(chalk.bold.cyan('═'.repeat(80)));
  lines.push('');

  return lines.join('\n');
}
