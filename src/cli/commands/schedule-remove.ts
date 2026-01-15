import chalk from 'chalk';
import { createInterface } from 'readline';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { letterToNum, numToLetter } from '../../utils/schedule-id';

interface ScheduleRemoveOptions {
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
 * tt schedule remove command implementation
 */
export async function scheduleRemoveCommand(taskIdArg: string, options: ScheduleRemoveOptions = {}): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      if (!taskIdArg) {
        console.error(chalk.red('Error: Task ID required'));
        process.exit(1);
      }

      let taskId: number;
      try {
        taskId = letterToNum(taskIdArg);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : `Error: Invalid task ID: ${taskIdArg}`));
        process.exit(1);
      }

      const task = db.getScheduledTaskById(taskId);

      if (!task) {
        console.error(chalk.red(`Error: Scheduled task ${taskIdArg} not found`));
        process.exit(1);
      }

      // Display task details
      console.log(chalk.bold('\nScheduled task to remove:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`  ID: ${numToLetter(task.id!)}`);
      console.log(`  Description: ${task.description}`);
      if (task.project) {
        console.log(`  Project: ${task.project}`);
      }
      if (task.tags.length > 0) {
        console.log(`  Tags: ${task.tags.join(', ')}`);
      }
      if (task.estimateMinutes) {
        console.log(`  Estimate: ${task.estimateMinutes}m`);
      }
      if (task.priority !== 5) {
        console.log(`  Priority: ^${task.priority}`);
      }
      if (task.scheduledDateTime) {
        console.log(`  Scheduled: ${task.scheduledDateTime.toLocaleString()}`);
      }
      console.log(chalk.gray('─'.repeat(80)));
      console.log();

      // Confirm deletion unless --yes flag is provided
      if (!options.yes) {
        const confirmed = await promptConfirmation(
          chalk.yellow('Are you sure you want to remove this scheduled task? (y/N): ')
        );

        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          process.exit(0);
        }
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
