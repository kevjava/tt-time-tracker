# TT Time Tracker - Examples

This document provides practical examples for using TT Time Tracker in various scenarios.

## Table of Contents

- [Quick Start](#quick-start)
- [Daily Workflows](#daily-workflows)
- [Log File Examples](#log-file-examples)
- [Reporting Examples](#reporting-examples)
- [Advanced Usage](#advanced-usage)

## Quick Start

### First Time Setup

```bash
# Install
npm install -g tt-time-tracker

# Start your first task
tt start "learning tt-time-tracker" -t tutorial

# Stop after a few minutes
tt stop -r "got the basics down"

# Create your first log file
cat > today.log << 'EOF'
09:00 morning standup @work +meeting
09:30 code review @work +review
10:00 implement feature @work +code ~2h
12:00 +lunch
EOF

# Import it
tt log today.log

# Generate your first report
tt report
```

## Daily Workflows

### Morning Routine

```bash
# Start the day with a planning session
tt start "daily planning" -t planning -e 15m

# After planning, start first real task
tt stop
tt start "review overnight alerts" -p monitoring -t ops,review
```

### Throughout the Day

```bash
# Quick task switching
tt stop
tt start "bug fix #1234" -p myapp -t code,bugfix -e 1h

# Add remark when stopping
tt stop -r "fixed and deployed"

# Handle interruptions via log file
cat >> interruptions.log << 'EOF'
# Capturing an interruption I forgot to log
10:30 implement auth flow @myapp +code
  11:15 production incident @legacy +urgent +ops (45m)
EOF

tt log interruptions.log
```

### End of Day

```bash
# Stop any active task
tt stop

# Create end-of-day log for forgotten items
cat > eod.log << 'EOF'
16:00 documentation update @myapp +docs (30m)
17:00 planning tomorrow @work +planning (15m)
EOF

tt log eod.log

# Review the day
tt report --week current
```

### Task Scheduling Workflow

```bash
# Monday morning - queue tasks for the week
tt schedule add "Review Q1 roadmap" -p planning --priority 2 --scheduled "2026-01-10 10:00"
tt schedule add "Deploy v2.0 to production" -p backend -t deploy,ops --priority 1
tt schedule add "Write API documentation" -p backend -t docs ~3h
tt schedule add "Team retrospective" -t meeting --scheduled "2026-01-10 15:00"

# View scheduled tasks
tt schedule list

# Tuesday morning - use interactive selection to pick your first task
# Just run 'tt start' with no arguments - it will show your scheduled tasks
tt start
# You'll see three stanzas:
#   Oldest - All tasks by creation time
#   Important - Tasks with priority ≠ 5
#   Urgent - Tasks scheduled for today or overdue
# Press Enter for the default (first oldest task) or type a number to select

# Later, when switching tasks, use interactive selection again
tt next
# Select from your scheduled tasks

# Edit a scheduled task's priority
tt schedule edit 2 --priority 3

# Remove a task that's no longer needed
tt schedule remove 5

# Add a task with full log notation including priority
tt schedule add "Fix critical bug @backend +urgent ~1h ^1"

# Start a task using a session ID as a template (reuse previous task metadata)
tt start 42  # Uses session 42's project, tags, and estimate
```

## Log File Examples

### Simple Daily Log

```
# Monday, December 23, 2024

09:00 morning standup @acme +meeting
09:15 email triage @acme +admin
09:45 implement user auth @acme +code ~3h
12:00 +lunch
13:00 @prev # back to auth implementation
15:00 code review @acme +review
16:00 update API docs @acme +docs
17:00 end of day
```

### With Interruptions

```
09:00 deep work on feature X @myapp +code ~4h
  10:30 slack question from team @myapp +communication (5m)
  11:00 coffee break +downtime (15m)
  11:30 urgent bug in prod @legacy +urgent +ops (45m)
14:00 @prev # back to feature X
```

### Multiple Projects

```
# Consulting Day
09:00 client A standup @clientA +meeting
09:30 feature development @clientA +code ~2h
11:30 client B code review @clientB +review ~1h
13:00 +lunch
14:00 client A deployment @clientA +deploy +ops
15:00 client B bug fixes @clientB +code +bugfix
16:30 invoicing and admin @consulting +admin
```

### With Estimates and Actuals

```
09:00 implement login @auth +code ~2h
11:15 @prev # took longer than expected
12:00 +lunch (45m)
13:00 write tests @auth +testing ~1h
13:45 @prev # finished early
14:00 documentation @auth +docs ~30m (20m)
```

### Full Week Example

```
# Week of December 23-27, 2024

# Monday
2024-12-23 09:00 standup @project +meeting
09:15 feature planning @project +planning ~1h
10:30 implement feature A @project +code ~4h
  11:00 production alert @ops +urgent (30m)
12:00 +lunch
13:00 @prev # back to feature A
15:00 code review for team @project +review
16:00 update documentation @project +docs

# Tuesday
2024-12-24 09:00 standup @project +meeting
09:15 bug triage @project +bugfix ~2h
11:30 pair programming @project +code +pairing (2h)
13:30 +lunch
14:30 testing @project +testing
16:00 deployment prep @project +deploy
17:00 end of day

# Wednesday
2024-12-25 # Holiday
# No work logged

# Thursday
2024-12-26 09:00 standup @project +meeting
09:15 code review backlog @project +review ~2h
11:30 security update @project +ops +security ~1h
12:30 +lunch
13:30 feature B implementation @project +code ~3h
16:30 retrospective @project +meeting
```

## Reporting Examples

### Basic Reports

```bash
# Current week summary
tt report

# Last week
tt report --week last

# Specific week by ISO week number
tt report --week 2024-W52
```

### Filtered Reports

```bash
# Only work from specific project
tt report --project myapp

# Only coding activities
tt report --tag code

# Multiple tags (OR logic)
tt report --tag code,review,testing

# Combine filters
tt report --week last --project myapp --tag code
```

### Export Formats

```bash
# JSON for programmatic analysis
tt report --format json > report.json

# Process with jq
tt report --format json | jq '.summary.byProject'
tt report --format json | jq '.efficiency'

# CSV for Excel
tt report --format csv > report.csv

# CSV for specific project
tt report --project myapp --format csv > myapp-report.csv
```

### Analysis Examples

```bash
# How much time on each project this week?
tt report --format json | jq '.summary.byProject'

# What's my efficiency ratio?
tt report --format json | jq '.efficiency.efficiencyRatio'

# How many context switches?
tt report --format json | jq '.contextSwitches'

# Deep work time
tt report --format json | jq '.focusBlocks.totalDeepWorkMinutes'
```

## Advanced Usage

### Bash Scripting

```bash
#!/bin/bash
# auto-log-commits.sh - Generate time log from git commits

git log --since="1 week ago" --pretty=format:"%ad %s" --date=format:"%H:%M" \
  | awk '{print $1, substr($0, index($0,$2)), "@project +code"}' \
  > commits.log

tt log commits.log
```

### Daily Automation

```bash
# Add to ~/.bashrc or ~/.zshrc

# Alias for quick task starting
alias tts='tt start'
alias ttstp='tt stop'

# Quick report
alias ttr='tt report --week current'

# End of day routine
function tt-eod() {
  echo "$(date +%H:%M) end of day +admin (5m)" >> ~/timelog/$(date +%Y-%m-%d).log
  tt log ~/timelog/$(date +%Y-%m-%d).log
  tt report
}
```

### Editor Integration

**Vim - Syntax Highlighting**

Create `~/.vim/syntax/ttlog.vim`:

```vim
syntax match ttTimestamp /^\d\{2}:\d\{2}/
syntax match ttProject /@\w\+/
syntax match ttTag /+\w\+/
syntax match ttEstimate /\~\d\+[hm]/
syntax match ttDuration /(\d\+[hm])/
syntax match ttComment /#.*$/

highlight link ttTimestamp Identifier
highlight link ttProject Type
highlight link ttTag Constant
highlight link ttEstimate Number
highlight link ttDuration Special
highlight link ttComment Comment
```

Add to `~/.vim/ftdetect/ttlog.vim`:

```vim
autocmd BufRead,BufNewFile *.log set filetype=ttlog
```

### Template Files

**templates/daily.log**

```
# Daily Log Template - $(date +%Y-%m-%d)

09:00 morning routine +admin
09:30 standup @project +meeting

# Fill in your activities here

12:00 +lunch
13:00

17:00 end of day +admin
```

Usage:

```bash
envsubst < templates/daily.log > $(date +%Y-%m-%d).log
$EDITOR $(date +%Y-%m-%d).log
tt log $(date +%Y-%m-%d).log
```

### Integration with Other Tools

**Pomodoro Technique**

```bash
# Start a pomodoro
tt start "deep work on feature X" -p myapp -t code -e 25m

# After 25 minutes
sleep 1500  # 25 minutes
tt stop
tt start "break" -t break -e 5m

# After break
sleep 300  # 5 minutes
tt stop
tt start "deep work on feature X" -p myapp -t code -e 25m
```

**Git Hooks**

`.git/hooks/post-commit`:

```bash
#!/bin/bash
# Auto-log git commits

COMMIT_MSG=$(git log -1 --pretty=%B)
TIME=$(date +%H:%M)
DATE=$(date +%Y-%m-%d)

echo "$TIME $COMMIT_MSG @project +code" >> ~/timelog/$DATE.log
```

### Bulk Import

```bash
# Import multiple log files
for file in logs/*.log; do
  echo "Processing $file..."
  tt log "$file"
done

# Or
find logs/ -name "*.log" -exec tt log {} \;
```

### Backup and Restore

```bash
# Backup database
cp ~/.local/share/tt/tt.db ~/backups/tt-$(date +%Y%m%d).db

# Export to JSON for portability
tt report --week 2024-W52 --format json > backup-2024-w52.json

# Restore (copy back)
cp ~/backups/tt-20241224.db ~/.local/share/tt/tt.db
```

### Custom Reports with jq

```bash
# Top 5 projects by time
tt report --format json | jq -r '
  .summary.byProject | to_entries |
  sort_by(-.value) |
  limit(5; .[]) |
  "\(.key): \(.value) minutes"
'

# Days with most context switches
tt report --format json | jq -r '
  .contextSwitches.mostFragmentedDays[] |
  "\(.date): \(.switches) switches"
'

# Deep work sessions
tt report --format json | jq -r '
  .focusBlocks.deepWorkSessions[] |
  "\(.description) - \(.durationMinutes) minutes"
'
```

## Tips and Tricks

### Consistent Tagging

Create a standard set of tags:

- `+code` - Writing code
- `+review` - Code reviews
- `+meeting` - All meetings
- `+planning` - Planning and design
- `+testing` - Writing/running tests
- `+docs` - Documentation
- `+admin` - Administrative tasks
- `+learning` - Learning/research
- `+deploy` - Deployments
- `+ops` - Operations work
- `+bugfix` - Bug fixing
- `+urgent` - Urgent/unplanned work

### Project Naming

Use consistent project identifiers:

- Company projects: `@acme-api`, `@acme-web`
- Personal: `@personal`, `@learning`
- Client work: `@client-name`
- Internal: `@ops`, `@admin`

### Weekly Review Routine

```bash
# Friday afternoon review
tt report --week current > ~/reviews/week-$(date +%Y-W%V).txt
tt report --week current --format json > ~/reviews/week-$(date +%Y-W%V).json

# Compare to last week
diff <(tt report --week last --format json | jq '.summary') \
     <(tt report --week current --format json | jq '.summary')
```

### Time Goal Tracking

```bash
# Check if you hit your deep work goal (15h/week)
DEEP_WORK=$(tt report --format json | jq '.focusBlocks.totalDeepWorkMinutes')
DEEP_HOURS=$((DEEP_WORK / 60))

if [ $DEEP_HOURS -ge 15 ]; then
  echo "✓ Deep work goal achieved: ${DEEP_HOURS}h"
else
  echo "⚠ Deep work goal not met: ${DEEP_HOURS}h / 15h"
fi
```

## Common Patterns

### Handling Forgotten Tasks

```bash
# Add to today's log
echo "14:00 forgot task @project +code (30m)" >> today.log
tt log today.log
```

### Batch Task Logging

```bash
# Create a template and fill it in
cat > batch.log << 'EOF'
09:00 task 1 @project +type1
10:00 task 2 @project +type2
11:00 task 3 @project +type3
EOF

tt log batch.log
```

### Multi-day Logs

```bash
# Single file for whole week
cat > week.log << 'EOF'
# Monday
2024-12-23 09:00 standup @project +meeting
09:30 coding @project +code

# Tuesday
2024-12-24 09:00 standup @project +meeting
09:30 more coding @project +code
EOF

tt log week.log
```

### Deleting Sessions

```bash
# Delete a single session
tt delete 42

# Delete multiple sessions by ID
tt delete 10 11 14 18 20

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

# Preview what would be deleted (dry-run)
tt delete --from monday --to tuesday --dry-run

# Skip confirmation prompt
tt delete 10 11 --yes

# Combine session IDs with filters (union)
tt delete 5 6 --project myApp

# Delete sessions from a specific day
tt delete --from yesterday --to yesterday
```

**Tips:**

- Always use `--dry-run` first when using filters to see what will be deleted
- The delete command shows a summary before confirmation
- Child sessions (interruptions) are automatically deleted with their parents
- Date ranges are inclusive of both start and end dates

### Session Editing

#### Quick Fixes

```bash
# Fix a typo in description using log notation
tt edit 42 "Corrected task description"

# Update project
tt edit 42 @correctProject

# Add tags
tt edit 42 +bugfix +urgent

# Update estimate
tt edit 42 ~2h

# Combine multiple updates
tt edit 42 "Fixed description @newProject +tag1 +tag2 ~1h30m"
```

#### Using Command-Line Flags

```bash
# Update description with flag
tt edit 42 -d "New description"

# Update project and tags
tt edit 42 -p backend -t code,refactor

# Update estimate
tt edit 42 -e 45m

# Update multiple fields
tt edit 42 -d "Bug fix" -p api -t bugfix,urgent -e 30m

# Add or update remark
tt edit 42 -r "Took longer than expected"

# Update state
tt edit 42 --state abandoned -r "Deprioritized"
```

#### Time Adjustments

```bash
# Update start time (preserves date, changes time)
tt edit 42 10:30

# Set end time with explicit duration
tt edit 42 "(45m)"

# Update both start time and end time
tt edit 42 "10:00 (30m)"

# Clear end time (re-open session)
tt edit 42 --end-time ""

# Set specific end time using flag
tt edit 42 --end-time "2024-12-24T14:30:00"
```

#### Metadata-Only Updates (Preserve Description)

```bash
# Update only project, keep description unchanged
tt edit 42 @newProject

# Update only tags
tt edit 42 +tag1 +tag2 +tag3

# Update only estimate
tt edit 42 ~1h

# Update project and tags, preserve description
tt edit 42 @backend +refactor +code
```

#### Flag Overrides

```bash
# Log notation with flag override
tt edit 42 @projectA -p projectB
# Result: Uses projectB (flag overrides notation)

# Multiple overrides
tt edit 42 "Task @projectA +tagA ~30m" -p projectB -t tagB -e 1h
# Result: Uses projectB, tagB, and 1h (all flags override)
```

#### Workflow: Find and Fix

```bash
# List sessions to find ID
tt list --from today

# Edit the session
tt edit 15 @correctProject ~2h

# Verify the change
tt list --from today
```

#### Batch Corrections

```bash
# Find all sessions for a project
tt list --project oldName --format table

# Edit each one (IDs from list output)
tt edit 10 @newName
tt edit 11 @newName
tt edit 12 @newName

# Verify
tt list --project newName --from "this week"
```

## Troubleshooting Examples

### Fix Common Errors

```bash
# Remark without space
# WRONG: 14:00 task #no-space
# RIGHT: 14:00 task # with space

# Invalid duration
# WRONG: ~2.5h
# RIGHT: ~2h30m

# Missing description
# WRONG: 09:00 @project
# RIGHT: 09:00 work on project @project
```

### Handling Parse Errors

When you get parse errors, the file opens in your editor automatically:

1. Fix the errors (line numbers shown)
2. Save and exit
3. Parser retries automatically
4. Repeat until valid

To abort: Exit editor without saving changes.

---

For more examples and use cases, visit the [GitHub repository](https://github.com/yourusername/tt-time-tracker).
