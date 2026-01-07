# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Task Scheduling System** (`tt schedule`): Queue future tasks with priorities and suggested dates
  - `tt schedule add` - Add tasks with full log notation support including priority (`^N`)
  - `tt schedule list` - View all scheduled tasks in columnar format
  - `tt schedule edit` - Update task metadata (description, project, tags, estimate, priority, date)
  - `tt schedule remove` - Remove tasks from schedule
  - Interactive selection UI when running `tt start`, `tt next`, `tt switch`, or `tt interrupt` without arguments
  - Three stanzas for task organization: Oldest (FIFO), Important (priority ≠ 5), Urgent (today/overdue)
  - Selected tasks automatically removed from schedule and used as templates
- **Priority Notation** (`^N`): Support for priority levels 1-9 in log notation
  - Parser recognizes priority token in log format
  - Priority field (1-9) with 5 as default
  - Used for task prioritization in scheduling
- **Session ID Templates**: Reference existing sessions as templates for new tasks
  - `tt start 42` - Start new task using session 42's metadata (project, tags, estimate)
  - `tt next 42`, `tt switch 42`, `tt interrupt 42` - Similar support in all relevant commands
  - Original session not modified, only used as template
- **Database Schema Updates**:
  - New `scheduled_tasks` table for future task queue
  - New `scheduled_task_tags` table for scheduled task tags
  - Indexes for efficient priority and date-based queries

### Changed
- **start/next/switch/interrupt commands**: Made async to support interactive selection
  - Commands now show interactive menu when called without arguments
  - Display scheduled tasks organized by oldest, important, and urgent
  - Session ID template support (e.g., `tt start 42`)
- **Context switches now include interruptions**: Interruptions are now counted as context switches since they break flow state. Each interruption generates two switches: one when switching to the interruption, and one when returning to the parent task. This provides a more accurate measure of productivity disruption.
- **Morning Focus metric updated**: Now shows time to first interruption rather than ignoring interruptions entirely. This better reflects actual uninterrupted focus time.

## [1.0.0] - 2024-12-24

### Added

#### Parser System
- Duration parser supporting formats like `2h`, `30m`, `1h30m`
- Tokenizer for extracting components from log lines
- Grammar parser with date context handling
- Resume marker support (`@prev`, `@N`)
- Interruption handling via indentation
- Automatic time inference (next task's start = current task's end)
- Editor integration for fixing parse errors
- Comprehensive error messages with line numbers
- Warning system for time gaps and midnight crossings

#### Database Layer
- SQLite-based storage with better-sqlite3
- Sessions table with full metadata support
- Tag system with many-to-many relationships
- Parent-child session relationships for interruptions
- Indexed queries for performance
- Foreign key constraints with CASCADE deletes
- WAL mode for better concurrency

#### CLI Commands
- `tt log [file]` - Parse and import time entries from files or stdin
- `tt start` - Start live tracking with project, tags, and estimates
- `tt stop` - Stop active task with optional remarks
- `tt report` - Generate comprehensive weekly reports

#### Reporting System
- Weekly time summaries by project and tag
- Context switch analysis with severity classification (hard/medium/soft)
- Efficiency metrics (gross/net time, interruption tracking)
- Deep work session detection (≥90min uninterrupted)
- Morning focus metrics (time to first context switch)
- Estimate accuracy tracking with error analysis
- Statistical outlier detection (>2σ from mean)
- Multiple output formats: terminal, JSON, CSV

#### Report Features
- Week filtering: current, last, or ISO week (2024-W52)
- Project filtering
- Tag filtering (comma-separated)
- Beautiful colored terminal output with progress bars
- JSON export for programmatic analysis
- CSV export for Excel/spreadsheet import

#### Configuration
- Environment variable support (`TT_DATA_DIR`, `EDITOR`)
- Automatic data directory creation
- Default paths following Unix conventions

### Features by Command

**tt log**
- File and stdin input support
- Parse error loop with editor integration
- Automatic end time calculation
- Interruption and resume marker handling
- Summary of logged sessions and interruptions

**tt start**
- Project and tag support
- Estimate duration tracking
- Active session checking
- Colored confirmation output

**tt stop**
- Automatic duration calculation
- Optional remark attachment
- Session state management
- Duration display

**tt report**
- 9 comprehensive report sections
- Filtering by week, project, tags
- Terminal, JSON, and CSV formats
- Context switch severity analysis
- Deep work identification
- Estimate accuracy metrics
- Statistical outlier detection

### Technical Details

#### Testing
- 102 passing unit and integration tests
- Test fixtures for parser validation
- In-memory database testing
- Comprehensive error case coverage

#### Architecture
- TypeScript with strict mode
- Modular design following Unix philosophy
- Pure functions where applicable
- Comprehensive type safety
- Clean separation of concerns

#### Dependencies
- Commander.js for CLI framework
- better-sqlite3 for database
- Chalk for terminal colors
- date-fns for date manipulation
- Jest for testing

### Documentation
- Comprehensive README with examples
- Development guide with architecture details
- Inline JSDoc comments
- Type definitions as documentation

## [Unreleased]

### Planned Features
- Web dashboard for reports
- PDF export format
- Pomodoro timer integration
- Team/multi-user support
- Cloud sync capabilities
- Mobile app
- Git integration
- Calendar sync
- Smart suggestions based on patterns

[1.0.0]: https://github.com/yourusername/tt-time-tracker/releases/tag/v1.0.0
