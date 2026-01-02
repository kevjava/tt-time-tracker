import chalk from 'chalk';
import { WeeklyReport } from '../types';
import { formatDateRange } from '../../utils/date';
import * as theme from '../../utils/theme';

/**
 * Format percentage
 */
function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Format duration change with trend indicator
 */
function formatDurationChange(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return '';

  const indicator = delta > 0 ? chalk.green('↑') : chalk.red('↓');
  const sign = delta > 0 ? '+' : '';
  return ` ${indicator} ${sign}${theme.formatDuration(Math.abs(delta))}`;
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
  lines.push(`  Total Time: ${chalk.bold(theme.formatDuration(report.summary.totalMinutes))}${totalTimeChange}`);
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
        `  ${theme.formatProject(project).padEnd(30)} ` +
        `${theme.formatDuration(minutes).padEnd(10)} ` +
        `${theme.progressBar(percent)} ${formatPercent(percent)}`
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
        `  ${theme.formatTag(tag).padEnd(30)} ` +
        `${theme.formatDuration(minutes).padEnd(10)} ` +
        `${theme.progressBar(percent)} ${formatPercent(percent)}`
      );
    }
    lines.push('');
  }

  // 4. Estimates vs Actuals
  if (report.estimateAccuracy) {
    lines.push(chalk.bold.yellow('🎯 ESTIMATE ACCURACY'));
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push(`  Average Error: ${chalk.bold(theme.formatDuration(report.estimateAccuracy.averageError))}`);
    lines.push(`  Average Error %: ${chalk.bold(formatPercent(report.estimateAccuracy.averageErrorPercent))}`);
    lines.push(`  Total Estimated: ${theme.formatEstimate(report.estimateAccuracy.totalEstimated)}`);
    lines.push(`  Total Actual: ${theme.formatDuration(report.estimateAccuracy.totalActual)}`);

    if (report.estimateAccuracy.worstMisses.length > 0) {
      lines.push('');
      lines.push(chalk.gray('  Worst Misses:'));
      for (const miss of report.estimateAccuracy.worstMisses.slice(0, 3)) {
        const overUnder = miss.actualMinutes > miss.estimateMinutes ? 'over' : 'under';
        lines.push(
          `    ${chalk.bold(miss.session.description.substring(0, 40))} - ` +
          `${formatPercent(miss.errorPercent)} ${overUnder}`
        );
      }
    }
    lines.push('');
  }

  // 5. Efficiency
  lines.push(chalk.bold.yellow('⚡ EFFICIENCY'));
  lines.push(chalk.gray('─'.repeat(80)));
  lines.push(`  Total Tracked: ${theme.formatDuration(report.efficiency.grossMinutes)}`);
  lines.push(`  Break Time: ${theme.formatDuration(report.efficiency.breakMinutes)}`);
  lines.push(`  Working Time: ${chalk.bold(theme.formatDuration(report.efficiency.workingMinutes))}`);
  lines.push(`  Interruptions: ${theme.formatDuration(report.efficiency.interruptionMinutes)}`);
  lines.push(`  Net Uninterrupted Time: ${chalk.bold.green(theme.formatDuration(report.efficiency.netUninterruptedMinutes))}`);
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
  lines.push(`  Total Deep Work: ${chalk.bold.green(theme.formatDuration(report.focusBlocks.totalDeepWorkMinutes))}${deepWorkChange}`);
  lines.push(`  Sessions: ${report.focusBlocks.deepWorkSessions.length}${deepWorkSessionsChange}`);

  if (report.focusBlocks.deepWorkSessions.length > 0) {
    lines.push(`  Average Length: ${theme.formatDuration(report.focusBlocks.averageSessionLength)}`);
    lines.push('');
    lines.push(chalk.gray('  Deep Work Sessions:'));
    for (const dws of report.focusBlocks.deepWorkSessions) {
      lines.push(
        `    ${chalk.bold(dws.session.description.substring(0, 50))} - ` +
        `${theme.formatDuration(dws.durationMinutes)}`
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
      lines.push(`    ${date}: ${chalk.bold(theme.formatDuration(minutes))}`);
    }
    lines.push('');
  }

  // 9. Incomplete Continuation Chains
  if (report.incompleteChains.length > 0) {
    lines.push(chalk.bold.yellow('🔗 INCOMPLETE CONTINUATION CHAINS'));
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push(chalk.gray(`  ${report.incompleteChains.length} chain(s) with paused or active sessions:`));
    lines.push('');

    for (const chain of report.incompleteChains.slice(0, 5)) {
      const description = chain.rootSession.description.substring(0, 45);
      const sessionCount = chain.sessions.length;
      const incompleteCount = chain.incompleteSessions.length;

      lines.push(`  ${chalk.bold(description)}`);
      lines.push(`    Sessions: ${sessionCount} (${chalk.yellow(incompleteCount + ' incomplete')})`);

      if (chain.totalMinutes > 0) {
        lines.push(`    Time logged: ${theme.formatDuration(chain.totalMinutes)}`);
      }

      if (chain.estimateMinutes) {
        const remaining = Math.max(0, chain.estimateMinutes - chain.totalMinutes);
        if (remaining > 0) {
          lines.push(`    Estimate: ${theme.formatEstimate(chain.estimateMinutes)} (${theme.formatDuration(remaining)} remaining)`);
        } else {
          const over = chain.totalMinutes - chain.estimateMinutes;
          lines.push(`    Estimate: ${theme.formatEstimate(chain.estimateMinutes)} ${chalk.yellow(`(${theme.formatDuration(over)} over)`)}`);
        }
      }

      if (chain.rootSession.project) {
        lines.push(`    Project: ${theme.formatProject(chain.rootSession.project)}`);
      }

      lines.push('');
    }

    if (report.incompleteChains.length > 5) {
      lines.push(chalk.gray(`  ... and ${report.incompleteChains.length - 5} more`));
      lines.push('');
    }
  }

  // 10. Outliers
  if (report.outliers.length > 0) {
    lines.push(chalk.bold.yellow('📈 OUTLIERS (>2σ from mean)'));
    lines.push(chalk.gray('─'.repeat(80)));

    for (const outlier of report.outliers.slice(0, 5)) {
      const remarkText = outlier.session.remark ? ` - ${theme.formatRemark(outlier.session.remark)}` : '';
      lines.push(
        `  ${chalk.bold(outlier.session.description.substring(0, 40))} - ` +
        `${theme.formatDuration(outlier.durationMinutes)} ` +
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
