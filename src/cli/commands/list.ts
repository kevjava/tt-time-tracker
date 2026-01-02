import chalk from 'chalk';
import { format } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath, loadConfig } from '../../utils/config';
import { getWeekBounds, parseFuzzyDate } from '../../utils/date';
import { Session } from '../../types/session';
import { logger } from '../../utils/logger';
import { formatSessionsAsLog } from '../formatters/log';
import { formatDetailedSession } from '../formatters/detailed-session';
import { getSessionDuration } from '../../utils/duration';
import * as theme from '../../utils/theme';

interface ListOptions {
  week?: string;
  from?: string;
  to?: string;
  project?: string;
  tag?: string;
  state?: string;
  format?: string;
}

/**
 * Calculate duration between start and end times
 * For interrupted tasks, shows both gross and net duration
 */
function calculateDuration(session: Session & { tags: string[] }, db: TimeTrackerDB): string {
  // Handle explicit duration (can exist even without end time)
  if (session.explicitDurationMinutes) {
    const grossMinutes = session.explicitDurationMinutes;

    // Check if this session has interruptions (child sessions)
    const children = session.id ? db.getChildSessions(session.id) : [];

    if (children.length === 0) {
      return theme.formatDuration(grossMinutes);
    }

    // Calculate interruption time
    const interruptionMinutes = children.reduce(
      (sum, child) => sum + getSessionDuration(child),
      0
    );

    const netMinutes = Math.max(0, grossMinutes - interruptionMinutes);
    return `${theme.formatDuration(grossMinutes)} ${chalk.dim(`(${theme.formatDuration(netMinutes)} net)`)}`;
  }

  // Active session (no end time and no explicit duration)
  if (!session.endTime) {
    return chalk.green('(active)');
  }

  const grossMinutes = getSessionDuration(session);

  // Check if this session has interruptions (child sessions)
  const children = session.id ? db.getChildSessions(session.id) : [];

  if (children.length === 0) {
    // No interruptions, just show gross duration
    return theme.formatDuration(grossMinutes);
  }

  // Calculate interruption time
  const interruptionMinutes = children.reduce(
    (sum, child) => sum + getSessionDuration(child),
    0
  );

  const netMinutes = Math.max(0, grossMinutes - interruptionMinutes);

  // Show both gross and net: "3h (2h 30m net)"
  return `${theme.formatDuration(grossMinutes)} ${chalk.dim(`(${theme.formatDuration(netMinutes)} net)`)}`;
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
 * tt list command implementation
 */
export function listCommand(sessionIdArg: string | undefined, options: ListOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // If session ID is provided, show detailed view
      if (sessionIdArg) {
        const sessionId = parseInt(sessionIdArg, 10);
        if (isNaN(sessionId)) {
          console.error(chalk.red(`Error: Invalid session ID: ${sessionIdArg}`));
          process.exit(1);
        }

        const session = db.getSessionById(sessionId);
        if (!session) {
          console.error(chalk.red(`Error: Session ${sessionId} not found`));
          process.exit(1);
        }

        const output = formatDetailedSession(session, db);
        console.log(output);
        return;
      }

      // Otherwise, show list view
      let start: Date;
      let end: Date;
      let label: string;

      // Determine time range
      if (options.from || options.to) {
        // Custom date range
        if (options.from) {
          try {
            start = parseFuzzyDate(options.from);
            // Set to start of day
            start.setHours(0, 0, 0, 0);
          } catch (error) {
            console.error(chalk.red(`Error parsing --from date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
        } else {
          // Default to beginning of time
          start = new Date(0);
        }

        if (options.to) {
          try {
            end = parseFuzzyDate(options.to);
            // Set to end of day
            end.setHours(23, 59, 59, 999);
          } catch (error) {
            console.error(chalk.red(`Error parsing --to date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
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

      // Format and display output - use config default if not specified
      const config = loadConfig();
      const outputFormat = options.format || config.listFormat;

      if (outputFormat === 'log') {
        const output = formatSessionsAsLog(sessions, db);
        console.log(output);
        return;
      }

      // Display header (table format)
      console.log(chalk.bold(`\nSessions: ${label}\n`));

      // Calculate column widths
      const idWidth = 6;
      const dateWidth = 16;
      const timeWidth = 14;
      const descWidth = 40;
      const projectWidth = 15;
      const tagsWidth = 20;
      const durationWidth = 24; // Increased to accommodate "3h 30m (2h 15m net)"
      const estimateWidth = 12;

      // Print header
      const header =
        pad(chalk.bold('ID'), idWidth) +
        pad(chalk.bold('Date'), dateWidth) +
        pad(chalk.bold('Time'), timeWidth) +
        pad(chalk.bold('Description'), descWidth) +
        pad(chalk.bold('Project'), projectWidth) +
        pad(chalk.bold('Tags'), tagsWidth) +
        pad(chalk.bold('Duration'), durationWidth) +
        pad(chalk.bold('Estimate'), estimateWidth) +
        chalk.bold('State');

      console.log(header);
      console.log(chalk.gray('─'.repeat(160)));

      // Print sessions
      for (const session of sessions) {
        // Skip child sessions (interruptions) - they'll be shown indented
        if (session.parentSessionId) {
          continue;
        }

        printSession(session, 0, db);
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
function printSession(session: Session & { tags: string[] }, indentLevel: number, db: TimeTrackerDB): void {
  const indent = '  '.repeat(indentLevel);
  const idWidth = 6;
  const dateWidth = 16;
  const timeWidth = 14;
  const descWidth = 40;
  const projectWidth = 15;
  const tagsWidth = 20;
  const durationWidth = 24; // Increased to accommodate "3h 30m (2h 15m net)"
  const estimateWidth = 12;

  const id = session.id?.toString() || '';
  const date = format(session.startTime, 'EEE, MMM d');
  const timeRange = session.endTime
    ? `${format(session.startTime, 'HH:mm')}-${format(session.endTime, 'HH:mm')}`
    : `${format(session.startTime, 'HH:mm')}-     `;

  let description = session.description;
  if (description.length > descWidth - indent.length - 2) {
    description = description.substring(0, descWidth - indent.length - 5) + '...';
  }

  const project = session.project ? theme.formatProject(session.project) : '';
  const tags = session.tags.length > 0 ? theme.formatTags(session.tags) : '';
  const duration = calculateDuration(session, db);
  const estimate = session.estimateMinutes ? theme.formatEstimate(session.estimateMinutes) : '';
  const state = theme.formatState(session.state);

  const row =
    pad(id, idWidth) +
    pad(date, dateWidth) +
    pad(timeRange, timeWidth) +
    pad(indent + description, descWidth) +
    pad(project, projectWidth) +
    pad(tags, tagsWidth) +
    pad(duration, durationWidth) +
    pad(estimate, estimateWidth) +
    state;

  console.log(row);

  // Fetch and display child sessions (interruptions)
  const children = db.getChildSessions(session.id!);
  for (const child of children) {
    printSession(child, indentLevel + 1, db);
  }
}
