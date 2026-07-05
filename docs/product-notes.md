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

## Mooring auto-detection → private coverage & mooring map (owner, 2026-07-04)

When cruise tracking believes the boat has been **stationary for over an hour**, send a
local notification: "Moored up? Log this spot." One tap opens a capture sheet:

- **Speed test** (one tap): download/upload/latency via the current network + operator
  name — auto-captures per-network signal (the Ofcom-beating ground truth)
- **Photo of the mooring** (camera or roll; EXIF GPS stripped on ingest as designed)
- Quick facts: rings/armco/pins, depth felt, noise (optional, one-tap chips)

Storage: **private to the user by default** (device + their private sync partition).
Sharing to the community layer is an explicit opt-in per entry, never bulk.
Over time this builds each boater's personal map of good moorings + cell coverage;
aggregated (opt-in, anonymised) it becomes the network-wide coverage map.

**Map presentation:** the user's own moorings render as **photo pins** — round
photo inside a pin, Google-Maps-featured-place style. Implementation: MapLibre
symbol layer with runtime-generated circular-cropped images (`Images` +
per-mooring thumbnails), falling back to an anchor glyph when no photo.

Detection heuristic (cruise mode already tracks chainage): stationary =
chainage movement < 50 m over 60 min while cruise session active; also fire a
gentler prompt when a cruise session _ends_ near a plausible mooring. Never
auto-log location without the user tapping the notification (privacy principle).

## Layer chips: pubs and shops are separate; fuel is first-class (owner, 2026-07-04)

- **Pubs** and **Shops** get separate chips/layers (different errands).
- **Diesel** (waterway fuel points, boatyards selling fuel, chandleries) and
  **Pump-out** are first-class layers alongside Water and Elsan — they're the
  errands that actually shape a liveaboard's week. Laundry too (post-Nov-2025
  facility closures made laundrettes acute).
- ETL: OSM shops/pubs/fuel/chandlery/laundry extracted from nodes AND building
  ways (centroids), clipped to the canal corridor so the POI artifact stays lean.

## Cruise mode verification note (owner build session)

Background tracking (foreground-location service) and the task-manager crash
fix (RECEIVE_BOOT_COMPLETED) are verified on-device: the FGS runs
(`isForeground=true`, type LOCATION, green notification) and the app no longer
crashes on background fixes. The direction-aware stoppage matching is a graph
golden test. The **moored-up → capture-sheet** flow can't be exercised on the
Android emulator: `adb emu geo fix` won't deliver a repeated identical fix
(distanceInterval gate), and stationary detection needs periodic fixes that
only real GPS jitter provides. Verify on a real device (a slow walk works).
