import { buildChainage, projectOntoChainage, type LonLat } from '@moorhen/graph'
import { getFacilities, getMoorings, getPois } from './artifacts'

/**
 * Services along a planned route, ordered by distance along the journey.
 * Tighter than the map layers on purpose: en-route errands only earn a stop
 * if they're within a ~10 minute walk (800 m) of the water.
 */

export const ROUTE_STOP_MAX_OFFSET_M = 800

export interface RouteStop {
  name: string
  category: string
  /** Marker badge / icon key. */
  icon: string
  point: [number, number]
  /** Metres along the route. */
  chainageM: number
  /** Metres off the route (crow-flies). */
  offsetM: number
}

const POI_STOPS: Record<string, { label: string; icon: string }> = {
  'water-point': { label: 'Water point', icon: 'water' },
  elsan: { label: 'Elsan', icon: 'elsan' },
  pub: { label: 'Pub', icon: 'pub' },
  shop: { label: 'Shop', icon: 'shop' },
  laundry: { label: 'Laundry', icon: 'laundry' },
  fuel: { label: 'Boat fuel', icon: 'fuel' },
  chandlery: { label: 'Chandlery', icon: 'chandlery' },
  station: { label: 'Railway station', icon: 'station' },
}

const CELL_DEG = 0.02

function cellOf(lon: number, lat: number): string {
  return `${Math.floor(lon / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`
}

function corridorCells(line: readonly LonLat[]): Set<string> {
  const cells = new Set<string>()
  for (let i = 0; i < line.length; i += 2) {
    const [lon, lat] = line[i]!
    const cx = Math.floor(lon / CELL_DEG)
    const cy = Math.floor(lat / CELL_DEG)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        cells.add(`${cx + dx},${cy + dy}`)
      }
    }
  }
  return cells
}

function midpointOf(geometry: GeoJSON.Geometry): [number, number] | null {
  if (geometry.type === 'Point') return geometry.coordinates as [number, number]
  if (geometry.type === 'LineString') {
    const line = geometry.coordinates as [number, number][]
    return line[Math.floor(line.length / 2)] ?? null
  }
  return null
}

export async function findRouteStops(
  routeLine: readonly LonLat[],
  maxOffsetM = ROUTE_STOP_MAX_OFFSET_M,
): Promise<RouteStop[]> {
  const [pois, facilities, moorings] = await Promise.all([
    getPois(),
    getFacilities(),
    getMoorings(),
  ])

  const cells = corridorCells(routeLine)
  const chain = buildChainage(routeLine as LonLat[])
  const stops: RouteStop[] = []

  const consider = (
    point: [number, number],
    name: string,
    category: string,
    icon: string,
  ): void => {
    if (!cells.has(cellOf(point[0], point[1]))) return
    const projection = projectOntoChainage(chain, point)
    if (projection.offsetMeters > maxOffsetM) return
    stops.push({
      name,
      category,
      icon,
      point,
      chainageM: projection.chainageMeters,
      offsetM: projection.offsetMeters,
    })
  }

  for (const feature of facilities.features) {
    const props = feature.properties ?? {}
    const point = midpointOf(feature.geometry)
    if (!point) continue
    consider(point, (props['name'] as string) || 'CRT facility', 'CRT facility', 'facility')
  }

  for (const feature of pois.features) {
    const props = feature.properties ?? {}
    const stopKind = POI_STOPS[String(props['category'])]
    if (!stopKind) continue
    const walkM = Number(props['walkM'])
    if (Number.isFinite(walkM) && walkM > maxOffsetM) continue
    const point = midpointOf(feature.geometry)
    if (!point) continue
    consider(point, (props['name'] as string) || stopKind.label, stopKind.label, stopKind.icon)
  }

  for (const feature of moorings.features) {
    const props = feature.properties ?? {}
    if (props['access'] !== 'public') continue
    const point = midpointOf(feature.geometry)
    if (!point) continue
    consider(point, (props['name'] as string) || 'Visitor mooring', 'Mooring', 'mooring')
  }

  stops.sort((a, b) => a.chainageM - b.chainageM)
  return dedupeStops(stops)
}

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function pointDistanceM(a: readonly [number, number], b: readonly [number, number]): number {
  const dLat = (a[1] - b[1]) * 111_320
  const dLon = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/**
 * Cross-source dedupe: a CRT water point and its OSM twin are one stop.
 * Same spot (<40 m) in the same category is a duplicate; so is the same
 * name within 200 m. First occurrence wins — CRT facilities are pushed
 * first because their records are richer.
 */
function dedupeStops(stops: RouteStop[]): RouteStop[] {
  const kept: RouteStop[] = []
  for (const stop of stops) {
    const name = normalizeName(stop.name)
    const duplicate = kept.some((existing) => {
      if (Math.abs(existing.chainageM - stop.chainageM) > 250) return false
      const distance = pointDistanceM(existing.point, stop.point)
      if (existing.category === stop.category && distance < 40) return true
      return name.length > 0 && normalizeName(existing.name) === name && distance < 200
    })
    if (!duplicate) kept.push(stop)
  }
  return kept
}
