# Moorhen design system

Working design file: `designs/moorhen.pen` (Pencil). Four core screens are mocked: **Map Home**, **Place Detail** (facility status + walkable amenities + Street View), **Route Plan** (journey estimate, date-aware winter-works warning, day-by-day, tunable pace), **Cruise Mode** (night theme, directional stoppage alert).

Design direction: _warm, natural, modern_ — the anti-antiquated statement. Cream canvas, floating white cards, soft shadows, generous radii, one geometric sans (Outfit). Brand accents come from the moorhen itself: red frontal shield for alerts, yellow bill tip for warnings, canal-water teal for the map.

## Tokens (day theme)

| Token                                 | Value                             | Use                             |
| ------------------------------------- | --------------------------------- | ------------------------------- |
| `bg`                                  | `#F5F4F1`                         | page background (warm cream)    |
| `surface`                             | `#FFFFFF`                         | cards, sheets, pills            |
| `surface-muted`                       | `#EDECEA`                         | secondary surfaces              |
| `ink` / `ink-2` / `ink-3`             | `#1A1918` / `#6D6C6A` / `#9C9B99` | text hierarchy                  |
| `border`                              | `#E5E4E1`                         | hairlines (`#D1D0CD` strong)    |
| `green` / `green-dark` / `green-soft` | `#3D8A5A` / `#2E6B45` / `#C8F0D8` | primary actions, working status |
| `water` / `water-deep`                | `#5E9DB5` / `#3F7E96`             | canal ribbon, mooring accents   |
| `land` / `greenspace`                 | `#EFEDE6` / `#DDE8D3`             | map base                        |
| `shield-red`                          | `#D9482F` (soft `#F8DDD6`)        | stoppages, closures, alerts     |
| `bill-yellow`                         | `#E8B830` (soft `#F7ECCF`)        | warnings, date-clash notices    |

## Tokens (night / cruise theme)

| Token                          | Value                 |
| ------------------------------ | --------------------- |
| `night-bg` / `night-surface`   | `#14191B` / `#1E2528` |
| `night-border`                 | `#2C3538`             |
| `night-ink` / `night-ink-2`    | `#F0EFEC` / `#9FA8A5` |
| water ribbon / travelled trail | `#4E8CA6` / `#7FD4A8` |
| alert text on dark             | `#F58D77`             |

## Type & shape

- **Font:** Outfit only. 32/700 −1 tracking (big metrics like journey time) · 22/600 (sheet titles) · 18/600 (headers) · 15/600 (row titles) · 13–14/500-600 (buttons, chips) · 12 (meta) · 11 (captions, provenance).
- **Radii:** 100 pills/circular buttons · 16–20 cards & sheets · 12 buttons/inputs · 4 tiny badges.
- **Shadows:** barely-there (`#1A1918` at 5–12% opacity, y=1–2, blur 6–12). Night alert card gets a red glow (`#D9482F40`, blur 24).
- **Icons:** Lucide outlined throughout. 22 tab bar · 18–20 actions · 14–16 inline.

## Patterns established

- **Freshness is a first-class visual**: status dot + "confirmed 2 h ago by 3 boaters" everywhere a fact can go stale; provenance footer ("Sources: CRT open data · 12 community reports") on every detail sheet.
- **One-tap confirm/report** buttons directly under status — the community loop is never more than one tap deep.
- **Direction-aware alerts** read as sentences: "Stoppage ahead — in your direction · 4.8 mi", always paired with the actionable escape ("Last good mooring before it…" + _Moor before it_).
- **Date-aware planning warnings** in bill-yellow, phrased around _your_ arrival date, with concrete options.
- **Cruise mode is a night theme** — boaters cruise at dusk; dark map, high-contrast cards, red only for the alert.
