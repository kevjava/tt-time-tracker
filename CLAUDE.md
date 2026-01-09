# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TT is a Unix-philosophy CLI time tracker written in TypeScript. It supports both retroactive logging via text files and live tracking via start/stop commands. The tool parses a custom log notation with priority support (`^N`), stores sessions in SQLite, provides task scheduling with interactive selection, and generates comprehensive weekly reports with metrics like context switching, deep work sessions, and estimation accuracy.

## Development Commands

### Build and Test

```bash
# Build the project (compiles TS and copies schema.sql)
npm run build

# Run all tests
npm test

# Watch mode for tests
npm run test:watch

# Run specific test file
npm test -- duration.test.ts

# Test coverage report
npm run test:coverage
```

### Testing the CLI

```bash
# Use temporary database for testing
TT_DATA_DIR=/tmp/tt-test node dist/index.js log src/parser/__tests__/fixtures/simple.log

# Test with second temp database (for multi-instance testing)
TT_DATA_DIR=/tmp/tt-test2 node dist/index.js start "test task" -p myProject

# Inspect test database
sqlite3 /tmp/tt-test/tt.db
```

### Running the CLI

```bash
# Run via ts-node (development)
npm run dev -- log test.log

# Run via compiled dist (production-like)
node dist/index.js --help
node dist/index.js log mywork.log
node dist/index.js report --week current
```

## Architecture Overview

### Data Flow: Log Command

```
Log File → Tokenizer → Grammar Parser → LogEntry[] → Database
                ↓
         Parse Errors → $EDITOR → Retry until valid
```

The parser is **error-resilient** during tokenization but **strict** during insertion. Parse errors open the file in `$EDITOR` for fixing, creating a retry loop until the file is valid or the user aborts.

### Data Flow: Report Command

```
Database → Query sessions → Calculate metrics → Format output
                              ↓
                    Context switches, efficiency,
                    focus blocks, estimate accuracy
```

### Critical Parser Behaviors

**Time Handling:**

- Timestamps without dates inherit the current date context, but if a log entry includes a date, it **must** appear on the same line as the first log entry of that date.
- When time goes backward (e.g., 22:00 → 01:00), parser assumes next day (midnight crossing)
- Large time gaps (>8 hours) generate warnings but don't block insertion
- End times are inferred: each task's end_time = next task's start_time (unless explicit duration `(30m)` is provided)

**Interruptions:**

- Indented lines are interruptions of the previous task
- When an interruption ends, the parent task resumes automatically
- Interruptions can nest arbitrarily deep via indentation level
- Parent-child relationships are stored via `parent_session_id` in the database
- When exporting to log format, interruptions automatically include explicit durations `(30m)` for round-trip compatibility

**Resume Markers:**

- `@prev` resumes the most recent task
- `@N` resumes task number N (1-indexed from start of file)
- These are resolved during parsing and converted to regular entries

### Database Schema

**sessions table:**

- Stores all time entries with start/end times
- Has `parent_session_id` for tracking interruptions
- `explicit_duration_minutes` overrides inferred duration when set
- `state` field: 'working', 'paused', 'completed', 'abandoned'

**session_tags table:**

- Many-to-many relationship between sessions and tags
- Uses composite primary key (session_id, tag)
- CASCADE delete when session is deleted

**scheduled_tasks table:**

- Stores future tasks that act as templates for starting work
- Has `priority` field (1-9, default 5) for task prioritization
- `scheduled_date_time` is optional, used to surface tasks on specific dates
- Tasks are removed from schedule when used via interactive selection

**scheduled_task_tags table:**

- Many-to-many relationship between scheduled tasks and tags
- Uses composite primary key (scheduled_task_id, tag)
- CASCADE delete when scheduled task is deleted

**Important indexes:**

