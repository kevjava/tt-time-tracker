import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';

interface InterruptOptions {
  project?: string;
  tags?: string;
  estimate?: string;
}

/**
 * tt interrupt command implementation
 */
export function interruptCommand(description: string, options: InterruptOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSession = db.getActiveSession();

      if (!activeSession) {
        console.error(
          chalk.red('Error: No active task to interrupt. Start a task first with: tt start')
        );
        process.exit(1);
      }

      // Parse tags
      const tags = options.tags
        ? options.tags.split(',').map((t) => t.trim())
        : [];

      // Parse estimate
      let estimateMinutes: number | undefined;
      if (options.estimate) {
        try {
          estimateMinutes = parseDuration(options.estimate);
        } catch (error) {
          console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
          process.exit(1);
        }
      }

      // Update parent session to paused state
      db.updateSession(activeSession.id!, { state: 'paused' });

      // Create interruption session
      const interruptionId = db.insertSession({
        startTime: new Date(),
        description,
        project: options.project,
        estimateMinutes,
        state: 'working',
        parentSessionId: activeSession.id,
      });

      // Add tags
      if (tags.length > 0) {
        db.insertSessionTags(interruptionId, tags);
      }

      // Display confirmation
      console.log(chalk.yellow.bold('⏸') + chalk.yellow(` Paused: ${activeSession.description}`));
      console.log(chalk.green.bold('✓') + chalk.green(` Started interruption: ${description}`));
      console.log(chalk.gray(`  Interruption ID: ${interruptionId}`));

      if (options.project) {
        console.log(chalk.gray(`  Project: ${options.project}`));
      }

      if (tags.length > 0) {
        console.log(chalk.gray(`  Tags: ${tags.join(', ')}`));
      }

      if (estimateMinutes) {
        const hours = Math.floor(estimateMinutes / 60);
        const mins = estimateMinutes % 60;
        const estimate = hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;
        console.log(chalk.gray(`  Estimate: ${estimate}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
