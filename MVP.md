# TT Time Tracker - MVP Roadmap

**Status**: In Progress - Actively dogfooding
**Last Updated**: 2025-12-29

## Vision

A Unix-philosophy CLI time tracker with low-friction retroactive logging, comprehensive reporting, and excellent UX. The tool should be pleasant to use daily and provide actionable insights.

## Current State

### ✅ Completed Features

- **Core Commands**: start, stop, interrupt, resume, edit, delete, status
- **Logging System**: Parse and import from log notation files
- **Reporting**: Weekly reports with analytics (terminal, JSON, CSV)
- **List Command**: View sessions in table or log format
- **Log Notation**: Quick task entry with inline metadata (timestamps, projects, tags, estimates)
- **Fuzzy Dates**: Natural language date parsing ("yesterday", "last week", "3 days ago")
- **Interruptions**: Parent-child session tracking with pause/resume
- **Round-trip Export**: Export sessions as log files and re-import
- **Error Visibility**: Parse errors shown as comments in editor
- **Database**: SQLite with proper indexes and relationships

### ✅ Test Coverage

- **Total Tests**: 454 passing across 21 test suites
- **Covered Commands**: All core commands fully tested
  - start, stop, resume, interrupt, pause, abandon (18-23 tests each)
  - edit, delete (21 tests each)
  - status (23 tests)
  - report, list (20-21 tests each)
  - log (14 tests)
- **Coverage**: 80%+ ✅ (MVP target met)

### 🎯 Remaining Gaps for MVP

1. ✅ **Test Coverage**: Complete - all commands have comprehensive tests
2. ✅ **Shell Completion**: Complete - Bash, Zsh, Fish completions available
3. ✅ **Configuration**: Complete - Config file support with display preferences
4. **Status Command**: Basic - could show more context (Phase 3)
5. **Trends**: No week-over-week comparisons or pattern analysis (Phase 3)

---

## MVP Roadmap

### Phase 0: Priority quality-of-life fixes

#### ✅ 0.1: Bulk deletion (COMPLETED 2025-12-28)

**Status**: Complete and tested

The `tt delete` command now supports:

- **Multiple session IDs**: `tt delete 10 11 14 18 20`
- **Date range deletion**: `tt delete --from sunday --to tuesday`
- **Filter-based deletion**: Match all `list` command filters
  - `--project <name>` - Delete sessions for a project
  - `--tag <tags>` - Delete sessions with specific tags
  - `--state <state>` - Delete sessions by state
- **Union of IDs and filters**: `tt delete 5 6 --project myApp`
- **Dry-run mode**: `--dry-run` to preview what would be deleted
- **Enhanced summary**: Shows total time, project breakdown, child sessions
- **Confirmation prompt**: Can be skipped with `--yes` or `--force`
- **Transaction safety**: All deletions in a single transaction (all-or-nothing)

**Test Coverage**: 21 tests covering all functionality

**Documentation**: Updated README.md and EXAMPLES.md with comprehensive examples

#### ✅ 0.2: Edit flexibility (COMPLETED 2025-12-28)

**Status**: Complete and tested

The `tt edit` command now supports log notation for quick updates:

- **Log notation syntax**: Same familiar syntax as `start` and `log` commands
  - `tt edit 10 ~20m` - Update estimate
  - `tt edit 10 @newProject` - Change project
  - `tt edit 10 +tag1 +tag2` - Update tags
  - `tt edit 10 New description` - Change description
  - `tt edit 10 New description @project +tags ~1h` - Update multiple fields
- **Timestamp support**: Update start times with timestamps
  - `tt edit 10 10:30` - Set start time (preserves date)
  - `tt edit 10 10:00 (30m)` - Set start time and end time via explicit duration
  - `tt edit 10 "(45m)"` - Set end time based on current start time
- **Flag override**: Command-line flags take precedence over log notation
  - `tt edit 10 @projectA -p projectB` uses `projectB`
- **Smart parsing**: Metadata-only updates preserve existing description
  - `tt edit 10 @project ~30m` keeps original description
- **All existing flags**: Still supports traditional flag-based editing
  - `-d, --description`, `-p, --project`, `-t, --tags`, `-e, --estimate`
  - `-r, --remark`, `--start-time`, `--end-time`, `--state`

**Implementation Details**:

- Modified `editCommand` to accept optional log notation arguments
- Added `LogParser` integration with smart placeholder insertion
- Implemented explicit duration handling for end time calculation
- Preserved date when updating time portion of timestamps
- Added `startTime` support to `database.updateSession()` method

**Test Coverage**: 21 comprehensive tests covering:

- Flag-based editing (description, project, tags, estimate)
- Log notation editing (all metadata types)
- Timestamp updates (start time, explicit duration)
- Flag override behavior
- Field preservation (metadata-only updates)
- Error handling (invalid inputs, missing session)

**Documentation**:

