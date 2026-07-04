/**
 * Data endpoints — data/latest carries the full GB build
 * (10,383 km navigable network), refreshed by the nightly ETL.
 */
export const CDN = 'https://pub-e452fe7a39ba403e8c67f2140e5dd064.r2.dev'

export const DATA_BASE = `${CDN}/data/latest`

export const urls = {
  waterways: `${DATA_BASE}/waterways.geojson`,
  pois: `${DATA_BASE}/osm-pois.geojson`,
  facilities: `${DATA_BASE}/crt-facilities.geojson`,
  notices: `${CDN}/data/latest/notices.json`,
} as const
