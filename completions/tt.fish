# Fish completion for tt (time tracker)
# Installation: Copy this file to ~/.config/fish/completions/

# Helper functions for dynamic completions
function __tt_recent_projects
    if type -q tt-completion-helper
        tt-completion-helper projects 2>/dev/null
    end
end

function __tt_recent_tags
    if type -q tt-completion-helper
        tt-completion-helper tags 2>/dev/null
    end
end

# Remove default completions
complete -c tt -e

# Global options
complete -c tt -s v -l verbose -d 'Output debug messages'
complete -c tt -l version -d 'Show version'
complete -c tt -l help -d 'Show help'

# Commands
complete -c tt -f -n '__fish_use_subcommand' -a 'status' -d 'Show status of running timers (default)'
complete -c tt -f -n '__fish_use_subcommand' -a 'log' -d 'Parse and insert time entries from file'
complete -c tt -f -n '__fish_use_subcommand' -a 'report' -d 'Generate time report for a date range'
complete -c tt -f -n '__fish_use_subcommand' -a 'list' -d 'List sessions in columnar format'
complete -c tt -f -n '__fish_use_subcommand' -a 'start' -d 'Start tracking a task'
complete -c tt -f -n '__fish_use_subcommand' -a 'next' -d 'Stop current task and start a new one'
complete -c tt -f -n '__fish_use_subcommand' -a 'switch' -d 'Pause current task and start a new one'
complete -c tt -f -n '__fish_use_subcommand' -a 'stop' -d 'Stop current active task'
complete -c tt -f -n '__fish_use_subcommand' -a 'interrupt' -d 'Interrupt current task'
complete -c tt -f -n '__fish_use_subcommand' -a 'resume' -d 'Complete interruption and resume parent'
complete -c tt -f -n '__fish_use_subcommand' -a 'pause' -d 'Pause current active task'
complete -c tt -f -n '__fish_use_subcommand' -a 'abandon' -d 'Abandon current active task'
complete -c tt -f -n '__fish_use_subcommand' -a 'schedule' -d 'Manage scheduled tasks'
complete -c tt -f -n '__fish_use_subcommand' -a 'delete' -d 'Delete one or more sessions'
complete -c tt -f -n '__fish_use_subcommand' -a 'edit' -d 'Edit a session by ID'
complete -c tt -f -n '__fish_use_subcommand' -a 'config' -d 'Manage configuration'
complete -c tt -f -n '__fish_use_subcommand' -a 'find' -d 'Search sessions by description'
complete -c tt -f -n '__fish_use_subcommand' -a 'help' -d 'Show help information'

# log command
complete -c tt -f -n '__fish_seen_subcommand_from log' -l overwrite -d 'Allow overwriting overlapping sessions'
complete -c tt -f -n '__fish_seen_subcommand_from log' -l help -d 'Show help'

# report command
complete -c tt -f -n '__fish_seen_subcommand_from report' -l week -d 'Week to report' -a 'current last'
complete -c tt -f -n '__fish_seen_subcommand_from report' -l from -d 'Start date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from report' -l to -d 'End date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from report' -l project -d 'Filter by project' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from report' -l tag -d 'Filter by tags' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from report' -l format -d 'Output format' -a 'terminal json csv'
complete -c tt -f -n '__fish_seen_subcommand_from report' -l help -d 'Show help'

# list command
complete -c tt -f -n '__fish_seen_subcommand_from list' -l week -d 'Week to list' -a 'current last'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l from -d 'Start date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l to -d 'End date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l project -d 'Filter by project' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l tag -d 'Filter by tags' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l state -d 'Filter by state' -a 'working paused completed abandoned'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l format -d 'Output format' -a 'table log'
complete -c tt -f -n '__fish_seen_subcommand_from list' -l help -d 'Show help'

# start, next, switch commands
complete -c tt -f -n '__fish_seen_subcommand_from start next switch' -s p -l project -d 'Project name' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from start next switch' -s t -l tags -d 'Tags (comma-separated)' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from start next switch' -s e -l estimate -d 'Estimated duration' -a '15m 30m 1h 1h30m 2h 3h 4h'
complete -c tt -f -n '__fish_seen_subcommand_from start next switch' -l at -d 'Start time' -a '-15m -30m -1h'
complete -c tt -f -n '__fish_seen_subcommand_from start next switch' -l help -d 'Show help'

# stop command
complete -c tt -f -n '__fish_seen_subcommand_from stop' -s r -l remark -d 'Add remark'
complete -c tt -f -n '__fish_seen_subcommand_from stop' -l at -d 'Stop time' -a '-15m -30m -1h'
complete -c tt -f -n '__fish_seen_subcommand_from stop' -l help -d 'Show help'

# interrupt command
complete -c tt -f -n '__fish_seen_subcommand_from interrupt' -s p -l project -d 'Project name' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from interrupt' -s t -l tags -d 'Tags (comma-separated)' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from interrupt' -s e -l estimate -d 'Estimated duration' -a '15m 30m 1h 1h30m 2h 3h 4h'
complete -c tt -f -n '__fish_seen_subcommand_from interrupt' -l at -d 'Interrupt time' -a '-15m -30m -1h'
complete -c tt -f -n '__fish_seen_subcommand_from interrupt' -l help -d 'Show help'

