import { Directory, File, Paths } from 'expo-file-system'
import { getLocks, getMoorings, getPois } from './artifacts'

/**
 * Named places on the network — one in-memory index shared by search and
 * the planner's "ends near X" lookups.
 */

export interface PlaceEntry {
  name: string
  kind: string
  /** Nearest waterway name — disambiguates search results. */
  waterway?: string
  point: [number, number]
}

const POI_KINDS: Record<string, string> = {
  junction: 'Junction',
  'winding-hole': 'Winding hole',
  pub: 'Pub',
  shop: 'Shop',
  station: 'Railway station',
  laundry: 'Laundry',
  'water-point': 'Water point',
  fuel: 'Place',
  chandlery: 'Place',
  elsan: 'Place',
}

let indexPromise: Promise<PlaceEntry[]> | null = null

const CACHE_STALE_MS = 24 * 60 * 60 * 1000

function cacheFile(): File {
  const dir = new Directory(Paths.cache, 'index')
  if (!dir.exists) dir.create({ intermediates: true })
  return new File(dir, 'places-index-v1.json')
}

async function buildIndex(): Promise<PlaceEntry[]> {
  const entries: PlaceEntry[] = []
  const [locks, pois, moorings] = await Promise.all([getLocks(), getPois(), getMoorings()])
  for (const f of (locks as GeoJSON.FeatureCollection).features) {
    const name = f.properties?.['name'] as string | null
    const waterway = f.properties?.['waterway'] as string | null
    if (!name) continue
    entries.push({
      name: waterway ? `${name} (${waterway})` : name,
      kind: 'Lock',
      point: (f.geometry as GeoJSON.Point).coordinates as [number, number],
    })
  }
  for (const f of (pois as GeoJSON.FeatureCollection).features) {
    const name = f.properties?.['name'] as string | null
    if (!name) continue
    const kind = POI_KINDS[String(f.properties?.['category'])]
    if (!kind) continue
    const waterway = f.properties?.['waterway'] as string | undefined
    entries.push({
      name,
      kind,
      ...(waterway ? { waterway } : {}),
      point: (f.geometry as GeoJSON.Point).coordinates as [number, number],
    })
  }
  for (const f of (moorings as GeoJSON.FeatureCollection).features) {
    const name = f.properties?.['name'] as string | null
    if (!name) continue
    const line = (f.geometry as GeoJSON.LineString).coordinates as [number, number][]
    entries.push({ name, kind: 'Mooring', point: line[Math.floor(line.length / 2)]! })
  }
  return entries
}

/**
 * First launch used to stare at "Loading the network…" while ~20 MB of
 * artifacts downloaded. The built index is persisted to a cache file, so
 * every later cold start reads locally in milliseconds; a background rebuild
 * refreshes it when it's more than a day old.
 */
export function loadPlacesIndex(): Promise<PlaceEntry[]> {
  indexPromise ??= (async () => {
    let file: File | null = null
    try {
      file = cacheFile()
      if (file.exists) {
        const entries = (await file.json()) as PlaceEntry[]
        if (Array.isArray(entries) && entries.length > 0) {
          const ageMs = Date.now() - (file.modificationTime ?? 0)
          if (ageMs > CACHE_STALE_MS) {
            void buildIndex()
              .then((fresh) => {
                cacheFile().write(JSON.stringify(fresh))
                indexPromise = Promise.resolve(fresh)
              })
              .catch(() => {})
          }
          return entries
        }
      }
    } catch {
      // fall through to a network build
    }
    const entries = await buildIndex()
    try {
      ;(file ?? cacheFile()).write(JSON.stringify(entries))
    } catch {
      // cache write is best-effort
    }
    return entries
  })()
  indexPromise.catch(() => {
    indexPromise = null
  })
  return indexPromise
}

function distSq(a: [number, number], b: [number, number]): number {
  const dLat = a[1] - b[1]
  const dLon = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180)
  return dLat * dLat + dLon * dLon
}

/** Nearest named place to a point — how boaters name "where day 2 ends". */
export function nearestNamed(
  entries: PlaceEntry[],
  point: [number, number],
  kinds?: ReadonlySet<string>,
): PlaceEntry | null {
  let best: PlaceEntry | null = null
  let bestD = Infinity
  for (const entry of entries) {
    if (kinds && !kinds.has(entry.kind)) continue
    const d = distSq(entry.point, point)
    if (d < bestD) {
      bestD = d
      best = entry
    }
  }
  return best
}

/** Navigation waypoints — what a boater calls a spot on the water. */
export const WAYPOINT_KINDS: ReadonlySet<string> = new Set(['Lock', 'Junction', 'Mooring'])

const M_PER_DEG = 111_320

/** Prefer a lock/junction/mooring name when one is close; else any named place. */
export function bestFrontierName(
  entries: PlaceEntry[],
  point: [number, number],
): PlaceEntry | null {
  const waypoint = nearestNamed(entries, point, WAYPOINT_KINDS)
  if (waypoint && Math.sqrt(distSq(waypoint.point, point)) * M_PER_DEG < 2000) return waypoint
  return nearestNamed(entries, point)
}
