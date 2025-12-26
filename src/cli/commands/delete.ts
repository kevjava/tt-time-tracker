import chalk from 'chalk';
import { createInterface } from 'readline';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { format } from 'date-fns';

interface DeleteOptions {
  force?: boolean;
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
 * Recursively collect all descendant sessions
 */
function getAllDescendants(db: TimeTrackerDB, sessionId: number): Array<{ id: number; description: string; level: number }> {
  const descendants: Array<{ id: number; description: string; level: number }> = [];

  function collectChildren(parentId: number, level: number): void {
    const children = db.getChildSessions(parentId);
    for (const child of children) {
      descendants.push({ id: child.id!, description: child.description, level });
      collectChildren(child.id!, level + 1);
    }
  }

  collectChildren(sessionId, 1);
  return descendants;
}

/**
 * tt delete command implementation
 */
export async function deleteCommand(sessionId: string, options: DeleteOptions): Promise<void> {
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

      // Get all descendants recursively
      const descendants = getAllDescendants(db, id);

      // Display session details
      console.log(chalk.yellow('\nSession to delete:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(`  ID: ${session.id}`);
      console.log(`  Date: ${format(session.startTime, 'EEE, MMM d, yyyy')}`);
      console.log(`  Time: ${format(session.startTime, 'HH:mm')}${session.endTime ? `-${format(session.endTime, 'HH:mm')}` : ''}`);
      console.log(`  Description: ${session.description}`);

      if (session.project) {
        console.log(`  Project: ${session.project}`);
      }

      if (session.tags.length > 0) {
        console.log(`  Tags: ${session.tags.join(', ')}`);
      }

      console.log(`  State: ${session.state}`);

      if (descendants.length > 0) {
        console.log(chalk.yellow(`\n  Warning: This session has ${descendants.length} interruption(s) that will also be deleted:`));
        for (const desc of descendants) {
          const indent = '  '.repeat(desc.level);
          console.log(chalk.gray(`    ${indent}- ${desc.description} (ID: ${desc.id})`));
        }
      }

      console.log(chalk.gray('─'.repeat(80)));

      // Confirm deletion unless --force is used
      if (!options.force) {
        const confirmed = await promptConfirmation(
          chalk.yellow('\nAre you sure you want to delete this session? (y/N): ')
        );

        if (!confirmed) {
          console.log(chalk.gray('Deletion cancelled.'));
          process.exit(0);
        }
      }

      // Delete the session (cascades to children and tags due to foreign key constraints)
      db.deleteSession(id);

      console.log(chalk.green.bold('\n✓') + chalk.green(' Session deleted successfully'));

      if (descendants.length > 0) {
        console.log(chalk.gray(`  Deleted ${descendants.length + 1} session(s) total`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