- README.md: Complete command reference with 15+ examples
- EXAMPLES.md: Detailed usage scenarios across 6 categories
  - Quick fixes, flag usage, time adjustments
  - Metadata-only updates, flag overrides
  - Workflows and batch corrections

**Notes**:

- Maintains consistency with `start` command log notation patterns
- Enables rapid corrections without switching to flag-based syntax
- Supports both workflows: quick log notation OR detailed flags

### Phase 1: Foundation & Reliability 🔧

**Goal**: Make the core stable and well-tested
**Time Estimate**: 2-3 sessions

#### ✅ 1.1 Test Coverage for Core Commands (COMPLETED 2025-12-29)

**Priority**: HIGH - Must have before adding more features

**Status**: Complete - All commands now have comprehensive test coverage

Comprehensive test suites added for:

1. ✅ **stop / resume** - COMPLETE (18 tests each, 36 total)
   - **stop**: 18 tests covering basic functionality, --at flag, error handling, console output, edge cases
   - **resume**: 18 tests covering basic functionality, --at flag, error handling, console output, state transitions
   - Stop active session with/without remark
   - Resume from interruption with/without remark
   - Nested interruptions (resume from level 2 to level 1)
   - Retroactive tracking with --at flag
   - Error cases (no active session, no parent to resume, invalid times)

2. ✅ **status** - COMPLETE (23 tests)
   - Show active/paused/abandoned sessions
   - Display interruption hierarchy (single and nested)
   - Multiple active sessions and edge cases
   - Metadata display (project, tags, estimate)
   - Elapsed time formatting
   - Console output variations (with/without isDefault flag)

3. ✅ **edit / delete** - COMPLETE (21 tests each, 42 total)
   - **edit**: 21 tests
     - Flag-based editing (all fields)
     - Log notation editing (description, project, tags, estimate, timestamps)
     - Timestamp updates with explicit duration
     - Flag override behavior
     - Field preservation logic
     - Invalid inputs and error handling
   - **delete**: 21 tests
     - Single and bulk deletion
     - Filter-based deletion
     - Dry-run mode
     - Cascade deletion with children
     - Transaction safety
     - Invalid inputs and error handling

4. ✅ **report** - COMPLETE (21 tests)
   - Different time ranges (week specs, custom dates, fuzzy dates)
   - Filters (project, tag, state)
   - Output formats (terminal, json, csv)
   - Edge cases (no sessions, single session, complex hierarchies)
   - Context switches, efficiency, focus blocks
   - Estimate accuracy calculations

5. ✅ **list** - COMPLETE (20 tests)
   - Time range filtering (week specs, custom from/to dates)
   - State filtering
   - Output formats (table, log)
   - Edge cases (no sessions, empty ranges)
   - Filter combinations (project, tag, state)

6. ✅ **log** - COMPLETE (14 tests)
   - Parse valid files (simple, interruptions, complex)
   - Handle parse errors gracefully
   - Display warnings for suspicious patterns
   - Overwrite mode
   - Interruption hierarchies and parent-child relationships
   - Metadata preservation (project, tags, estimates)

**Success Criteria**: ✅ ALL MET

- ✅ 80%+ test coverage - **454 tests passing across 21 test suites**
- ✅ All commands have happy path + error case tests
- ✅ Confidence to refactor without breaking things

---

### ✅ Phase 2: Discoverability & Ease of Use ⚡ (COMPLETED 2025-12-29)

**Goal**: Reduce friction in daily use
**Time Estimate**: 1-2 sessions

#### ✅ 2.1 Shell Completion Scripts (COMPLETED 2025-12-28)

**Priority**: HIGH - Daily UX improvement
**Status**: Complete

Implement tab completion for:

**Commands**:

```bash
tt st<TAB>     → tt start
tt rep<TAB>    → tt report
tt int<TAB>    → tt interrupt
```

**Options**:

```bash
tt report --f<TAB>        → tt report --from
tt start -p <TAB>         → [list of recent projects]
tt start -t <TAB>         → [list of recent tags]
```

**Dynamic Suggestions** (from database):

- Projects: Show recent projects when completing `-p` or `--project`
- Tags: Show recent tags when completing `-t` or `--tags`
- Week specs: `current`, `last`, `2024-W51`, etc.
- Date examples: `yesterday`, `monday`, `last week`

**Files to Create**:

- `completions/tt.bash`
- `completions/tt.zsh`
- `completions/tt.fish`
- Installation instructions in README

**Implementation Notes**:

- Use commander.js's built-in completion support
- Query database for recent projects/tags (last 30 days)
- Include installation instructions for each shell

---

#### ✅ 2.2 Configuration File Support (COMPLETED 2025-12-29)

**Priority**: MEDIUM - Reduces repetitive typing
**Status**: Complete - Config system fully implemented

Users can now set defaults in `~/.config/tt/config.json`:

```json
{
  "weekStartDay": "monday",
  "reportFormat": "terminal",
  "listFormat": "table",
  "timeFormat": "24h",
  "editor": "vim"
}
```

