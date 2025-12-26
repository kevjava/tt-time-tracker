import chalk from 'chalk';
import { format } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseDuration } from '../../parser/duration';
import { SessionState } from '../../types/session';

interface EditOptions {
  description?: string;
  project?: string;
  tags?: string;
  estimate?: string;
  remark?: string;
  startTime?: string;
  endTime?: string;
  state?: string;
}

/**
 * tt edit command implementation
 */
export function editCommand(sessionId: string, options: EditOptions): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const id = parseInt(sessionId, 10);

      if (isNaN(id)) {
        console.error(chalk.red(`Error: Invalid session ID: ${sessionId}`));
        process.exit(1);
      }

      // Get session details
      const session = db.getSessionById(id);

      if (!session) {
        console.error(chalk.red(`Error: Session with ID ${id} not found`));
        process.exit(1);
      }

      // Check if any updates were provided
      const hasUpdates = Object.keys(options).some(
        (key) => options[key as keyof EditOptions] !== undefined
      );

      if (!hasUpdates) {
        console.error(chalk.red('Error: No updates provided. Use --help to see available options.'));
        process.exit(1);
      }

      // Display current session details
      console.log(chalk.bold('\nCurrent session:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`  ID: ${session.id}`);
      console.log(`  Date: ${format(session.startTime, 'EEE, MMM d, yyyy')}`);
      console.log(`  Start time: ${format(session.startTime, 'HH:mm:ss')}`);
      if (session.endTime) {
        console.log(`  End time: ${format(session.endTime, 'HH:mm:ss')}`);
      }
      console.log(`  Description: ${session.description}`);
      console.log(`  Project: ${session.project || '(none)'}`);
      console.log(`  Tags: ${session.tags.length > 0 ? session.tags.join(', ') : '(none)'}`);
      console.log(`  Estimate: ${session.estimateMinutes ? `${session.estimateMinutes}m` : '(none)'}`);
      console.log(`  Remark: ${session.remark || '(none)'}`);
      console.log(`  State: ${session.state}`);
      console.log(chalk.gray('─'.repeat(80)));

      // Prepare updates
      const updates: any = {};
      let tagsUpdated = false;
      let newTags: string[] = [];

      if (options.description !== undefined) {
        updates.description = options.description;
      }

      if (options.project !== undefined) {
        updates.project = options.project || null;
      }

      if (options.tags !== undefined) {
        tagsUpdated = true;
        newTags = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];
      }

      if (options.estimate !== undefined) {
        try {
          updates.estimateMinutes = parseDuration(options.estimate);
        } catch (error) {
          console.error(chalk.red(`Error: Invalid estimate format: ${options.estimate}`));
          process.exit(1);
        }
      }

      if (options.remark !== undefined) {
        updates.remark = options.remark || null;
      }

      if (options.startTime !== undefined) {
        const newStartTime = new Date(options.startTime);
        if (isNaN(newStartTime.getTime())) {
          console.error(chalk.red(`Error: Invalid start time: ${options.startTime}`));
          process.exit(1);
        }
        updates.startTime = newStartTime;
      }

      if (options.endTime !== undefined) {
        if (options.endTime === '') {
          // Empty string means clear the end time
          updates.endTime = null;
        } else {
          const newEndTime = new Date(options.endTime);
          if (isNaN(newEndTime.getTime())) {
            console.error(chalk.red(`Error: Invalid end time: ${options.endTime}`));
            process.exit(1);
          }
          updates.endTime = newEndTime;

          // Validate end_time > start_time
          const startTime = updates.startTime || session.startTime;
          if (newEndTime <= startTime) {
            console.error(chalk.red('Error: End time must be after start time'));
            process.exit(1);
          }
        }
      }

      if (options.state !== undefined) {
        const validStates: SessionState[] = ['working', 'paused', 'completed', 'abandoned'];
        if (!validStates.includes(options.state as SessionState)) {
          console.error(
            chalk.red(`Error: Invalid state. Must be one of: ${validStates.join(', ')}`)
          );
          process.exit(1);
        }
        updates.state = options.state as SessionState;
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        db.updateSession(id, updates);
      }

      if (tagsUpdated) {
        db.updateSessionTags(id, newTags);
      }

      // Display what was updated
      console.log(chalk.green.bold('\n✓') + chalk.green(' Session updated successfully\n'));
      console.log(chalk.bold('Changes made:'));

      if (options.description !== undefined) {
        console.log(`  Description: ${chalk.gray(session.description)} → ${chalk.green(options.description)}`);
      }

      if (options.project !== undefined) {
        console.log(
          `  Project: ${chalk.gray(session.project || '(none)')} → ${chalk.green(options.project || '(none)')}`
        );
      }

      if (tagsUpdated) {
        const oldTags = session.tags.length > 0 ? session.tags.join(', ') : '(none)';
        const newTagsStr = newTags.length > 0 ? newTags.join(', ') : '(none)';
        console.log(`  Tags: ${chalk.gray(oldTags)} → ${chalk.green(newTagsStr)}`);
      }

      if (options.estimate !== undefined) {
        const oldEst = session.estimateMinutes ? `${session.estimateMinutes}m` : '(none)';
        const newEst = updates.estimateMinutes ? `${updates.estimateMinutes}m` : '(none)';
        console.log(`  Estimate: ${chalk.gray(oldEst)} → ${chalk.green(newEst)}`);
      }

      if (options.remark !== undefined) {
        console.log(
          `  Remark: ${chalk.gray(session.remark || '(none)')} → ${chalk.green(options.remark || '(none)')}`
        );
      }

      if (options.startTime !== undefined) {
        console.log(
          `  Start time: ${chalk.gray(format(session.startTime, 'yyyy-MM-dd HH:mm:ss'))} → ${chalk.green(format(updates.startTime, 'yyyy-MM-dd HH:mm:ss'))}`
        );
      }

      if (options.endTime !== undefined) {
        const oldEnd = session.endTime ? format(session.endTime, 'yyyy-MM-dd HH:mm:ss') : '(none)';
        const newEnd = updates.endTime ? format(updates.endTime, 'yyyy-MM-dd HH:mm:ss') : '(none)';
        console.log(`  End time: ${chalk.gray(oldEnd)} → ${chalk.green(newEnd)}`);
      }

      if (options.state !== undefined) {
        console.log(`  State: ${chalk.gray(session.state)} → ${chalk.green(options.state)}`);
      }

      console.log();
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
