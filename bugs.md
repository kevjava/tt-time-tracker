# BUGS / IMPROVEMENTS

## Thinking - soon

- Wasted tags in the session_tags table. It looks like they're just stored
  one-by-one per task. Refactor those to use a linking table (sessions ->
  session_tags -> tags).
- Refactor to use a repository model?
- Refactor the core code library out to a new project.

## Ready

None - we're good!
