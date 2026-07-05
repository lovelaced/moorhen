# Data sources (verified 2026-07-04)

The machine-readable version of this table lives in `data/registry/sources.json` and is CI-enforced. This doc adds the operational detail.

## CRT stoppage notices API (the critical live feed)

```
GET https://canalrivertrust.org.uk/api/stoppage/notices
    ?consult=false&geometry=point&start=YYYY-MM-DD&end=YYYY-MM-DD
    &fields=title,region,waterways,path,typeId,reasonId,programmeId,start,end,state,image
```

- **All five params are required** — any subset → HTTP 500. `geometry=line` is broken (500); `point` returns a GeometryCollection of points per notice.
- Properties: `id` (uuid), `title`, `region`, `waterways` (comma-separated names, values may be truncated), `path` (`/notices/{uuid}` → HTML detail page), `typeId`, `reasonId`, `programmeId`, `start`/`end` (ISO 8601), `state` (`Published` | `Completed` | `Cancelled`), `image`.
- **typeId**: 1 Navigation Closure · 2 Navigation Restriction · 3 Towpath Closure · 4 Advice · 8 Towpath Restriction · 9 Nav+Towpath Closure · 10 Customer Service Facility · 11 Nav Restriction+Towpath Closure. Navigation-blocking = {1, 2, 9, 11}; facility outages = 10.
- **reasonId**: 2 3rd-Party Works · 5 Inspections · 6 Maintenance · 8 Repair · 9 Suspected Vandalism · 10 Vegetation · 12 Information · 13 Event · 14 Boating Incident · 15 Emergency Services Incident · 16 Underwater Obstruction · 17 Vehicle Incident · 18 Low Water Levels · 19 High Water Levels · 20 Pollution Incident.
- No CORS. Undocumented — validate defensively (zod), alert on drift, keep last-good cache. Reference implementation: [Canal-and-River-Trust-Notices-for-Home-Assistant](https://github.com/usersaynoso/Canal-and-River-Trust-Notices-for-Home-Assistant) (MIT).
- Fixture: `packages/etl/test/fixtures/notices-2026-07-04.json` (296 features, live-captured).

## CRT open data (ArcGIS Hub)

- Catalogue (30 datasets, auto-discovery): `https://data-canalrivertrust.opendata.arcgis.com/api/feed/dcat-us/1.1.json`
- FeatureServers: `https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/{Name}/FeatureServer/{layer}` (`f=geojson`, CORS `*`)
- **Licence is per dataset**: OGL v3 (locks, bridges, winding holes, wharves, tunnel portals, weirs, slipways, reservoirs, boat lifts, dry docks, aqueducts, culverts) vs CRT non-commercial (centreline, tunnels — **do not ship centreline**, use OSM) vs INSPIRE EUL (docks, embankments — skip).
- **Facilities & moorings exist only in legacy 2019 layers** (`*_View_Public`): `Customer_Service_Facilities` (1,174 — flags: TOILET, SHOWER, WATER_POINT, ELSAN_POINT, PUMP_OUT_*, WASHING_MACHINE, TUMBLE_DRYER, REFUSE_DISPOSAL, recycling), `Water_Point` (730), `Elsan` (254), `Pump_Out` (112), `Refuse_Disposal` (860), `Mooring_Site` (4,123 — max-stay encoded in description), `Boatyards` (42). Page with `resultOffset` (limit 1–2k/request). Migration risk: watch for new-generation replacements via DCAT.

## OpenStreetMap

- Geofabrik GB extract (~2 GB, daily): waterway geometry & locks near-complete; pubs (38k)/convenience (33k) excellent; moorings/water points/Elsan patchy (~35–50%) — that's the gap our community layer + OSM-upstreaming fills.
- Production access = nightly `osmium tags-filter` over the extract. Public Overpass for dev only (`overpass-api.de` <10k q/day; `overpass.kumi.systems` more generous).
- Graph QA: [waterwaymap.org](https://waterwaymap.org) (osm-lump-ways) surfaces connectivity breaks.

## Environment Agency / GOV.UK

- Flood-monitoring real-time API: `https://environment.data.gov.uk/flood-monitoring/id/{stations|floods|measures|readings}` — levels/flows every 15 min, flood warnings, tide gauges. OGL, no key, CORS `*`, verbatim attribution string required.
- Hydrology API (historic trends): `https://environment.data.gov.uk/hydrology/id/stations`
- Thames reach conditions (red/yellow boards): `https://www.gov.uk/api/content/guidance/river-thames-current-river-conditions` (parse govspeak HTML in `details.body`; updated daily ~11:00). Restrictions: `.../river-thames-restrictions-and-closures`.

## Everything else

| Source              | Key detail                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FSA FHRS            | `api.ratings.food.gov.uk/Establishments?latitude=&longitude=&maxDistanceLimit=` — **header `x-api-version: 2`** + UA; bulk XML for ETL; Scotland = FHIS                                                                    |
| Open-Meteo          | client-callable (CORS `*`), 10k/day, CC-BY, non-commercial                                                                                                                                                                 |
| OS OpenData         | `api.os.uk/downloads/v1/products/{OpenZoomstack,OpenRivers,CodePointOpen}`                                                                                                                                                 |
| Scottish Canals     | shapefiles at `d1hxd0sho1wxko.cloudfront.net/production/general/scottish_canals_*.zip` — **licence unstated, pending outreach**                                                                                            |
| Broads Authority    | moorings FeatureServer (75 pts, rich fields) — **unlicensed DRAFT, pending**; centreline OGL via data.gov.uk                                                                                                               |
| CRT Reservoir Watch | monthly PDF, tokenised link — scrape the page for the latest link                                                                                                                                                          |
| Winter moorings     | page + PDFs ~early Sept; watersidemooring.com has **no API — do not scrape**                                                                                                                                               |
| Ofcom coverage      | 50 m per-operator grid behind Map Your Mobile — verify developer terms                                                                                                                                                     |
| Street imagery      | Google Maps deep link `google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lng` (free, keyless, user-initiated); Mapillary `graph.mapillary.com/images?bbox=` (CC-BY-SA, real towpath coverage); Bing Streetside is dead |

## Polling etiquette

Descriptive User-Agent everywhere (`Moorhen-ETL/x.y (+repo URL)`). CRT notices ≤ every 15 min with caching; EA hourly with cache-friendly patterns; FHRS/OSM/CRT-geodata nightly in ETL; everything client-side goes through our CDN artifacts except Open-Meteo (allowed) and user-initiated deep links.
