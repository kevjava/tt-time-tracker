import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { LogParser } from '../../parser/grammar';
import { parseDuration } from '../../parser/duration';
import { logger } from '../../utils/logger';
import * as theme from '../../utils/theme';
import { parseScheduledTime } from '../../utils/time-parser';

interface ScheduleAddOptions {
  project?: string;
  tags?: string;
  estimate?: string;
  priority?: string;
  startTime?: string;
  scheduled?: string;
}

export function scheduleAddCommand(descriptionArgs: string[], options: ScheduleAddOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      if (!descriptionArgs || descriptionArgs.length === 0) {
        console.error(chalk.red('Error: Description required'));
        process.exit(1);
      }

      const fullInput = descriptionArgs.join(' ');

      // Try to parse as log notation
      let description = fullInput;
      let project = options.project;
      let tags: string[] = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];
      let estimateMinutes: number | undefined;
      let priority: number = 5; // Default
      let scheduledDateTime: Date | undefined;

      // Parse log notation if present
      const hasDateOrMetadata = fullInput.match(/^\d{4}-\d{2}-\d{2}/) ||
                                fullInput.includes('@') ||
                                fullInput.includes('+') ||
                                fullInput.includes('^') ||
                                fullInput.includes('~');

      if (hasDateOrMetadata) {
        logger.debug('Attempting to parse as log notation');
        try {
          // Prepend dummy timestamp if needed for parser
          const inputToParse = fullInput.match(/^\d{4}-\d{2}-\d{2}/)
            ? fullInput
            : `00:00 ${fullInput}`;

          const parseResult = LogParser.parse(inputToParse);

          if (parseResult.errors.length === 0 && parseResult.entries.length > 0) {
            const logEntry = parseResult.entries[0];
            logger.debug('Successfully parsed log notation');

            description = logEntry.description;

            if (!project && logEntry.project) {
              project = logEntry.project;
            }

            if (tags.length === 0 && logEntry.tags.length > 0) {
              tags = logEntry.tags;
            }

            if (!options.estimate && logEntry.estimateMinutes) {
              estimateMinutes = logEntry.estimateMinutes;
            }

            if (!options.priority && logEntry.priority) {
              priority = logEntry.priority;
            }

            // Extract scheduled date/time if present in input
            if (fullInput.match(/^\d{4}-\d{2}-\d{2}/)) {
              scheduledDateTime = logEntry.timestamp;
            }
          }
        } catch (error) {
          logger.debug(`Log notation parsing failed: ${error}, treating as plain description`);
        }
      }

      // Command-line options override log notation
      if (options.estimate) {
        try {
          estimateMinutes = parseDuration(options.estimate);
        } catch (error) {
          console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
          process.exit(1);
        }
      }

      if (options.priority) {
        priority = parseInt(options.priority, 10);
        if (isNaN(priority) || priority < 1 || priority > 9) {
          console.error(chalk.red('Error: Priority must be between 1 and 9'));
          process.exit(1);
        }
      }

      // Support both --start-time (new) and --scheduled (deprecated)
      const scheduledValue = options.startTime || options.scheduled;
      if (scheduledValue) {
        try {
          scheduledDateTime = parseScheduledTime(scheduledValue);
        } catch (error) {
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Invalid scheduled date'}`));
          process.exit(1);
        }
      }

      // Insert task
      const taskId = db.insertScheduledTask({
        description,
        project,
        estimateMinutes,
        priority,
        scheduledDateTime,
      });

      if (tags.length > 0) {
        db.insertScheduledTaskTags(taskId, tags);
      }

      // Display confirmation
      console.log(chalk.green.bold('✓') + chalk.green(' Scheduled task added'));
      console.log(chalk.gray(`  Task ID: ${taskId}`));
      console.log(chalk.gray(`  Description: ${description}`));

      if (project) {
        console.log(chalk.gray(`  Project: ${theme.formatProject(project)}`));
      }

      if (tags.length > 0) {
        console.log(chalk.gray(`  Tags: ${theme.formatTags(tags)}`));
      }

      if (estimateMinutes) {
        console.log(chalk.gray(`  Estimate: ${theme.formatEstimate(estimateMinutes)}`));
      }

      if (priority !== 5) {
        console.log(chalk.gray(`  Priority: ^${priority}`));
      }

      if (scheduledDateTime) {
        console.log(chalk.gray(`  Scheduled: ${scheduledDateTime.toLocaleString()}`));
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
