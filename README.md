# Moorhen 🐦

**The open-source UK canal & mooring companion** — built for people who live on the cut.

Moorhen combines every open data source about the UK waterways (Canal & River Trust, OpenStreetMap, Environment Agency, Food Standards Agency, and more) with a community layer that answers the questions no static guide can:

- _Is that water point actually working today?_
- _Is there a stoppage ahead of me, in the direction I'm heading?_
- _Can my 62-footer actually get into the bank at this mooring — and is there a pub, a shop, and 4G?_
- _Where's my movement log when CRT asks?_

## Principles

1. **Offline-first.** There is no signal on the cut. Maps, search, routing, and logging all work in airplane mode.
2. **Privacy-first.** No public boat positions, ever. Reviews attach to _places_, never to boats. Movement logs are private by default and exportable only by you.
3. **Free forever, ad-free forever.** Partly by conviction, partly by licence: our upstream data terms (CRT, Open-Meteo) prohibit commercial use. Donations and grants fund the ~£110/yr the project actually costs.
4. **Provenance everywhere.** Every datum shows where it came from and how fresh it is. Data stores with different licences are never merged (see `docs/licensing.md`).
5. **Give back.** Durable facts (water points, moorings) get upstreamed to OpenStreetMap; we deep-link to [redacted] and the CRT app rather than replacing what already works (see `docs/[redacted].md`).

## Architecture (one paragraph)

An Expo/React Native app reading **versioned static artifacts** (PMTiles basemap, GeoJSON layers, a bundled waterway graph) built nightly by GitHub Actions from open data and served from Cloudflare R2; a **Cloudflare Worker cron** polls CRT stoppage notices every 15 minutes and fans out FCM push alerts per waterway; a small **Supabase** Postgres holds only what users create (facility status reports, mooring reviews, private logs) behind row-level security with anonymous-first auth. Infrastructure cost: £0/month.

## Repository layout

| Path               | What                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `apps/mobile/`     | Expo app (TypeScript)                                                                           |
| `packages/etl/`    | Data pipelines: OSM, CRT, FHRS fetchers → validated artifacts                                   |
| `packages/graph/`  | Waterway graph, chainage/linear-referencing, routing, direction detection (shared by app + ETL) |
| `packages/schema/` | Zod schemas — the data contract for every published artifact                                    |
| `workers/notices/` | Cloudflare Worker: poll CRT notices, diff, publish, push                                        |
| `supabase/`        | Migrations, RLS policies                                                                        |
| `data/registry/`   | Machine-readable licence registry — CI fails if code ingests an unregistered/disallowed source  |
| `docs/`            | Licensing, data sources, architecture decisions                                                 |

## Development

```sh
pnpm install
pnpm test            # vitest
pnpm typecheck
pnpm lint
pnpm registry:check  # licence gate
```

## Roadmap

- **Phase 1 — Data platform**: nightly ETL → tested, versioned artifacts on a CDN
- **Phase 2 — Map + reference**: offline map, all layers, search, street-level imagery
- **Phase 3 — Routing, cruise mode & alerts**: "stoppage ahead, in your direction" push
- **Phase 4 — Community layer**: live facility status, structured mooring reviews, signal reports
- **Phase 5 — Liveaboard toolkit**: CC movement log + evidence pack, river levels, fuel boats
- **Phase 6 — Ecosystem**: stores, web companion, OSM upstreaming, governance & grants

## Licences

- Code: **GPL-3.0-only**
- Community database (when live): **ODbL**, with contributor terms permitting upstreaming of facts to OSM
- Map data: © OpenStreetMap contributors (ODbL) · © Canal & River Trust · EA/FSA/OS data under OGL v3 — full details in `docs/licensing.md` and `data/registry/sources.json`
