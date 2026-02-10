import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath, loadConfig } from '../../utils/config';
import { getWeekBounds, parseFuzzyDate } from '../../utils/date';
import { generateWeeklyReport } from '../../reports/weekly';
import { formatTerminalReport } from '../../reports/formatters/terminal';
import { formatJsonReport } from '../../reports/formatters/json';
import { formatCsvReport } from '../../reports/formatters/csv';
import { logger } from '../../utils/logger';
import { formatDateRange as fmtDateRange } from '../../utils/format-date';

interface ReportOptions {
  week?: string;
  from?: string;
  to?: string;
  project?: string;
  tag?: string;
  format?: string;
  compare?: boolean;
}

/**
 * Calculate the previous period's time range
 */
function getPreviousPeriod(start: Date, end: Date): { start: Date; end: Date; label: string } {
  const durationMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 1); // 1ms before current period start
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  const label = fmtDateRange(prevStart, prevEnd);

  return { start: prevStart, end: prevEnd, label };
}

/**
 * tt report command implementation
 */
export function reportCommand(options: ReportOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Determine time range: custom dates take precedence over week
      let start: Date;
      let end: Date;
      let label: string;

      if (options.from || options.to) {
        // Parse and validate start date
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
          start = new Date(0);  // Beginning of time if only --to is provided
        }

        // Parse and validate end date
        if (options.to) {
          try {
            end = parseFuzzyDate(options.to);
            end.setHours(23, 59, 59, 999);  // Include entire end day
          } catch (error) {
            console.error(chalk.red(`Error parsing --to date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
        } else {
          end = new Date();  // Current moment if only --from is provided
        }

        // Generate label for custom range
        label = fmtDateRange(start, end);
        logger.debug(`Using custom date range: ${label}`);
      } else {
        // Week-based range (existing logic)
        const weekSpec = options.week || 'current';
        const bounds = getWeekBounds(weekSpec);
        start = bounds.start;
        end = bounds.end;
        label = bounds.label;
        logger.debug(`Using week-based range: ${label}`);
      }

      logger.debug(`Generating report for: ${label} (${start.toDateString()} - ${end.toDateString()})`);

      // Build filter options
      const filterOptions: any = {};

      if (options.project) {
        filterOptions.project = options.project;
      }

      if (options.tag) {
        filterOptions.tags = options.tag.split(',').map((t) => t.trim());
      }
      logger.debug(`Filter options: ${JSON.stringify(filterOptions)}`);

      // Get sessions
      const sessions = db.getSessionsByTimeRange(start, end, filterOptions);

      if (sessions.length === 0) {
        console.log(chalk.yellow('No sessions found for the specified time range.'));
        process.exit(0);
      }

      // Generate report
      const report = generateWeeklyReport(sessions, label, start, end);

      // Generate comparison if requested
      let previousReport = null;
      if (options.compare) {
        const prevPeriod = getPreviousPeriod(start, end);
        logger.debug(`Generating comparison report for: ${prevPeriod.label}`);

        const prevSessions = db.getSessionsByTimeRange(prevPeriod.start, prevPeriod.end, filterOptions);
        if (prevSessions.length > 0) {
          previousReport = generateWeeklyReport(prevSessions, prevPeriod.label, prevPeriod.start, prevPeriod.end);
        } else {
          logger.debug('No sessions found in previous period for comparison');
        }
      }

      // Format output - use config default if not specified
      const config = loadConfig();
      const format = options.format || config.reportFormat;
      logger.debug(`Output format: ${format}`);

      let output: string;

      switch (format) {
        case 'json':
          output = formatJsonReport(report);
          if (options.compare && previousReport) {
            console.log(chalk.yellow('Warning: Comparison mode not supported for JSON format'));
          }
          break;

        case 'csv':
          output = formatCsvReport(report);
          if (options.compare && previousReport) {
            console.log(chalk.yellow('Warning: Comparison mode not supported for CSV format'));
          }
          break;

        case 'terminal':
        default:
          output = formatTerminalReport(report, previousReport);
          break;
      }

      console.log(output);

      // Check for active sessions and add a note
      const activeSessions = sessions.filter(s => !s.endTime);
      if (activeSessions.length > 0) {
        const sessionWord = activeSessions.length === 1 ? 'session' : 'sessions';
        console.log();
        console.log(chalk.yellow(`Note: ${activeSessions.length} active ${sessionWord} excluded from totals.`));
        console.log(chalk.gray(`      Run 'tt status' to see current activity.`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
