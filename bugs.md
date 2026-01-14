# BUGS / IMPROVEMENTS

## Thinking - soon

- Wasted tags in the session_tags table. It looks like they're just stored
  one-by-one per task. Refactor those to use a linking table (sessions ->
  session_tags -> tags).
- Refactor to use a repository model?
- Refactor the core code library out to a new project.

## Ready

### ~~Issuing a `next` or `switch` command during an interruption~~ RESOLVED

**Resolution:** Implemented option 2 - detect interruption and prompt user.

Both `tt next` and `tt switch` now check if the active session is an interruption
(has a `parentSessionId`) before proceeding. If so, they display an error message
telling the user to run `tt resume` first to properly end the interruption, then
re-run the command.

Example:
```
Error: Currently in an interruption "side task". Use `tt resume` to end the interruption first, then run `tt next`.
```

Note: `tt start` was not affected - it already refuses to start when there's an
active session.

### ~~`--at` for the same minute can cause overlaps~~ ✅ RESOLVED

**Resolution:** Implemented option 2 - auto-adjustment for overlaps < 60 seconds.

When using `--at` and the specified time would overlap with an existing session
by less than 60 seconds, the start time is automatically adjusted to 1 second
after the previous session's end time. A warning message is displayed to inform
the user of the adjustment.

Example:
```
Note: Adjusted start time from 10:30:00 to 10:30:46 to avoid overlap with previous session
```

If the overlap is >= 60 seconds, the original error is still shown and the user
must manually resolve the conflict.
