import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { parseFuzzyDate } from '../../utils/date';
import { formatDetailedSession } from '../formatters/detailed-session';
import * as readline from 'readline';

interface IncompleteOptions {
  from?: string;
  to?: string;
  all?: boolean;
}

/**
 * Ask user what to do with a paused session
 */
function promptAction(): Promise<'complete' | 'abandon' | 'skip'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      chalk.cyan('Action? ') + chalk.gray('[c]omplete / [a]bandon / [s]kip: '),
      (answer) => {
        rl.close();
        const normalized = answer.toLowerCase().trim();

        if (normalized === 'c' || normalized === 'complete') {
          resolve('complete');
        } else if (normalized === 'a' || normalized === 'abandon') {
          resolve('abandon');
        } else {
          resolve('skip');
        }
      }
    );
  });
}

/**
 * tt incomplete command implementation
 * Shows paused tasks and allows completing or abandoning them
 */
export async function incompleteCommand(options: IncompleteOptions): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      // Determine date range
      let start: Date;
      let end: Date;

      if (options.all) {
        // All time
        start = new Date(0);
        end = new Date();
      } else if (options.from || options.to) {
        // Custom range
        if (options.from) {
          try {
            start = parseFuzzyDate(options.from);
            start.setHours(0, 0, 0, 0);
          } catch (error) {
            console.error(chalk.red(`Error parsing --from date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
        } else {
          start = new Date(0);
        }

        if (options.to) {
          try {
            end = parseFuzzyDate(options.to);
            end.setHours(23, 59, 59, 999);
          } catch (error) {
            console.error(chalk.red(`Error parsing --to date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
        } else {
          end = new Date();
        }
      } else {
        // Default: last 30 days
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
      }

      // Get paused sessions
      const pausedSessions = db.getSessionsByTimeRange(start, end, { state: 'paused' });

      if (pausedSessions.length === 0) {
        console.log(chalk.yellow('No incomplete (paused) sessions found.'));
        process.exit(0);
      }

      // Filter to only include sessions where the continuation chain is incomplete
      // (i.e., the most recent session in the chain is paused or working)
      const incompleteChains = new Map<number, typeof pausedSessions[0]>();

      for (const session of pausedSessions) {
        if (!session.id) continue;

        // Get the continuation chain for this session
        const chain = db.getContinuationChain(session.id);

        if (chain.length === 0) {
          // No chain found, include this session
          incompleteChains.set(session.id, session);
          continue;
        }

        // Get the most recent session in the chain (last in chronological order)
        const mostRecent = chain[chain.length - 1];

        // Only include if the chain is still incomplete (paused or working)
        if (mostRecent.state === 'paused' || mostRecent.state === 'working') {
          // Use the most recent session in the chain as the representative
          if (mostRecent.id) {
            incompleteChains.set(mostRecent.id, mostRecent);
          }
        }
      }

      const sessions = Array.from(incompleteChains.values());

      if (sessions.length === 0) {
        console.log(chalk.yellow('No incomplete session chains found.'));
        console.log(chalk.gray('All paused sessions are part of completed or abandoned chains.'));
        process.exit(0);
      }

      // Display header
      console.log();
      console.log(chalk.bold(`Found ${sessions.length} incomplete session(s):`));
      console.log();

      let completedCount = 0;
      let abandonedCount = 0;
      let skippedCount = 0;

      // Process each session
      for (const session of sessions) {
        // Display session details
        console.log(formatDetailedSession(session, db));
        console.log();

        // Prompt for action
        const action = await promptAction();

        if (action === 'complete') {
          db.updateSession(session.id!, { state: 'completed' });
          console.log(chalk.green('✓ Marked as completed'));
          completedCount++;
        } else if (action === 'abandon') {
          db.updateSession(session.id!, { state: 'abandoned' });
          console.log(chalk.red('✗ Marked as abandoned'));
          abandonedCount++;
        } else {
          console.log(chalk.gray('⊘ Skipped'));
          skippedCount++;
        }

        console.log();
      }

      // Display summary
      console.log(chalk.bold('Summary:'));
      console.log(chalk.green(`  Completed: ${completedCount}`));
      console.log(chalk.red(`  Abandoned: ${abandonedCount}`));
      console.log(chalk.gray(`  Skipped: ${skippedCount}`));
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
