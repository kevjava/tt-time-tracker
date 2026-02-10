import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseFuzzyDate } from '../../utils/date';
import { Session, SessionState } from '../../types/session';
import { logger } from '../../utils/logger';
import { getSessionDuration } from '../../utils/duration';
import * as theme from '../../utils/theme';
import { formatDayDate, formatTime, formatDateShort } from '../../utils/format-date';

interface FindOptions {
  from?: string;
  to?: string;
  state?: string;
}

interface ParsedQuery {
  project?: string;
  tags: string[];
  descriptionTerms: string[];
}

/**
 * Parse query string to extract @project, +tags, and description terms
 */
function parseQuery(query: string): ParsedQuery {
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  let project: string | undefined;
  const tags: string[] = [];
  const descriptionTerms: string[] = [];

  for (const token of tokens) {
    if (token.startsWith('@')) {
      // Only take last project if multiple are specified
      project = token.slice(1);
    } else if (token.startsWith('+')) {
      tags.push(token.slice(1));
    } else {
      descriptionTerms.push(token);
    }
  }

  return { project, tags, descriptionTerms };
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
 * Highlight search terms in text (case-insensitive)
 */
function highlightSearchTerms(text: string, searchTerms: string[]): string {
  if (searchTerms.length === 0) {
    return text;
  }

  let result = text;

  // Sort terms by length (longest first) to avoid partial matches
  const sortedTerms = [...searchTerms].sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    // Create case-insensitive regex with word boundary considerations
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, chalk.cyan('$1'));
  }

  return result;
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
 * Print a session and its children
 */
function printSession(
  session: Session & { tags: string[] },
  indentLevel: number,
  db: TimeTrackerDB,
  searchTerms: string[]
): void {
  const indent = '  '.repeat(indentLevel);
  const idWidth = 6;
  const dateWidth = 16;
  const timeWidth = 14;
  const descWidth = 40;
  const projectWidth = 15;
  const tagsWidth = 20;
  const durationWidth = 24;
  const estimateWidth = 12;

  const id = session.id?.toString() || '';
  const date = formatDayDate(session.startTime);
  const timeRange = session.endTime
    ? `${formatTime(session.startTime)}-${formatTime(session.endTime)}`
    : `${formatTime(session.startTime)}-     `;

  // Highlight search terms in description, then truncate
  const highlightedDescription = highlightSearchTerms(session.description, searchTerms);
  const description = truncate(indent + highlightedDescription, descWidth).slice(indent.length);

  // Truncate project and tags to fit within their columns
  const project = session.project ? truncate(theme.formatProject(session.project), projectWidth) : '';
  const tags = session.tags.length > 0 ? truncate(theme.formatTags(session.tags), tagsWidth) : '';
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
    printSession(child, indentLevel + 1, db, searchTerms);
  }
}

/**
 * tt find command implementation
 */
export function findCommand(queryArg: string, options: FindOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Validate query
      const trimmedQuery = queryArg.trim();
      if (!trimmedQuery) {
        console.error(chalk.red('Error: Query cannot be empty'));
        process.exit(1);
      }

      // Parse query to extract project, tags, and description terms
      const { project, tags, descriptionTerms } = parseQuery(trimmedQuery);

      logger.debug(`Parsed query - project: ${project}, tags: ${tags.join(', ')}, terms: ${descriptionTerms.join(', ')}`);

      // If no description terms, project, or tags specified, error out
      if (descriptionTerms.length === 0 && !project && tags.length === 0) {
        console.error(chalk.red('Error: Query must contain at least one search term, @project, or +tag'));
        process.exit(1);
      }

      // Parse date range (optional)
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (options.from) {
        try {
          startDate = parseFuzzyDate(options.from);
          startDate.setHours(0, 0, 0, 0);
        } catch (error) {
          console.error(chalk.red(`Error parsing --from date: ${error instanceof Error ? error.message : error}`));
          process.exit(1);
        }
      }

      if (options.to) {
        try {
          endDate = parseFuzzyDate(options.to);
          endDate.setHours(23, 59, 59, 999);
        } catch (error) {
          console.error(chalk.red(`Error parsing --to date: ${error instanceof Error ? error.message : error}`));
          process.exit(1);
        }
      }

      // Build search options
      const searchOptions: any = {};

      if (project) {
        searchOptions.project = project;
      }

      if (tags.length > 0) {
        searchOptions.tags = tags;
      }

      if (options.state) {
        searchOptions.state = options.state as SessionState;
      }

      if (startDate) {
        searchOptions.startDate = startDate;
      }

      if (endDate) {
        searchOptions.endDate = endDate;
      }

      logger.debug(`Search options: ${JSON.stringify(searchOptions)}`);

      // Search sessions
      const sessions = db.searchSessions(descriptionTerms, searchOptions);

      if (sessions.length === 0) {
        console.log(chalk.yellow('No sessions found matching your search criteria.'));
        return;
      }

      // Build search summary for header
      let searchSummary = 'Search results';
      const criteria: string[] = [];

      if (descriptionTerms.length > 0) {
        criteria.push(`"${descriptionTerms.join(' ')}"`);
      }
      if (project) {
        criteria.push(theme.formatProject(project));
      }
      if (tags.length > 0) {
        criteria.push(theme.formatTags(tags));
      }
      if (options.state) {
        criteria.push(`state=${options.state}`);
      }
      if (startDate || endDate) {
        if (startDate && endDate) {
          criteria.push(`${formatDateShort(startDate)} - ${formatDateShort(endDate)}`);
        } else if (startDate) {
          criteria.push(`from ${formatDateShort(startDate)}`);
        } else if (endDate) {
          criteria.push(`until ${formatDateShort(endDate)}`);
        }
      }

      if (criteria.length > 0) {
        searchSummary += `: ${criteria.join(', ')}`;
      }

      // Display header
      console.log(chalk.bold(`\n${searchSummary}`));
      console.log(chalk.dim(`Found ${sessions.length} session${sessions.length === 1 ? '' : 's'}\n`));

      // Calculate column widths
      const idWidth = 6;
      const dateWidth = 16;
      const timeWidth = 14;
      const descWidth = 40;
      const projectWidth = 15;
      const tagsWidth = 20;
      const durationWidth = 24;
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

        printSession(session, 0, db, descriptionTerms);
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
