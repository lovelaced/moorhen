import {
  DEFAULT_TIMING_PROFILE,
  formatJourneyDuration,
  planJourney,
  type JourneyDay,
  type LonLat,
  type WaterwayEdge,
  type WaterwayGraph,
} from '@moorhen/graph'
import { urls } from '../data'
import { offlineDataFile } from './offline'

/**
 * On-device routing over the published waterway graph. The graph is fetched
 * once per session (~8 MB, cached in memory); planning (exact mid-edge
 * snapping, Dijkstra, per-chamber lock counting, timing) lives in
 * @moorhen/graph where the golden tests exercise it.
 */

interface GraphFile {
  vertices: Array<{ id: number; lon: number; lat: number; degree: number }>
  edges: WaterwayEdge[]
}

let graphPromise: Promise<WaterwayGraph> | null = null

async function fetchGraphFile(): Promise<GraphFile> {
  try {
    const response = await fetch(urls.graph)
    if (!response.ok) throw new Error(`graph fetch failed: HTTP ${response.status}`)
    return (await response.json()) as GraphFile
  } catch (error) {
    const local = offlineDataFile('graph.json')
    if (local) return (await local.json()) as GraphFile
    throw error
  }
}

export function loadGraph(): Promise<WaterwayGraph> {
  if (!graphPromise) {
    graphPromise = fetchGraphFile().then((file) => ({
      vertices: new Map(file.vertices.map((v) => [v.id, v])),
      edges: file.edges,
    }))
    graphPromise.catch(() => {
      graphPromise = null
    })
  }
  return graphPromise
}

export interface PlannedRoute {
  line: LonLat[]
  distanceM: number
  narrowLocks: number
  broadLocks: number
  durationLabel: string
  cruisingDays: number
  days: JourneyDay[]
}

export function planRoute(
  graph: WaterwayGraph,
  from: LonLat,
  to: LonLat,
  hoursPerDay = DEFAULT_TIMING_PROFILE.cruisingHoursPerDay,
): PlannedRoute | null {
  const profile = { ...DEFAULT_TIMING_PROFILE, cruisingHoursPerDay: hoursPerDay }
  const journey = planJourney(graph, from, to, profile)
  if (!journey) return null
  return {
    line: journey.line,
    distanceM: journey.distanceM,
    narrowLocks: journey.narrowLocks,
    broadLocks: journey.broadLocks,
    durationLabel: formatJourneyDuration(journey.totalSeconds, profile),
    cruisingDays: journey.cruisingDays,
    days: journey.days,
  }
}
