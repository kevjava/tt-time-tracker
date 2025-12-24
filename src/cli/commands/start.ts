import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';

interface StartOptions {
  project?: string;
  tags?: string;
  estimate?: string;
}

/**
 * tt start command implementation
 */
export function startCommand(description: string, options: StartOptions): void {
  try {
    // Check for active session
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSession = db.getActiveSession();

      if (activeSession) {
        console.error(
          chalk.red(
            `Error: Already tracking "${activeSession.description}". Stop it first with: tt stop`
          )
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

      // Create session
      const sessionId = db.insertSession({
        startTime: new Date(),
        description,
        project: options.project,
        estimateMinutes,
        state: 'working',
      });

      // Add tags
      if (tags.length > 0) {
        db.insertSessionTags(sessionId, tags);
      }

      // Display confirmation
      console.log(chalk.green.bold('✓') + chalk.green(` Started tracking: ${description}`));
      console.log(chalk.gray(`  Task ID: ${sessionId}`));

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
