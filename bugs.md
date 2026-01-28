# BUGS / IMPROVEMENTS

## Thinking - soon

1. Refactor to use `task-parser` library.
2. Add support for buckets with the dollar sign `($)`.
3. Wasted tags in the session_tags table. It looks like they're just stored
   one-by-one per task. Refactor those to use a linking table (sessions ->
   session_tags -> tags).
4. Refactor to use a repository model?

## Ready

### Schedule listing order

- [ ] `tt schedule` should list schedule items that have a scheduled start time
      first in chronological order by start time, then the rest by priority (descending).

For example, this:

```text
Scheduled Tasks

ID    Priority  Scheduled           Description                             Project        Tags                Estimate
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
aw    ^3                            security updates for backend            @vdr           +security           ~1h
bo    ^3                            VDR FSApps Client Secret                @vdr           +admin
bq    ^4                            Contact page for AZSDC                  @fireweb       +code               ~4h
bs    ^3                            Admin Review review/submit should mat...@elms          +bug +code          ~4h
bz                                  ELMS 3608 plan                          @elms          +plan
ci                                  Add logo to AZ-SDC site                 @fireweb       +support            ~30m
cj                                  research tech stack classification      @admin         +adrs
dg              2026-01-28 07:30    Dog walk                                @break                             ~30m
dh              2026-01-28 08:00    Weights                                 @break         +wellness           ~20m
di              2026-01-28 09:30    Standup                                 @elms          +meeting            ~15m
dj              2026-01-28 10:30    Standup                                 @fsapps        +meeting            ~30m
dk              2026-01-28 11:00    1:1 w/ Dan                              @admin         +meeting            ~30m
dl              2026-01-28 11:30    Dog walk                                @break                             ~30m
dm              2026-01-28 13:00    Weekly Geo Team Sync                    @elms          +meeting            ~1h
dn              2026-01-28 14:00    Dog walk                                @break                             ~10m
do              2026-01-28 12:00    ADRS All Monthly Call                   @admin         +meeting            ~1h30m
dp              2026-01-28 15:00    DevSecOps CoP                           @admin         +meeting            ~1h
```

should be listed as:

```text
Scheduled Tasks

ID    Priority  Scheduled           Description                             Project        Tags                Estimate
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
dg              2026-01-28 07:30    Dog walk                                @break                             ~30m
dh              2026-01-28 08:00    Weights                                 @break         +wellness           ~20m
di              2026-01-28 09:30    Standup                                 @elms          +meeting            ~15m
dj              2026-01-28 10:30    Standup                                 @fsapps        +meeting            ~30m
dk              2026-01-28 11:00    1:1 w/ Dan                              @admin         +meeting            ~30m
dl              2026-01-28 11:30    Dog walk                                @break                             ~30m
do              2026-01-28 12:00    ADRS All Monthly Call                   @admin         +meeting            ~1h30m
dm              2026-01-28 13:00    Weekly Geo Team Sync                    @elms          +meeting            ~1h
dn              2026-01-28 14:00    Dog walk                                @break                             ~10m
dp              2026-01-28 15:00    DevSecOps CoP                           @admin         +meeting            ~1h
aw    ^3                            security updates for backend            @vdr           +security           ~1h
bo    ^3                            VDR FSApps Client Secret                @vdr           +admin
bs    ^3                            Admin Review review/submit should mat...@elms          +bug +code          ~4h
bq    ^4                            Contact page for AZSDC                  @fireweb       +code               ~4h
bz                                  ELMS 3608 plan                          @elms          +plan
ci                                  Add logo to AZ-SDC site                 @fireweb       +support            ~30m
cj                                  research tech stack classification      @admin         +adrs
```
