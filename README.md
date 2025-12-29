# TT Time Tracker

A Unix-philosophy CLI time tracker with low-friction retroactive logging and comprehensive reporting.

## Features

- 📝 **Retroactive Logging** - Log your time using a simple text notation, edit in your favorite editor
- ⚡ **Live Tracking** - Start/stop tasks in real-time with interruption support
- 📊 **Rich Analytics** - Context switching, deep work sessions, efficiency metrics, and more
- 🎨 **Multiple Formats** - Terminal, JSON, CSV, and log format output
- 🔍 **Smart Filtering** - Filter reports by project, tags, date ranges, and state
- 🔄 **Round-trip Export** - Export sessions in log format and re-import seamlessly
- 💾 **SQLite Storage** - Portable, reliable local database
- ✏️ **Session Management** - Edit, delete, and manage tracked sessions

## Installation

### From Source

```bash
git clone https://github.com/yourusername/tt-time-tracker.git
cd tt-time-tracker
npm install
npm run build
npm install -g .
```

### Requirements

- Node.js >= 18
- SQLite3 (included via better-sqlite3)

## Quick Start

### 1. Log Your Time

Create a log file with your time entries:

```text
# Monday, Dec 23, 2024
09:00 morning standup @projectX +meeting
09:15 fix unit tests @projectX +code ~2h # struggling with mock setup
  10:37 walked dog +downtime (20m)
12:10 +lunch
12:48 @prev # back to fixing tests
15:30 deploy to staging @projectX +deploy +ops
17:00 @end
```

Import it:

```bash
tt log mywork.log
```

### 2. Live Tracking

Start a task:

```bash
tt start "implement authentication" -p myApp -t code,backend -e 2h
```

Stop when done:

```bash
tt stop -r "completed with tests"
```

### 3. Generate Reports

```bash
# Current week report
tt report

# Specific week
tt report --week 2024-W52

# Filter by project
tt report --project myApp

# Export to JSON
tt report --format json > report.json
```

## Log File Notation

### Basic Format

```text
TIMESTAMP DESCRIPTION [@PROJECT] [+TAG...] [~ESTIMATE] [(DURATION)] [# REMARK]
```

### Components

**Timestamps:**

- `09:00` - Time only (inherits current date)
- `09:00:15` - With seconds
- `2024-12-24 09:00` - Explicit date and time

**Projects:**

- `@projectName` - Single project per task

**Tags:**

- `+code +urgent` - Multiple tags allowed
- Common tags: `+meeting`, `+code`, `+review`, `+lunch`

**Estimates:**

- `~2h` - Estimated duration
- `~30m` or `~1h30m`

**Explicit Duration:**

- `(45m)` - Override inferred duration

**Remarks:**

- `# struggling with the setup` - Comment about the task
- Must have space after `#`

**Interruptions:**

- Indent with spaces to mark interruptions
- Parent task resumes when interruption ends

**Resume Markers:**

- `@prev` - Resume most recent task
- `@5` - Resume task number 5

**State Markers:**

- `@end` - Mark task as completed
  - Sets the end time for the previous task
  - Example: `17:30 @end # done for the day`
- `@pause` - Mark task as paused (will resume later)
  - Sets the end time and marks task as 'paused'
  - Example: `11:00 @pause # waiting for design review`
