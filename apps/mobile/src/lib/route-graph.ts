import {
  DEFAULT_TIMING_PROFILE,
  formatJourneyDuration,
  planJourney,
  type LonLat,
  type WaterwayEdge,
  type WaterwayGraph,
} from '@moorhen/graph'
import { urls } from '../data'

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

export function loadGraph(): Promise<WaterwayGraph> {
  graphPromise ??= fetch(urls.graph)
    .then((response) => {
      if (!response.ok) throw new Error(`graph fetch failed: HTTP ${response.status}`)
      return response.json() as Promise<GraphFile>
    })
    .then((file) => ({
      vertices: new Map(file.vertices.map((v) => [v.id, v])),
      edges: file.edges,
    }))
  return graphPromise
}

export interface PlannedRoute {
  line: LonLat[]
  distanceM: number
  narrowLocks: number
  broadLocks: number
  durationLabel: string
  cruisingDays: number
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
  }
}
