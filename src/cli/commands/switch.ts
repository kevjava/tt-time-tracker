import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';
import { LogParser } from '../../parser/grammar';
import { logger } from '../../utils/logger';
import { validateStartTime, validateStopTime } from '../../utils/session-validator';

interface SwitchOptions {
  project?: string;
  tags?: string;
  estimate?: string;
  at?: string;
}

/**
 * tt switch command implementation
 * Pauses the current task (if any) and starts a new one
 */
export function switchCommand(descriptionArgs: string | string[], options: SwitchOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Step 1: Pause any active session (silently if none exists)
      const activeSession = db.getActiveSession();

      if (activeSession) {
        // Pause the active session
        const endTime = validateStopTime(options.at, activeSession);

        db.updateSession(activeSession.id!, {
          endTime,
          state: 'paused',
        });

        logger.debug(`Paused previous task: ${activeSession.description}`);
      }

      // Step 2: Start the new session (reuse logic from start.ts)
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

      // If --at is provided, override the timestamp (takes precedence)
      if (options.at && parsedAsLogNotation) {
        logger.debug('--at flag overrides log notation timestamp');
        parsedAsLogNotation = false; // Don't show log notation time in output
      }

      // Determine the actual start time
      let actualStartTime: Date;
      if (options.at) {
        // Use validation function which will parse and validate overlap
        actualStartTime = validateStartTime(options.at, db);
      } else if (startTime) {
        // Use time from log notation
        actualStartTime = startTime;
      } else {
        // Current time - no need to check for active session since we just paused it
        actualStartTime = new Date();
      }

      // Create session
      const sessionId = db.insertSession({
        startTime: actualStartTime,
        description,
        project,
        estimateMinutes,
        state: 'working',
      });

      // Add tags
      if (tags.length > 0) {
        db.insertSessionTags(sessionId, tags);
      }

      // Display confirmation
      console.log(chalk.green.bold('✓') + chalk.green(` Started tracking: ${description}`));
      console.log(chalk.gray(`  Task ID: ${sessionId}`));

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

      // Display what was paused
      if (activeSession) {
        console.log(chalk.gray(`  Paused: ${activeSession.description}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
