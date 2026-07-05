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
  | 'junction'
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
  | 'station'

export interface Poi {
  id: number
  category: PoiCategory
  name: string | null
  point: [number, number]
  /** Crow-flies metres to the nearest waterway — the "how far a walk" signal. */
  walkM: number
  /** Name of the nearest waterway — disambiguates search results. */
  waterway?: string
  /** Pubs only: metres to the nearest known mooring, when within ~400 m. */
  mooringM?: number
  /** Pubs only: the pub's own OSM mooring tag (yes / customer / private…). */
  mooring?: string
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
  if (tags['waterway'] === 'junction' && tags['name']) return 'junction'
  if (tags['railway'] === 'station' || tags['railway'] === 'halt') return 'station'
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
  /** Nearest-waterway index; POIs further than maxWalkM are dropped. */
  network?: NetworkIndex
  /** Default 2000 m (~25 min walk) — the app filters tighter (~20 min). */
  maxWalkM?: number
  /** Mooring-geometry index; pubs within 400 m get a mooringM distance. */
  moorings?: NetworkIndex
  /** Labelled waterway index; POIs get the nearest waterway's name. */
  waterwayNames?: LabelledIndex
}

/**
 * Spatial hash of waterway geometry vertices (vertex spacing on UK canals is
 * ~20–50 m, so nearest-vertex ≈ nearest-line well within walking tolerances).
 */
export interface NetworkIndex {
  cells: Map<string, LonLat[]>
  cellDeg: number
}

export function buildNetworkIndex(
  geometries: Iterable<readonly LonLat[]>,
  cellDeg = 0.03,
): NetworkIndex {
  const cells = new Map<string, LonLat[]>()
  for (const line of geometries) {
    for (const point of line) {
      const key = cellKey(point, cellDeg)
      const bucket = cells.get(key)
      if (bucket) bucket.push(point)
      else cells.set(key, [point])
    }
  }
  return { cells, cellDeg }
}

export interface LabelledIndex {
  cells: Map<string, Array<[number, number, string]>>
  cellDeg: number
}

/** Like buildNetworkIndex, but each point carries a label (the edge name). */
export function buildLabelledIndex(
  entries: Iterable<{ geometry: readonly LonLat[]; name: string | null }>,
  cellDeg = 0.03,
): LabelledIndex {
  const cells = new Map<string, Array<[number, number, string]>>()
  for (const entry of entries) {
    if (!entry.name) continue
    for (const point of entry.geometry) {
      const key = cellKey(point, cellDeg)
      const labelled: [number, number, string] = [point[0], point[1], entry.name]
      const bucket = cells.get(key)
      if (bucket) bucket.push(labelled)
      else cells.set(key, [labelled])
    }
  }
  return { cells, cellDeg }
}

export function nearestLabel(
  index: LabelledIndex,
  point: readonly [number, number],
): string | null {
  const cx = Math.floor(point[0] / index.cellDeg)
  const cy = Math.floor(point[1] / index.cellDeg)
  let best: string | null = null
  let bestD = Infinity
  const cosLat = Math.cos((point[1] * Math.PI) / 180)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = index.cells.get(`${cx + dx},${cy + dy}`)
      if (!bucket) continue
      for (const [lon, lat, label] of bucket) {
        const dLat = (lat - point[1]) * EARTH_M_PER_DEG_LAT
        const dLon = (lon - point[0]) * EARTH_M_PER_DEG_LAT * cosLat
        const d = dLat * dLat + dLon * dLon
        if (d < bestD) {
          bestD = d
          best = label
        }
      }
    }
  }
  return best
}

const EARTH_M_PER_DEG_LAT = 111_320

export function distanceToNetworkM(index: NetworkIndex, point: readonly [number, number]): number {
  const cx = Math.floor(point[0] / index.cellDeg)
  const cy = Math.floor(point[1] / index.cellDeg)
  let best = Infinity
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = index.cells.get(`${cx + dx},${cy + dy}`)
      if (!bucket) continue
      for (const vertex of bucket) {
        // equirectangular — ample at walking scales
        const dLat = (vertex[1] - point[1]) * EARTH_M_PER_DEG_LAT
        const dLon =
          (vertex[0] - point[0]) * EARTH_M_PER_DEG_LAT * Math.cos((point[1] * Math.PI) / 180)
        const d = Math.hypot(dLat, dLon)
        if (d < best) best = d
      }
    }
  }
  return best
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
  const maxWalkM = options.maxWalkM ?? 2000
  const walkOf = (point: [number, number]): number | null => {
    if (!options.network) return 0
    const d = distanceToNetworkM(options.network, point)
    return d <= maxWalkM ? Math.round(d) : null
  }
  // pubs cross-referenced against the mooring layer: "can I moor there?"
  const pubExtras = (
    category: PoiCategory,
    tags: Record<string, string>,
    point: [number, number],
  ): Pick<Poi, 'mooringM' | 'mooring'> => {
    if (category !== 'pub') return {}
    const extras: Pick<Poi, 'mooringM' | 'mooring'> = {}
    if (tags['mooring']) extras.mooring = tags['mooring']
    if (options.moorings) {
      const d = distanceToNetworkM(options.moorings, point)
      if (d <= 400) extras.mooringM = Math.round(d)
    }
    return extras
  }

  // Canal junction guard: junction nodes must lie ON a waterway way,
  // otherwise every named road junction near the cut would leak in.
  const waterwayNodeIds = new Set<number>()
  for (const way of data.ways) {
    if (way.tags['waterway']) {
      for (const ref of way.nodeRefs) waterwayNodeIds.add(ref)
    }
  }

  const waterwayOf = (point: [number, number]): Pick<Poi, 'waterway'> => {
    if (!options.waterwayNames) return {}
    const name = nearestLabel(options.waterwayNames, point)
    return name ? { waterway: name } : {}
  }

  const pois: Poi[] = []
  for (const node of data.nodes.values()) {
    let category = categorize(node.tags)
    if (!category && node.tags['junction'] === 'yes' && node.tags['name']) {
      if (waterwayNodeIds.has(node.id)) category = 'junction'
    }
    if (!category) continue
    const point: [number, number] = [node.lon, node.lat]
    const walkM = walkOf(point)
    if (walkM === null) continue
    pois.push({
      id: node.id,
      category,
      name: node.tags['name'] ?? null,
      point,
      walkM,
      ...waterwayOf(point),
      ...pubExtras(category, node.tags, point),
      source: 'osm',
    })
  }
  for (const way of data.ways) {
    const category = categorize(way.tags)
    if (!category) continue
    const point = wayCentroid(way, data.nodes)
    if (!point) continue
    const walkM = walkOf(point)
    if (walkM === null) continue
    pois.push({
      id: way.id,
      category,
      name: way.tags['name'] ?? null,
      point,
      walkM,
      ...waterwayOf(point),
      ...pubExtras(category, way.tags, point),
      source: 'osm',
    })
  }
  return pois
}
