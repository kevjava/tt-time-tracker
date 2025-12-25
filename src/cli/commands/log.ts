import { readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { LogParser } from '../../parser/grammar';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { openInEditor } from '../editor';
import { LogEntry } from '../../types/session';
import { logger } from '../../utils/logger';

/**
 * Log entry with calculated end time
 */
interface ProcessedLogEntry extends LogEntry {
  endTime?: Date;
}

/**
 * Calculate end times for log entries
 * Each entry's end_time is the next entry's start_time (unless explicit duration)
 */
function calculateEndTimes(entries: LogEntry[]): ProcessedLogEntry[] {
  const result: ProcessedLogEntry[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nextEntry = entries[i + 1];

    // If entry has explicit duration, calculate end_time from start_time + duration
    if (entry.explicitDurationMinutes) {
      const endTime = new Date(entry.timestamp);
      endTime.setMinutes(endTime.getMinutes() + entry.explicitDurationMinutes);

      result.push({
        ...entry,
        endTime,
      });
    }
    // If there's a next entry at the same or lower indent level, use its start_time
    else if (nextEntry && nextEntry.indentLevel <= entry.indentLevel) {
      result.push({
        ...entry,
        endTime: nextEntry.timestamp,
      });
    }
    // Otherwise, leave end_time undefined (session is still open or we don't know when it ended)
    else {
      result.push(entry);
    }
  }

  return result;
}

/**
 * Build parent-child relationships for interruptions
 * Returns a map of entry index to parent entry index
 */
function buildParentMap(entries: LogEntry[]): Map<number, number> {
  const parentMap = new Map<number, number>();
  const indentStack: number[] = []; // Stack of indices at each indent level

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const indentLevel = entry.indentLevel;

    // Pop stack until we find a parent with lower indent
    while (indentStack.length > 0) {
      const potentialParentIdx = indentStack[indentStack.length - 1];
      const potentialParent = entries[potentialParentIdx];

      if (potentialParent.indentLevel < indentLevel) {
        // Found parent
        parentMap.set(i, potentialParentIdx);
        break;
      } else {
        // This entry is not a valid parent, pop it
        indentStack.pop();
      }
    }

    // Add current entry to stack at its indent level
    // First, clear any entries at the same or higher indent
    while (indentStack.length > 0) {
      const lastIdx = indentStack[indentStack.length - 1];
      if (entries[lastIdx].indentLevel >= indentLevel) {
        indentStack.pop();
      } else {
        break;
      }
    }

    indentStack.push(i);
  }

  return parentMap;
}

/**
 * Insert log entries into database
 */
function insertEntries(db: TimeTrackerDB, entries: LogEntry[]): { sessions: number; interruptions: number } {
  // Calculate end times
  const entriesWithEndTimes = calculateEndTimes(entries);

  // Build parent-child relationships
  const parentMap = buildParentMap(entries);

  // Map to store original entry index -> database session ID
  const sessionIds = new Map<number, number>();

  let sessionCount = 0;
  let interruptionCount = 0;

  // Insert all entries
  for (let i = 0; i < entriesWithEndTimes.length; i++) {
    const entry = entriesWithEndTimes[i];

    // Determine parent session ID
    const parentEntryIdx = parentMap.get(i);
    const parentSessionId = parentEntryIdx !== undefined ? sessionIds.get(parentEntryIdx) : undefined;

    // Insert session
    const sessionId = db.insertSession({
      startTime: entry.timestamp,
      endTime: entry.endTime,
      description: entry.description,
      project: entry.project,
      estimateMinutes: entry.estimateMinutes,
      explicitDurationMinutes: entry.explicitDurationMinutes,
      remark: entry.remark,
      state: entry.endTime ? 'completed' : 'working',
      parentSessionId,
    });

    // Insert tags
    if (entry.tags.length > 0) {
      db.insertSessionTags(sessionId, entry.tags);
    }

    // Store session ID for parent mapping
    sessionIds.set(i, sessionId);

    // Count sessions vs interruptions
    if (entry.indentLevel === 0) {
      sessionCount++;
    } else {
      interruptionCount++;
    }
  }

  return { sessions: sessionCount, interruptions: interruptionCount };
}

/**
 * Display parse errors
 */
function displayErrors(errors: any[]): void {
  console.error(chalk.red.bold(`\n✗ Found ${errors.length} error(s):\n`));

  for (const error of errors) {
    console.error(chalk.red(`  ${error.message}`));
  }

  console.error();
}

/**
 * Display warnings
 */
function displayWarnings(warnings: string[]): void {
  console.warn(chalk.yellow.bold(`\n⚠ ${warnings.length} warning(s):\n`));

  for (const warning of warnings) {
    console.warn(chalk.yellow(`  ${warning}`));
  }

  console.warn();
}

/**
 * tt log command implementation
 */
export async function logCommand(file?: string): Promise<void> {
  try {
    let content: string;
    let filePath: string;

    // Read from file or stdin
    if (file) {
      if (!existsSync(file)) {
        console.error(chalk.red(`Error: File not found: ${file}`));
        process.exit(1);
      }

      logger.debug(`Reading log file: ${file}`);
      filePath = file;
      content = readFileSync(file, 'utf-8');
      logger.debug(`Read ${content.split('\n').length} lines from file`);
    } else {
      logger.debug('Reading from stdin...');
      // Read from stdin
      const chunks: Buffer[] = [];

      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }

      content = Buffer.concat(chunks).toString('utf-8');

      // Save to temp file for editor
      filePath = join(tmpdir(), `tt-log-${Date.now()}.log`);
      writeFileSync(filePath, content, 'utf-8');
      logger.debug(`Saved stdin to temp file: ${filePath}`);
    }

    // Parse loop: keep trying until valid or user aborts
    logger.debug('Starting parse...');
    let parseResult = LogParser.parse(content);

    while (parseResult.errors.length > 0) {
      displayErrors(parseResult.errors);

      console.log(chalk.yellow('Opening file in editor to fix errors...\n'));

      // Open in editor
      const editorResult = openInEditor(filePath);

      if (!editorResult.modified) {
        console.log(chalk.gray('No changes made. Aborting.'));
        process.exit(1);
      }

      // Re-parse
      content = editorResult.content;
      parseResult = LogParser.parse(content);
    }

    // Display warnings (don't block insertion)
    if (parseResult.warnings.length > 0) {
      displayWarnings(parseResult.warnings);
    }

    // Insert into database
    ensureDataDir();
    const dbPath = getDatabasePath();
    logger.debug(`Using database: ${dbPath}`);
    const db = new TimeTrackerDB(dbPath);

    try {
      logger.debug(`Inserting ${parseResult.entries.length} entries into database...`);
      const { sessions, interruptions } = insertEntries(db, parseResult.entries);
      logger.debug(`Inserted ${sessions} sessions and ${interruptions} interruptions`);

      console.log(
        chalk.green.bold('✓') +
          chalk.green(` Logged ${sessions} session(s)`) +
          (interruptions > 0 ? chalk.green(`, ${interruptions} interruption(s)`) : '')
      );
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
