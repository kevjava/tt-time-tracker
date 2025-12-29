import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { validateResumeTime } from '../../utils/session-validator';

interface ResumeOptions {
  remark?: string;
  at?: string;
}

/**
 * tt resume command implementation
 */
export function resumeCommand(options: ResumeOptions = {}): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
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
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
