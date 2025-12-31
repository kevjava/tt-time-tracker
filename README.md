# TT Time Tracker

A Unix-philosophy CLI time tracker with low-friction retroactive logging and comprehensive reporting.

## Features

- 📝 **Retroactive Logging** - Log your time using a simple text notation, edit in your favorite editor
- ⚡ **Live Tracking** - Start/stop tasks in real-time with interruption support
- ⏰ **Retroactive Commands** - Use `--at` flag to backfill forgotten context switches with overlap prevention
- 📊 **Rich Analytics** - Context switching, deep work sessions, efficiency metrics, and more
- 🎨 **Multiple Formats** - Terminal, JSON, CSV, and log format output
- 🔍 **Smart Filtering** - Filter reports by project, tags, date ranges, and state
- 🔄 **Round-trip Export** - Export sessions in log format and re-import seamlessly
- 💾 **SQLite Storage** - Portable, reliable local database
- ✏️ **Session Management** - Edit, delete, and manage tracked sessions

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Log File Notation](#log-file-notation)
- [Commands](#commands)
  - [`tt log`](#tt-log-file)
  - [`tt start`](#tt-start-description)
  - [`tt next`](#tt-next-description)
  - [`tt stop`](#tt-stop)
  - [`tt interrupt`](#tt-interrupt-description)
  - [`tt resume`](#tt-resume)
  - [`tt pause`](#tt-pause)
  - [`tt abandon`](#tt-abandon)
  - [`tt report`](#tt-report)
  - [`tt list`](#tt-list)
  - [`tt delete`](#tt-delete-session-ids)
  - [`tt edit`](#tt-edit-session-id-log-notation)
  - [`tt config`](#tt-config)
- [Report Sections](#report-sections)
- [Configuration](#configuration)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

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

### Shell Completions (Optional)

Enable tab completion for commands, flags, and dynamic suggestions (recent projects/tags):

#### Bash

```bash
# Copy the completion script
sudo cp completions/tt.bash /etc/bash_completion.d/tt

# Or source it in your ~/.bashrc
echo 'source /path/to/tt-time-tracker/completions/tt.bash' >> ~/.bashrc
source ~/.bashrc
```

#### Zsh

```bash
# Copy to your fpath (adjust path as needed)
sudo cp completions/_tt /usr/local/share/zsh/site-functions/_tt

# Or add to your ~/.zshrc
fpath=(/path/to/tt-time-tracker/completions $fpath)
compinit
```

#### Fish

```bash
# Copy to fish completions directory
cp completions/tt.fish ~/.config/fish/completions/

# Reload completions
fish_update_completions
```

**Features:**
- Command and flag completion
- Dynamic project suggestions from recent sessions
- Dynamic tag suggestions from recent sessions
- Week specs (`current`, `last`, ISO weeks)
- Fuzzy date completions (`yesterday`, `monday`, etc.)
- Common duration suggestions (`15m`, `1h`, `2h`)

### Configuration (Optional)

Customize TT's behavior with a config file at `~/.config/tt/config.json`:

```bash
# View current configuration
tt config

# Set a config value
tt config set reportFormat json
tt config set listFormat log
tt config set weekStartDay sunday

# Get a specific value
tt config get reportFormat

# Edit config file directly
tt config edit

# Show config file location
tt config path
```

**Available Settings:**

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| `weekStartDay` | `monday`, `sunday` | `monday` | Week start day for `--week current` |
| `reportFormat` | `terminal`, `json`, `csv` | `terminal` | Default output format for `tt report` |
| `listFormat` | `table`, `log` | `table` | Default output format for `tt list` |
| `timeFormat` | `24h`, `12h` | `24h` | Time display format |
| `editor` | Any editor command | Uses `$EDITOR` | Editor for `tt config edit` and fixing parse errors |

**Note:** Command-line flags always override config settings.

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

Forgot to start tracking? Backfill with `--at`:

```bash
tt start "Code review" --at "-30m" -p myApp -t review
tt stop --at "-5m"
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
- Use explicit duration syntax `(30m)` to specify how long the interruption lasted
- Parent task resumes when interruption ends
- Note: When exporting in log format, interruptions automatically include explicit durations

**Resume Markers:**

- `@prev` - Resume most recent task
- `@5` - Resume task number 5

**State Markers:**

- `@end` - Mark task as completed
  - Sets the end time for the previous top-level task
  - Only use for non-indented (top-level) tasks
  - Interruptions use explicit durations instead (e.g., `(30m)`)
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

Start tracking a task. Supports both plain descriptions and log notation syntax.

**Options:**

- `-p, --project <project>` - Project name (overrides log notation)
- `-t, --tags <tags>` - Comma-separated tags (overrides log notation)
- `-e, --estimate <duration>` - Estimated duration (overrides log notation, e.g., 2h, 30m)
- `--at <time>` - Start time for retroactive tracking (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Log Notation Support:**

You can use log notation syntax directly with the `start` command for quick task creation with all metadata inline:

```bash
# With timestamp (sets start time to specified time)
tt start 09:30 implement feature @myApp +code ~2h

# Without timestamp (uses current time)
tt start implement feature @myApp +code +urgent ~1h30m

# Command-line options override log notation values
tt start 10:00 fix bug @projectA +bugfix -p projectB -t critical
# Result: Uses projectB (overrides projectA) and critical tag (overrides bugfix)
```

**Retroactive Tracking:**

Use the `--at` flag to log tasks that you forgot to start. The time can be specified in three formats:
- **Time-only**: `15:51` (assumes today, or yesterday if that would be in the future)
- **Full datetime**: `2025-12-29 15:51`
- **Relative**: `-30m`, `-2h`, `-1h30m` (relative to current time)

The system prevents overlaps - you'll get an error if the time conflicts with an existing session.

**Examples:**

```bash
# Plain description with options
tt start "implement login" -p myApp -t code,auth -e 1h30m

# Log notation with inline metadata
tt start 14:30 code review @myProject +review ~30m

# Log notation with just project and tags
tt start write tests @myApp +testing +urgent

# Mixed: log notation with option override
tt start 09:00 morning standup @teamA +meeting -p teamB

# Retroactive tracking - started 30 minutes ago
tt start "Forgot to start this" --at "-30m" -p myApp

# Retroactive tracking - started at specific time today
tt start "Morning standup" --at "09:00" -p team -t meeting

# Retroactive tracking - started at specific datetime
tt start "Yesterday's work" --at "2025-12-28 14:00" -p myApp
```

### `tt next <description>`

Stop the current task (if any) and immediately start tracking a new task. This is a convenience command that combines `tt stop` and `tt start` in a single operation, making it easy to switch between tasks without manually stopping the previous one.

**Options:**

- `-p, --project <project>` - Project name (overrides log notation)
- `-t, --tags <tags>` - Comma-separated tags (overrides log notation)
- `-e, --estimate <duration>` - Estimated duration (overrides log notation, e.g., 2h, 30m)
- `--at <time>` - Time for the task switch (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Log Notation Support:**

Like the `start` command, `next` supports log notation syntax directly:

```bash
# With timestamp (stops previous task and starts new one at specified time)
tt next 10:30 code review @myApp +review ~30m

# Without timestamp (stops now and starts new task immediately)
tt next implement feature @myApp +code +urgent ~1h30m

# Command-line options override log notation values
tt next 11:00 fix bug @projectA +bugfix -p projectB -t critical
# Result: Uses projectB and critical tag (overrides inline notation)
```

**Behavior:**

- If a task is currently active, it will be stopped (with the current time or `--at` time)
- If no task is active, it simply starts the new task (no error)
- The new task starts immediately after the previous task stops
- Perfect for tracking continuous work with frequent context switches

**Retroactive Tracking:**

Use the `--at` flag to log task switches that happened in the past:

```bash
# You switched tasks 15 minutes ago but forgot to log it
tt next "Different task" --at "-15m" -p myApp

# Specific time today
tt next "Afternoon meeting" --at "14:00" -t meeting
```

**Examples:**

```bash
# Simple task switch
tt next "code review" -p myApp -t review

# Using log notation
tt next 14:30 standup meeting @team +meeting ~15m

# Retroactive task switch - happened 20 minutes ago
tt next "Bug fix" --at "-20m" -t urgent -p backend

# Mixed notation with option override
tt next implement auth @projectA +code -p projectB

# When no task is active (behaves like tt start)
tt next "First task of the day" -p myApp -t planning
```

**Comparison to Other Commands:**

```bash
# These two sequences are equivalent:
tt stop
tt start "new task" @project +tag

# Is the same as:
tt next "new task" @project +tag
```

### `tt stop`

Stop current active task.

**Options:**

- `-r, --remark <remark>` - Add remark to task
- `--at <time>` - Stop time for retroactive tracking (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Examples:**

```bash
# Stop now with a remark
tt stop -r "completed ahead of schedule"

# Retroactive stop - you forgot to stop 10 minutes ago
tt stop --at "-10m"

# Stop at specific time today
tt stop --at "15:51" -r "Completed early"

# Stop at specific datetime
tt stop --at "2025-12-29 17:30" -r "End of day"
```

### `tt interrupt <description>`

Interrupt the current task with a new task. The current task is paused and a new task starts as a child session. Supports log notation syntax.

**Options:**

- `-p, --project <project>` - Project name (overrides log notation)
- `-t, --tags <tags>` - Comma-separated tags (overrides log notation)
- `-e, --estimate <duration>` - Estimated duration (overrides log notation, e.g., 2h, 30m)
- `--at <time>` - Interrupt time for retroactive tracking (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Log Notation Support:**

Like the `start` command, `interrupt` supports log notation for quick task creation:

```bash
# With timestamp
tt interrupt 10:30 Quick bug fix @hotfix +urgent ~15m

# Without timestamp (uses current time)
tt interrupt Code review needed @myApp +review

# Command-line options override
tt interrupt 11:00 Meeting @projectA -p projectB
```

**Examples:**

```bash
# Simple interruption
tt interrupt "urgent customer call"

# With metadata using flags
tt interrupt "fix production bug" -p backend -t urgent,bugfix -e 30m

# Using log notation
tt interrupt 14:00 Standup meeting @team +meeting ~15m

# Retroactive interruption - happened 15 minutes ago
tt interrupt "Quick bug fix" --at "-15m" -t urgent

# Retroactive interruption at specific time
tt interrupt "Customer call" --at "10:30" -p support
```

### `tt resume`

Complete the current interruption and resume the parent task.

**Options:**

- `-r, --remark <remark>` - Add remark to the interruption being completed
- `--at <time>` - Resume time for retroactive tracking (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Examples:**

```bash
# Resume now with a remark
tt resume -r "issue resolved"

# Retroactive resume - you finished the interruption 5 minutes ago
tt resume --at "-5m"

# Resume at specific time
tt resume --at "10:51" -r "Back to main task"
```

### `tt pause`

Pause the current active task without starting an interruption. This is useful when you need to step away but aren't starting a new task (e.g., lunch break, end of day).

**Options:**

- `--reason <reason>` - Reason for pausing the task
- `--at <time>` - Pause time for retroactive tracking (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Examples:**

```bash
# Pause now
tt pause

# Pause with a reason
tt pause --reason "Going to lunch"

# Retroactive pause - you paused 20 minutes ago
tt pause --at "-20m" --reason "End of day"

# Pause at specific time
tt pause --at "12:00" --reason "Lunch break"
```

**Note:** To resume work on a paused task, use `tt start` with a new or similar description.

### `tt abandon`

Abandon the current active task. Use this when you need to give up on a task without completing it (e.g., blocked, no longer needed, context switch).

**Options:**

- `--reason <reason>` - Reason for abandoning the task
- `--at <time>` - Abandon time for retroactive tracking (e.g., `15:51`, `2025-12-29 15:51`, `-30m`)

**Examples:**

```bash
# Abandon now
tt abandon

# Abandon with a reason
tt abandon --reason "Blocked by external dependency"

# Retroactive abandon - realized you stopped working 30 minutes ago
tt abandon --at "-30m" --reason "Deprioritized"

# Abandon at specific time
tt abandon --at "14:30" --reason "No longer needed"
```

### `tt status`

Show active timers and today's summary. This is the default command when you run `tt` with no arguments.

**Features:**

- **Active Sessions** - Shows all currently active tasks with elapsed time
- **Interruption Hierarchy** - Displays parent-child relationships for interrupted tasks
- **Time Remaining** - Shows remaining time when estimates are set
- **Over-Estimate Warning** - Highlights tasks that have exceeded their estimate (⚠)
- **Today's Summary** - Daily productivity metrics including:
  - Total time tracked today
  - Interruption count
  - Project breakdown (sorted by time)
  - Deep work metric (longest uninterrupted session)
  - Warnings for excessive interruptions (>10)

**Examples:**

```bash
# Show current status
tt status

# Or just run tt with no arguments
tt
```

**Example Output:**

```
Active Timers:

▶ Feature implementation (1h 15m)
  Project: myApp
  Tags: dev, feature
  Estimate: 2h, 45m remaining

⏸ Morning standup (30m)
  Project: team
  Tags: meeting
  Interrupted by:
    ▶ Quick bug fix (10m)
      Project: myApp
      Tags: bugfix, urgent

Today's Summary:
  Total time: 4h 30m
  Interruptions: 3 interruptions
  Projects:
    myApp: 3h 15m
    team: 1h 15m
  Deep work: 2h 30m (longest session)
```

### `tt report`

Generate time report for a date range.

**Options:**

- `--week <week>` - Week specification (default: current)
  - `current` - Current week
  - `last` - Last week
  - `2024-W52` - Specific ISO week
- `--from <date>` - Start date (supports ISO format and natural language)
- `--to <date>` - End date (supports ISO format and natural language)
- `--project <project>` - Filter by project
- `--tag <tags>` - Filter by tags (comma-separated)
- `--format <format>` - Output format: `terminal`, `json`, `csv`
- `--compare` - Compare with previous period and show trend indicators

**Comparison Feature:**

The `--compare` flag enables period-over-period comparison with trend indicators (↑↓) for key metrics:
- **Total Time** - Shows increase/decrease from previous period
- **Context Switches** - Track switching behavior trends
- **Deep Work** - Monitor focus session changes

The previous period is automatically calculated based on your current time range:
- Current week → compares to last week
- Last 7 days → compares to previous 7 days
- Custom range → compares to same duration immediately before

**Date Formats:**

The `--from` and `--to` options support both ISO dates and natural language:
- **ISO format**: `YYYY-MM-DD` (e.g., `2024-12-25`)
- **Natural language**: `yesterday`, `today`, `tomorrow`, `monday`, `last week`, `3 days ago`, `2 months ago`, etc.

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

# Custom date range (ISO format)
tt report --from 2024-12-01 --to 2024-12-31

# Natural language dates
tt report --from monday --to yesterday
tt report --from "last week" --to today
tt report --from "3 days ago"

# From a specific date to now
tt report --from 2024-12-20

# Filter by project
tt report --project myApp

# Multiple filters with custom range
tt report --from yesterday --to today --project myApp --tag code

# Compare with previous period
tt report --compare
tt report --week last --compare
tt report --from "last monday" --to "last friday" --compare

# Export formats
tt report --format json > report.json
tt report --format csv > report.csv
```

**Example Comparison Output:**

```
📊 SUMMARY
────────────────────────────────────────────────────────────────────────────────
  Total Time: 35h ↑ +5h

🔀 CONTEXT SWITCHING
────────────────────────────────────────────────────────────────────────────────
  Total Switches: 45 ↓ -5
    Hard Switches: 12
    Medium Switches: 20
    Soft Switches: 13

🧠 DEEP WORK SESSIONS
────────────────────────────────────────────────────────────────────────────────
  Total Deep Work: 18h ↑ +3h
  Sessions: 8 ↑ +2
```

### `tt list`

List individual sessions in tabular or log format.

**Options:**

- `--week <week>` - Week specification (default: current)
  - `current` - Current week
  - `last` - Last week
  - `2024-W52` - Specific ISO week
- `--from <date>` - Start date (supports ISO format and natural language)
- `--to <date>` - End date (supports ISO format and natural language)
- `--project <project>` - Filter by project
- `--tag <tags>` - Filter by tags (comma-separated)
- `--state <state>` - Filter by state: `working`, `paused`, `completed`, `abandoned`
- `--format <format>` - Output format: `table` (default), `log`

**Date Formats:**

Like the `report` command, `--from` and `--to` support both ISO dates and natural language (e.g., `yesterday`, `monday`, `last week`).

**Output Formats:**

- `table` - Columnar display with session details (default)
- `log` - Log notation format compatible with `tt log` command (enables round-trip export/import)

**Examples:**

```bash
# List current week sessions
tt list

# List with filters
tt list --project myApp --tag code

# List specific date range (ISO format)
tt list --from 2024-12-20 --to 2024-12-26

# List with natural language dates
tt list --from monday --to friday
tt list --from "last week"
tt list --from yesterday --to today

# Export sessions in log format for backup
tt list --format log > backup.log

# Round-trip export and import
tt list --from "last month" --format log > backup.log
tt log backup.log

# List only paused tasks
tt list --state paused
```

### `tt delete [session-ids...]`

Delete one or more sessions by ID or by filter criteria.

**Arguments:**

- `[session-ids...]` - One or more session IDs to delete (optional if using filters)

**Options:**

- `--from <date>` - Delete sessions from this date (supports ISO format and natural language)
- `--to <date>` - Delete sessions up to this date (supports ISO format and natural language)
- `-p, --project <project>` - Delete sessions for specific project
- `-t, --tag <tags>` - Delete sessions with specific tag(s) (comma-separated)
- `-s, --state <state>` - Delete sessions with specific state: `working`, `paused`, `completed`, `abandoned`
- `--dry-run` - Show what would be deleted without actually deleting
- `-y, --yes` - Skip confirmation prompt

**Behavior:**

- Shows a summary of sessions to be deleted before confirmation
- Displays total time, project breakdown, and child session count
- Automatically deletes child sessions (interruptions) when parent is deleted
- Supports combining session IDs with filters (union of both criteria)
- Requires confirmation unless `--yes` flag is used
- All deletions are performed in a single transaction (all or nothing)

**Examples:**

```bash
# Delete a single session
tt delete 42

# Delete multiple sessions by ID
tt delete 10 11 14 18 20

# Delete with confirmation skip
tt delete 5 --yes

# Delete all sessions from a date range
tt delete --from monday --to wednesday

# Delete all sessions for a specific project
tt delete --project oldProject

# Delete all meetings this week
tt delete --tag meeting --from "this week"

# Delete paused sessions
tt delete --state paused

# Combine filters
tt delete --project testProject --from "last week" --to "last friday"

# Preview what would be deleted (recommended before bulk deletions)
tt delete --from monday --to tuesday --dry-run

# Combine session IDs with filters (deletes union of both)
tt delete 5 6 --project myApp

# Delete sessions from a specific day
tt delete --from yesterday --to yesterday

# Delete all sessions from natural language date
tt delete --from "3 days ago" --to yesterday
```

**Tips:**

- Always use `--dry-run` first when using filters to preview deletions
- Date ranges are inclusive of both start and end dates
- Child sessions are automatically included in the deletion summary
- The command shows total time and project breakdown before confirmation

### `tt edit <session-id> [log-notation...]`

Edit a session by ID using command-line flags or log notation.

**Arguments:**

- `<session-id>` - ID of the session to edit (required)
- `[log-notation...]` - Optional log notation for updates (e.g., `~20m`, `@project`, `+tag1 +tag2`)

**Options:**

- `-d, --description <description>` - Update description
- `-p, --project <project>` - Update project
- `-t, --tags <tags>` - Update tags (comma-separated)
- `-e, --estimate <duration>` - Update estimate (e.g., `2h`, `30m`)
- `-r, --remark <remark>` - Update remark
- `--start-time <time>` - Update start time (ISO 8601 format)
- `--end-time <time>` - Update end time (ISO 8601 format, empty string to clear)
- `--state <state>` - Update state (`working`, `paused`, `completed`, `abandoned`)

**Log Notation Support:**

Like the `start` command, `edit` supports log notation for quick updates. Command-line flags override log notation values when both are provided.

**Behavior:**

- Only specified fields are updated; other fields remain unchanged
- Empty description in log notation (e.g., `@project ~30m`) preserves existing description
- Supports timestamps to update start time (preserves date, updates time only)
- Supports explicit duration like `(45m)` to set end time relative to start time
- Command-line flags take precedence over log notation

**Examples:**

```bash
# Edit using command-line flags
tt edit 42 -d "Updated description" -p newProject

# Update estimate using log notation
tt edit 42 ~45m

# Update project and tags using log notation
tt edit 42 @newProject +tag1 +tag2

# Update description with log notation
tt edit 42 New task description

# Combine description with metadata
tt edit 42 Refactored auth module @backend +refactor ~2h

# Update start time using timestamp notation
tt edit 42 10:30

# Set end time using explicit duration
tt edit 42 "(45m)"

# Update start time and set end time with explicit duration
tt edit 42 "10:00 (30m)"

# Update multiple fields with log notation
tt edit 42 "Fixed critical bug @backend +bugfix +urgent ~1h"

# Command-line flags override log notation
tt edit 42 @projectA +tagA -p projectB -t tagB
# Result: Uses projectB and tagB (flags override notation)

# Update only metadata, preserve description
tt edit 42 @newProject ~2h
# Description remains unchanged

# Clear end time
tt edit 42 --end-time ""

# Update state
tt edit 42 --state abandoned -r "Deprioritized"
```

**Tips:**

- Use `tt list` to find session IDs
- Preview current session details before editing - they're displayed when you run the command
- Changes are shown after applying updates
- Timestamps in log notation preserve the session's date, only updating the time

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

Tracks all context switches including interruptions. Each interruption generates two switches: switching away from the parent task and returning to it.

- Total switches with severity breakdown:
  - **Hard**: Different project + different activity
  - **Medium**: Same project, different activity
  - **Soft**: Same project + activity
- Most fragmented days
- Breaks and lunch don't count as switches

### 🧠 Deep Work Sessions

Sessions ≥90 minutes uninterrupted, showing:

- Total deep work time
- Number of sessions
- Individual session details

### 🌅 Morning Focus

Time from first task to first context switch (including interruptions) each day. Measures how long you can maintain focus before flow is broken.

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

2. **Throughout the day**: Switch between tasks seamlessly

   ```bash
   # Quick task switching
   tt next "code review" -p myProject -t review

   # Or if you want to add a remark to the previous task
   tt stop -r "feature complete"
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

### Retroactive Tracking with `--at`

When you forget to track context switches in real-time, use the `--at` flag to backfill:

```bash
# Realized you forgot to start tracking an hour ago
tt start "Code review" --at "-1h" -p myApp -t review

# Stop it 30 minutes ago
tt stop --at "-30m"

# Or use specific times
tt start "Morning standup" --at "09:00" -t meeting
tt stop --at "09:15"

# Handle interruptions retroactively
tt start "Feature work" --at "10:00" -p myApp
tt interrupt "Bug fix" --at "11:30" -t urgent
tt resume --at "12:00" -r "Fixed the issue"
tt stop --at "13:00"
```

**Overlap Prevention:**
The `--at` flag validates that times don't conflict with existing sessions. If you get an overlap error, you'll need to stop or adjust the conflicting session first.

**Time Formats:**
- **Relative**: `-30m`, `-2h`, `-1h30m` (most convenient for recent tasks)
- **Time-only**: `15:51` (assumes today, or yesterday if in future)
- **Full datetime**: `2025-12-29 15:51` (for older corrections)

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
