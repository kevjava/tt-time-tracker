# BUGS / IMPROVEMENTS

## Thinking - soon

1. Refactor to use `task-parser` library.
2. Add support for buckets with the dollar sign `($)`.
3. Wasted tags in the session_tags table. It looks like they're just stored
   one-by-one per task. Refactor those to use a linking table (sessions ->
   session_tags -> tags).
4. Refactor to use a repository model?

## Ready

### Warn the user if logging sessions from more than a month ago or for the future to guard against date mistyping

### Reports by project can result in projects' time being reported as greater than 100%

```sh
kev@pop-os:~$ tt report --project fireweb --from=2026-01-01

════════════════════════════════════════════════════════════════════════════════
  TIME TRACKING REPORT - 01 Jan - 2026-02-10
  01 Jan - 2026-02-10
════════════════════════════════════════════════════════════════════════════════

📊 SUMMARY
────────────────────────────────────────────────────────────────────────────────
  Total Time: 15h 15m

📁 TIME BY PROJECT
────────────────────────────────────────────────────────────────────────────────
  @fireweb             15h 42m    ████████████████████ 103%

🏷️  TIME BY ACTIVITY
────────────────────────────────────────────────────────────────────────────────
  +support             9h 6m      ████████████░░░░░░░░ 60%
  +meeting             4h 4m      █████░░░░░░░░░░░░░░░ 27%
  +admin               1h 33m     ██░░░░░░░░░░░░░░░░░░ 10%
  +drupal              59m        █░░░░░░░░░░░░░░░░░░░ 6%
  +wfmrda              59m        █░░░░░░░░░░░░░░░░░░░ 6%

🎯 ESTIMATE ACCURACY
────────────────────────────────────────────────────────────────────────────────
  Average Error: 44m
  Average Error %: 87%
  Total Estimated: ~7h30m
  Total Actual: 10h 47m

  Worst Misses:
    Shut down Sierra Front - 537% over
    Springerville content - 96% over
    NESS Water Cooler - 75% under

⚡ EFFICIENCY
────────────────────────────────────────────────────────────────────────────────
  Total Tracked: 15h 15m
  Break Time: 0m
  Working Time: 15h 15m
  Interruptions: 27m
  Net Uninterrupted Time: 14h 48m
  Efficiency Ratio: 97%

🔀 CONTEXT SWITCHING
────────────────────────────────────────────────────────────────────────────────
  Total Switches: 25
    Hard Switches: 0
    Medium Switches: 14
    Soft Switches: 11

  Most Fragmented Days:
    2026-01-07: 3 switches
    2026-01-12: 3 switches
    2026-01-16: 3 switches

🧠 DEEP WORK SESSIONS
────────────────────────────────────────────────────────────────────────────────
  Total Deep Work: 3h 23m
  Sessions: 2
  Average Length: 1h 42m

  Deep Work Sessions:
    Springerville content - 1h 50m
    Shut down Sierra Front - 1h 33m

🌅 MORNING FOCUS
────────────────────────────────────────────────────────────────────────────────
  Time to first context switch each day:
    2026-01-05: 1h 16m
    2026-01-07: 24m
    2026-01-08: 1h 11m
    2026-01-09: 8m
    2026-01-12: 25m
    2026-01-13: 1h 12m
    2026-01-16: 2h 55m
    2026-01-21: 26m
    2026-01-23: 14m
    2026-01-26: 55m
    2026-01-28: 21m
    2026-01-29: 17m
    2026-02-02: 24m
    2026-02-09: 16m
    2026-02-10: 1h

🔗 INCOMPLETE CONTINUATION CHAINS
────────────────────────────────────────────────────────────────────────────────
  1 chain(s) with paused or active sessions:

  Looking into WFMRDA replacement.
    Sessions: 2 (2 incomplete)
    Time logged: 59m
    Project: @fireweb

📈 OUTLIERS (>2σ from mean)
────────────────────────────────────────────────────────────────────────────────
  Springerville content - 1h 50m (2.4σ)

════════════════════════════════════════════════════════════════════════════════


Note: 1 active session excluded from totals.
      Run 'tt status' to see current activity.
```
