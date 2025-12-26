import chalk from 'chalk';
import { format } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { getWeekBounds } from '../../utils/date';
import { Session } from '../../types/session';
import { logger } from '../../utils/logger';

interface ListOptions {
  week?: string;
  from?: string;
  to?: string;
  project?: string;
  tag?: string;
  state?: string;
}

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
 * Calculate duration between start and end times
 */
function calculateDuration(session: Session & { tags: string[] }): string {
  if (session.explicitDurationMinutes) {
    return formatDuration(session.explicitDurationMinutes);
  }

  if (session.endTime) {
    const durationMs = session.endTime.getTime() - session.startTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);
    return formatDuration(durationMinutes);
  }

  // Active session
  return chalk.green('(active)');
}

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
 * Format session state
 */
function formatState(state: string): string {
  switch (state) {
    case 'working':
      return chalk.green('▶ working');
    case 'paused':
      return chalk.yellow('⏸ paused');
    case 'completed':
      return chalk.gray('✓ completed');
    case 'abandoned':
      return chalk.red('✗ abandoned');
    default:
      return state;
  }
}

/**
 * tt list command implementation
 */
export function listCommand(options: ListOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      let start: Date;
      let end: Date;
      let label: string;

      // Determine time range
      if (options.from || options.to) {
        // Custom date range
        if (options.from) {
          start = new Date(options.from);
          if (isNaN(start.getTime())) {
            console.error(chalk.red(`Error: Invalid --from date: ${options.from}`));
            process.exit(1);
          }
        } else {
          // Default to beginning of time
          start = new Date(0);
        }

        if (options.to) {
          end = new Date(options.to);
          if (isNaN(end.getTime())) {
            console.error(chalk.red(`Error: Invalid --to date: ${options.to}`));
            process.exit(1);
          }
          // Set to end of day
          end.setHours(23, 59, 59, 999);
        } else {
          // Default to now
          end = new Date();
        }

        label = `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
      } else {
        // Week-based range
        const weekSpec = options.week || 'current';
        const bounds = getWeekBounds(weekSpec);
        start = bounds.start;
        end = bounds.end;
        label = bounds.label;
      }

      logger.debug(`Listing sessions for: ${label}`);

      // Build filter options
      const filterOptions: any = {};

      if (options.project) {
        filterOptions.project = options.project;
      }

      if (options.tag) {
        filterOptions.tags = options.tag.split(',').map((t) => t.trim());
      }

      if (options.state) {
        filterOptions.state = options.state;
      }

      logger.debug(`Filter options: ${JSON.stringify(filterOptions)}`);

      // Get sessions
      const sessions = db.getSessionsByTimeRange(start, end, filterOptions);

      if (sessions.length === 0) {
        console.log(chalk.yellow('No sessions found for the specified time range.'));
        process.exit(0);
      }

      // Display header
      console.log(chalk.bold(`\nSessions: ${label}\n`));

      // Calculate column widths
      const dateWidth = 16;
      const timeWidth = 14;
      const descWidth = 40;
      const projectWidth = 15;
      const tagsWidth = 20;
      const durationWidth = 12;

      // Print header
      const header =
        pad(chalk.bold('Date'), dateWidth) +
        pad(chalk.bold('Time'), timeWidth) +
        pad(chalk.bold('Description'), descWidth) +
        pad(chalk.bold('Project'), projectWidth) +
        pad(chalk.bold('Tags'), tagsWidth) +
        pad(chalk.bold('Duration'), durationWidth) +
        chalk.bold('State');

      console.log(header);
      console.log(chalk.gray('─'.repeat(130)));

      // Print sessions
      for (const session of sessions) {
        // Skip child sessions (interruptions) - they'll be shown indented
        if (session.parentSessionId) {
          continue;
        }

        printSession(session, 0);
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

/**
 * Print a session and its children
 */
function printSession(session: Session & { tags: string[] }, indentLevel: number): void {
  const indent = '  '.repeat(indentLevel);
  const dateWidth = 16;
  const timeWidth = 14;
  const descWidth = 40;
  const projectWidth = 15;
  const tagsWidth = 20;
  const durationWidth = 12;

  const date = format(session.startTime, 'EEE, MMM d');
  const timeRange = session.endTime
    ? `${format(session.startTime, 'HH:mm')}-${format(session.endTime, 'HH:mm')}`
    : `${format(session.startTime, 'HH:mm')}-     `;

  let description = session.description;
  if (description.length > descWidth - indent.length - 2) {
    description = description.substring(0, descWidth - indent.length - 5) + '...';
  }

  const project = session.project || '';
  const tags = session.tags.length > 0 ? session.tags.join(', ') : '';
  const duration = calculateDuration(session);
  const state = formatState(session.state);

  const row =
    pad(date, dateWidth) +
    pad(timeRange, timeWidth) +
    pad(indent + description, descWidth) +
    pad(project, projectWidth) +
    pad(tags, tagsWidth) +
    pad(duration, durationWidth) +
    state;

  console.log(row);

  // Note: Child sessions (interruptions) would need to be fetched separately
  // For now, we're only showing top-level sessions
}
