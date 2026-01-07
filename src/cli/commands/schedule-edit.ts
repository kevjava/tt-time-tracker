import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { LogParser } from '../../parser/grammar';
import { parseDuration } from '../../parser/duration';
import { logger } from '../../utils/logger';

interface ScheduleEditOptions {
  description?: string;
  project?: string;
  tags?: string;
  estimate?: string;
  priority?: string;
  scheduled?: string;
}

/**
 * tt schedule edit command implementation
 */
export function scheduleEditCommand(
  taskId: string,
  logNotationArgs: string | string[] | undefined,
  options: ScheduleEditOptions
): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const id = parseInt(taskId, 10);

      if (isNaN(id)) {
        console.error(chalk.red(`Error: Invalid task ID: ${taskId}`));
        process.exit(1);
      }

      // Get task details
      const task = db.getScheduledTaskById(id);

      if (!task) {
        console.error(chalk.red(`Error: Scheduled task with ID ${id} not found`));
        process.exit(1);
      }

      // Parse log notation if provided
      let logNotationData: any = {};
      let hasLogNotation = false;

      if (logNotationArgs) {
        const fullInput = Array.isArray(logNotationArgs)
          ? logNotationArgs.join(' ')
          : logNotationArgs;

        if (fullInput.trim()) {
          logger.debug('Attempting to parse log notation for edit');
          try {
            // Prepend dummy timestamp if needed
            const parseInput = fullInput.match(/^\d{4}-\d{2}-\d{2}/)
              ? fullInput
              : `00:00 ${fullInput}`;

            const parseResult = LogParser.parse(parseInput);

            if (parseResult.errors.length === 0 && parseResult.entries.length > 0) {
              const logEntry = parseResult.entries[0];
              hasLogNotation = true;
              logger.debug('Successfully parsed log notation for edit');

              // Extract values from log notation (will be overridden by command-line flags)
              if (logEntry.description && logEntry.description.trim()) {
                logNotationData.description = logEntry.description;
              }

              if (logEntry.project) {
                logNotationData.project = logEntry.project;
              }

              if (logEntry.tags && logEntry.tags.length > 0) {
                logNotationData.tags = logEntry.tags;
              }

              if (logEntry.estimateMinutes) {
                logNotationData.estimateMinutes = logEntry.estimateMinutes;
              }

              if (logEntry.priority) {
                logNotationData.priority = logEntry.priority;
              }

              // Extract scheduled date/time if present
              if (fullInput.match(/^\d{4}-\d{2}-\d{2}/)) {
                logNotationData.scheduledDateTime = logEntry.timestamp;
              }
            } else {
              logger.debug('Failed to parse as log notation, ignoring');
            }
          } catch (error) {
            logger.debug(`Log notation parsing failed: ${error}, ignoring`);
          }
        }
      }

      // Check if any updates were provided
      const hasUpdates =
        Object.keys(options).some((key) => options[key as keyof ScheduleEditOptions] !== undefined) ||
        hasLogNotation;

      if (!hasUpdates) {
        console.error(chalk.red('Error: No updates provided. Use --help to see available options.'));
        process.exit(1);
      }

      // Display current task details
      console.log(chalk.bold('\nCurrent scheduled task:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`  ID: ${task.id}`);
      console.log(`  Description: ${task.description}`);
      console.log(`  Project: ${task.project || '(none)'}`);
      console.log(`  Tags: ${task.tags.length > 0 ? task.tags.join(', ') : '(none)'}`);
      console.log(`  Estimate: ${task.estimateMinutes ? `${task.estimateMinutes}m` : '(none)'}`);
      console.log(`  Priority: ${task.priority === 5 ? '(default)' : `^${task.priority}`}`);
      console.log(`  Scheduled: ${task.scheduledDateTime ? task.scheduledDateTime.toLocaleString() : '(none)'}`);
      console.log(chalk.gray('─'.repeat(80)));

      // Prepare updates
      const updates: any = {};
      let tagsUpdated = false;
      let newTags: string[] = [];

      // Merge log notation data with options (options take precedence)
      // Description
      if (options.description !== undefined) {
        updates.description = options.description;
      } else if (logNotationData.description !== undefined) {
        updates.description = logNotationData.description;
      }

      // Project
      if (options.project !== undefined) {
        updates.project = options.project || undefined;
      } else if (logNotationData.project !== undefined) {
        updates.project = logNotationData.project;
      }

      // Tags
      if (options.tags !== undefined) {
        tagsUpdated = true;
        newTags = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];
      } else if (logNotationData.tags !== undefined) {
        tagsUpdated = true;
        newTags = logNotationData.tags;
      }

      // Estimate
      if (options.estimate !== undefined) {
        try {
          updates.estimateMinutes = parseDuration(options.estimate);
        } catch (error) {
          console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
          process.exit(1);
        }
      } else if (logNotationData.estimateMinutes !== undefined) {
        updates.estimateMinutes = logNotationData.estimateMinutes;
      }

      // Priority
      if (options.priority !== undefined) {
        const priorityValue = parseInt(options.priority, 10);
        if (isNaN(priorityValue) || priorityValue < 1 || priorityValue > 9) {
          console.error(chalk.red('Error: Priority must be between 1 and 9'));
          process.exit(1);
        }
        updates.priority = priorityValue;
      } else if (logNotationData.priority !== undefined) {
        updates.priority = logNotationData.priority;
      }

      // Scheduled date/time
      if (options.scheduled !== undefined) {
        if (options.scheduled === '') {
          // Empty string means clear the scheduled date
          updates.scheduledDateTime = undefined;
        } else {
          const newScheduled = new Date(options.scheduled);
          if (isNaN(newScheduled.getTime())) {
            console.error(chalk.red(`Error: Invalid scheduled date: ${options.scheduled}`));
            process.exit(1);
          }
          updates.scheduledDateTime = newScheduled;
        }
      } else if (logNotationData.scheduledDateTime !== undefined) {
        updates.scheduledDateTime = logNotationData.scheduledDateTime;
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        db.updateScheduledTask(id, updates);
      }

      if (tagsUpdated) {
        db.updateScheduledTaskTags(id, newTags);
      }

      // Display what was updated
      console.log(chalk.green.bold('\n✓') + chalk.green(' Scheduled task updated successfully\n'));
      console.log(chalk.bold('Changes made:'));

      if (updates.description !== undefined) {
        console.log(`  Description: ${chalk.gray(task.description)} → ${chalk.green(updates.description)}`);
      }

      if (updates.project !== undefined) {
        console.log(
          `  Project: ${chalk.gray(task.project || '(none)')} → ${chalk.green(updates.project || '(none)')}`
        );
      }

      if (tagsUpdated) {
        const oldTags = task.tags.length > 0 ? task.tags.join(', ') : '(none)';
        const newTagsStr = newTags.length > 0 ? newTags.join(', ') : '(none)';
        console.log(`  Tags: ${chalk.gray(oldTags)} → ${chalk.green(newTagsStr)}`);
      }

      if (updates.estimateMinutes !== undefined) {
        const oldEst = task.estimateMinutes ? `${task.estimateMinutes}m` : '(none)';
        const newEst = updates.estimateMinutes ? `${updates.estimateMinutes}m` : '(none)';
        console.log(`  Estimate: ${chalk.gray(oldEst)} → ${chalk.green(newEst)}`);
      }

      if (updates.priority !== undefined) {
        const oldPri = task.priority === 5 ? '(default)' : `^${task.priority}`;
        const newPri = updates.priority === 5 ? '(default)' : `^${updates.priority}`;
        console.log(`  Priority: ${chalk.gray(oldPri)} → ${chalk.green(newPri)}`);
      }

      if (updates.scheduledDateTime !== undefined) {
        const oldSched = task.scheduledDateTime ? task.scheduledDateTime.toLocaleString() : '(none)';
        const newSched = updates.scheduledDateTime ? updates.scheduledDateTime.toLocaleString() : '(none)';
        console.log(`  Scheduled: ${chalk.gray(oldSched)} → ${chalk.green(newSched)}`);
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
