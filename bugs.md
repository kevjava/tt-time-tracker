# BUGS / IMPROVEMENTS

## Thinking - soon

- Wasted tags in the session_tags table. It looks like they're just stored
  one-by-one per task. Refactor those to use a linking table (sessions ->
  session_tags -> tags).
- Refactor to use a repository model?
- Refactor the core code library out to a new project.

## Ready

### Issuing a `next` command during an interruption

Doing a `tt next` during an interruption will end the interruption and then fail
to start the next one. Should we:

1. Stop the interruption and the parent task
2. Do nothing. Tell the user that they should issue a `tt resume` command to end
   the interruption and then proceed to the next task

I think option 2 is better -- there are no surprises to the user. Do you see
consistency issues with that?

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
