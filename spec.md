# TT Time Tracker - Implementation Spec

## Project Overview

Build a Unix-philosophy CLI time tracker in TypeScript with low-friction retroactive logging and comprehensive reporting. The tool should support both live tracking (`tt start/stop`) and parsing text-based log files with a custom notation syntax.

## Tech Stack

- **Language**: TypeScript (Node.js >= 18)
- **Database**: SQLite (better-sqlite3)
- **CLI Framework**: Commander.js
- **Testing**: Jest
- **Formatting**: Chalk (terminal colors)
- **Date handling**: date-fns

## Project Structure

```
tt-time-tracker/
├── package.json
├── tsconfig.json
├── jest.config.js
├── README.md
├── .gitignore
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── types/
│   │   ├── session.ts              # Type definitions
│   │   └── errors.ts               # Error classes
│   ├── parser/
│   │   ├── tokenizer.ts            # Token extraction
│   │   ├── grammar.ts              # LogParser class
│   │   ├── duration.ts             # Duration parsing
│   │   └── __tests__/
│   │       ├── tokenizer.test.ts
│   │       ├── grammar.test.ts
│   │       ├── duration.test.ts
│   │       └── fixtures/           # Test log files
│   ├── db/
│   │   ├── schema.sql
│   │   ├── database.ts             # DB connection & queries
│   │   └── __tests__/
│   │       └── database.test.ts
│   ├── reports/
│   │   ├── weekly.ts               # Report generator
│   │   ├── calculators/
│   │   │   ├── context-switches.ts
│   │   │   ├── efficiency.ts
│   │   │   ├── focus-blocks.ts
│   │   │   └── estimate-accuracy.ts
│   │   ├── formatters/
│   │   │   ├── terminal.ts
│   │   │   ├── json.ts
│   │   │   └── csv.ts
│   │   └── __tests__/
│   │       └── weekly.test.ts
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── log.ts
│   │   │   ├── report.ts
│   │   │   ├── start.ts
│   │   │   ├── next.ts
│   │   │   ├── stop.ts
│   │   │   ├── pause.ts
│   │   │   ├── resume.ts
│   │   │   ├── interrupt.ts
│   │   │   ├── schedule.ts           # Schedule command router
│   │   │   ├── schedule-add.ts       # Add scheduled task
│   │   │   ├── schedule-list.ts      # List scheduled tasks
│   │   │   ├── schedule-edit.ts      # Edit scheduled task
│   │   │   ├── schedule-remove.ts    # Remove scheduled task
│   │   │   ├── schedule-import.ts    # Import tasks from .ttlog file
│   │   │   └── schedule-select.ts    # Interactive selection UI
│   │   └── editor.ts                 # $EDITOR integration
│   └── utils/
│       ├── config.ts
│       └── date.ts
└── data/
    └── tt.db                       # Default SQLite location
```

## Log File Notation Syntax

### Basic Format

```
TIMESTAMP DESCRIPTION [@PROJECT] [+TAG...] [~ESTIMATE] [^PRIORITY] [(DURATION)] [# REMARK]
```

### Components

**Timestamps:**

- `HH:MM` - Time only (inherits current date)
- `HH:MM:SS` - Time with seconds
- `YYYY-MM-DD HH:MM` - Explicit date and time

**Projects:**

- `@projectName` - Single project per task
- Format: `@[a-zA-Z0-9_-]+`

**Tags:**

- `+tagName` - Multiple tags allowed
- Format: `+[a-zA-Z0-9_-]+`
- Examples: `+code`, `+meeting`, `+lunch`

**Estimates:**

- `~DURATION` - Estimated time
- Examples: `~2h`, `~30m`, `~1h30m`

**Priority:**

- `^N` - Priority level (1-9, default 5)
- Format: `^[1-9]`
- Examples: `^1` (highest), `^5` (default), `^9` (lowest)
- Used with `tt schedule` for task prioritization

**Explicit Duration:**

