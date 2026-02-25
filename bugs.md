# BUGS / IMPROVEMENTS

## Thinking - soon

1. Refactor to use `task-parser` library.
2. Add support for buckets with the dollar sign `($)`.
3. Wasted tags in the session_tags table. It looks like they're just stored
   one-by-one per task. Refactor those to use a linking table (sessions ->
   session_tags -> tags).
4. Refactor to use a repository model?

## Ready

### ~~Logged sessions, end times, and durations~~ (FIXED)

~~Logging a session and then changing the end time does not change the duration of
the logged session.~~

Follow the progression of session 689 in this exchange:

```sh
kev@pop-os:~$ tt log
07:21 Dog walk @break (17m)
✓ Logged 1 session(s)
kev@pop-os:~$ tt ls

Sessions: Week of 2026-02-23 (2026-W9)

ID    Date            Time          Description                             Project        Tags                Duration                Estimate    State
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
657   Mon, 23 Feb     06:58-07:17   In, reading emails.                     @admin                             19m                     ~15m        ✓ Completed
658   Mon, 23 Feb     07:17-07:30   Plan the day.                           @admin         +plan               13m                     ~15m        ✓ Completed
659   Mon, 23 Feb     07:30-07:39   Time sheets                             @admin                             8m                      ~15m        ✓ Completed
660   Mon, 23 Feb     07:39-08:07   Dog walk                                @break                             28m                     ~30m        ✓ Completed
661   Mon, 23 Feb     08:07-09:07   Run                                     @wellness      +wellness           59m                     ~1h         ✓ Completed
662   Mon, 23 Feb     09:07-09:30   Shower                                  @break                             23m                                 ✓ Completed
663   Mon, 23 Feb     09:30-09:40   Standup                                 @elms          +meeting            10m                     ~15m        ✓ Completed
664   Mon, 23 Feb     09:40-09:41   Get the day off                         @admin                             0m                                  ✓ Completed
665   Mon, 23 Feb     09:41-09:47   break                                   @break                             5m                                  ✓ Completed
666   Mon, 23 Feb     09:47-10:30   VDR security updates                    @vdr           +security           42m                                 ⏸ Paused
667   Mon, 23 Feb     10:30-10:56   Standup                                 @fsapps        +meeting            26m                     ~30m        ✓ Completed
668   Mon, 23 Feb     10:56-11:30   VDR security updates                    @vdr           +security           33m                                 ⏸ Paused
669   Mon, 23 Feb     11:30-12:00   ATLAS ATO meeting                       @admin         +meeting +turboplan 30m                     ~30m        ✓ Completed
670   Mon, 23 Feb     12:00-14:00   VDR security updates                    @vdr           +security           2h                                  ⏸ Paused
671   Mon, 23 Feb     14:00-14:30   Dog walk                                @break                             30m                                 ✓ Completed
672   Mon, 23 Feb     14:30-16:30   VDR security updates                    @vdr           +security           2h                                  ⏸ Paused
673   Tue, 24 Feb     07:00-07:15   In, reading emails.                     @admin                             15m                                 ✓ Completed
674   Tue, 24 Feb     07:15-07:30   Plan the day.                           @admin         +plan               15m                                 ✓ Completed
675   Tue, 24 Feb     07:30-08:00   Dog walk                                @break                             30m                                 ✓ Completed
676   Tue, 24 Feb     08:00-10:45   VDR security updates                    @vdr           +security           2h 45m                              ⏸ Paused
677   Tue, 24 Feb     10:45-11:05   Dog walk                                @break                             20m                                 ✓ Completed
678   Tue, 24 Feb     11:05-11:16   VDR security updates                    @vdr           +security           11m                                 ✓ Completed
679   Tue, 24 Feb     11:16-12:00   Weights                                 @break                             43m                     ~30m        ✓ Completed
680   Tue, 24 Feb     12:00-12:27   AD/AS Services Weekly Check-in          @admin         +meeting            27m                     ~30m        ✓ Completed
681   Tue, 24 Feb     12:27-13:38   VDR security updates                    @vdr           +security           1h 11m                              ⏸ Paused
682   Tue, 24 Feb     13:38-16:40   Lunch                                   @break         +atp                3h 1m                   ~1h30m      ✓ Completed
683   Tue, 24 Feb     16:40-16:50   VDR security updates                    @vdr           +security           10m                                 ⏸ Paused
684   Tue, 24 Feb     16:50-17:10   ISA-ROB training                        @admin         +training           20m                     ~30m        ✓ Completed
685   Wed, 25 Feb     06:23-07:21   In, reading emails.                     @admin                             57m                     ~15m        ✓ Completed
689   Wed, 25 Feb     07:21-07:38   Dog walk                                @break                             17m                                 ✓ Completed
686   Wed, 25 Feb     07:49-08:11   Plan the day.                           @admin         +plan               21m                     ~15m        ✓ Completed
687   Wed, 25 Feb     08:11-08:45   VDR security updates                    @vdr           +security           34m                                 ⏸ Paused
688   Wed, 25 Feb     08:45-        Run                                     @wellness      +wellness           (active)                ~1h         ▶ Working

kev@pop-os:~$ tt edit 689 --end-time 07:49

Current session:
────────────────────────────────────────────────────────────────────────────────
  ID: 689
  Date: Wed, 2026-02-25
  Start time: 07:21:00
  End time: 07:38:00
  Description: Dog walk
  Project: break
  Tags: (none)
  Estimate: (none)
  Remark: (none)
  State: completed
  Continues: (none)
────────────────────────────────────────────────────────────────────────────────

✓ Session updated successfully

Changes made:
  End time: 2026-02-25 07:38:00 → 2026-02-25 07:49:00

kev@pop-os:~$ tt ls

Sessions: Week of 2026-02-23 (2026-W9)

ID    Date            Time          Description                             Project        Tags                Duration                Estimate    State
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
657   Mon, 23 Feb     06:58-07:17   In, reading emails.                     @admin                             19m                     ~15m        ✓ Completed
658   Mon, 23 Feb     07:17-07:30   Plan the day.                           @admin         +plan               13m                     ~15m        ✓ Completed
659   Mon, 23 Feb     07:30-07:39   Time sheets                             @admin                             8m                      ~15m        ✓ Completed
660   Mon, 23 Feb     07:39-08:07   Dog walk                                @break                             28m                     ~30m        ✓ Completed
661   Mon, 23 Feb     08:07-09:07   Run                                     @wellness      +wellness           59m                     ~1h         ✓ Completed
662   Mon, 23 Feb     09:07-09:30   Shower                                  @break                             23m                                 ✓ Completed
663   Mon, 23 Feb     09:30-09:40   Standup                                 @elms          +meeting            10m                     ~15m        ✓ Completed
664   Mon, 23 Feb     09:40-09:41   Get the day off                         @admin                             0m                                  ✓ Completed
665   Mon, 23 Feb     09:41-09:47   break                                   @break                             5m                                  ✓ Completed
666   Mon, 23 Feb     09:47-10:30   VDR security updates                    @vdr           +security           42m                                 ⏸ Paused
667   Mon, 23 Feb     10:30-10:56   Standup                                 @fsapps        +meeting            26m                     ~30m        ✓ Completed
668   Mon, 23 Feb     10:56-11:30   VDR security updates                    @vdr           +security           33m                                 ⏸ Paused
669   Mon, 23 Feb     11:30-12:00   ATLAS ATO meeting                       @admin         +meeting +turboplan 30m                     ~30m        ✓ Completed
670   Mon, 23 Feb     12:00-14:00   VDR security updates                    @vdr           +security           2h                                  ⏸ Paused
671   Mon, 23 Feb     14:00-14:30   Dog walk                                @break                             30m                                 ✓ Completed
672   Mon, 23 Feb     14:30-16:30   VDR security updates                    @vdr           +security           2h                                  ⏸ Paused
673   Tue, 24 Feb     07:00-07:15   In, reading emails.                     @admin                             15m                                 ✓ Completed
674   Tue, 24 Feb     07:15-07:30   Plan the day.                           @admin         +plan               15m                                 ✓ Completed
675   Tue, 24 Feb     07:30-08:00   Dog walk                                @break                             30m                                 ✓ Completed
676   Tue, 24 Feb     08:00-10:45   VDR security updates                    @vdr           +security           2h 45m                              ⏸ Paused
677   Tue, 24 Feb     10:45-11:05   Dog walk                                @break                             20m                                 ✓ Completed
678   Tue, 24 Feb     11:05-11:16   VDR security updates                    @vdr           +security           11m                                 ✓ Completed
679   Tue, 24 Feb     11:16-12:00   Weights                                 @break                             43m                     ~30m        ✓ Completed
680   Tue, 24 Feb     12:00-12:27   AD/AS Services Weekly Check-in          @admin         +meeting            27m                     ~30m        ✓ Completed
681   Tue, 24 Feb     12:27-13:38   VDR security updates                    @vdr           +security           1h 11m                              ⏸ Paused
682   Tue, 24 Feb     13:38-16:40   Lunch                                   @break         +atp                3h 1m                   ~1h30m      ✓ Completed
683   Tue, 24 Feb     16:40-16:50   VDR security updates                    @vdr           +security           10m                                 ⏸ Paused
684   Tue, 24 Feb     16:50-17:10   ISA-ROB training                        @admin         +training           20m                     ~30m        ✓ Completed
685   Wed, 25 Feb     06:23-07:21   In, reading emails.                     @admin                             57m                     ~15m        ✓ Completed
689   Wed, 25 Feb     07:21-07:49   Dog walk                                @break                             17m                                 ✓ Completed
686   Wed, 25 Feb     07:49-08:11   Plan the day.                           @admin         +plan               21m                     ~15m        ✓ Completed
687   Wed, 25 Feb     08:11-08:45   VDR security updates                    @vdr           +security           34m                                 ⏸ Paused
688   Wed, 25 Feb     08:45-        Run                                     @wellness      +wellness           (active)                ~1h         ▶ Working

kev@pop-os:~$
```

- Warn the user if logging sessions from more than a month ago or for the future to guard against date mistyping.

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
