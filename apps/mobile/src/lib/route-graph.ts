import {
  edgeToTimingEdge,
  estimateJourney,
  formatJourneyDuration,
  shortestRoute,
  type LonLat,
  type WaterwayEdge,
  type WaterwayGraph,
} from '@moorhen/graph'
import { urls } from '../data'

/**
 * On-device routing over the published waterway graph. The graph is fetched
 * once per session (~7 MB, cached in memory); Dijkstra and the timing model
 * are the same code the ETL's golden tests exercise.
 *
 * v1 snapping: routes run between the nearest end-vertices of the nearest
 * edges — worst case that's half an edge off, which reads fine at journey
 * scale. Mid-edge splitting comes with the routing polish pass.
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

const M_PER_DEG_LAT = 111_320

function fastDistanceM(a: LonLat, b: LonLat): number {
  const dLat = (a[1] - b[1]) * M_PER_DEG_LAT
  const dLon = (a[0] - b[0]) * M_PER_DEG_LAT * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/** Nearest graph vertex to a tapped point, via a coarse edge-geometry scan. */
export function nearestVertex(
  graph: WaterwayGraph,
  point: LonLat,
): { vertexId: number; distanceM: number } | null {
  let bestEdge: WaterwayEdge | null = null
  let bestD = Infinity
  for (const edge of graph.edges) {
    // stride the geometry — canal vertices are dense, precision comes later
    for (let i = 0; i < edge.geometry.length; i += 4) {
      const d = fastDistanceM(edge.geometry[i]!, point)
      if (d < bestD) {
        bestD = d
        bestEdge = edge
      }
    }
  }
  if (!bestEdge || bestD > 5_000) return null
  const start = bestEdge.geometry[0]!
  const end = bestEdge.geometry[bestEdge.geometry.length - 1]!
  const vertexId =
    fastDistanceM(start, point) <= fastDistanceM(end, point) ? bestEdge.a : bestEdge.b
  return { vertexId, distanceM: bestD }
}

export interface PlannedRoute {
  line: LonLat[]
  distanceM: number
  narrowLocks: number
  broadLocks: number
  durationLabel: string
  cruisingDays: number
}

export function planRoute(graph: WaterwayGraph, from: LonLat, to: LonLat): PlannedRoute | null {
  const start = nearestVertex(graph, from)
  const end = nearestVertex(graph, to)
  if (!start || !end || start.vertexId === end.vertexId) return null
  const route = shortestRoute(graph, start.vertexId, end.vertexId)
  if (!route || route.legs.length === 0) return null

  const line: LonLat[] = []
  let narrowLocks = 0
  let broadLocks = 0
  for (const leg of route.legs) {
    const geometry = leg.forward ? leg.edge.geometry : [...leg.edge.geometry].reverse()
    line.push(...(line.length > 0 ? geometry.slice(1) : geometry))
    narrowLocks += leg.edge.narrowLocks
    broadLocks += leg.edge.broadLocks
  }
  const estimate = estimateJourney(
    route.legs.map((leg) => ({ edge: edgeToTimingEdge(leg.edge), direction: 1 as const })),
  )
  return {
    line,
    distanceM: route.totalLengthM,
    narrowLocks,
    broadLocks,
    durationLabel: formatJourneyDuration(estimate.totalSeconds),
    cruisingDays: estimate.cruisingDays,
  }
}
