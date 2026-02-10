import chalk from 'chalk';
import { differenceInMinutes } from 'date-fns';
import { Session } from '../../types/session';
import { TimeTrackerDB } from '../../db/database';
import { getSessionDuration } from '../../utils/duration';
import * as theme from '../../utils/theme';
import { formatDateTimeSeconds, formatDateShortTime, formatTime } from '../../utils/format-date';


/**
 * Format interruptions tree recursively
 */
function formatInterruptions(
  children: Array<Session & { tags: string[] }>,
  db: TimeTrackerDB,
  indent: number = 0
): string {
  if (children.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const indentStr = '  '.repeat(indent);

  for (const child of children) {
    const duration = getSessionDuration(child);
    const durationStr = theme.formatDuration(duration);
    const stateIcon = theme.formatStateIcon(child.state);

    lines.push(
      `${indentStr}${stateIcon} ${chalk.bold(child.description)} ${chalk.dim(`(${durationStr})`)}`
    );

    // Recursively show nested interruptions
    const grandchildren = db.getChildSessions(child.id!);
    if (grandchildren.length > 0) {
      lines.push(formatInterruptions(grandchildren, db, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Display detailed view of a single session
 */
export function formatDetailedSession(
  session: Session & { tags: string[] },
  db: TimeTrackerDB
): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold.cyan(`Session ${session.id}`));
  lines.push(chalk.gray('═'.repeat(80)));

  // Parent context (if this is an interruption)
  if (session.parentSessionId) {
    const parent = db.getSessionById(session.parentSessionId);
    if (parent) {
      lines.push('');
      lines.push(chalk.dim(`└─ Interruption of Session ${parent.id}: "${parent.description}"`));
    }
  }

  // Continuation chain context
  const chain = db.getContinuationChain(session.id!);
  if (chain.length > 1) {
    lines.push('');
    lines.push(chalk.dim(`└─ Part of continuation chain (${chain.length} sessions)`));
  }

  lines.push('');

  // Basic info
  lines.push(`${chalk.bold('Description:')}  ${chalk.bold(session.description)}`);

  // State
  lines.push(`${chalk.bold('State:')}        ${theme.formatState(session.state)}`);

  // Timestamps
  const startTimeStr = formatDateTimeSeconds(session.startTime);
  lines.push(`${chalk.bold('Start time:')}   ${startTimeStr}`);

  if (session.endTime) {
    const endTimeStr = formatDateTimeSeconds(session.endTime);
    lines.push(`${chalk.bold('End time:')}     ${endTimeStr}`);
  } else {
    const elapsed = differenceInMinutes(new Date(), session.startTime);
    lines.push(`${chalk.bold('End time:')}     ${chalk.yellow(`(active - ${theme.formatDuration(elapsed)} elapsed)`)}`);
  }

  // Project
  if (session.project) {
    lines.push(`${chalk.bold('Project:')}      ${theme.formatProject(session.project)}`);
  }

  // Tags
  if (session.tags.length > 0) {
    lines.push(`${chalk.bold('Tags:')}         ${theme.formatTags(session.tags)}`);
  }

  // Estimate
  if (session.estimateMinutes) {
    lines.push(`${chalk.bold('Estimate:')}     ${theme.formatEstimate(session.estimateMinutes)}`);
  }

  // Remark
  if (session.remark) {
    lines.push(`${chalk.bold('Remark:')}       ${theme.formatRemark(session.remark)}`);
  }

  lines.push('');
  lines.push(chalk.gray('─'.repeat(80)));

  // Time calculations section
  lines.push('');
  lines.push(chalk.bold.cyan('⏱  Time Breakdown'));
  lines.push('');

  const grossMinutes = session.explicitDurationMinutes ||
                       (session.endTime ? getSessionDuration(session) :
                        differenceInMinutes(new Date(), session.startTime));

  // Get interruptions
  const children = db.getChildSessions(session.id!);
  const interruptionMinutes = children.reduce(
    (sum, child) => sum + getSessionDuration(child),
    0
  );
  const netMinutes = Math.max(0, grossMinutes - interruptionMinutes);

  lines.push(`${chalk.bold('Gross time:')}    ${theme.formatDuration(grossMinutes)}`);

  if (children.length > 0) {
    lines.push(`${chalk.bold('Interruptions:')} ${theme.formatDuration(interruptionMinutes)} ${chalk.dim(`(${children.length} interruption${children.length > 1 ? 's' : ''})`)}`);
    lines.push(`${chalk.bold('Net time:')}      ${chalk.green(theme.formatDuration(netMinutes))}`);
  }

  // Interruptions tree
  if (children.length > 0) {
    lines.push('');
    lines.push(chalk.bold.cyan('🔀 Interruptions'));
    lines.push('');
    lines.push(formatInterruptions(children, db, 0));
  }

  // Continuation chain section
  if (chain.length > 1) {
    lines.push('');
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push('');
    lines.push(chalk.bold.cyan('🔗 Continuation Chain'));
    lines.push('');
    lines.push(chalk.dim(`This task spans ${chain.length} work sessions:`));
    lines.push('');

    let chainTotalMinutes = 0;
    const chainRoot = chain[0];

    for (let i = 0; i < chain.length; i++) {
      const chainSession = chain[i];
      const isCurrentSession = chainSession.id === session.id;
      const sessionDuration = chainSession.endTime ? getSessionDuration(chainSession) : 0;
      chainTotalMinutes += sessionDuration;

      // Get net duration (excluding interruptions)
      const sessionChildren = db.getChildSessions(chainSession.id!);
      const sessionInterruptionMinutes = sessionChildren.reduce(
        (sum, child) => sum + getSessionDuration(child),
        0
      );
      const sessionNetMinutes = Math.max(0, sessionDuration - sessionInterruptionMinutes);

      const startTimeStr = formatDateShortTime(chainSession.startTime);
      const endTimeStr = chainSession.endTime
        ? formatTime(chainSession.endTime)
        : chalk.yellow('(active)');

      const stateIcon = theme.formatStateIcon(chainSession.state);

      const durationDisplay = sessionNetMinutes > 0
        ? `${theme.formatDuration(sessionNetMinutes)}${sessionInterruptionMinutes > 0 ? chalk.dim(` (${theme.formatDuration(sessionDuration)} gross)`) : ''}`
        : chalk.dim('(active)');

      const prefix = isCurrentSession ? chalk.cyan('▶ ') : '  ';
      const sessionLabel = isCurrentSession
        ? chalk.cyan.bold(`Session ${chainSession.id}`)
        : chalk.dim(`Session ${chainSession.id}`);

      lines.push(
        `${prefix}${sessionLabel}: ${startTimeStr} - ${endTimeStr}  ${stateIcon} ${theme.formatState(chainSession.state).replace(/[▶⏸✓✗] /, '')}  ${chalk.dim('│')}  ${durationDisplay}`
      );

      if (chainSession.remark) {
        lines.push(`   ${theme.formatRemark(chainSession.remark)}`);
      }
    }

    lines.push('');
    lines.push(chalk.bold('Chain Summary:'));
    lines.push(`  Total time: ${chalk.green(theme.formatDuration(chainTotalMinutes))}`);

    if (chainRoot.estimateMinutes) {
      lines.push(`  Estimate: ${theme.formatEstimate(chainRoot.estimateMinutes)}`);
      const chainDifference = chainTotalMinutes - chainRoot.estimateMinutes;
      const chainPercentageOff = Math.round((Math.abs(chainDifference) / chainRoot.estimateMinutes) * 100);

      if (Math.abs(chainDifference) < 5) {
        lines.push(`  ${chalk.green('✓')} Chain is on track (within 5 minutes of estimate)`);
      } else if (chainDifference > 0) {
        lines.push(
          `  ${chalk.yellow('⚠')} Chain is ${theme.formatDuration(chainDifference)} over estimate (${chainPercentageOff}% over)`
        );
      } else {
        lines.push(
          `  ${chalk.green('✓')} Chain is ${theme.formatDuration(Math.abs(chainDifference))} under estimate (${chainPercentageOff}% under)`
        );
      }
    }
  }

  // Insights section
  lines.push('');
  lines.push(chalk.gray('─'.repeat(80)));
  lines.push('');
  lines.push(chalk.bold.cyan('📊 Insights'));
  lines.push('');

  const insights: string[] = [];

  // Estimation accuracy
  if (session.estimateMinutes && session.endTime) {
    const actualMinutes = netMinutes; // Use net time for comparison
    const estimateMinutes = session.estimateMinutes;
    const difference = actualMinutes - estimateMinutes;
    const percentageOff = Math.round((Math.abs(difference) / estimateMinutes) * 100);

    if (Math.abs(difference) < 5) {
      insights.push(`${chalk.green('✓')} Estimate was accurate (within 5 minutes)`);
    } else if (difference > 0) {
      insights.push(
        `${chalk.yellow('⚠')} Task took ${theme.formatDuration(difference)} longer than estimated (${percentageOff}% over)`
      );
    } else {
      insights.push(
        `${chalk.green('✓')} Task finished ${theme.formatDuration(Math.abs(difference))} faster than estimated (${percentageOff}% under)`
      );
    }
  }

  // Interruption frequency
  if (children.length > 0) {
    const avgInterruptionMinutes = Math.round(interruptionMinutes / children.length);
    insights.push(
      `${chalk.blue('ℹ')} Average interruption duration: ${theme.formatDuration(avgInterruptionMinutes)}`
    );

    if (children.length >= 5) {
      insights.push(
        `${chalk.yellow('⚠')} High interruption count (${children.length}) - consider focusing strategies`
      );
    }

    // Efficiency ratio (only if gross time > 0)
    if (grossMinutes > 0) {
      const efficiencyPercent = Math.round((netMinutes / grossMinutes) * 100);
      if (efficiencyPercent < 50) {
        insights.push(
          `${chalk.red('⚠')} Low efficiency (${efficiencyPercent}%) - interruptions took more than half the time`
        );
      } else {
        insights.push(
          `${chalk.blue('ℹ')} Efficiency: ${efficiencyPercent}% (${theme.formatDuration(netMinutes)} productive / ${theme.formatDuration(grossMinutes)} total)`
        );
      }
    }
  }

  // Session duration insights
  if (session.endTime) {
    if (netMinutes >= 90) {
      insights.push(
        `${chalk.green('✓')} Deep work session (≥90 minutes of focused time)`
      );
    }
  }

  // Active session warning
  if (!session.endTime && session.state === 'working') {
    const elapsedMinutes = differenceInMinutes(new Date(), session.startTime);
    if (elapsedMinutes > 180) { // 3 hours
      insights.push(
        `${chalk.yellow('⚠')} Session has been active for ${theme.formatDuration(elapsedMinutes)} - consider taking a break`
      );
    }
  }

  if (insights.length > 0) {
    lines.push(insights.join('\n'));
  } else {
    lines.push(chalk.dim('No insights available for this session'));
  }

  lines.push('');
  lines.push(chalk.gray('═'.repeat(80)));
  lines.push('');

  return lines.join('\n');
}
