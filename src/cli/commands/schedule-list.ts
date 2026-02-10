import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath, loadConfig } from '../../utils/config';
import * as theme from '../../utils/theme';
import { numToLetter } from '../../utils/schedule-id';
import { getScheduler } from '../../utils/scheduler';
import { formatDateTime } from '../../utils/format-date';

/**
 * Pad string to specified width
 */
function pad(str: string, width: number): string {
  // Strip ANSI codes for length calculation
  const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - cleanStr.length);
  return str + ' '.repeat(padding);
}

/**
 * Truncate string to specified width with ellipsis, preserving ANSI codes
 */
function truncate(str: string, width: number): string {
  // Strip ANSI codes for length calculation
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  const cleanStr = str.replace(ansiRegex, '');
  const hasAnsiCodes = ansiRegex.test(str);
  // Reset regex state after test
  ansiRegex.lastIndex = 0;

  // ANSI reset code to ensure colors don't bleed out
  const reset = hasAnsiCodes ? '\x1b[0m' : '';

  // If it fits, return as-is
  if (cleanStr.length <= width) {
    return str;
  }

  // Need to truncate - extract ANSI codes and content separately
  let result = '';
  let visibleLength = 0;
  let lastIndex = 0;
  let match;

  // Build truncated string while preserving ANSI codes
  while ((match = ansiRegex.exec(str)) !== null) {
    // Add content before this ANSI code
    const content = str.slice(lastIndex, match.index);
    const spaceLeft = width - 3 - visibleLength; // Reserve 3 for "..."

    if (content.length <= spaceLeft) {
      result += content;
      visibleLength += content.length;
    } else {
      result += content.slice(0, spaceLeft);
      visibleLength += spaceLeft;
      result += '...' + reset;
      return result;
    }

    // Add the ANSI code (doesn't count toward visible length)
    result += match[0];
    lastIndex = match.index + match[0].length;
  }

  // Handle remaining content after last ANSI code
  const remaining = str.slice(lastIndex);
  const spaceLeft = width - 3 - visibleLength;

  if (remaining.length <= spaceLeft) {
    result += remaining + '...' + reset;
  } else {
    result += remaining.slice(0, spaceLeft) + '...' + reset;
  }

  return result;
}

/**
 * tt schedule list command implementation
 */
export async function scheduleListCommand(): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());
    const config = loadConfig();
    const scheduler = await getScheduler(config, db);

    try {
      const plan = await scheduler.getDailyPlan(new Date());
      const tasks = plan.tasks;

      if (tasks.length === 0) {
        console.log(chalk.yellow('No scheduled tasks. Add one with: tt schedule add'));
        return;
      }

      console.log(chalk.bold('\nScheduled Tasks\n'));

      // Column widths
      const idWidth = 6;
      const priorityWidth = 10;
      const scheduledWidth = 20;
      const descWidth = 40;
      const projectWidth = 15;
      const tagsWidth = 20;

      // Header
      const header =
        pad(chalk.bold('ID'), idWidth) +
        pad(chalk.bold('Priority'), priorityWidth) +
        pad(chalk.bold('Scheduled'), scheduledWidth) +
        pad(chalk.bold('Description'), descWidth) +
        pad(chalk.bold('Project'), projectWidth) +
        pad(chalk.bold('Tags'), tagsWidth) +
        chalk.bold('Estimate');

      console.log(header);
      console.log(chalk.gray('─'.repeat(130)));

      // Rows
      for (const task of tasks) {
        const id = task.id ? numToLetter(task.id) : '';
        const priority = task.priority === 5 || task.priority === undefined ? '' : chalk.yellow(`^${task.priority}`);
        const scheduled = task.scheduledDateTime
          ? formatDateTime(task.scheduledDateTime)
          : task.deadline
            ? formatDateTime(task.deadline)
            : '';
        const description = truncate(task.title, descWidth);
        const project = task.project ? truncate(theme.formatProject(task.project), projectWidth) : '';
        const tags = task.tags.length > 0 ? truncate(theme.formatTags(task.tags), tagsWidth) : '';
        const estimate = task.estimateMinutes ? theme.formatEstimate(task.estimateMinutes) : '';

        const row =
          pad(id, idWidth) +
          pad(priority, priorityWidth) +
          pad(scheduled, scheduledWidth) +
          pad(description, descWidth) +
          pad(project, projectWidth) +
          pad(tags, tagsWidth) +
          estimate;

        console.log(row);
      }

      console.log();
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
