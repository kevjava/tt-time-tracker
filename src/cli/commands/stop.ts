import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath, loadConfig } from '../../utils/config';
import { differenceInMinutes } from 'date-fns';
import { validateStopTime } from '../../utils/session-validator';
import * as theme from '../../utils/theme';
import { getScheduler, isChurnEnabled } from '../../utils/scheduler';

interface StopOptions {
  remark?: string;
  at?: string;
}

/**
 * tt stop command implementation
 */
export async function stopCommand(options: StopOptions): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());
    const config = loadConfig();

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

      // Check if this session was started from a Churn task
      const churnTaskId = db.getChurnTaskId(activeSession.id!);
      if (churnTaskId && isChurnEnabled(config)) {
        // Complete the Churn task with actual time
        const scheduler = await getScheduler(config, db);
        await scheduler.completeTask({
          taskId: churnTaskId,
          completedAt: endTime,
          actualMinutes: durationMinutes,
          scheduledMinutes: activeSession.estimateMinutes,
        });

        // Remove the mapping
        db.removeChurnTaskMapping(activeSession.id!);
      }

      // Display summary
      console.log(chalk.bold(chalk.green('✓')) + chalk.green(' Stopped tracking'));
      console.log(chalk.gray(`  Task: ${chalk.bold(activeSession.description)}`));
      console.log(chalk.gray(`  Duration: ${theme.formatDuration(durationMinutes)}`));

      if (options.at) {
        console.log(chalk.gray(`  Stop time: ${endTime.toLocaleString()}`));
      }

      if (options.remark) {
        console.log(chalk.gray(`  Remark: ${theme.formatRemark(options.remark)}`));
      }

      if (churnTaskId && isChurnEnabled(config)) {
        console.log(chalk.gray(`  Churn task #${churnTaskId} completed`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