- `@abandon` - Mark task as abandoned (won't finish)
  - Sets the end time and marks task as 'abandoned'
  - Example: `10:30 @abandon # approach won't work`

### Example Log File

```ttlog
# Monday Work Log
09:00 morning standup @projectX +meeting
09:15 implement feature A @projectX +code ~3h
  10:30 quick code review @projectY +review (15m)
  11:00 coffee break +downtime (10m)
12:00 +lunch
13:00 @prev # back to feature A
15:00 deploy to prod @projectX +deploy +ops (30m)
16:00 write documentation @projectX +docs
17:30 @end # done for the day
```

## Commands

### `tt log [file]`

Parse and insert time entries from file or stdin.

**Options:**

- `[file]` - Log file path (reads from stdin if omitted)

**Behavior:**

- Validates syntax and opens errors in `$EDITOR` for fixing
- Calculates end times automatically (next task's start = current task's end)
- Handles interruptions and resume markers
- Displays warnings for time gaps and date changes

**Example:**

```bash
tt log work.log
cat work.log | tt log
```

### `tt start <description>`

Start tracking a task.

**Options:**

- `-p, --project <project>` - Project name
- `-t, --tags <tags>` - Comma-separated tags
- `-e, --estimate <duration>` - Estimated duration (e.g., 2h, 30m)

**Example:**

```bash
tt start "implement login" -p myApp -t code,auth -e 1h30m
```

### `tt stop`

Stop current active task.

**Options:**

- `-r, --remark <remark>` - Add remark to task

**Example:**

```bash
tt stop -r "completed ahead of schedule"
```

### `tt report`

Generate time report for a date range.

**Options:**

- `--week <week>` - Week specification (default: current)
  - `current` - Current week
  - `last` - Last week
  - `2024-W52` - Specific ISO week
- `--from <date>` - Start date (YYYY-MM-DD)
- `--to <date>` - End date (YYYY-MM-DD)
- `--project <project>` - Filter by project
- `--tag <tags>` - Filter by tags (comma-separated)
- `--format <format>` - Output format: `terminal`, `json`, `csv`

**Date Range Behavior:**

- If `--from` and/or `--to` are provided, they take precedence over `--week`
- Using only `--from` reports from that date to now
- Using only `--to` reports from the beginning to that date
- End date includes the entire day (until 23:59:59)

**Examples:**

```bash
# Current week
tt report

# Last week
tt report --week last

# Specific week
tt report --week 2024-W52

# Custom date range
tt report --from 2024-12-01 --to 2024-12-31

# From a specific date to now
tt report --from 2024-12-20

# Filter by project
tt report --project myApp

# Multiple filters with custom range
tt report --from 2024-12-01 --to 2024-12-31 --project myApp --tag code

# Export formats
tt report --format json > report.json
tt report --format csv > report.csv
```

### `tt list`

List individual sessions in tabular or log format.

**Options:**

- `--week <week>` - Week specification (default: current)
  - `current` - Current week
  - `last` - Last week
  - `2024-W52` - Specific ISO week
- `--from <date>` - Start date (YYYY-MM-DD)
- `--to <date>` - End date (YYYY-MM-DD)
- `--project <project>` - Filter by project
- `--tag <tags>` - Filter by tags (comma-separated)
- `--state <state>` - Filter by state: `working`, `paused`, `completed`, `abandoned`
- `--format <format>` - Output format: `table` (default), `log`

**Output Formats:**

- `table` - Columnar display with session details (default)
- `log` - Log notation format compatible with `tt log` command (enables round-trip export/import)

**Examples:**

```bash
# List current week sessions
tt list

# List with filters
tt list --project myApp --tag code

# List specific date range
tt list --from 2024-12-20 --to 2024-12-26

# Export sessions in log format for backup
tt list --format log > backup.log

# Round-trip export and import
tt list --from 2024-12-01 --to 2024-12-31 --format log > december.log
tt log december.log

# List only paused tasks
tt list --state paused
```

## Report Sections

The weekly report includes:

### 📊 Summary

Total time tracked for the week.

### 📁 Time by Project

Breakdown of time spent per project with percentages and progress bars.

### 🏷️ Time by Activity

Breakdown of time spent per tag (top 10) with percentages.

### 🎯 Estimate Accuracy

- Average estimation error
- Total estimated vs actual time
- Worst misses (tasks with largest estimation errors)

### ⚡ Efficiency

- Gross time (total tracked)
- Interruption time
- Net productive time
- Efficiency ratio

### 🔀 Context Switching

- Total switches with severity breakdown:
  - **Hard**: Different project + different activity
  - **Medium**: Same project, different activity
  - **Soft**: Same project + activity
- Most fragmented days

### 🧠 Deep Work Sessions

Sessions ≥90 minutes uninterrupted, showing:

- Total deep work time
- Number of sessions
- Individual session details

### 🌅 Morning Focus

Time from first task to first context switch each day.

### 📈 Outliers

Tasks >2σ from mean duration with remarks.

## Configuration

### Environment Variables

**`TT_DATA_DIR`**
Override default data directory.

```bash
export TT_DATA_DIR=~/my-time-data
```

Default: `~/.local/share/tt`

**`EDITOR` or `VISUAL`**
Editor for fixing parse errors.

```bash
export EDITOR=vim
```

Default: `vi`

### File Locations

- **Database**: `$TT_DATA_DIR/tt.db` or `~/.local/share/tt/tt.db`
- **Data directory**: Created automatically on first run

## Tips & Best Practices

### Daily Workflow

1. **Morning**: Start your first task

   ```bash
   tt start "review emails" -t admin
   ```

2. **Throughout the day**: Log interruptions or switch tasks

   ```bash
   tt stop
   tt start "code review" -p myProject -t review
   ```

3. **End of day**: Create a log file for retroactive entries

   ```ttlog
   # Capture forgotten tasks
   14:00 team meeting @myProject +meeting (1h)
   16:00 bug triage @myProject +bugs (30m)
   ```

   ```bash
   tt log daily-additions.log
   ```

4. **Weekly**: Review your report

   ```bash
   tt report --week current
   ```

### Log File Organization

Organize by day or week:

```text
logs/
  2024-W51-monday.log
  2024-W51-tuesday.log
  2024-W51.log
```

### Estimation Tips

- Start with rough estimates (`~1h`, `~30m`)
- Review estimate accuracy in weekly reports
- Adjust future estimates based on patterns

### Tag Conventions

Establish consistent tags:

- **Activity types**: `+code`, `+review`, `+meeting`, `+docs`, `+testing`
- **Priority**: `+urgent`, `+routine`
- **Breaks**: `+lunch`, `+break`, `+downtime`

## Troubleshooting

### Parse Errors

If you get parse errors:

1. The file will open in your `$EDITOR` automatically
2. Fix the errors (check line numbers in error message)
3. Save and exit - the parser will retry
4. Repeat until valid or exit without saving to abort

Common errors:

- Missing space after `#` in remarks
- Invalid duration format (use `2h30m` not `2.5h`)
- Invalid timestamp format

### No Active Session

If `tt stop` says "No active task":

- Check for active sessions: Run a report to see recent activity
- A session may have been stopped already
- Database may be in a different location (check `TT_DATA_DIR`)

### Time Gaps or Warnings

Warnings are informational and won't block insertion:

- **Time went backward**: Crossing midnight, assumes next day
- **Large time gap**: >8 hours between entries

## Examples

### Complex Log File

```ttlog
# Project Work - Dec 23, 2024
2024-12-23 09:00 standup @myApp +meeting
09:15 implement auth @myApp +code ~4h # OAuth integration
  10:30 prod incident @legacy +urgent +ops (45m)
  11:30 lunch break +lunch (30m)
12:15 @prev # back to auth work
  14:00 pair program w/ Alice @myApp +code +pairing (1h30m)
16:00 write tests @myApp +testing ~1h
17:00 code review @myApp +review
17:30 update docs @myApp +docs
```

### Filtering Examples

```bash
# All code work this week
tt report --tag code

# Specific project last week
tt report --week last --project myApp

# Multiple tags
tt report --tag code,testing

# Export for analysis
tt report --format json | jq '.summary.byProject'
```

### Round-trip Export/Import

```bash
# Export December's sessions to a log file
tt list --from 2024-12-01 --to 2024-12-31 --format log > december-backup.log

# Later, re-import the sessions (e.g., to a new database)
tt log december-backup.log

# Export specific project for sharing with team
tt list --project myApp --format log > myapp-time.log

# Export and edit before re-importing
tt list --week last --format log > last-week.log
# Edit last-week.log in your editor to fix/adjust entries
tt log last-week.log
```

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and architecture.

## License

MIT

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/tt-time-tracker/issues)
- Documentation: This README and source code comments
