# Product decisions (running log)

## Stoppages: important, not central (owner, 2026-07-04)

Stoppages are uncommon enough that they must not dominate the daily UI. Where they live:

- **System map** (whole-network zoomed-out view): stoppage markers shine here — one glance shows every closure on the network. This is a distinct view/zoom state, not the default local map.
- **Route planning**: date-aware clash warnings (already designed).
- **Cruise mode**: push alert only when ahead + in your direction + close.
- **Local map**: stoppages are an optional layer chip, _not_ the default active lens (default is Moorings). No badge-spam.

## Wide vs narrow is first-class (owner, 2026-07-04)

Canals and locks are gauge-classified (`narrow` ~7 ft vs `broad` ~14 ft) throughout:

- Graph edges carry `navigableClass` + separate `narrowLocks`/`broadLocks` counts (curated per-waterway table in `packages/graph/src/classification.ts`, refined by OSM `maxwidth`/`lock_name` tags; per-section overrides to come from community data — e.g. Trent & Mersey changes gauge mid-route).
- Timing model charges narrow and broad locks differently.
- Boat profile beam → hard warnings when a route needs a narrow lock a widebeam can't fit ("your 10' 6" beam cannot pass Watford Locks").
- Map/POI iconography should visually distinguish narrow and broad locks; route summaries say "35 locks (23 broad, 12 narrow)".

## [redacted] (owner, 2026-07-04)

No outreach emails yet — drafts stay in `docs/outreach/` until the owner decides the time is right (likely when Moorhen is demoable). Deep links fine; zero automated ingestion (see `docs/[redacted].md`).
