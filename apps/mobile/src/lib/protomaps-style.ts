/**
 * Minimal MapLibre style for a Protomaps basemap served from a local PMTiles
 * file — the offline map. Covers the layers a boater needs (land, water,
 * greenspace, roads, place labels) in the warm Moorhen palette. Glyphs come
 * from a CDN: geometry renders fully offline; labels want a connection (font
 * PBFs are a future bundled asset).
 */
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import { day } from '../theme'

const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'

export function protomapsOfflineStyle(pmtilesFileUri: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${pmtilesFileUri}`,
        attribution: '© OpenStreetMap · Protomaps',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': day.land } },
      {
        id: 'earth',
        source: 'protomaps',
        'source-layer': 'earth',
        type: 'fill',
        paint: { 'fill-color': day.land },
      },
      {
        id: 'landuse',
        source: 'protomaps',
        'source-layer': 'landuse',
        type: 'fill',
        filter: [
          'in',
          ['get', 'kind'],
          ['literal', ['park', 'forest', 'wood', 'grass', 'nature_reserve', 'meadow']],
        ],
        paint: { 'fill-color': day.greenspace },
      },
      {
        id: 'water',
        source: 'protomaps',
        'source-layer': 'water',
        type: 'fill',
        paint: { 'fill-color': '#BFD5DE' },
      },
      {
        id: 'roads-minor',
        source: 'protomaps',
        'source-layer': 'roads',
        type: 'line',
        filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'other']]],
        paint: {
          'line-color': '#E7E3DA',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 4],
        },
      },
      {
        id: 'roads-major',
        source: 'protomaps',
        'source-layer': 'roads',
        type: 'line',
        filter: ['in', ['get', 'kind'], ['literal', ['major_road', 'highway', 'medium_road']]],
        paint: {
          'line-color': '#EFC98B',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 16, 6],
        },
      },
      {
        id: 'places',
        source: 'protomaps',
        'source-layer': 'places',
        type: 'symbol',
        filter: ['in', ['get', 'kind'], ['literal', ['city', 'town', 'village', 'locality']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 16],
        },
        paint: {
          'text-color': day.ink2,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.4,
        },
      },
    ],
  }
}
