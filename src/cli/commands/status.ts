import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { Session } from '../../types/session';

interface StatusOptions {
  isDefault?: boolean;
}

/**
 * Calculate elapsed time in human-readable format
 */
function formatElapsedTime(startTime: Date): string {
  const elapsed = Date.now() - startTime.getTime();
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

/**
 * tt status command implementation
 */
export function statusCommand(options: StatusOptions = {}): void {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      const activeSessions = db.getAllActiveSessions();

      if (activeSessions.length === 0) {
        console.log(chalk.gray('No active timers'));
        if (options.isDefault) {
          console.log(chalk.gray('\nRun `tt help` to see available commands'));
        }
        return;
      }

      // Organize sessions by parent relationship
      const sessionMap = new Map<number, Session & { tags: string[] }>();
      const childSessions = new Map<number, (Session & { tags: string[] })[]>();

      for (const session of activeSessions) {
        sessionMap.set(session.id!, session);

        if (session.parentSessionId) {
          if (!childSessions.has(session.parentSessionId)) {
            childSessions.set(session.parentSessionId, []);
          }
          childSessions.get(session.parentSessionId)!.push(session);
        }
      }

      // Find root sessions (those without parents or whose parents are inactive)
      const rootSessions = activeSessions.filter(
        (session) => !session.parentSessionId || !sessionMap.has(session.parentSessionId)
      );

      console.log(chalk.bold('\nActive Timers:\n'));

      // Display sessions in a tree structure
      for (const root of rootSessions) {
        displaySession(root, 0, childSessions);
      }

      if (options.isDefault) {
        console.log(chalk.gray('\nRun `tt help` to see available commands'));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

/**
 * Display a session and its children recursively
 */
function displaySession(
  session: Session & { tags: string[] },
  depth: number,
  childSessions: Map<number, (Session & { tags: string[] })[]>
): void {
  const indent = '  '.repeat(depth);
  const elapsed = formatElapsedTime(session.startTime);

  // State indicator
  let stateIndicator = '';
  let stateColor = chalk.green;
  if (session.state === 'working') {
    stateIndicator = '▶';
    stateColor = chalk.green;
  } else if (session.state === 'paused') {
    stateIndicator = '⏸';
    stateColor = chalk.yellow;
  }

  // Main line
  console.log(
    `${indent}${stateColor(stateIndicator)} ${chalk.bold(session.description)} ${chalk.gray(`(${elapsed})`)}`
  );

  // Details
  if (session.project) {
    console.log(`${indent}  ${chalk.gray(`Project: ${session.project}`)}`);
  }
  if (session.tags.length > 0) {
    console.log(`${indent}  ${chalk.gray(`Tags: ${session.tags.join(', ')}`)}`);
  }
  if (session.estimateMinutes) {
    const hours = Math.floor(session.estimateMinutes / 60);
    const mins = session.estimateMinutes % 60;
    const estimate = hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;
    console.log(`${indent}  ${chalk.gray(`Estimate: ${estimate}`)}`);
  }

  // Display children (interruptions)
  const children = childSessions.get(session.id!);
  if (children && children.length > 0) {
    console.log(`${indent}  ${chalk.dim('Interrupted by:')}`);
    for (const child of children) {
      displaySession(child, depth + 2, childSessions);
    }
  }

  console.log(); // Empty line between root sessions
}
