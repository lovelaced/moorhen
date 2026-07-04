import type { LonLat } from '@moorhen/graph'
import type { OplData, OplNode, OplWay } from './osm/opl'

/**
 * OSM point-of-interest extraction for the corridor layers. Categories map to
 * the app's layer chips (pubs and shops deliberately separate; diesel and
 * laundry first-class — they shape a liveaboard's week). POIs come from nodes
 * AND building ways (centroid of available nodes), then get clipped to the
 * canal corridor so the artifact stays lean. Provenance is always `osm`.
 */

export type PoiCategory =
  | 'lock-gate'
  | 'water-point'
  | 'elsan'
  | 'winding-hole'
  | 'pub'
  | 'shop'
  | 'laundry'
  | 'fuel'
  | 'chandlery'
  | 'drinking-water'

export interface Poi {
  id: number
  category: PoiCategory
  name: string | null
  point: [number, number]
  source: 'osm'
}

const SHOP_TYPES = new Set([
  'convenience',
  'supermarket',
  'farm',
  'bakery',
  'butcher',
  'greengrocer',
  'deli',
])

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
    case 'fuel':
      return 'fuel'
    default:
      break
  }
  const shop = tags['shop']
  if (shop) {
    if (SHOP_TYPES.has(shop)) return 'shop'
    if (shop === 'laundry' || shop === 'dry_cleaning') return 'laundry'
    if (shop === 'boat') return 'chandlery'
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

function wayCentroid(way: OplWay, nodes: ReadonlyMap<number, OplNode>): [number, number] | null {
  let lon = 0
  let lat = 0
  let count = 0
  for (const ref of way.nodeRefs) {
    const node = nodes.get(ref)
    if (!node) continue
    lon += node.lon
    lat += node.lat
    count += 1
  }
  return count > 0 ? [lon / count, lat / count] : null
}

export interface ExtractPoisOptions {
  /**
   * Keep only POIs within these grid cells (keys "cx,cy" at cellDeg) — the
   * same cells as the map corridor. Without it, shop/pub filters would pull
   * in every establishment in Britain, canal-adjacent or not.
   */
  corridorCells?: ReadonlySet<string>
  cellDeg?: number
}

export function cellKey(point: readonly [number, number], cellDeg: number): string {
  return `${Math.floor(point[0] / cellDeg)},${Math.floor(point[1] / cellDeg)}`
}

/** Grid cells (plus a 1-cell buffer) touched by any geometry — corridor membership. */
export function corridorCells(
  geometries: Iterable<readonly LonLat[]>,
  cellDeg: number,
): Set<string> {
  const cells = new Set<string>()
  for (const line of geometries) {
    for (const [lon, lat] of line) {
      const cx = Math.floor(lon / cellDeg)
      const cy = Math.floor(lat / cellDeg)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          cells.add(`${cx + dx},${cy + dy}`)
        }
      }
    }
  }
  return cells
}

export function extractPois(data: OplData, options: ExtractPoisOptions = {}): Poi[] {
  const cellDeg = options.cellDeg ?? 0.05
  const inCorridor = (point: [number, number]) =>
    !options.corridorCells || options.corridorCells.has(cellKey(point, cellDeg))

  const pois: Poi[] = []
  for (const node of data.nodes.values()) {
    const category = categorize(node.tags)
    if (!category) continue
    const point: [number, number] = [node.lon, node.lat]
    if (!inCorridor(point)) continue
    pois.push({ id: node.id, category, name: node.tags['name'] ?? null, point, source: 'osm' })
  }
  for (const way of data.ways) {
    const category = categorize(way.tags)
    if (!category) continue
    const point = wayCentroid(way, data.nodes)
    if (!point || !inCorridor(point)) continue
    pois.push({ id: way.id, category, name: way.tags['name'] ?? null, point, source: 'osm' })
  }
  return pois
}