- `(DURATION)` - Actual duration override
- Examples: `(45m)`, `(2h30m)`

**Remarks:**

- `# text` - Comment about the task
- **MUST** have space after `#`
- **MUST** be last element on line
- `#` without space after is a parse error (use `\#` to escape)

**Interruptions:**

- Indented lines are interruptions of previous task
- Any amount of whitespace counts as indentation
- Use explicit duration syntax `(30m)` to specify interruption length
- When interruption ends, parent task resumes
- When exporting to log format, interruptions automatically include explicit durations

**Resume Markers:**

- `@prev` - Resume most recent task
- `@N` - Resume task number N

**Comments:**

- Lines starting with `#` (after whitespace) are ignored
- Useful for section headers in log files

### Example Log File

```
# Monday, Dec 23, 2024
09:00 morning standup @projectX +meeting
09:15 fix unit tests @projectX +code ~2h # struggling with mock setup
  10:37 walked dog +downtime (20m)
12:10 +lunch
12:48 @prev # found the issue, race condition
  14:02 teams call w/ joe @projectY +meeting (29m)
15:30 deploy to staging @projectX +deploy +ops

# Tuesday, Dec 24, 2024
2024-12-24 08:30 fix prod bug @projectX +code +urgent
```

## Parser Rules

### Time Handling

1. **Date context**: If timestamp lacks date, use current date context
2. **Date changes**: When explicit date seen or time goes backward (crossed midnight)
3. **Time underflow**: If time goes backward (22:04 → 01:12), assume next day
4. **Gap warnings**: Warn if gap between tasks > 8 hours
5. **End time inference**: Each task's end_time = next task's start_time (unless explicit duration)

### Error Handling

1. **Parse errors**: Reject file and open in `$EDITOR` for fixes
2. **Error loop**: Re-parse after edit until valid or user aborts
3. **Strict validation**: Prefer errors over skipping malformed lines

### Validation Rules

- Timestamps are required
- Description cannot be empty
- `#` without space after is error
- Invalid duration format is error
- Resume marker (`@prev`, `@N`) must have valid target

## Database Schema

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  description TEXT NOT NULL,
  project TEXT,
  estimate_minutes INTEGER,
  explicit_duration_minutes INTEGER,
  remark TEXT,
  state TEXT NOT NULL DEFAULT 'working',
  parent_session_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CHECK (state IN ('working', 'paused', 'completed', 'abandoned')),
  CHECK (end_time IS NULL OR end_time > start_time)
);

CREATE TABLE session_tags (
  session_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  project TEXT,
  estimate_minutes INTEGER,
  priority INTEGER DEFAULT 5,
  scheduled_date_time DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (priority >= 1 AND priority <= 9)
);

