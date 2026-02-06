# BUGS / IMPROVEMENTS

## Thinking - soon

1. Refactor to use `task-parser` library.
2. Add support for buckets with the dollar sign `($)`.
3. Wasted tags in the session_tags table. It looks like they're just stored
   one-by-one per task. Refactor those to use a linking table (sessions ->
   session_tags -> tags).
4. Refactor to use a repository model?
5. Refactor schedule commands (list, edit, remove, add) to use a common
   scheduler interface that works correctly with both TTScheduler and
   ChurnScheduler. Currently schedule-list has special handling for churn
   vs non-churn, but edit/remove only work with scheduled_tasks table.

## Ready

- Print the year on sessions.
- Warn the user if logging sessions from more than a month ago or for the future to guard against date mistyping.
