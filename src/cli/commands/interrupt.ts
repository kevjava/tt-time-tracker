import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';
import { LogParser } from '../../parser/grammar';
import { logger } from '../../utils/logger';
import { validateInterruptTime } from '../../utils/session-validator';

interface InterruptOptions {
  project?: string;
  tags?: string;
  estimate?: string;
  at?: string;
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
    let startTime: Date | undefined;
    let parsedAsLogNotation = false;

    // Attempt to parse as log notation if it looks like it might be
    const hasTimestamp = !!(fullInput.match(/^\d{1,2}:\d{2}/) || fullInput.match(/^\d{4}-\d{2}-\d{2}/));
    const hasProjectOrTags = fullInput.includes('@') || fullInput.includes('+');

    if (hasTimestamp || hasProjectOrTags) {
      logger.debug('Attempting to parse input as log notation');
      try {
        // If no timestamp but has project/tags, prepend a dummy timestamp for parsing
        const inputToParse = hasTimestamp ? fullInput : `00:00 ${fullInput}`;
        const parseResult = LogParser.parse(inputToParse);

        if (parseResult.errors.length === 0 && parseResult.entries.length > 0) {
          const logEntry = parseResult.entries[0];
          logger.debug('Successfully parsed as log notation');

          // Only treat as log notation with timestamp if it actually had one
          parsedAsLogNotation = hasTimestamp;

          // Use parsed values (command-line options override)
          description = logEntry.description;

          // Only use the parsed timestamp if the input actually had one
          if (hasTimestamp) {
            startTime = logEntry.timestamp;
          }

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

      // If --at is provided, override the timestamp (takes precedence)
      if (options.at && parsedAsLogNotation) {
        logger.debug('--at flag overrides log notation timestamp');
        parsedAsLogNotation = false; // Don't show log notation time in output
      }

      // Determine the actual interrupt time
      let actualStartTime: Date;
      if (options.at) {
        // Use validation function which will parse and validate
        actualStartTime = validateInterruptTime(options.at, activeSession, db);
      } else if (startTime) {
        // Use time from log notation, but still validate
        actualStartTime = startTime;
        // Note: We skip overlap validation for log notation timestamps
      } else {
        // Use current time with validation
        actualStartTime = validateInterruptTime(undefined, activeSession, db);
      }

      // Update parent session to paused state
      db.updateSession(activeSession.id!, { state: 'paused' });

      // Create interruption session
      logger.debug(`Attempting to insert interruption: ${description} at ${actualStartTime.toISOString()}`);
      const interruptionId = db.insertSession({
        startTime: actualStartTime,
        description,
        project,
        estimateMinutes,
        state: 'working',
        parentSessionId: activeSession.id,
      });
      logger.debug(`Interruption created with ID: ${interruptionId}`);

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

      // Display timestamp if it was parsed from log notation or --at flag
      if (parsedAsLogNotation || options.at) {
        console.log(chalk.gray(`  Start time: ${actualStartTime.toLocaleString()}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