CREATE TABLE scheduled_task_tags (
  scheduled_task_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (scheduled_task_id, tag),
  FOREIGN KEY (scheduled_task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
CREATE INDEX idx_sessions_end_time ON sessions(end_time);
CREATE INDEX idx_sessions_project ON sessions(project);
CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX idx_sessions_time_range ON sessions(start_time, end_time, project);
CREATE INDEX idx_session_tags_tag ON session_tags(tag);
CREATE INDEX idx_scheduled_tasks_priority ON scheduled_tasks(priority ASC);
CREATE INDEX idx_scheduled_tasks_scheduled_date ON scheduled_tasks(scheduled_date_time ASC);
CREATE INDEX idx_scheduled_tasks_created_at ON scheduled_tasks(created_at ASC);
```

## CLI Commands

### `tt log [file]`

Parse and insert time entries from file or stdin.

**Behavior:**

- If no file provided, read from stdin
- Parse entire file
- If errors found:
  - Display all errors with line numbers
  - Open file in `$EDITOR`
  - Re-parse after edit
  - Loop until valid or user aborts (no changes)
- Display warnings (don't block insertion)
- Insert sessions and tags into database
- Print summary: "Logged N sessions, M interruptions"

### `tt report`

Generate weekly time report.

**Options:**

- `--week [week]` - "current" (default), "last", or ISO week number (2024-W51)
- `--project <project>` - Filter by single project
- `--tag <tags>` - Filter by tags (comma-separated)
- `--format <format>` - "terminal" (default), "json", "csv"

**Report Sections:**

1. **Summary**: Total time, billable/non-billable breakdown
2. **By Project**: Time per project with percentages
3. **By Activity**: Time per tag with percentages
4. **Estimates vs Actuals**: Average error, worst misses
5. **Efficiency**: Gross time, interruption time, net productive time
6. **Context Switching**: Total switches, by severity (hard/medium/soft), most fragmented days
7. **Deep Work Sessions**: Sessions >90min uninterrupted
8. **Morning Focus**: Time to first context switch each day
9. **Outliers**: Tasks >2σ from mean with remarks

### `tt start <description>`

Start tracking a task (live mode).

**Options:**

- `-p, --project <project>`
- `-t, --tags <tags>` (comma-separated)
- `-e, --estimate <duration>`
- `--at <time>` - Start time (retroactive tracking)

**Behavior:**

- Create new session with start_time = now (or --at time)
- Store in DB with state = 'working'
- Print confirmation with task ID
- Supports log notation syntax inline

### `tt next <description>`

Stop current task (if any) and start a new task (convenience command).

**Options:**

- `-p, --project <project>`
- `-t, --tags <tags>` (comma-separated)
- `-e, --estimate <duration>`
- `--at <time>` - Time for the task switch

**Behavior:**

- If active session exists, stop it (set end_time, state = 'completed')
- Create new session with start_time = now (or --at time)
- Store in DB with state = 'working'
- Supports log notation syntax inline
- Equivalent to: `tt stop && tt start <description>`

### `tt stop`

Stop current active task.

**Options:**

- `-r, --remark <remark>` - Add remark to task
- `--at <time>` - Stop time (retroactive tracking)

**Behavior:**

- Find active session (state = 'working', end_time = NULL)
- Set end_time = now (or --at time)
- Set state = 'completed'
- Update remark if provided
- Print summary: task description, duration

### `tt schedule import <file>`

Import scheduled tasks from a .ttlog template file.

**Arguments:**

- `<file>` - Path to .ttlog file containing task entries

**Behavior:**

- Read and parse file using LogParser
- Display parse errors and exit (do NOT open editor for batch imports)
- Display parse warnings but continue
- Filter out state marker placeholders (`__END__`, `__PAUSE__`, `__ABANDON__`)
- For each valid entry:
  - Skip entries with unresolved `@resume` markers (require database)
  - Resolve `@prev` and `@N` markers using in-file context
  - Import as scheduled task with:
    - description from entry.description
    - project from entry.project
    - estimateMinutes from entry.estimateMinutes (NOT explicitDurationMinutes)
    - priority from entry.priority (default 5)
    - scheduledDateTime from entry.timestamp (preserves exact date/time)
    - tags from entry.tags
- Flatten interruptions (import indented entries as separate tasks)
- Display summary: count imported, count skipped, sample of recent imports
- Allow duplicate descriptions (no deduplication)

**Error Handling:**

- File not found → error + exit(1)
- Parse errors → display all, suggest fixing source, exit(1)
- Parse warnings → display but continue
- Unresolved @resume → skip, increment skipped count
- No entries → graceful message

**Key Differences from log command:**

- No editor integration (batch operation, fix source file)
- Uses estimateMinutes (~15m) not explicitDurationMinutes ((30m))
- Preserves exact timestamps in scheduledDateTime
- Flattens interruption hierarchy (no parent_session_id concept for scheduled tasks)

### Future commands (not in v1.0):

- `tt pause` - Pause current task
- `tt resume` - Resume paused task
- `tt interrupt <description>` - Log interruption of current task

## Weekly Report Details

### Context Switch Classification

Context switches include all changes in focus, including interruptions. When you're interrupted and then return to the parent task, this generates two switches.

**Hard switch** (different project + different activity):

```
10:00 coding @projectX +code
11:00 meeting @projectY +meeting
```

**Medium switch** (same project, different activity):

```
10:00 coding @projectX +code
11:00 code review @projectX +review
```

**Soft switch** (same project + same activity):

```
10:00 fix bug #123 @projectX +code
11:00 fix bug #456 @projectX +code
```

**Interruptions count as switches**:

```
10:00 deep work @projectX +code
  10:30 quick question @projectX +communication (5m)
# This generates 2 switches: to interruption and back to deep work
```

**Not a switch** (break/lunch):

```
12:00 +lunch
13:00 resume coding @projectX +code
```

### Deep Work Definition

- Session duration ≥ 90 minutes
- No interruptions (parent_session_id IS NULL for all time in window)
- Same project + activity throughout

### Morning Focus

Track time from first work session of day until first context switch (including interruptions). This measures how long you can maintain uninterrupted focus before flow is broken.

## Configuration

**Environment Variables:**

- `TT_DATA_DIR` - Override default data directory (default: `~/.local/share/tt`)
- `EDITOR` or `VISUAL` - Editor for fixing parse errors (default: `vi`)

**Default Paths:**

- Database: `$TT_DATA_DIR/tt.db` or `~/.local/share/tt/tt.db`
- Config: `~/.config/tt/config.yml` (future)

## Testing Strategy

### Unit Tests

- Parser components (tokenizer, grammar, duration)
- Database queries
- Report calculators
- All utility functions

### Integration Tests

- Full log file parsing with various edge cases
- Database insertion and retrieval
- Report generation with sample data

### Test Fixtures

Create example log files in `src/parser/__tests__/fixtures/`:

- `simple.log` - Basic entries
- `interruptions.log` - Nested interruptions
- `errors.log` - Various parse errors
- `warnings.log` - Time gaps, underflows
- `complex.log` - All features combined

## Implementation Order

1. **Phase 1: Parser**
   - Duration parser + tests
   - Tokenizer + tests
   - Grammar parser + tests
   - Test fixtures

2. **Phase 2: Database**
   - Schema setup
   - Connection management
   - Insert/query functions
   - Tests with in-memory DB

3. **Phase 3: CLI - Log Command**
   - Commander.js setup
   - `tt log` implementation
   - $EDITOR integration
   - Error/warning display

4. **Phase 4: Reporting**
   - Basic queries (time by project/tag)
   - Terminal formatter
   - Calculator modules
   - Weekly report assembly

5. **Phase 5: Live Tracking**
   - `tt start` command
   - `tt stop` command
   - State management

## Dependencies

```json
{
  "dependencies": {
    "commander": "^11.1.0",
    "better-sqlite3": "^9.2.2",
    "chalk": "^5.3.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.10.6",
    "typescript": "^5.3.3",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11",
    "ts-jest": "^29.1.1"
  }
}
```

## Code Style Guidelines

- Use strict TypeScript
- Prefer pure functions where possible
- Comprehensive error handling
- Meaningful variable names
- JSDoc comments for public APIs
- Test-driven development
- Unix philosophy: do one thing well

## Success Criteria

v1.0 is complete when:

1. Can parse complex log files without errors
2. $EDITOR integration works for fixing errors
3. Weekly reports show all defined metrics
4. Live tracking (`tt start/stop`) works
5. 80%+ test coverage
6. Comprehensive README with examples
7. Can `npm install -g` and use globally

---

## Additional Notes

- This is explicitly a single-user tool (multi-user is future scope)
- Database is SQLite for simplicity and portability
- All duration calculations should handle explicit_duration_minutes override
- Interruptions can nest arbitrarily deep
- Parser should be lenient with whitespace but strict with syntax
- Report formatting should be clean and readable in terminal
- Consider using chalk for color-coding in terminal output