- `idx_sessions_time_range` on (start_time, end_time, project) for efficient report queries
- `idx_scheduled_tasks_priority` for priority-based queries
- `idx_scheduled_tasks_scheduled_date` for date-based queries
- `idx_scheduled_tasks_created_at` for chronological ordering
- Time-range queries are performance-critical for reports

## Module Organization

### Parser Module (`src/parser/`)

- **duration.ts**: Parses duration strings like `2h30m` into minutes (pure function)
- **tokenizer.ts**: Converts log lines into token streams including priority (`^N`), error-resilient
- **grammar.ts**: `LogParser` class maintains date context, handles time underflow, resolves resume markers, parses priority

### Database Module (`src/db/`)

- **database.ts**: `TimeTrackerDB` class wraps better-sqlite3
- **schema.sql**: SQLite schema (copied to dist/ during build)
- Uses synchronous API (better-sqlite3 is sync-only)
- Transactions are used for batch inserts in the log command

### Reports Module (`src/reports/`)

- **calculators/**: Pure functions that compute metrics from session arrays
  - `context-switches.ts`: Classifies switches as hard/medium/soft based on project+tag changes
  - `efficiency.ts`: Calculates gross time, interruption time, net productive time
  - `focus-blocks.ts`: Detects deep work sessions (≥90min uninterrupted, same project+activity)
  - `estimate-accuracy.ts`: Compares estimated vs actual time
- **formatters/**: Convert report data to terminal/json/csv formats
  - Terminal formatter uses chalk for colored output

### CLI Module (`src/cli/`)

- **commands/**: Each command is a separate module (log.ts, start.ts, stop.ts, report.ts, schedule.ts, etc.)
- **schedule-\*.ts**: Schedule command implementation (add, list, edit, remove, import, select)
- **schedule-import.ts**: Imports .ttlog files as scheduled tasks, flattens interruptions, preserves timestamps
- **schedule-select.ts**: Interactive selection UI for scheduled tasks (three stanzas: oldest, important, urgent)
- **editor.ts**: Handles `$EDITOR` integration for fixing parse errors
- Uses Commander.js for argument parsing
- start/next/switch/interrupt commands support interactive selection when called without arguments

## Key Implementation Details

### End Time Inference (log command)

After parsing all entries, the log command infers end times:

1. Each task's end_time = next task's start_time
2. Unless the task has an explicit duration `(30m)`, which overrides this
3. Interrupted tasks: end_time = start of first interruption
4. Last task in file: end_time remains NULL (still in progress)

### Parent-Child Relationships (interruptions)

During insertion:

1. Track indentation levels while parsing
2. When indentation increases: new task becomes child of previous
3. When indentation decreases: return to parent context
4. Store `parent_session_id` to maintain the tree structure

### Context Switch Classification

Context switches include all focus changes, including interruptions. Each interruption generates two switches: one when switching to the interruption, and one when returning to the parent task.

- **Hard**: Different project AND different primary tag
- **Medium**: Same project, different primary tag
- **Soft**: Same project AND same primary tag
- **Not a switch**: Breaks/lunch (tagged with +lunch, +break, +downtime) don't count

The `buildWorkTimeline()` function in both `context-switches.ts` and `focus-blocks.ts` creates a chronological timeline of active work sessions, tracking when you switch to/from interruptions.

### Schedule Import (schedule-import.ts)

The `schedule import` command imports .ttlog files as scheduled task templates:

**Key behaviors:**
1. Uses LogParser to parse file (same as `log` command)
2. **No editor integration** - displays errors and exits (batch operation, not interactive)
3. **Flattens interruptions** - imports all entries (including indented ones) as separate scheduled tasks
4. **Uses estimates not durations** - `estimateMinutes` from `~15m`, ignores `explicitDurationMinutes` from `(30m)`
5. **Preserves timestamps** - stores exact date/time in `scheduledDateTime` field
6. **Resolves resume markers** - `@prev` and `@N` resolved using in-file context, `@resume` skipped
7. **Filters state markers** - skips `__END__`, `__PAUSE__`, `__ABANDON__` placeholder entries
8. **Allows duplicates** - no deduplication, each import creates new tasks

**Implementation pattern:**
```typescript
// 1. Read and parse file
const parseResult = LogParser.parse(content);

// 2. Filter valid entries (skip state markers)
const validEntries = entries.filter(e => !isSpecialMarker(e.description));

// 3. Import each entry
for (const entry of validEntries) {
  const taskId = db.insertScheduledTask({
    description: entry.description,
    project: entry.project,
    estimateMinutes: entry.estimateMinutes,  // NOT explicitDurationMinutes
    priority: entry.priority || 5,
    scheduledDateTime: entry.timestamp,      // Preserve exact time
  });
  if (entry.tags.length > 0) {
    db.insertScheduledTaskTags(taskId, entry.tags);
  }
}
```

**Test fixtures:**
- `schedule-import-simple.log` - Basic entries with timestamps and metadata
- `schedule-import-interruptions.log` - Nested interruptions to test flattening
- `schedule-import-resume-markers.log` - Resume marker resolution

### Test Organization

```
src/module/__tests__/
  module.test.ts
  fixtures/         # Test log files for integration tests
```

All tests use Jest. Database tests use in-memory SQLite (`:memory:`) for isolation.

## Important Caveats

### Build Process

The build script copies `src/db/schema.sql` to `dist/db/schema.sql`. If you modify the schema, you **must rebuild** or the CLI will use the old schema.

### Time Zone Handling

All timestamps are stored in local time. The parser uses `date-fns` which respects the system timezone. There is no UTC conversion—this is a single-user local tool.

### Duration Calculations

When calculating actual duration, always check for `explicitDurationMinutes` first. If set, use it. Otherwise, use `end_time - start_time`. This is critical for accurate reporting.

### Chalk Import (ESM)

Chalk v5 is ESM-only but the project uses CommonJS. The imports work because of `esModuleInterop: true` in tsconfig.json. Don't change the module system without updating all imports.

## Common Development Tasks

### Adding a New Report Metric

1. Create calculator in `src/reports/calculators/new-metric.ts`
2. Add to `WeeklyReport` type in `src/reports/types.ts`
3. Call calculator in `src/reports/weekly.ts`
4. Update formatters to display the new metric
5. Add tests in `src/reports/__tests__/`

### Adding a New Command

1. Create `src/cli/commands/new-command.ts`
2. Export command handler function
3. Register in `src/index.ts` using Commander.js
4. Write comprehensive tests in `src/cli/commands/__tests__/new-command.test.ts`
5. Update README.md with usage examples
6. Update spec.md to document the command behavior

**Example:** The `next` command (see `src/cli/commands/next.ts`) combines stop and start logic:

- Stops any active session silently
- Starts a new session with full log notation support
- Supports all the same options as `start` command
- Useful pattern for convenience commands that combine operations

### Modifying the Log Notation Syntax

1. Update tokenizer to recognize new token types
2. Update grammar parser to handle new tokens
3. Add fixtures in `src/parser/__tests__/fixtures/`
4. Update README.md documentation
5. Update spec.md if changing semantics

## Testing Philosophy

- **Parser**: Comprehensive unit tests for edge cases (102 tests total, 74 for parser)
- **Database**: Use in-memory SQLite for fast, isolated tests
- **Integration**: Test fixtures include `simple.log`, `interruptions.log`, `errors.log`, `warnings.log`, `complex.log`
- **Errors**: Test both happy path and error conditions
- **Test-first**: Write tests before implementation for new features

## Environment Variables

- `TT_DATA_DIR`: Override data directory (default: `~/.local/share/tt`)
- `EDITOR` or `VISUAL`: Editor for fixing parse errors (default: `vi`)
- For testing, always use `TT_DATA_DIR=/tmp/tt-test` to avoid polluting your real data
