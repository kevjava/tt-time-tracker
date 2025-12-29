import chalk from 'chalk';
import { format as formatDate } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { getWeekBounds, parseFuzzyDate } from '../../utils/date';
import { generateWeeklyReport } from '../../reports/weekly';
import { formatTerminalReport } from '../../reports/formatters/terminal';
import { formatJsonReport } from '../../reports/formatters/json';
import { formatCsvReport } from '../../reports/formatters/csv';
import { logger } from '../../utils/logger';

interface ReportOptions {
  week?: string;
  from?: string;
  to?: string;
  project?: string;
  tag?: string;
  format?: string;
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
        label = `${formatDate(start, 'MMM d')} - ${formatDate(end, 'MMM d, yyyy')}`;
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

      // Format output
      const format = options.format || 'terminal';
      logger.debug(`Output format: ${format}`);

      let output: string;

      switch (format) {
        case 'json':
          output = formatJsonReport(report);
          break;

        case 'csv':
          output = formatCsvReport(report);
          break;

        case 'terminal':
        default:
          output = formatTerminalReport(report);
          break;
      }

      console.log(output);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
