import { readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { format } from 'date-fns';
import { LogParser } from '../../parser/grammar';
import { TimeTrackerDB } from '../../db/database';
import { ensureDataDir, getDatabasePath } from '../../utils/config';
import { openInEditor } from '../editor';
import { LogEntry, Session, SessionState } from '../../types/session';
import { logger } from '../../utils/logger';

/**
 * Log entry with calculated end time and state
 */
interface ProcessedLogEntry extends LogEntry {
  endTime?: Date;
  state?: SessionState;
}

/**
 * Find the next entry at the same or lower indent level (skipping children/interruptions)
 */
function findNextSiblingOrParent(entries: LogEntry[], currentIndex: number): LogEntry | undefined {
  const currentIndent = entries[currentIndex].indentLevel;

  for (let i = currentIndex + 1; i < entries.length; i++) {
    if (entries[i].indentLevel <= currentIndent) {
      return entries[i];
    }
  }

  return undefined;
}

/**
 * Calculate end times and states for log entries
 * Each entry's end_time is the next entry's start_time (unless explicit duration)
 * State markers (@end, @pause, @abandon) set both end time and state
 */
function calculateEndTimes(entries: LogEntry[]): ProcessedLogEntry[] {
  const result: ProcessedLogEntry[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Skip state markers - they don't get inserted into database
    if (entry.description === '__END__' || entry.description === '__PAUSE__' || entry.description === '__ABANDON__') {
      continue;
    }

    // If entry has explicit duration, calculate end_time from start_time + duration
    // This takes precedence over everything else
    if (entry.explicitDurationMinutes) {
      const endTime = new Date(entry.timestamp);
      endTime.setMinutes(endTime.getMinutes() + entry.explicitDurationMinutes);

      result.push({
        ...entry,
        endTime,
      });
    }
    // Otherwise, find the next entry at same or lower indent level (skips over children)
    else {
      const nextSiblingOrParent = findNextSiblingOrParent(entries, i);

      // Check if next sibling/parent is a state marker
      const isNextEnd = nextSiblingOrParent?.description === '__END__';
      const isNextPause = nextSiblingOrParent?.description === '__PAUSE__';
      const isNextAbandon = nextSiblingOrParent?.description === '__ABANDON__';
      const isNextStateMarker = isNextEnd || isNextPause || isNextAbandon;

      // If next sibling/parent is a state marker, use its timestamp as end time and set state
      if (isNextStateMarker) {
        const stateFromMarker = isNextEnd ? 'completed' : isNextPause ? 'paused' : 'abandoned';
        result.push({
          ...entry,
          endTime: nextSiblingOrParent!.timestamp,
          // Preserve explicit state suffix (->paused, ->abandoned) if present
          // Otherwise use the state from the marker
          state: entry.state || stateFromMarker,
        });
      }
      // If there's a next sibling/parent, use its start_time as end_time
      else if (nextSiblingOrParent) {
        result.push({
          ...entry,
          endTime: nextSiblingOrParent.timestamp,
        });
      }
      // Otherwise, leave end_time undefined (session is still open or we don't know when it ended)
      else {
        result.push(entry);
      }
    }
  }

  return result;
}

/**
 * Build parent-child relationships for interruptions
 * Returns a map of entry index to parent entry index
 */
function buildParentMap(entries: LogEntry[]): Map<number, number> {
  // Filter out state markers first to match calculateEndTimes behavior
  const filteredEntries = entries.filter(
    e => e.description !== '__END__' && e.description !== '__PAUSE__' && e.description !== '__ABANDON__'
  );

  const parentMap = new Map<number, number>();
  const indentStack: number[] = []; // Stack of indices at each indent level

  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const indentLevel = entry.indentLevel;

    // Pop stack until we find a parent with lower indent
    while (indentStack.length > 0) {
      const potentialParentIdx = indentStack[indentStack.length - 1];
      const potentialParent = filteredEntries[potentialParentIdx];

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
      if (filteredEntries[lastIdx].indentLevel >= indentLevel) {
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

    // Determine parent session ID (for interruptions)
    const parentEntryIdx = parentMap.get(i);
    const parentSessionId = parentEntryIdx !== undefined ? sessionIds.get(parentEntryIdx) : undefined;

    // Determine continuation session ID (for @resume)
    let continuesSessionId: number | undefined;
    let inheritedDescription = entry.description;
    let inheritedProject = entry.project;
    let inheritedTags = entry.tags;

    if (entry.resumeMarkerValue) {
      // This entry was created via @resume/@prev/@N marker
      // Find the paused session to link to, then find the root of its chain

      if (entry.resumeMarkerValue === 'resume') {
        // @resume keyword (with or without task specification)
        if (!entry.description && !entry.project && entry.tags.length === 0) {
          // @resume alone - find most recent paused task and inherit its fields
          const pausedSession = db.findPausedSessionToResume();
          if (pausedSession) {
            // Find the root of the chain and point to that
            const chainRoot = db.getChainRoot(pausedSession.id!);
            continuesSessionId = chainRoot?.id;
            inheritedDescription = pausedSession.description;
            inheritedProject = pausedSession.project;
            inheritedTags = pausedSession.tags;
          }
        } else {
          // @resume with task specification - match by description/project/tags
          const primaryTag = entry.tags[0];
          const pausedSession = db.findPausedSessionToResume(
            entry.description || undefined,
            entry.project,
            primaryTag
          );
          if (pausedSession) {
            // Find the root of the chain and point to that
            const chainRoot = db.getChainRoot(pausedSession.id!);
            continuesSessionId = chainRoot?.id;
          }
        }
      } else if (entry.resumeMarkerValue === 'prev') {
        // @prev - find most recent paused task
        const pausedSession = db.findPausedSessionToResume();
        if (pausedSession) {
          // Find the root of the chain and point to that
          const chainRoot = db.getChainRoot(pausedSession.id!);
          continuesSessionId = chainRoot?.id;
        }
      } else if (/^\d+$/.test(entry.resumeMarkerValue)) {
        // @N - find Nth task from this file and check if it's paused
        const targetIdx = parseInt(entry.resumeMarkerValue, 10) - 1;
        const targetEntryDbId = sessionIds.get(targetIdx);
        if (targetEntryDbId) {
          const targetSession = db.getSessionById(targetEntryDbId);
          if (targetSession?.state === 'paused') {
            // Find the root of the chain and point to that
            const chainRoot = db.getChainRoot(targetEntryDbId);
            continuesSessionId = chainRoot?.id;
          }
        }
      }
    }

    // Insert session with both parent and continuation links
    const sessionId = db.insertSession({
      startTime: entry.timestamp,
      endTime: entry.endTime,
      description: inheritedDescription,
      project: inheritedProject,
      estimateMinutes: entry.estimateMinutes,
      explicitDurationMinutes: entry.explicitDurationMinutes,
      remark: entry.remark,
      state: entry.state || (entry.endTime ? 'completed' : 'working'),
      parentSessionId,
      continuesSessionId,
    });

    // Insert tags
    if (inheritedTags.length > 0) {
      db.insertSessionTags(sessionId, inheritedTags);
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
 * Check if two time ranges overlap
 */
function timeRangesOverlap(
  start1: Date,
  end1: Date | undefined,
  start2: Date,
  end2: Date | undefined
): boolean {
  // If either is open-ended, check if one starts during the other
  if (!end1) {
    // start1 is open-ended: overlaps if start2 >= start1
    return start2 >= start1;
  }
  if (!end2) {
    // start2 is open-ended: overlaps if start1 >= start2
    return start1 >= start2;
  }

  // Both are closed: ranges overlap if start1 < end2 AND start2 < end1
  return start1 < end2 && start2 < end1;
}

/**
 * Validate that entries don't have overlapping time ranges (except parent-child)
 * Returns array of error messages
 */
function validateNoSelfOverlaps(entries: ProcessedLogEntry[], parentMap: Map<number, number>): string[] {
  const errors: string[] = [];

  // Only check top-level entries (not children)
  const topLevelEntries = entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ idx }) => !parentMap.has(idx));

  for (let i = 0; i < topLevelEntries.length; i++) {
    for (let j = i + 1; j < topLevelEntries.length; j++) {
      const { entry: entry1 } = topLevelEntries[i];
      const { entry: entry2 } = topLevelEntries[j];

      if (timeRangesOverlap(entry1.timestamp, entry1.endTime, entry2.timestamp, entry2.endTime)) {
        errors.push(
          `Sessions overlap: "${entry1.description}" (line ${entry1.lineNumber}) and "${entry2.description}" (line ${entry2.lineNumber})`
        );
      }
    }
  }

  return errors;
}

/**
 * Find all existing sessions that overlap with the imported entries
 */
function findOverlappingExistingSessions(
  db: TimeTrackerDB,
  entries: ProcessedLogEntry[],
  parentMap: Map<number, number>
): Set<number> {
  const overlappingIds = new Set<number>();

  // Only check top-level entries
  const topLevelEntries = entries.filter((_, idx) => !parentMap.has(idx));

  for (const entry of topLevelEntries) {
    const overlapping = db.getOverlappingSessions(entry.timestamp, entry.endTime || null);
    for (const session of overlapping) {
      overlappingIds.add(session.id!);
    }
  }

  return overlappingIds;
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
 * Recursively collect all descendants for display
 */
function getAllDescendantIds(db: TimeTrackerDB, sessionId: number): number[] {
  const descendants: number[] = [];

  function collectChildren(parentId: number): void {
    const children = db.getChildSessions(parentId);
    for (const child of children) {
      descendants.push(child.id!);
      collectChildren(child.id!);
    }
  }

  collectChildren(sessionId);
  return descendants;
}

interface LogCommandOptions {
  overwrite?: boolean;
  dryRun?: boolean;
}

/**
 * tt log command implementation
 */
export async function logCommand(file?: string, options: LogCommandOptions = {}): Promise<void> {
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

      // Prepend errors as comments to help user fix them
      const errorComments = [
        '# PARSING ERRORS - Fix these issues and save the file',
        '# Remove these comment lines when done',
        '#',
        ...parseResult.errors.map(err => `# ERROR: ${err.message}`),
        '#',
        '# ────────────────────────────────────────────────────────',
        '',
        content,
      ].join('\n');

      // Write the file with error comments
      writeFileSync(filePath, errorComments, 'utf-8');

      // Open in editor
      const editorResult = openInEditor(filePath);

      if (!editorResult.modified) {
        console.log(chalk.gray('No changes made. Aborting.'));
        process.exit(1);
      }

      // Re-parse (errors will be stripped since they're comments)
      content = editorResult.content;
      parseResult = LogParser.parse(content);
    }

    // Display warnings (don't block insertion)
    if (parseResult.warnings.length > 0) {
      displayWarnings(parseResult.warnings);
    }

    // Calculate end times and parent relationships
    const entriesWithEndTimes = calculateEndTimes(parseResult.entries);
    const parentMap = buildParentMap(parseResult.entries);

    // Validate no self-overlaps in the import file
    logger.debug('Validating no self-overlaps...');
    const selfOverlapErrors = validateNoSelfOverlaps(entriesWithEndTimes, parentMap);
    if (selfOverlapErrors.length > 0) {
      console.error(chalk.red.bold('\n✗ Found overlapping sessions in import file:\n'));
      for (const error of selfOverlapErrors) {
        console.error(chalk.red(`  ${error}`));
      }
      console.error();
      process.exit(1);
    }

    // Insert into database
    ensureDataDir();
    const dbPath = getDatabasePath();
    logger.debug(`Using database: ${dbPath}`);
    const db = new TimeTrackerDB(dbPath);

    try {
      // Check for overlaps with existing sessions
      logger.debug('Checking for overlaps with existing sessions...');
      const overlappingIds = findOverlappingExistingSessions(db, entriesWithEndTimes, parentMap);

      if (overlappingIds.size > 0) {
        logger.debug(`Found ${overlappingIds.size} overlapping session(s)`);

        // Display overlapping sessions
        console.log(chalk.yellow.bold(`\n⚠ Found ${overlappingIds.size} overlapping session(s):\n`));

        const overlappingSessions: Array<Session & { tags: string[]; descendants: number[] }> = [];
        for (const id of overlappingIds) {
          const session = db.getSessionById(id);
          if (session) {
            const descendants = getAllDescendantIds(db, id);
            overlappingSessions.push({ ...session, descendants });

            console.log(
              `  ${chalk.yellow(`#${id}`)} ${session.description} - ${format(session.startTime, 'MMM d, HH:mm')}${session.endTime ? `-${format(session.endTime, 'HH:mm')}` : ''}`
            );
            if (descendants.length > 0) {
              console.log(chalk.gray(`      (includes ${descendants.length} interruption(s))`));
            }
          }
        }
        console.log();

        if (!options.overwrite) {
          console.error(
            chalk.red(
              'Cannot import: sessions would overlap with existing sessions.\n' +
                'Use --overwrite flag to replace overlapping sessions.'
            )
          );
          process.exit(1);
        }

        // Ask for confirmation to delete and replace
        const totalToDelete =
          overlappingIds.size +
          overlappingSessions.reduce((sum, s) => sum + s.descendants.length, 0);

        if (!options.dryRun) {
          const confirmed = await promptConfirmation(
            chalk.yellow(
              `This will delete ${totalToDelete} session(s) and replace them with the imported data.\n` +
                'Are you sure you want to continue? (y/N): '
            )
          );

          if (!confirmed) {
            console.log(chalk.gray('Import cancelled.'));
            process.exit(0);
          }

          // Delete overlapping sessions (cascade will handle descendants)
          logger.debug(`Deleting ${overlappingIds.size} overlapping session(s)...`);
          for (const id of overlappingIds) {
            db.deleteSession(id);
          }
          console.log(chalk.green(`✓ Deleted ${totalToDelete} session(s)\n`));
        } else {
          console.log(chalk.yellow(`\n  Would delete ${totalToDelete} session(s)\n`));
        }
      }

      // Insert the new entries
      if (options.dryRun) {
        // Count sessions and interruptions without inserting
        const sessionsCount = parseResult.entries.filter(e => e.indentLevel === 0).length;
        const interruptionsCount = parseResult.entries.filter(e => e.indentLevel > 0).length;

        console.log(chalk.blue.bold('🔍 DRY RUN MODE - No sessions were imported'));
        console.log(
          chalk.blue(
            `\n  Would import ${sessionsCount} session(s)` +
              (interruptionsCount > 0 ? `, ${interruptionsCount} interruption(s)` : '')
          )
        );
      } else {
        logger.debug(`Inserting ${parseResult.entries.length} entries into database...`);
        const { sessions, interruptions } = insertEntries(db, parseResult.entries);
        logger.debug(`Inserted ${sessions} sessions and ${interruptions} interruptions`);

        console.log(
          chalk.green.bold('✓') +
            chalk.green(` Logged ${sessions} session(s)`) +
            (interruptions > 0 ? chalk.green(`, ${interruptions} interruption(s)`) : '')
        );
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
