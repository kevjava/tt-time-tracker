import chalk from 'chalk';
import { format } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';
import { SessionState } from '../../types/session';
import { LogParser } from '../../parser/grammar';
import { logger } from '../../utils/logger';

interface EditOptions {
  description?: string;
  project?: string;
  tags?: string;
  estimate?: string;
  remark?: string;
  startTime?: string;
  endTime?: string;
  state?: string;
}

/**
 * tt edit command implementation
 */
export function editCommand(
  sessionId: string,
  logNotationArgs: string | string[] | undefined,
  options: EditOptions
): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const id = parseInt(sessionId, 10);

      if (isNaN(id)) {
        console.error(chalk.red(`Error: Invalid session ID: ${sessionId}`));
        process.exit(1);
      }

      // Get session details
      const session = db.getSessionById(id);

      if (!session) {
        console.error(chalk.red(`Error: Session with ID ${id} not found`));
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
            // Try to parse as a complete log entry with timestamp
            let parseInput = fullInput;
            let userProvidedTimestamp = false;

            // If input doesn't start with a timestamp, prepend the session's current start time
            // But only if the input looks like it might be a full log entry (has description text)
            // For pure metadata like "@project ~30m", we still need a timestamp for the parser
            if (!fullInput.match(/^\d{1,2}:\d{2}/) && !fullInput.match(/^\d{4}-\d{2}-\d{2}/)) {
              const timeStr = format(session.startTime, 'HH:mm');
              // Add a placeholder description if none seems to exist (only metadata markers)
              const hasOnlyMetadata = /^[@+~(]/.test(fullInput.trim());
              if (hasOnlyMetadata) {
                parseInput = `${timeStr} _placeholder_ ${fullInput}`;
                logger.debug(`Prepended timestamp with placeholder: ${parseInput}`);
              } else {
                parseInput = `${timeStr} ${fullInput}`;
                logger.debug(`Prepended timestamp: ${parseInput}`);
              }
            } else {
              userProvidedTimestamp = true;
              // If input is ONLY a timestamp or timestamp + metadata (no description), add placeholder
              // Matches: "10:00", "10:00 (30m)", "10:00 @project ~20m", etc.
              if (fullInput.match(/^\d{1,2}:\d{2}(\s+[@+~(]|$)/)) {
                const timestampMatch = fullInput.match(/^\d{1,2}:\d{2}/);
                if (timestampMatch) {
                  const timestamp = timestampMatch[0];
                  const rest = fullInput.substring(timestamp.length).trim();
                  parseInput = `${timestamp} _placeholder_${rest ? ' ' + rest : ''}`;
                }
              }
            }

            const parseResult = LogParser.parse(parseInput, session.startTime);

            if (parseResult.errors.length === 0 && parseResult.entries.length > 0) {
              const logEntry = parseResult.entries[0];
              hasLogNotation = true;
              logger.debug('Successfully parsed log notation for edit');

              // Extract values from log notation (will be overridden by command-line flags)
              // Don't use the description if we added a placeholder
              if (logEntry.description && logEntry.description.trim() && logEntry.description !== '_placeholder_') {
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

              if (logEntry.explicitDurationMinutes) {
                logNotationData.explicitDurationMinutes = logEntry.explicitDurationMinutes;
              }

              // Only use the timestamp if the user explicitly provided it
              if (logEntry.timestamp && userProvidedTimestamp) {
                // Preserve the original session's date, only update the time
                const newStartTime = new Date(session.startTime);
                newStartTime.setHours(logEntry.timestamp.getHours());
                newStartTime.setMinutes(logEntry.timestamp.getMinutes());
                newStartTime.setSeconds(logEntry.timestamp.getSeconds());
                newStartTime.setMilliseconds(0);
                logNotationData.startTime = newStartTime;
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
        Object.keys(options).some((key) => options[key as keyof EditOptions] !== undefined) ||
        hasLogNotation;

      if (!hasUpdates) {
        console.error(chalk.red('Error: No updates provided. Use --help to see available options.'));
        process.exit(1);
      }

      // Display current session details
      console.log(chalk.bold('\nCurrent session:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`  ID: ${session.id}`);
      console.log(`  Date: ${format(session.startTime, 'EEE, MMM d, yyyy')}`);
      console.log(`  Start time: ${format(session.startTime, 'HH:mm:ss')}`);
      if (session.endTime) {
        console.log(`  End time: ${format(session.endTime, 'HH:mm:ss')}`);
      }
      console.log(`  Description: ${session.description}`);
      console.log(`  Project: ${session.project || '(none)'}`);
      console.log(`  Tags: ${session.tags.length > 0 ? session.tags.join(', ') : '(none)'}`);
      console.log(`  Estimate: ${session.estimateMinutes ? `${session.estimateMinutes}m` : '(none)'}`);
      console.log(`  Remark: ${session.remark || '(none)'}`);
      console.log(`  State: ${session.state}`);
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
        updates.project = options.project || null;
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

      // Start time (process before explicit duration)
      if (options.startTime !== undefined) {
        const newStartTime = new Date(options.startTime);
        if (isNaN(newStartTime.getTime())) {
          console.error(chalk.red(`Error: Invalid start time: ${options.startTime}`));
          process.exit(1);
        }
        updates.startTime = newStartTime;
      } else if (logNotationData.startTime !== undefined) {
        updates.startTime = logNotationData.startTime;
      }

      // Explicit duration (sets end time based on start time + duration)
      // Process this AFTER start time so we use the updated start time
      if (logNotationData.explicitDurationMinutes !== undefined) {
        const startTime = updates.startTime || session.startTime;
        const endTime = new Date(startTime.getTime() + logNotationData.explicitDurationMinutes * 60000);
        updates.endTime = endTime;
      }

      // Remark
      if (options.remark !== undefined) {
        updates.remark = options.remark || null;
      }

      // End time (from flag) - this can override explicit duration
      if (options.endTime !== undefined) {
        if (options.endTime === '') {
          // Empty string means clear the end time
          updates.endTime = null;
        } else {
          const newEndTime = new Date(options.endTime);
          if (isNaN(newEndTime.getTime())) {
            console.error(chalk.red(`Error: Invalid end time: ${options.endTime}`));
            process.exit(1);
          }
          updates.endTime = newEndTime;

          // Validate end_time > start_time
          const startTime = updates.startTime || session.startTime;
          if (newEndTime <= startTime) {
            console.error(chalk.red('Error: End time must be after start time'));
            process.exit(1);
          }
        }
      }

      // State
      if (options.state !== undefined) {
        const validStates: SessionState[] = ['working', 'paused', 'completed', 'abandoned'];
        if (!validStates.includes(options.state as SessionState)) {
          console.error(
            chalk.red(`Error: Invalid state. Must be one of: ${validStates.join(', ')}`)
          );
          process.exit(1);
        }
        updates.state = options.state as SessionState;
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        db.updateSession(id, updates);
      }

      if (tagsUpdated) {
        db.updateSessionTags(id, newTags);
      }

      // Display what was updated
      console.log(chalk.green.bold('\n✓') + chalk.green(' Session updated successfully\n'));
      console.log(chalk.bold('Changes made:'));

      if (updates.description !== undefined) {
        console.log(`  Description: ${chalk.gray(session.description)} → ${chalk.green(updates.description)}`);
      }

      if (updates.project !== undefined) {
        console.log(
          `  Project: ${chalk.gray(session.project || '(none)')} → ${chalk.green(updates.project || '(none)')}`
        );
      }

      if (tagsUpdated) {
        const oldTags = session.tags.length > 0 ? session.tags.join(', ') : '(none)';
        const newTagsStr = newTags.length > 0 ? newTags.join(', ') : '(none)';
        console.log(`  Tags: ${chalk.gray(oldTags)} → ${chalk.green(newTagsStr)}`);
      }

      if (updates.estimateMinutes !== undefined) {
        const oldEst = session.estimateMinutes ? `${session.estimateMinutes}m` : '(none)';
        const newEst = updates.estimateMinutes ? `${updates.estimateMinutes}m` : '(none)';
        console.log(`  Estimate: ${chalk.gray(oldEst)} → ${chalk.green(newEst)}`);
      }

      if (options.remark !== undefined) {
        console.log(
          `  Remark: ${chalk.gray(session.remark || '(none)')} → ${chalk.green(options.remark || '(none)')}`
        );
      }

      if (updates.startTime !== undefined) {
        console.log(
          `  Start time: ${chalk.gray(format(session.startTime, 'yyyy-MM-dd HH:mm:ss'))} → ${chalk.green(format(updates.startTime, 'yyyy-MM-dd HH:mm:ss'))}`
        );
      }

      if (updates.endTime !== undefined) {
        const oldEnd = session.endTime ? format(session.endTime, 'yyyy-MM-dd HH:mm:ss') : '(none)';
        const newEnd = updates.endTime ? format(updates.endTime, 'yyyy-MM-dd HH:mm:ss') : '(none)';
        console.log(`  End time: ${chalk.gray(oldEnd)} → ${chalk.green(newEnd)}`);
      }

      if (options.state !== undefined) {
        console.log(`  State: ${chalk.gray(session.state)} → ${chalk.green(options.state)}`);
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
