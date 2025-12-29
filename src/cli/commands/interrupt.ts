import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';
import { LogParser } from '../../parser/grammar';
import { logger } from '../../utils/logger';

interface InterruptOptions {
  project?: string;
  tags?: string;
  estimate?: string;
}

/**
 * tt interrupt command implementation
 */
export function interruptCommand(descriptionArgs: string | string[], options: InterruptOptions): void {
  try {
    // Join description arguments
    const fullInput = Array.isArray(descriptionArgs)
      ? descriptionArgs.join(' ')
      : descriptionArgs;

    // Try to parse as log notation
    let description = fullInput;
    let project = options.project;
    let tags: string[] = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];
    let estimateMinutes: number | undefined;
    let startTime = new Date();
    let parsedAsLogNotation = false;

    // Attempt to parse as log notation if it looks like it might be
    if (fullInput.match(/^\d{1,2}:\d{2}/) || fullInput.match(/^\d{4}-\d{2}-\d{2}/)) {
      logger.debug('Attempting to parse input as log notation');
      try {
        const parseResult = LogParser.parse(fullInput);

        if (parseResult.errors.length === 0 && parseResult.entries.length > 0) {
          const logEntry = parseResult.entries[0];
          logger.debug('Successfully parsed as log notation');
          parsedAsLogNotation = true;

          // Use parsed values (command-line options override)
          description = logEntry.description;
          startTime = logEntry.timestamp;

          if (!project && logEntry.project) {
            project = logEntry.project;
          }

          if (tags.length === 0 && logEntry.tags.length > 0) {
            tags = logEntry.tags;
          }

          if (!options.estimate && logEntry.estimateMinutes) {
            estimateMinutes = logEntry.estimateMinutes;
          }
        } else {
          logger.debug('Failed to parse as log notation, treating as plain description');
        }
      } catch (error) {
        logger.debug(`Log notation parsing failed: ${error}, treating as plain description`);
      }
    }

    // Parse estimate from option if provided (overrides log notation)
    if (options.estimate) {
      try {
        estimateMinutes = parseDuration(options.estimate);
      } catch (error) {
        console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
        process.exit(1);
      }
    }

    // Validate description
    if (!description || description.trim() === '') {
      console.error(chalk.red('Error: Description cannot be empty'));
      process.exit(1);
    }

    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSession = db.getActiveSession();

      if (!activeSession) {
        console.error(
          chalk.red('Error: No active task to interrupt. Start a task first with: tt start')
        );
        process.exit(1);
      }

      // Update parent session to paused state
      db.updateSession(activeSession.id!, { state: 'paused' });

      // Create interruption session
      const interruptionId = db.insertSession({
        startTime,
        description,
        project,
        estimateMinutes,
        state: 'working',
        parentSessionId: activeSession.id,
      });

      // Add tags
      if (tags.length > 0) {
        db.insertSessionTags(interruptionId, tags);
      }

      // Display confirmation
      console.log(chalk.yellow.bold('⏸') + chalk.yellow(` Paused: ${activeSession.description}`));
      console.log(chalk.green.bold('✓') + chalk.green(` Started interruption: ${description}`));
      console.log(chalk.gray(`  Interruption ID: ${interruptionId}`));

      if (project) {
        console.log(chalk.gray(`  Project: ${project}`));
      }

      if (tags.length > 0) {
        console.log(chalk.gray(`  Tags: ${tags.join(', ')}`));
      }

      if (estimateMinutes) {
        const hours = Math.floor(estimateMinutes / 60);
        const mins = estimateMinutes % 60;
        const estimate = hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;
        console.log(chalk.gray(`  Estimate: ${estimate}`));
      }

      // Display timestamp if it was parsed from log notation
      if (parsedAsLogNotation) {
        console.log(chalk.gray(`  Start time: ${startTime.toLocaleTimeString()}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
