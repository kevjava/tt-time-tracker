import chalk from 'chalk';
import { createInterface } from 'readline';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { format } from 'date-fns';
import { parseFuzzyDate } from '../../utils/date';
import { Session } from '../../types/session';

interface DeleteOptions {
  force?: boolean;
  yes?: boolean;
  from?: string;
  to?: string;
  project?: string;
  tag?: string;
  state?: string;
  dryRun?: boolean;
}

/**
 * Format duration in minutes to human-readable string
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Calculate total duration for a session
 */
function calculateSessionDuration(session: Session & { tags: string[] }): number {
  if (session.explicitDurationMinutes) {
    return session.explicitDurationMinutes;
  }

  if (session.endTime) {
    const durationMs = session.endTime.getTime() - session.startTime.getTime();
    return Math.floor(durationMs / 60000);
  }

  return 0; // Active sessions have no duration yet
}

/**
 * Group sessions by project for summary
 */
function groupByProject(sessions: Array<Session & { tags: string[] }>): Map<string, number> {
  const projectMap = new Map<string, number>();

  for (const session of sessions) {
    const project = session.project || '(no project)';
    const duration = calculateSessionDuration(session);
    projectMap.set(project, (projectMap.get(project) || 0) + duration);
  }

  return projectMap;
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
export async function deleteCommand(
  sessionIds: string | string[],
  options: DeleteOptions
): Promise<void> {
  try {
    ensureDataDir();
    const db = new TimeTrackerDB(getDatabasePath());

    try {
      let sessionsToDelete: Array<Session & { tags: string[] }> = [];
      let allDescendants: Array<{ id: number; description: string; level: number }> = [];

      // Parse session IDs if provided
      const ids: number[] = [];
      if (sessionIds) {
        const idArray = Array.isArray(sessionIds) ? sessionIds : [sessionIds];
        const invalidIds: string[] = [];

        for (const idStr of idArray) {
          const id = parseInt(idStr, 10);
          if (isNaN(id)) {
            invalidIds.push(idStr);
          } else {
            ids.push(id);
          }
        }

        if (invalidIds.length > 0) {
          console.error(chalk.red(`Error: Invalid session IDs: ${invalidIds.join(', ')}`));
          process.exit(1);
        }
      }

      // Build filter options for date range and other filters
      if (options.from || options.to || options.project || options.tag || options.state) {
        // Use filter-based query
        let start: Date;
        let end: Date;

        if (options.from) {
          try {
            start = parseFuzzyDate(options.from);
          } catch (error) {
            console.error(chalk.red(`Error parsing --from date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
        } else {
          start = new Date(0); // Beginning of time
        }

        if (options.to) {
          try {
            end = parseFuzzyDate(options.to);
            end.setHours(23, 59, 59, 999); // End of day
          } catch (error) {
            console.error(chalk.red(`Error parsing --to date: ${error instanceof Error ? error.message : error}`));
            process.exit(1);
          }
        } else {
          end = new Date(); // Now
        }

        const filterOptions: any = {};

        if (options.project) {
          filterOptions.project = options.project;
        }

        if (options.tag) {
          filterOptions.tags = options.tag.split(',').map((t) => t.trim());
        }

        if (options.state) {
          filterOptions.state = options.state;
        }

        const filteredSessions = db.getSessionsByTimeRange(start, end, filterOptions);

        // If IDs were also provided, union them
        if (ids.length > 0) {
          const sessionIds = new Set(filteredSessions.map(s => s.id!));
          for (const id of ids) {
            if (!sessionIds.has(id)) {
              const session = db.getSessionById(id);
              if (session) {
                filteredSessions.push(session);
              }
            }
          }
        }

        sessionsToDelete = filteredSessions;
      } else if (ids.length > 0) {
        // Only IDs provided
        const notFoundIds: number[] = [];

        for (const id of ids) {
          const session = db.getSessionById(id);
          if (session) {
            sessionsToDelete.push(session);
          } else {
            notFoundIds.push(id);
          }
        }

        if (notFoundIds.length > 0) {
          console.error(chalk.red(`Warning: Sessions not found: ${notFoundIds.join(', ')}`));
          if (sessionsToDelete.length === 0) {
            console.error(chalk.red('No valid sessions to delete.'));
            process.exit(1);
          }
        }
      } else {
        console.error(chalk.red('Error: Must provide session IDs or filter options (--from, --to, --project, --tag, --state)'));
        process.exit(1);
      }

      if (sessionsToDelete.length === 0) {
        console.log(chalk.yellow('No sessions found matching criteria.'));
        process.exit(0);
      }

      // Collect all descendants for each session
      const descendantsMap = new Map<number, Array<{ id: number; description: string; level: number }>>();
      let totalDescendants = 0;

      for (const session of sessionsToDelete) {
        const descendants = getAllDescendants(db, session.id!);
        if (descendants.length > 0) {
          descendantsMap.set(session.id!, descendants);
          totalDescendants += descendants.length;
        }
        allDescendants.push(...descendants);
      }

      // Display summary
      console.log(chalk.yellow(`\nFound ${sessionsToDelete.length} session(s) to delete:\n`));
      console.log(chalk.gray('─'.repeat(80)));

      // Show each session
      for (const session of sessionsToDelete) {
        const timeStr = session.endTime
          ? `${format(session.startTime, 'HH:mm')}-${format(session.endTime, 'HH:mm')}`
          : `${format(session.startTime, 'HH:mm')}`;

        let sessionLine = `  #${session.id}  ${format(session.startTime, 'EEE MMM d')}  ${timeStr}  ${session.description}`;

        if (session.project) {
          sessionLine += ` ${chalk.cyan('@' + session.project)}`;
        }

        if (session.tags.length > 0) {
          sessionLine += ` ${chalk.magenta(session.tags.map(t => '+' + t).join(' '))}`;
        }

        console.log(sessionLine);

        // Show interruptions for this session
        const descendants = descendantsMap.get(session.id!);
        if (descendants && descendants.length > 0) {
          for (const desc of descendants) {
            const indent = '    ' + '  '.repeat(desc.level - 1);
            console.log(chalk.gray(`${indent}↳ ${desc.description} (ID: ${desc.id})`));
          }
        }
      }

      console.log(chalk.gray('─'.repeat(80)));

      // Calculate and show summary stats
      const totalDuration = sessionsToDelete.reduce((sum, s) => sum + calculateSessionDuration(s), 0);
      const projectBreakdown = groupByProject(sessionsToDelete);

      console.log(chalk.bold('\nSummary:'));
      console.log(`  Total sessions: ${sessionsToDelete.length}`);
      console.log(`  Total time: ${formatDuration(totalDuration)}`);

      if (projectBreakdown.size > 0) {
        console.log(`  Projects:`);
        for (const [project, duration] of projectBreakdown) {
          console.log(`    ${project}: ${formatDuration(duration)}`);
        }
      }

      if (totalDescendants > 0) {
        console.log(chalk.yellow(`\n  ⚠ This will also delete ${totalDescendants} child session(s) (interruptions)`));
      }

      console.log('');

      // Check if we should actually delete
      let shouldDelete = true;

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.blue.bold('🔍 DRY RUN MODE - No sessions were deleted'));
        shouldDelete = false;
        process.exit(0);
      }

      // Confirm deletion unless --yes or --force is used
      if (shouldDelete && !options.yes && !options.force) {
        const confirmed = await promptConfirmation(
          chalk.yellow('Are you sure you want to delete these sessions? (y/N): ')
        );

        if (!confirmed) {
          console.log(chalk.gray('Deletion cancelled.'));
          shouldDelete = false;
          process.exit(0);
        }
      }

      // Only delete if we should
      if (shouldDelete) {
        // Collect all IDs to delete (sessions + descendants)
        const allIdsToDelete = new Set<number>();
        for (const session of sessionsToDelete) {
          allIdsToDelete.add(session.id!);
        }
        for (const desc of allDescendants) {
          allIdsToDelete.add(desc.id);
        }

        // Delete all sessions
        db.deleteSessions(Array.from(allIdsToDelete));

        console.log(chalk.green.bold('\n✓') + chalk.green(` Successfully deleted ${allIdsToDelete.size} session(s)`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
