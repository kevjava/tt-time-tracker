import chalk from 'chalk';
import { format, differenceInMinutes } from 'date-fns';
import { Session } from '../../types/session';
import { TimeTrackerDB } from '../../db/database';
import { getSessionDuration } from '../../utils/duration';

/**
 * Format duration in minutes to human-readable string
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Format state with color and icon
 */
function formatState(state: string): string {
  switch (state) {
    case 'working':
      return chalk.yellow('▶ Working');
    case 'paused':
      return chalk.gray('⏸ Paused');
    case 'completed':
      return chalk.green('✓ Completed');
    case 'abandoned':
      return chalk.red('✗ Abandoned');
    default:
      return state;
  }
}

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
    const durationStr = formatDuration(duration);
    const stateIcon = child.state === 'completed' ? chalk.green('✓') :
                      child.state === 'working' ? chalk.yellow('▶') :
                      child.state === 'paused' ? chalk.gray('⏸') :
                      chalk.red('✗');

    lines.push(
      `${indentStr}${stateIcon} ${chalk.cyan(child.description)} ${chalk.dim(`(${durationStr})`)}`
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

  lines.push('');

  // Basic info
  lines.push(`${chalk.bold('Description:')}  ${session.description}`);

  // State
  lines.push(`${chalk.bold('State:')}        ${formatState(session.state)}`);

  // Timestamps
  const startTimeStr = format(session.startTime, 'yyyy-MM-dd HH:mm:ss');
  lines.push(`${chalk.bold('Start time:')}   ${startTimeStr}`);

  if (session.endTime) {
    const endTimeStr = format(session.endTime, 'yyyy-MM-dd HH:mm:ss');
    lines.push(`${chalk.bold('End time:')}     ${endTimeStr}`);
  } else {
    const elapsed = differenceInMinutes(new Date(), session.startTime);
    lines.push(`${chalk.bold('End time:')}     ${chalk.yellow(`(active - ${formatDuration(elapsed)} elapsed)`)}`);
  }

  // Project
  if (session.project) {
    lines.push(`${chalk.bold('Project:')}      ${chalk.cyan(session.project)}`);
  }

  // Tags
  if (session.tags.length > 0) {
    lines.push(`${chalk.bold('Tags:')}         ${session.tags.map(t => chalk.magenta(`+${t}`)).join(' ')}`);
  }

  // Estimate
  if (session.estimateMinutes) {
    lines.push(`${chalk.bold('Estimate:')}     ${formatDuration(session.estimateMinutes)}`);
  }

  // Remark
  if (session.remark) {
    lines.push(`${chalk.bold('Remark:')}       ${chalk.italic(session.remark)}`);
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

  lines.push(`${chalk.bold('Gross time:')}    ${formatDuration(grossMinutes)}`);

  if (children.length > 0) {
    lines.push(`${chalk.bold('Interruptions:')} ${formatDuration(interruptionMinutes)} ${chalk.dim(`(${children.length} interruption${children.length > 1 ? 's' : ''})`)}`);
    lines.push(`${chalk.bold('Net time:')}      ${chalk.green(formatDuration(netMinutes))}`);
  }

  // Interruptions tree
  if (children.length > 0) {
    lines.push('');
    lines.push(chalk.bold.cyan('🔀 Interruptions'));
    lines.push('');
    lines.push(formatInterruptions(children, db, 0));
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
        `${chalk.yellow('⚠')} Task took ${formatDuration(difference)} longer than estimated (${percentageOff}% over)`
      );
    } else {
      insights.push(
        `${chalk.green('✓')} Task finished ${formatDuration(Math.abs(difference))} faster than estimated (${percentageOff}% under)`
      );
    }
  }

  // Interruption frequency
  if (children.length > 0) {
    const avgInterruptionMinutes = Math.round(interruptionMinutes / children.length);
    insights.push(
      `${chalk.blue('ℹ')} Average interruption duration: ${formatDuration(avgInterruptionMinutes)}`
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
          `${chalk.blue('ℹ')} Efficiency: ${efficiencyPercent}% (${formatDuration(netMinutes)} productive / ${formatDuration(grossMinutes)} total)`
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
        `${chalk.yellow('⚠')} Session has been active for ${formatDuration(elapsedMinutes)} - consider taking a break`
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