**Note**: Deliberately excluded auto-defaults for project/tags to maintain data accuracy (explicit > implicit).

**Commands Implemented**:

```bash
tt config                    # Show current config
tt config set <key> <value>  # Set a config value
tt config get <key>          # Get a config value
tt config edit               # Open config file in editor
tt config path               # Show config file path
```

**Implementation Details**:

- ✅ Config values used as defaults when flags not provided
- ✅ Command-line flags always override config
- ✅ Validation on config load with helpful error messages
- ✅ Only non-default values saved (minimal config files)
- ✅ Graceful fallback if config missing or malformed

**Files Created/Modified**:

- ✅ `src/types/config.ts` - Config schema and defaults
- ✅ `src/utils/config.ts` - Config loading/saving/validation
- ✅ `src/cli/commands/config.ts` - New config command
- ✅ Updated `report` and `list` commands to use config defaults
- ✅ README.md documentation added

---

### Phase 3: Better Insights 📊

**Goal**: Make the data more useful
**Time Estimate**: 2-3 sessions

#### 3.1 Enhanced Status Command

**Priority**: HIGH - Used frequently

Show richer context about current work:

```bash
$ tt status

▶ Working on: Fix authentication bug @myApp +code +bugfix ~2h
  Started: 09:30 (2h 15m ago)
  Estimate: 2h (15m remaining)

  Interrupted by:
    ⏸ Quick code review @sideProject +review
    Started: 10:45 (1h ago)

Today's Summary:
  Total time: 3h 45m
  Interruptions: 2
  Projects: myApp (2h 30m), sideProject (1h 15m)
  Deep work: 1h 45m (longest session)
```

**What to Show**:

- Current session with metadata
- How long you've been working
- Time remaining (if estimate set)
- Interruption hierarchy
- Today's summary stats
- Warnings (over estimate, too many interruptions)

---

#### 3.2 Trends & Analytics

**Priority**: MEDIUM - Nice insights, but not critical

Add comparative analytics to reports:

**Week-over-Week Comparison**:

```bash
$ tt report

📊 This Week vs Last Week
  Total time: 35h (↑ 5h from last week)
  Projects:
    myApp: 20h (↑ 3h)
    sideProject: 15h (↑ 2h)

  Context switches: 45 (↓ 5 from last week)
  Deep work sessions: 8 (↑ 2)
```

**Time Patterns**:

```text
Most Productive Hours:
  09:00-11:00: 12h (34%)
  14:00-16:00: 10h (29%)

Morning Focus: Avg 2h 15m before first interruption
```

**Features**:

- Week-over-week deltas
- Month-over-month trends
- Time-of-day heatmap
- Context switch trends
- Deep work session trends
- Identify patterns (most productive times)

**Implementation**:

- Add `--compare` flag to report command
- Query previous period's data
- Calculate deltas and percentages
- Format with trend indicators (↑↓)

---

## Additional Features (Post-MVP)

These are nice-to-have features that can come after MVP:

### Goals & Targets

- Weekly hour targets per project
- Tag-based goals (e.g., "40h coding per week")
- Progress tracking and warnings

### Import from Other Tools

- Toggl CSV export
- Harvest CSV export
- RescueTime data
- Generic CSV format

### Pomodoro Mode

- Built-in timer: `tt pomo "Task" --duration 25m`
- Auto-break reminders
- Pomodoro statistics in reports

### Web Dashboard

- Optional web UI for reports
- Visualizations and charts
- Mobile-friendly

### Team Features

- Shared projects database
- Team reports
- Export for invoicing

---

## Success Criteria for MVP

The MVP will be considered complete when:

1. ✅ **Test Coverage**: 80%+ coverage on all commands
2. ✅ **Shell Completion**: Bash, Zsh, Fish completions available
3. ✅ **Configuration**: Config file support with sensible defaults
4. ✅ **Status Command**: Rich context about current session + today
5. ✅ **Trends**: Basic week-over-week comparison in reports
6. ✅ **Dogfooding**: Successfully used daily for 2+ weeks with no blockers
7. ✅ **Documentation**: All features documented in README
8. ✅ **Installation**: One-line install script works

---

## Next Session Plan

**Status**: Phases 0, 1, and 2 complete! Ready for Phase 3.

**Next Up**: Phase 3 - Better Insights 📊

**Options**:

1. **3.1 Enhanced Status Command** - Show richer context (today's summary, warnings, time remaining)
2. **3.2 Trends & Analytics** - Week-over-week comparisons, time patterns, trend indicators

Both features would improve the daily UX and provide actionable insights from the tracking data.

---

## Notes

- This plan is flexible - adjust based on what you discover while dogfooding
- If you hit pain points while using the tool daily, prioritize fixing those
- Consider keeping a "friction log" of things that annoy you during use
- The best features often come from real usage patterns

---

**Questions or changes?** Update this file as the plan evolves!
