# TT Time Tracker - MVP Roadmap

**Status**: In Progress - Actively dogfooding
**Last Updated**: 2025-12-28

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

### 📊 Test Coverage

- **Total Tests**: 200 passing
- **Covered Commands**: start, interrupt
- **Missing Tests**: stop, resume, status, edit, delete, report, list, log
- **Coverage**: ~40% (need 80%+ for MVP)

### 🎯 Known Gaps for MVP

1. **Test Coverage**: Critical commands lack tests
2. **Shell Completion**: No tab completion for better discoverability
3. **Configuration**: No way to set defaults (project, tags)
4. **Status Command**: Basic - could show more context
5. **Trends**: No week-over-week comparisons or pattern analysis

---

## MVP Roadmap

### Phase 0: Priority quality-of-life fixes

#### 0.1: Bulk deletion

The `tt delete` command should be able to delete multiple entries. We should be
able to do things like:

```ttlog
tt delete 10 11 14 18 20
```

or:

```ttlog
tt delete --from sunday --to tuesday
```

#### 0.2: Edit flexibility

I'd like to add log format to the `tt edit` command.

For example, you could use

```ttlog
tt edit 10 ~20m
```

To change the estimate of session number 10 to 20 minutes.

Please ask if you see issues that could arise with this or need clarification.

### Phase 1: Foundation & Reliability 🔧

**Goal**: Make the core stable and well-tested
**Time Estimate**: 2-3 sessions

#### 1.1 Test Coverage for Core Commands

**Priority**: HIGH - Must have before adding more features

Add comprehensive test suites for:

1. **stop / resume** (Session 1)
   - Stop active session
   - Stop with remark
   - Resume from interruption
   - Resume with remark
   - Error cases (no active session, no parent to resume)
   - Follow existing test patterns from start/interrupt

2. **status** (Session 1)
   - Show active session
   - Show interruption hierarchy
   - No active session state
   - Edge cases (paused sessions, etc.)

3. **edit / delete** (Session 2)
   - Edit session fields (description, project, tags, estimate, remark, times, state)
   - Delete session (with confirmation)
   - Delete with children (cascade)
   - Invalid inputs
   - Non-existent session IDs

4. **report** (Session 2)
   - Different time ranges (week specs, custom dates, fuzzy dates)
   - Filters (project, tag)
   - Output formats (terminal, json, csv)
   - Edge cases (no sessions, single session, complex hierarchies)

5. **list** (Session 3)
   - Time range filtering
   - State filtering
   - Output formats (table, log)
   - Edge cases

6. **log** (Session 3)
   - Parse valid files
   - Handle parse errors
   - Overlap detection
   - Overwrite mode
   - Interruption hierarchies

**Success Criteria**:

- 80%+ test coverage
- All commands have happy path + error case tests
- Confidence to refactor without breaking things

---

### Phase 2: Discoverability & Ease of Use ⚡

**Goal**: Reduce friction in daily use
**Time Estimate**: 1-2 sessions

#### 2.1 Shell Completion Scripts

**Priority**: HIGH - Daily UX improvement

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

#### 2.2 Configuration File Support

**Priority**: MEDIUM - Reduces repetitive typing

Allow users to set defaults in `~/.config/tt/config.json`:

```json
{
  "defaultProject": "myApp",
  "defaultTags": ["dev"],
  "weekStartDay": "monday",
  "editor": "vim",
  "favoriteProjects": ["myApp", "sideProject", "research"],
  "favoriteTags": ["code", "meeting", "review", "planning"],
  "reportFormat": "terminal",
  "listFormat": "table"
}
```

**Commands to Add**:

```bash
tt config                    # Show current config
tt config set <key> <value>  # Set a config value
tt config get <key>          # Get a config value
tt config edit               # Open config file in editor
```

**Behavior**:

- Config values are used as defaults when flags not provided
- Command-line flags always override config
- Validation on config load (warn about invalid keys)

**Files**:

- `src/utils/config.ts` - Add config loading/saving
- `src/cli/commands/config.ts` - New command
- Update existing commands to use config defaults

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

```
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

**Start with**: Test coverage for `stop` and `resume` commands

**Approach**:

1. Read existing tests for `start` and `interrupt` as templates
2. Create `src/cli/commands/__tests__/stop.test.ts`
3. Create `src/cli/commands/__tests__/resume.test.ts`
4. Follow same pattern: mocking setup, happy paths, error cases
5. Aim for ~10-15 tests per command

**Expected Tests for stop**:

- Stop active session
- Stop with remark
- Stop when no active session (error)
- Stop and verify end time is set
- Stop and verify state changes to completed
- Multiple start/stop cycles

**Expected Tests for resume**:

- Resume from interruption
- Resume with remark
- Resume when no active session (error)
- Resume when not in interruption (error)
- Resume and verify parent state changes to working
- Resume and verify interruption state changes to completed
- Nested interruptions (resume from level 2 to level 1)

---

## Notes

- This plan is flexible - adjust based on what you discover while dogfooding
- If you hit pain points while using the tool daily, prioritize fixing those
- Consider keeping a "friction log" of things that annoy you during use
- The best features often come from real usage patterns

---

**Questions or changes?** Update this file as the plan evolves!