# resume command
complete -c tt -f -n '__fish_seen_subcommand_from resume' -s r -l remark -d 'Add remark'
complete -c tt -f -n '__fish_seen_subcommand_from resume' -l at -d 'Resume time' -a '-15m -30m -1h'
complete -c tt -f -n '__fish_seen_subcommand_from resume' -l help -d 'Show help'

# pause command
complete -c tt -f -n '__fish_seen_subcommand_from pause' -l reason -d 'Reason for pausing'
complete -c tt -f -n '__fish_seen_subcommand_from pause' -l at -d 'Pause time' -a '-15m -30m -1h'
complete -c tt -f -n '__fish_seen_subcommand_from pause' -l help -d 'Show help'

# abandon command
complete -c tt -f -n '__fish_seen_subcommand_from abandon' -l reason -d 'Reason for abandoning'
complete -c tt -f -n '__fish_seen_subcommand_from abandon' -l at -d 'Abandon time' -a '-15m -30m -1h'
complete -c tt -f -n '__fish_seen_subcommand_from abandon' -l help -d 'Show help'

# delete command
complete -c tt -f -n '__fish_seen_subcommand_from delete' -s y -l yes -d 'Skip confirmation'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -l from -d 'Delete from date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -l to -d 'Delete to date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -s p -l project -d 'Filter by project' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -s t -l tag -d 'Filter by tag' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -s s -l state -d 'Filter by state' -a 'working paused completed abandoned'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -l dry-run -d 'Preview without deleting'
complete -c tt -f -n '__fish_seen_subcommand_from delete' -l help -d 'Show help'

# edit command
complete -c tt -f -n '__fish_seen_subcommand_from edit' -s d -l description -d 'Update description'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -s p -l project -d 'Update project' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -s t -l tags -d 'Update tags' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -s e -l estimate -d 'Update estimate' -a '15m 30m 1h 1h30m 2h 3h 4h'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -s r -l remark -d 'Update remark'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -l start-time -d 'Update start time'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -l end-time -d 'Update end time'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -l state -d 'Update state' -a 'working paused completed abandoned'
complete -c tt -f -n '__fish_seen_subcommand_from edit' -l help -d 'Show help'

# schedule command
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and not __fish_seen_subcommand_from add list edit remove' -a 'add' -d 'Add a new scheduled task'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and not __fish_seen_subcommand_from add list edit remove' -a 'list' -d 'List all scheduled tasks'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and not __fish_seen_subcommand_from add list edit remove' -a 'edit' -d 'Edit a scheduled task'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and not __fish_seen_subcommand_from add list edit remove' -a 'remove' -d 'Remove a scheduled task'

# schedule add
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from add' -s p -l project -d 'Project name' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from add' -s t -l tags -d 'Tags (comma-separated)' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from add' -s e -l estimate -d 'Estimated duration' -a '15m 30m 1h 1h30m 2h 3h 4h'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from add' -l priority -d 'Priority level (1-9)' -a '1 2 3 4 5 6 7 8 9'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from add' -l scheduled -d 'Scheduled date/time'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from add' -l help -d 'Show help'

# schedule edit
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -l description -d 'Update description'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -s p -l project -d 'Update project' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -s t -l tags -d 'Update tags' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -s e -l estimate -d 'Update estimate' -a '15m 30m 1h 1h30m 2h 3h 4h'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -l priority -d 'Update priority' -a '1 2 3 4 5 6 7 8 9'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -l scheduled -d 'Update scheduled date/time'
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from edit' -l help -d 'Show help'

# schedule list and remove
complete -c tt -f -n '__fish_seen_subcommand_from schedule; and __fish_seen_subcommand_from list remove' -l help -d 'Show help'

# config command
complete -c tt -f -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from get set edit path' -a 'get' -d 'Get a configuration value'
complete -c tt -f -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from get set edit path' -a 'set' -d 'Set a configuration value'
complete -c tt -f -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from get set edit path' -a 'edit' -d 'Edit configuration file'
complete -c tt -f -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from get set edit path' -a 'path' -d 'Show path to configuration file'

# config get/set
complete -c tt -f -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get set' -a 'weekStartDay reportFormat listFormat timeFormat editor' -d 'Configuration key'

# find command
complete -c tt -f -n '__fish_seen_subcommand_from find' -l from -d 'Start date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from find' -l to -d 'End date' -a 'yesterday today monday tuesday wednesday thursday friday saturday sunday'
complete -c tt -f -n '__fish_seen_subcommand_from find' -s p -l project -d 'Filter by project' -a '(__tt_recent_projects)'
complete -c tt -f -n '__fish_seen_subcommand_from find' -s t -l tag -d 'Filter by tag' -a '(__tt_recent_tags)'
complete -c tt -f -n '__fish_seen_subcommand_from find' -s s -l state -d 'Filter by state' -a 'working paused completed abandoned'
complete -c tt -f -n '__fish_seen_subcommand_from find' -l help -d 'Show help'

# status command
complete -c tt -f -n '__fish_seen_subcommand_from status' -l help -d 'Show help'
