import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';

/**
 * tt schedule remove command implementation
 */
export function scheduleRemoveCommand(taskIdArg: string): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      if (!taskIdArg) {
        console.error(chalk.red('Error: Task ID required'));
        process.exit(1);
      }

      const taskId = parseInt(taskIdArg, 10);

      if (isNaN(taskId)) {
        console.error(chalk.red(`Error: Invalid task ID: ${taskIdArg}`));
        process.exit(1);
      }

      const task = db.getScheduledTaskById(taskId);

      if (!task) {
        console.error(chalk.red(`Error: Scheduled task ${taskId} not found`));
        process.exit(1);
      }

      db.deleteScheduledTask(taskId);

      console.log(chalk.green.bold('✓') + chalk.green(` Removed scheduled task: ${task.description}`));
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
