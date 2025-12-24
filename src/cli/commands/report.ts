import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { getWeekBounds } from '../../utils/date';
import { generateWeeklyReport } from '../../reports/weekly';
import { formatTerminalReport } from '../../reports/formatters/terminal';
import { formatJsonReport } from '../../reports/formatters/json';
import { formatCsvReport } from '../../reports/formatters/csv';

interface ReportOptions {
  week?: string;
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
      // Parse week specification
      const weekSpec = options.week || 'current';
      const { start, end, label } = getWeekBounds(weekSpec);

      // Build filter options
      const filterOptions: any = {};

      if (options.project) {
        filterOptions.project = options.project;
      }

      if (options.tag) {
        filterOptions.tags = options.tag.split(',').map((t) => t.trim());
      }

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
