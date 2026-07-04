import type { OplNode } from './osm/opl'

/**
 * OSM point-of-interest extraction for the corridor layers. Categories map to
 * the app's layer chips; provenance is always `osm`.
 */

export type PoiCategory =
  'lock-gate' | 'water-point' | 'elsan' | 'winding-hole' | 'pub' | 'drinking-water'

export interface Poi {
  id: number
  category: PoiCategory
  name: string | null
  point: [number, number]
  source: 'osm'
}

function categorize(tags: Record<string, string>): PoiCategory | null {
  switch (tags['waterway']) {
    case 'lock_gate':
      return 'lock-gate'
    case 'water_point':
      return 'water-point'
    case 'sanitary_dump_station':
      return 'elsan'
    case 'turning_point':
      return 'winding-hole'
    default:
      break
  }
  switch (tags['amenity']) {
    case 'pub':
      return 'pub'
    case 'drinking_water':
      return 'drinking-water'
    default:
      return null
  }
}

export function extractPois(nodes: Iterable<OplNode>): Poi[] {
  const pois: Poi[] = []
  for (const node of nodes) {
    const category = categorize(node.tags)
    if (!category) continue
    pois.push({
      id: node.id,
      category,
      name: node.tags['name'] ?? null,
      point: [node.lon, node.lat],
      source: 'osm',
    })
  }
  return pois
}
