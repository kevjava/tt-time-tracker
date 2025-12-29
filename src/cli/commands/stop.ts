import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { differenceInMinutes } from 'date-fns';
import { validateStopTime } from '../../utils/session-validator';

interface StopOptions {
  remark?: string;
  at?: string;
}

/**
 * tt stop command implementation
 */
export function stopCommand(options: StopOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSession = db.getActiveSession();

      if (!activeSession) {
        console.error(chalk.red('Error: No active task to stop'));
        process.exit(1);
      }

      // Validate and parse stop time
      const endTime = validateStopTime(options.at, activeSession);

      // Update session
      db.updateSession(activeSession.id!, {
        endTime,
        state: 'completed',
        remark: options.remark,
      });

      // Calculate duration
      const durationMinutes = differenceInMinutes(endTime, activeSession.startTime);
      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      // Display summary
      console.log(chalk.green.bold('✓') + chalk.green(' Stopped tracking'));
      console.log(chalk.gray(`  Task: ${activeSession.description}`));
      console.log(chalk.gray(`  Duration: ${duration}`));

      if (options.at) {
        console.log(chalk.gray(`  Stop time: ${endTime.toLocaleString()}`));
      }

      if (options.remark) {
        console.log(chalk.gray(`  Remark: ${options.remark}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
