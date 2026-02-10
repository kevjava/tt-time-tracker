# BUGS / IMPROVEMENTS

## Thinking - soon

1. Refactor to use `task-parser` library.
2. Add support for buckets with the dollar sign `($)`.
3. Wasted tags in the session_tags table. It looks like they're just stored
   one-by-one per task. Refactor those to use a linking table (sessions ->
   session_tags -> tags).
4. Refactor to use a repository model?

## Ready

- Warn the user if logging sessions from more than a month ago or for the future to guard against date mistyping.
