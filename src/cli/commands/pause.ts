import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { differenceInMinutes } from 'date-fns';
import { validatePauseTime } from '../../utils/session-validator';

interface PauseOptions {
  reason?: string;
  at?: string;
}

/**
 * tt pause command implementation
 * Pauses the active session without starting an interruption
 */
export function pauseCommand(options: PauseOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSession = db.getActiveSession();

      if (!activeSession) {
        console.error(chalk.red('Error: No active task to pause'));
        process.exit(1);
      }

      // Validate and parse pause time
      const endTime = validatePauseTime(options.at, activeSession);

      // Update session
      db.updateSession(activeSession.id!, {
        endTime,
        state: 'paused',
        remark: options.reason,
      });

      // Calculate duration
      const durationMinutes = differenceInMinutes(endTime, activeSession.startTime);
      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      // Display summary
      console.log(chalk.yellow.bold('⏸') + chalk.yellow(' Paused task'));
      console.log(chalk.gray(`  Task: ${activeSession.description}`));
      console.log(chalk.gray(`  Duration: ${duration}`));

      if (options.at) {
        console.log(chalk.gray(`  Pause time: ${endTime.toLocaleString()}`));
      }

      if (options.reason) {
        console.log(chalk.gray(`  Reason: ${options.reason}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
