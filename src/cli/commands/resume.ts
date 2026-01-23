import chalk from 'chalk';
import { createInterface } from 'readline';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { validateResumeTime, validateStartTime } from '../../utils/session-validator';

interface ResumeOptions {
  remark?: string;
  at?: string;
  yes?: boolean;
}

/**
 * Prompt user for confirmation
 */
function promptConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * tt resume command implementation
 *
 * Two modes:
 * 1. Resume from interruption: `tt resume` (no ID)
 * 2. Resume paused task: `tt resume <id>`
 */
export async function resumeCommand(idArg?: string, options: ResumeOptions = {}): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Mode 1: Resume paused task by ID
      if (idArg) {
        await resumePausedTask(db, idArg, options);
        return;
      }

      // Mode 2: End interruption and resume parent (existing behavior)
      resumeFromInterruption(db, options);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

/**
 * Resume a paused task by creating a new session continuing from it
 */
async function resumePausedTask(db: TimeTrackerDB, idArg: string, options: ResumeOptions): Promise<void> {
  // Parse ID
  const id = parseInt(idArg, 10);
  if (isNaN(id)) {
    console.error(chalk.red(`Error: Invalid session ID: ${idArg}`));
    process.exit(1);
    return;
  }

  // Get the session
  const session = db.getSessionById(id);

  if (!session) {
    console.error(chalk.red(`Error: Session ${id} not found`));
    process.exit(1);
    return;
  }

  // Handle completed sessions - offer to resume them
  if (session.state === 'completed') {
    if (!options.yes) {
      console.log(chalk.yellow(`Session ${id} is completed: "${session.description}"`));
      const confirmed = await promptConfirmation(
        chalk.yellow('Would you like to resume this session? (y/N): ')
      );

      if (!confirmed) {
        console.log(chalk.gray('Resume cancelled.'));
        process.exit(0);
        return;
      }
    }

    // Update the completed session to paused so it can be part of the continuation chain
    db.updateSession(session.id!, { state: 'paused' });
    session.state = 'paused';
  }

  if (session.state !== 'paused') {
    console.error(
      chalk.red(
        `Error: Session ${id} is not paused (state: ${session.state}). Only paused tasks can be resumed.`
      )
    );
    process.exit(1);
    return;
  }

  // Check for active session (can't resume if already working on something)
  const activeSession = db.getActiveSession();
  if (activeSession) {
    console.error(
      chalk.red(
        `Error: Already tracking "${activeSession.description}". Stop it first with: tt stop`
      )
    );
    process.exit(1);
    return;
  }

  // Determine start time
  const startTime = options.at ? validateStartTime(options.at, db) : new Date();

  // Find the root of the continuation chain
  const chainRoot = db.getChainRoot(session.id!);

  // Create new session continuing from the chain root
  const sessionId = db.insertSession({
    startTime,
    description: session.description,
    project: session.project,
    state: 'working',
    continuesSessionId: chainRoot?.id,
    remark: options.remark,
  });

  // Copy tags from paused session
  if (session.tags.length > 0) {
    db.insertSessionTags(sessionId, session.tags);
  }

  // Display confirmation
  console.log(
    chalk.green.bold('▶') + chalk.green(` Resumed: ${session.description}`)
  );

  if (options.at) {
    console.log(chalk.gray(`  Start time: ${startTime.toLocaleString()}`));
  }

  if (session.project) {
    console.log(chalk.gray(`  Project: ${session.project}`));
  }

  if (session.tags.length > 0) {
    console.log(chalk.gray(`  Tags: ${session.tags.join(', ')}`));
  }

  if (options.remark) {
    console.log(chalk.gray(`  Remark: ${options.remark}`));
  }

  console.log(chalk.gray(`  Continuing from session ${session.id}`));
}

/**
 * End current interruption and resume parent task (original behavior)
 */
function resumeFromInterruption(db: TimeTrackerDB, options: ResumeOptions): void {
  const activeSession = db.getActiveSession();

  if (!activeSession) {
    console.error(
      chalk.red('Error: No active task to resume from. Start a task first with: tt start')
    );
    process.exit(1);
  }

  // Check if current task has a parent
  if (!activeSession.parentSessionId) {
    console.error(
      chalk.red(
        'Error: Current task is not an interruption. Use `tt stop` to stop the current task.'
      )
    );
    process.exit(1);
  }

  // Get parent session
  const parentSession = db.getSessionById(activeSession.parentSessionId);

  if (!parentSession) {
    console.error(
      chalk.red('Error: Parent task not found. Database may be corrupted.')
    );
    process.exit(1);
  }

  // Validate and parse resume time (which is the end time for the interruption)
  const endTime = validateResumeTime(options.at, activeSession);

  db.updateSession(activeSession.id!, {
    endTime,
    state: 'completed',
    remark: options.remark,
  });

  // Resume parent task
  db.updateSession(parentSession.id!, {
    state: 'working',
  });

  // Display confirmation
  console.log(
    chalk.green.bold('✓') + chalk.green(` Completed interruption: ${activeSession.description}`)
  );

  if (options.at) {
    console.log(chalk.gray(`  Resume time: ${endTime.toLocaleString()}`));
  }

  if (options.remark) {
    console.log(chalk.gray(`  Remark: ${options.remark}`));
  }

  console.log(
    chalk.green.bold('▶') + chalk.green(` Resumed: ${parentSession.description}`)
  );

  if (parentSession.project) {
    console.log(chalk.gray(`  Project: ${parentSession.project}`));
  }

  if (parentSession.tags.length > 0) {
    console.log(chalk.gray(`  Tags: ${parentSession.tags.join(', ')}`));
  }
}
