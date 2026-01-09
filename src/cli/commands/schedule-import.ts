import { readFileSync, existsSync } from 'fs';
import chalk from 'chalk';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { LogParser } from '../../parser/grammar';
import { LogEntry } from '../../types/session';
import { logger } from '../../utils/logger';
import * as theme from '../../utils/theme';

interface ScheduleImportOptions {
  // Future: could add filtering options like --date to shift timestamps
}

/**
 * Import log file entries as scheduled tasks (flattening interruptions)
 */
export function scheduleImportCommand(file: string, _options: ScheduleImportOptions = {}): void {
  try {
    ensureDataDir();

    // Validate file exists
    if (!file) {
      console.error(chalk.red('Error: File path required'));
      console.log(chalk.yellow('Usage: tt schedule import <file>'));
      process.exit(1);
    }

    if (!existsSync(file)) {
      console.error(chalk.red(`Error: File not found: ${file}`));
      process.exit(1);
    }

    logger.debug(`Reading log file: ${file}`);
    const content = readFileSync(file, 'utf-8');

    // Parse the file
    logger.debug('Parsing log file...');
    const parseResult = LogParser.parse(content);

    // Handle parse errors - different approach than log command
    // Since this is for scheduling, we show errors and exit (don't open editor)
    if (parseResult.errors.length > 0) {
      console.error(chalk.red.bold(`\n✗ Found ${parseResult.errors.length} parsing error(s):\n`));
      for (const error of parseResult.errors) {
        console.error(chalk.red(`  ${error.message}`));
      }
      console.error();
      console.error(chalk.yellow('Fix errors in the file and try again.'));
      process.exit(1);
    }

    // Display warnings (but continue)
    if (parseResult.warnings.length > 0) {
      console.warn(chalk.yellow.bold(`\n⚠ ${parseResult.warnings.length} warning(s):\n`));
      for (const warning of parseResult.warnings) {
        console.warn(chalk.yellow(`  ${warning}`));
      }
      console.warn();
    }

    const db = new TimeTrackerDB(getDatabasePath());
    try {
      // Filter out special markers and process entries
      const validEntries = parseResult.entries.filter(
        entry => !isSpecialMarker(entry.description)
      );

      if (validEntries.length === 0) {
        console.log(chalk.yellow('No entries found in file.'));
        return;
      }

      // Import each entry as a scheduled task (flattening hierarchy)
      let importedCount = 0;
      let skippedCount = 0;

      for (const entry of validEntries) {
        // Skip entries with unresolved resume markers
        // These have resumeMarkerValue set but empty/placeholder description
        if (isUnresolvedResumeMarker(entry)) {
          logger.debug(`Skipping entry at line ${entry.lineNumber}: unresolved resume marker`);
          skippedCount++;
          continue;
        }

        // Use estimate, NOT explicit duration (per requirements)
        const taskId = db.insertScheduledTask({
          description: entry.description,
          project: entry.project,
          estimateMinutes: entry.estimateMinutes, // Use ~15m, ignore (30m)
          priority: entry.priority || 5,
          scheduledDateTime: entry.timestamp, // Preserve exact date/time from file
        });

        if (entry.tags.length > 0) {
          db.insertScheduledTaskTags(taskId, entry.tags);
        }

        importedCount++;

        logger.debug(
          `Imported task ${taskId}: ${entry.description} ` +
          `(line ${entry.lineNumber}, indent ${entry.indentLevel})`
        );
      }

      // Display summary
      console.log(chalk.green.bold(`✓ Imported ${importedCount} scheduled task(s) from ${file}`));

      if (skippedCount > 0) {
        console.log(chalk.yellow(`  Skipped ${skippedCount} entry/entries with unresolved resume markers`));
      }

      // Show sample of imported tasks
      if (importedCount > 0) {
        displayRecentlyImportedTasks(db, importedCount);
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
 * Check if entry has an unresolved resume marker
 * @resume markers can't be resolved without database, so they'll have empty description
 */
function isUnresolvedResumeMarker(entry: LogEntry): boolean {
  // If resumeMarkerValue is set and description is empty or looks like a marker
  if (entry.resumeMarkerValue) {
    // @prev and @N get resolved by parser, @resume doesn't
    // Check if description is still empty or is the marker itself
    if (!entry.description || entry.description === entry.resumeMarkerValue) {
      return true;
    }
  }
  return false;
}

/**
 * Check if description is a special marker placeholder that should be filtered out
 */
function isSpecialMarker(description: string): boolean {
  const specialMarkers = ['__END__', '__PAUSE__', '__ABANDON__'];
  return specialMarkers.includes(description);
}

/**
 * Display a sample of recently imported tasks
 */
function displayRecentlyImportedTasks(db: TimeTrackerDB, importedCount: number): void {
  console.log(chalk.gray('\nRecently imported tasks:'));
  const recentTasks = db.getAllScheduledTasks()
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
    .slice(0, Math.min(5, importedCount));

  for (const task of recentTasks) {
    const parts: string[] = [];
    parts.push(chalk.gray(`  #${task.id}`));

    if (task.scheduledDateTime) {
      const dateStr = task.scheduledDateTime.toISOString().split('T')[0];
      const timeStr = task.scheduledDateTime.toTimeString().slice(0, 5);
      parts.push(chalk.gray(`${dateStr} ${timeStr}`));
    }

    parts.push(task.description);

    if (task.project) {
      parts.push(theme.formatProject(task.project));
    }

    if (task.tags.length > 0) {
      parts.push(theme.formatTags(task.tags));
    }

    if (task.estimateMinutes) {
      parts.push(theme.formatEstimate(task.estimateMinutes));
    }

    if (task.priority !== 5) {
      parts.push(chalk.yellow(`^${task.priority}`));
    }

    console.log(parts.join(' '));
  }
  console.log();
}
