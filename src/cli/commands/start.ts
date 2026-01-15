import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';
import { LogParser } from '../../parser/grammar';
import { logger } from '../../utils/logger';
import { validateStartTime } from '../../utils/session-validator';
import * as theme from '../../utils/theme';
import { promptScheduledTaskSelection } from './schedule-select';
import { ScheduledTask, Session } from '../../types/session';
import { letterToNum } from '../../utils/schedule-id';

interface StartOptions {
  project?: string;
  tags?: string;
  estimate?: string;
  at?: string;
}

/**
 * tt start command implementation
 */
export async function startCommand(descriptionArgs: string | string[] | undefined, options: StartOptions): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Check if first argument is a session ID
      if (descriptionArgs) {
        const firstArg = Array.isArray(descriptionArgs) ? descriptionArgs[0] : descriptionArgs;
        const sessionId = parseInt(firstArg, 10);

        // If it's a valid number, there's only one argument, and it doesn't look like a timestamp
        // (timestamps contain ":" or "-"), and doesn't contain spaces, treat it as session ID
        const isSingleArg = Array.isArray(descriptionArgs)
          ? descriptionArgs.length === 1
          : !firstArg.includes(' ');

        if (
          !isNaN(sessionId) &&
          isSingleArg &&
          !firstArg.includes(':') &&
          !firstArg.includes('-')
        ) {
          startFromSessionTemplate(db, sessionId, options);
          return;
        }

        // Check if first argument is a schedule ID (letters only, exists in DB)
        if (/^[a-zA-Z]+$/.test(firstArg) && isSingleArg) {
          const scheduleId = letterToNum(firstArg);
          const task = db.getScheduledTaskById(scheduleId);
          if (task) {
            startFromScheduledTask(db, task, options);
            db.deleteScheduledTask(task.id!);
            return;
          }
          // Not a valid schedule ID, fall through to description handling
        }
      }

      // Otherwise, proceed with normal start logic
      await startWithDescription(db, descriptionArgs, options);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

/**
 * Start a new session based on an existing session's metadata
 */
function startFromSessionTemplate(db: TimeTrackerDB, sessionId: number, options: StartOptions): void {
  // Fetch the template session
  const templateSession = db.getSessionById(sessionId);

  if (!templateSession) {
    console.error(chalk.red(`Error: Session ${sessionId} not found`));
    process.exit(1);
  }

  // Use template session metadata, but allow options to override
  const description = templateSession.description;
  const project = options.project || templateSession.project;
  const tags = options.tags
    ? options.tags.split(',').map((t) => t.trim())
    : templateSession.tags;

  let estimateMinutes: number | undefined;
  if (options.estimate) {
    try {
      estimateMinutes = parseDuration(options.estimate);
    } catch (error) {
      console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
      process.exit(1);
    }
  } else {
    estimateMinutes = templateSession.estimateMinutes || undefined;
  }

  // Determine start time
  let actualStartTime: Date;
  if (options.at) {
    actualStartTime = validateStartTime(options.at, db);
  } else {
    // Check for active session
    const activeSession = db.getActiveSession();
    if (activeSession) {
      console.error(
        chalk.red(
          `Error: Already tracking "${activeSession.description}". Stop it first with: tt stop`
        )
      );
      process.exit(1);
    }
    actualStartTime = new Date();
  }

  // Create the new session
  const newSessionId = db.insertSession({
    startTime: actualStartTime,
    description,
    project,
    estimateMinutes,
    state: 'working',
  });

  // Add tags
  if (tags.length > 0) {
    db.insertSessionTags(newSessionId, tags);
  }

  // Display confirmation
  console.log(chalk.bold(chalk.green('✓')) + chalk.green(` Started tracking: ${chalk.bold(description)}`));
  console.log(chalk.gray(`  Task ID: ${newSessionId}`));
  console.log(chalk.gray(`  Template: Session ${sessionId}`));

  if (project) {
    console.log(chalk.gray(`  Project: ${theme.formatProject(project)}`));
  }

  if (tags.length > 0) {
    console.log(chalk.gray(`  Tags: ${theme.formatTags(tags)}`));
  }

  if (estimateMinutes) {
    console.log(chalk.gray(`  Estimate: ${theme.formatEstimate(estimateMinutes)}`));
  }

  if (options.at) {
    console.log(chalk.gray(`  Start time: ${actualStartTime.toLocaleString()}`));
  }
}

/**
 * Start a new session based on a scheduled task
 */
function startFromScheduledTask(db: TimeTrackerDB, task: ScheduledTask & { tags: string[] }, options: StartOptions): void {
  // Use scheduled task metadata, but allow options to override
  const description = task.description;
  const project = options.project || task.project;
  const tags = options.tags
    ? options.tags.split(',').map((t) => t.trim())
    : task.tags;

  let estimateMinutes: number | undefined;
  if (options.estimate) {
    try {
      estimateMinutes = parseDuration(options.estimate);
    } catch (error) {
      console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
      process.exit(1);
    }
  } else {
    estimateMinutes = task.estimateMinutes;
  }

  // Validate and get start time
  let actualStartTime: Date;
  if (options.at) {
    actualStartTime = validateStartTime(options.at, db);
  } else {
    // Check if already tracking something
    const activeSession = db.getActiveSession();
    if (activeSession) {
      console.error(
        chalk.red(
          `Error: Already tracking "${activeSession.description}". Stop it first with: tt stop`
        )
      );
      process.exit(1);
    }
    actualStartTime = new Date();
  }

  // Create the new session
  const newSessionId = db.insertSession({
    startTime: actualStartTime,
    description,
    project,
    estimateMinutes,
    state: 'working',
  });

  // Add tags
  if (tags.length > 0) {
    db.insertSessionTags(newSessionId, tags);
  }

  // Display confirmation
  console.log(chalk.bold(chalk.green('✓')) + chalk.green(` Started tracking: ${chalk.bold(description)}`));
  console.log(chalk.gray(`  Task ID: ${newSessionId}`));
  console.log(chalk.gray(`  From scheduled task`));

  if (project) {
    console.log(chalk.gray(`  Project: ${theme.formatProject(project)}`));
  }

  if (tags.length > 0) {
    console.log(chalk.gray(`  Tags: ${theme.formatTags(tags)}`));
  }

  if (estimateMinutes) {
    console.log(chalk.gray(`  Estimate: ${theme.formatEstimate(estimateMinutes)}`));
  }

  if (options.at) {
    console.log(chalk.gray(`  Start time: ${actualStartTime.toLocaleString()}`));
  }
}

