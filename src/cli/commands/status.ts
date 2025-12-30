import chalk from 'chalk';
import { startOfDay, endOfDay } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { Session } from '../../types/session';
import { getSessionDuration, getNetSessionDuration } from '../../utils/duration';

interface StatusOptions {
  isDefault?: boolean;
}

interface TodaySummary {
  totalMinutes: number;
  interruptionCount: number;
  projectBreakdown: Map<string, number>;
  longestSessionMinutes: number;
}

/**
 * Calculate elapsed time in minutes
 */
function getElapsedMinutes(startTime: Date): number {
  const elapsed = Date.now() - startTime.getTime();
  return Math.floor(elapsed / 60000);
}

/**
 * Calculate elapsed time in human-readable format
 */
function formatElapsedTime(startTime: Date): string {
  const minutes = getElapsedMinutes(startTime);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
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
 * Calculate time remaining for a session with an estimate
 */
function getTimeRemaining(session: Session, elapsedMinutes: number): { minutes: number; isOverEstimate: boolean } {
  if (!session.estimateMinutes) {
    return { minutes: 0, isOverEstimate: false };
  }

  const remaining = session.estimateMinutes - elapsedMinutes;
  return {
    minutes: Math.abs(remaining),
    isOverEstimate: remaining < 0,
  };
}

/**
 * Calculate today's summary statistics
 * Uses net duration (minus interruptions) for longest session detection
 */
function calculateTodaySummary(db: TimeTrackerDB): TodaySummary {
  const today = new Date();
  const start = startOfDay(today);
  const end = endOfDay(today);

  const sessions = db.getSessionsByTimeRange(start, end);

  let totalMinutes = 0;
  let interruptionCount = 0;
  const projectBreakdown = new Map<string, number>();
  let longestSessionMinutes = 0;

  for (const session of sessions) {
    // Calculate session duration
    let sessionDuration = 0;
    if (session.explicitDurationMinutes) {
      sessionDuration = session.explicitDurationMinutes;
    } else if (session.endTime) {
      sessionDuration = Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 60000);
    } else {
      // Active session - calculate elapsed time
      sessionDuration = getElapsedMinutes(session.startTime);
    }

    // Calculate net duration (handles nested interruptions correctly)
    let netDuration = 0;
    if (session.endTime) {
      netDuration = getNetSessionDuration(session, sessions);
    } else {
      // Active session - subtract interruptions from elapsed time
      const interruptions = sessions.filter(s => s.parentSessionId === session.id);
      let interruptionTime = 0;
      for (const interruption of interruptions) {
        interruptionTime += getSessionDuration(interruption);
      }
      netDuration = Math.max(0, sessionDuration - interruptionTime);
    }

    if (session.parentSessionId) {
      // This is an interruption
      interruptionCount++;

      // All sessions (including nested interruptions) contribute NET time to their project
      const project = session.project || '(no project)';
      projectBreakdown.set(project, (projectBreakdown.get(project) || 0) + netDuration);
    } else {
      // This is a top-level session

      // Add gross duration to total time (wall-clock time)
      totalMinutes += sessionDuration;

      // Track longest session using net duration
      if (netDuration > longestSessionMinutes) {
        longestSessionMinutes = netDuration;
      }

      // All sessions (including top-level) contribute NET time to their project
      const project = session.project || '(no project)';
      projectBreakdown.set(project, (projectBreakdown.get(project) || 0) + netDuration);
    }
  }

  return {
    totalMinutes,
    interruptionCount,
    projectBreakdown,
    longestSessionMinutes,
  };
}

/**
 * Display today's summary section
 */
function displayTodaySummary(summary: TodaySummary): void {
  // Don't show summary if there's been less than a minute of work today
  if (summary.totalMinutes < 1) {
    return;
  }

  console.log();
  console.log(chalk.bold("Today's Summary:"));
  console.log(`  Total time: ${chalk.cyan(formatDuration(summary.totalMinutes))}`);

  if (summary.interruptionCount > 0) {
    const interruptionText = summary.interruptionCount === 1 ? 'interruption' : 'interruptions';
    const color = summary.interruptionCount > 5 ? chalk.yellow : chalk.white;
    console.log(`  Interruptions: ${color(summary.interruptionCount)} ${interruptionText}`);
  }

  if (summary.projectBreakdown.size > 0) {
    console.log(`  Projects:`);
    // Sort projects by time (descending)
    const sorted = Array.from(summary.projectBreakdown.entries()).sort((a, b) => b[1] - a[1]);
    for (const [project, minutes] of sorted) {
      console.log(`    ${project}: ${chalk.cyan(formatDuration(minutes))}`);
    }
  }

  if (summary.longestSessionMinutes > 0) {
    console.log(`  Deep work: ${chalk.cyan(formatDuration(summary.longestSessionMinutes))} (longest session)`);
  }

  // Warnings
  const warnings: string[] = [];
  if (summary.interruptionCount > 10) {
    warnings.push(`${chalk.yellow('⚠')} High interruption count (${summary.interruptionCount}) - consider blocking focus time`);
  }

  if (warnings.length > 0) {
    console.log();
    for (const warning of warnings) {
      console.log(`  ${warning}`);
    }
  }
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

      // Calculate and display today's summary
      const summary = calculateTodaySummary(db);
      displayTodaySummary(summary);

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
  const elapsedMinutes = getElapsedMinutes(session.startTime);

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
    const estimateFormatted = formatDuration(session.estimateMinutes);
    const timeRemaining = getTimeRemaining(session, elapsedMinutes);

    if (timeRemaining.isOverEstimate) {
      console.log(
        `${indent}  ${chalk.gray(`Estimate: ${estimateFormatted}`)} ${chalk.yellow(`⚠ Over by ${formatDuration(timeRemaining.minutes)}`)}`
      );
    } else {
      console.log(
        `${indent}  ${chalk.gray(`Estimate: ${estimateFormatted}, ${formatDuration(timeRemaining.minutes)} remaining`)}`
      );
    }
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
