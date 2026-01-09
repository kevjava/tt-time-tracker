# BUGS / IMPROVEMENTS

## Thinking - soon

- Wasted tags in the session_tags table. It looks like they're just stored
  one-by-one per task. Refactor those to use a linking table (sessions ->
  session_tags -> tags).
- Refactor to use a repository model?
- Refactor the core code library out to a new project.

## Ready

### Schedule imports

I'd like to be able to import a schedule file as a template for a day's work.

I could create a file called `wednesday.ttlog`:

```ttlog
07:00 In, reading emails @admin ~15m
07:15 Plan the day @admin ~15m
07:30 Dog walk @break ~30m
08:00 Run @wellness +wellness ~1h
09:00 Shower @break ~30m
09:30 Standup @project1 ~15m
```

I could do a

```sh
tt schedule import wednesday.ttlog
```

...and `tt` would parse them in log format, then import all of these schedule
entries to be executed with a default date of today (it's acceptable for some of
these to be in the past.)