/**
 * Resume an incomplete session (create continuation)
 */
function resumeIncompleteSession(
  db: TimeTrackerDB,
  session: Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number },
  options: StartOptions
): void {
  // Check for active session (can't resume if already working on something)
  const activeSession = db.getActiveSession();
  if (activeSession) {
    console.error(
      chalk.red(
        `Error: Already tracking "${activeSession.description}". Stop it first with: tt stop`
      )
    );
    process.exit(1);
  }

  // Determine start time
  const startTime = options.at ? validateStartTime(options.at, db) : new Date();

  // Find the root of the continuation chain
  const chainRoot = db.getChainRoot(session.id!);

  // Allow options to override session metadata
  const description = session.description;
  const project = options.project || session.project;
  const tags = options.tags
    ? options.tags.split(',').map((t) => t.trim())
    : session.tags;

  let estimateMinutes: number | undefined;
  if (options.estimate) {
    try {
      estimateMinutes = parseDuration(options.estimate);
    } catch (error) {
      console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
      process.exit(1);
    }
  } else {
    estimateMinutes = session.estimateMinutes;
  }

  // Create new session continuing from the chain root
  const newSessionId = db.insertSession({
    startTime,
    description,
    project,
    estimateMinutes,
    state: 'working',
    continuesSessionId: chainRoot?.id,
  });

  // Copy tags (or use overridden tags)
  if (tags.length > 0) {
    db.insertSessionTags(newSessionId, tags);
  }

  // Display confirmation
  console.log(
    chalk.green.bold('▶') + chalk.green(` Resumed: ${description}`)
  );
  console.log(chalk.gray(`  Task ID: ${newSessionId}`));
  console.log(chalk.gray(`  Continuing from session ${session.id}`));

  if (session.totalMinutes !== undefined && session.totalMinutes > 0) {
    const hours = Math.floor(session.totalMinutes / 60);
    const mins = Math.round(session.totalMinutes % 60);
    const timeStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
    console.log(chalk.gray(`  Previous time: ${timeStr}`));
  }

  if (options.at) {
    console.log(chalk.gray(`  Start time: ${startTime.toLocaleString()}`));
  }

  if (project) {
    console.log(chalk.gray(`  Project: ${theme.formatProject(project)}`));
  }

  if (tags.length > 0) {
    console.log(chalk.gray(`  Tags: ${theme.formatTags(tags)}`));
  }

  if (estimateMinutes) {
    console.log(chalk.gray(`  Estimate: ${theme.formatEstimate(estimateMinutes)}`));
  }
}

/**
 * Start a new session with description from arguments
 */
async function startWithDescription(db: TimeTrackerDB, descriptionArgs: string | string[] | undefined, options: StartOptions): Promise<void> {
  // Check if no arguments provided (undefined or empty array from Commander.js)
  const noArgs = descriptionArgs === undefined || (Array.isArray(descriptionArgs) && descriptionArgs.length === 0);

  if (noArgs) {
    // Try interactive selection from scheduled tasks
    const selectedTask = await promptScheduledTaskSelection(db);

    if (!selectedTask) {
      // User cancelled or no tasks available - exit gracefully
      process.exit(0);
      return;
    }

    // Check if this is a Session (incomplete) or ScheduledTask
    if ('startTime' in selectedTask) {
      // This is an incomplete session - resume it
      const session = selectedTask as Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number };
      resumeIncompleteSession(db, session, options);
    } else {
      // This is a scheduled task - use as template
      const scheduledTask = selectedTask as ScheduledTask & { tags: string[] };
      startFromScheduledTask(db, scheduledTask, options);

      // Remove task from schedule only after successful session creation
      db.deleteScheduledTask(scheduledTask.id!);
    }
    return;
  }

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
      // Note: We skip overlap validation for log notation timestamps
      // because they're typically used for backdating entire sessions
    } else {
      // Current time - check for active session with friendly error
      const activeSession = db.getActiveSession();

      if (activeSession) {
        console.error(
          chalk.red(
            `Error: Already tracking "${activeSession.description}". Stop it first with: tt stop`
          )
        );
        process.exit(1);
      }

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
    console.log(chalk.bold(chalk.green('✓')) + chalk.green(` Started tracking: ${chalk.bold(description)}`));
    console.log(chalk.gray(`  Task ID: ${sessionId}`));

    if (project) {
      console.log(chalk.gray(`  Project: ${theme.formatProject(project)}`));
    }

    if (tags.length > 0) {
      console.log(chalk.gray(`  Tags: ${theme.formatTags(tags)}`));
    }

    if (estimateMinutes) {
      console.log(chalk.gray(`  Estimate: ${theme.formatEstimate(estimateMinutes)}`));
    }

    // Display timestamp if it was parsed from log notation or --at flag
    if (parsedAsLogNotation || options.at) {
      console.log(chalk.gray(`  Start time: ${actualStartTime.toLocaleString()}`));
    }
}
