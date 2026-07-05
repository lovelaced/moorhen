# Licensing architecture

This project's viability depends on clean data provenance. These rules are load-bearing; CI enforces the machine-readable half via `data/registry/sources.json` + `scripts/check-registry.mjs`.

## The three-store rule

We maintain **three separately-provenanced data stores** and display them as map layers ("Collective Database" under the OSMF community guidelines). They are **never merged into one deduplicated table**:

1. **OSM-derived** (geometry, locks, bridges, pubs, shops) — ODbL 1.0.
2. **Official** (CRT facilities/notices, EA levels, FHRS ratings, OS) — per-dataset licence, tracked in the registry.
3. **Moorhen community database** (status reports, mooring reviews, signal samples) — **ODbL**, with contributor terms that additionally permit upstreaming facts to OSM. Free-text reviews and photos are _content_, not database rows: CC-BY-SA + ToS.

Conflation for display (e.g. a CRT water point and an OSM node shown as one map feature) keeps each source's attributes in separate, labelled fields.

## Hard constraints we accepted knowingly

- **No ads, no paid tiers, ever.** The CRT data licence §3.1.4 excludes any use "for or in connection with... any Commercial Purpose" (explicitly including selling ad space), and Open-Meteo's free tier is non-commercial. The app is donation/grant-funded.
- **Never ship the CRT canal centreline** — its licence-of-record is contradictory (custom non-commercial vs OGL) and OSM geometry is complete and ODbL-clean.
- **Skip INSPIRE-EUL datasets** (CRT Docks, Embankments) — personal, non-commercial, non-redistributable; incompatible with everything we do.
- **Never use tile.openstreetmap.org** in the app (OSMF tile policy forbids app usage patterns); we build and host our own PMTiles.

## Attribution requirements (in-app attribution screen + map credits)

| Source              | Required text                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| OpenStreetMap       | © OpenStreetMap contributors (on-map)                                                                   |
| Canal & River Trust | © The Canal & River Trust copyright and database rights reserved [year]                                 |
| Environment Agency  | "this uses Environment Agency flood and river level data from the real-time data API (Beta)" (verbatim) |
| FSA                 | Contains Food Standards Agency data © Crown copyright                                                   |
| OS OpenData         | Contains OS data © Crown copyright and database right                                                   |
| Open-Meteo          | Weather data by Open-Meteo.com (CC-BY 4.0)                                                              |
| Mapillary           | Imagery © Mapillary contributors, CC BY-SA 4.0                                                          |

## Code licence

GPL-3.0-only. Chosen deliberately (StreetComplete/OsmAnd precedent) so the app and its derivatives stay open.
