# Offline map tiles

Two artifacts, both PMTiles (single files, HTTP range-request friendly, MapLibre-native):

1. **Basemap** — extracted from [Protomaps' daily planet build](https://build.protomaps.com) with `pmtiles extract --region=corridor.geojson`. No tile rendering on our side at all; the corridor polygon (grid cells around the navigable network, built by the ETL) clips the download to where boats can actually go.
2. **`overlay.pmtiles`** — our own layers (waterways with gauge/locks/tunnels, OSM POIs, CRT facilities) rendered by tippecanoe from the GeoJSON artifacts. Drawn on top of any basemap. Uncompressed tiles (`--no-tile-compression`) so `pmtiles://file://` range reads stay cheap on device.

## Measured (2026-07-04, Northamptonshire extract, Protomaps 2026-07-03 build)

| Metric                                              | Value                                                  |
| --------------------------------------------------- | ------------------------------------------------------ |
| Navigable network in extract                        | 378 km (231 edges, canals + Nene/Welland/Gt Ouse/Avon) |
| Corridor polygon                                    | 22 rectangles (0.05° cells, 1-cell buffer)             |
| Corridor basemap (default maxzoom 15)               | **46 MB**, 10,280 tiles, ~80 s remote extract          |
| Overlay tiles (incl. national CRT facilities layer) | ~1 MB                                                  |
| Per-km basemap cost                                 | ~120 KB/km (dominated by town tiles, not waterway km)  |

**GB measured (2026-07-04):** the real navigable network is **10,383 km**
(4,666 edges; boat-tagged tidal rivers doubled the early 5,000 km estimate) and
the full corridor basemap at **maxzoom 14 = 896 MB** (90,372 tiles, ~15 min
remote extract). One 896 MB download is too heavy as the only option, so the
plan is **regional offline downloads**: group corridor cells by canal region
(London & South East, Midlands, North West, Yorkshire & North East, Wales &
Borders, Scotland) → each region lands in the 100–250 MB range, which is the
Organic-Maps-style UX boaters already know. Full-GB stays available for the
completists. The 9.6 MB national overlay (our data) always ships whole.

## Rivers are filtered to navigable

`waterway=river` in OSM includes tens of thousands of km of unnavigable
rivers and brooks. The graph/corridor keep a river only when it has
`boat|motorboat|ship = yes/designated/permissive` or its name is in the
curated `NAVIGABLE_RIVERS` list (`packages/graph/src/classification.ts`).
Dropping this filter tripled the Northamptonshire "network" with brooks.

## Commands

```sh
# full artifact build incl. corridor + overlay tiles
pnpm etl:build --pbf gb.osm.pbf --out artifacts --tiles

# basemap extract (remote, no planet download; ~date = latest daily build)
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles \
  basemap.pmtiles --region=artifacts/corridor.geojson --maxzoom=14
```

Attribution for the Protomaps basemap: © OpenStreetMap contributors (data),
Protomaps (tiles) — already covered by the in-app attribution screen.
