import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { differenceInMinutes } from 'date-fns';
import { validateAbandonTime } from '../../utils/session-validator';

interface AbandonOptions {
  reason?: string;
  at?: string;
}

/**
 * tt abandon command implementation
 */
export function abandonCommand(options: AbandonOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSession = db.getActiveSession();

      if (!activeSession) {
        console.error(chalk.red('Error: No active task to abandon'));
        process.exit(1);
      }

      // Validate and parse abandon time
      const endTime = validateAbandonTime(options.at, activeSession);

      // Update session
      db.updateSession(activeSession.id!, {
        endTime,
        state: 'abandoned',
        remark: options.reason,
      });

      // Calculate duration
      const durationMinutes = differenceInMinutes(endTime, activeSession.startTime);
      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      // Display summary
      console.log(chalk.yellow.bold('⚠') + chalk.yellow(' Abandoned task'));
      console.log(chalk.gray(`  Task: ${activeSession.description}`));
      console.log(chalk.gray(`  Duration: ${duration}`));

      if (options.at) {
        console.log(chalk.gray(`  Abandon time: ${endTime.toLocaleString()}`));
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
