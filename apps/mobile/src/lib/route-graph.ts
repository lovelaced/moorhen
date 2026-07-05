import {
  buildChainage,
  edgeToTimingEdge,
  estimateJourney,
  formatJourneyDuration,
  projectOntoChainage,
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
 * Start and end snap to the exact nearest point on the network: the nearest
 * edge is split at the projection into partial edges joined by virtual
 * vertices, so distances and times are measured from where you actually are,
 * not the nearest junction. Lock/tunnel totals on split edges are
 * apportioned by length (lock positions within an edge aren't in the data —
 * per-lock chainage is a future artifact refinement).
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

interface Snap {
  edge: WaterwayEdge
  /** Metres along the edge geometry (a → b). */
  chainageM: number
  point: LonLat
  distanceM: number
  segmentIndex: number
}

/** Exact nearest point on the network: coarse edge scan, then precise projection. */
export function snapToNetwork(graph: WaterwayGraph, point: LonLat): Snap | null {
  let bestEdge: WaterwayEdge | null = null
  let bestD = Infinity
  for (const edge of graph.edges) {
    for (let i = 0; i < edge.geometry.length; i += 4) {
      const d = fastDistanceM(edge.geometry[i]!, point)
      if (d < bestD) {
        bestD = d
        bestEdge = edge
      }
    }
  }
  if (!bestEdge || bestD > 5_000) return null
  const chain = buildChainage(bestEdge.geometry)
  const projection = projectOntoChainage(chain, point)
  return {
    edge: bestEdge,
    chainageM: projection.chainageMeters,
    point: projection.point,
    distanceM: projection.offsetMeters,
    segmentIndex: projection.segmentIndex,
  }
}

/** Geometry of the edge up to / after a snap point, oriented outward from the snap. */
function sliceGeometry(snap: Snap, towards: 'a' | 'b'): LonLat[] {
  const geometry = snap.edge.geometry
  if (towards === 'a') {
    const head = geometry.slice(0, snap.segmentIndex + 1)
    return [snap.point, ...head.reverse()]
  }
  const tail = geometry.slice(snap.segmentIndex + 1)
  return [snap.point, ...tail]
}

function partialEdge(
  snap: Snap,
  towards: 'a' | 'b',
  virtualId: number,
  idSuffix: string,
): WaterwayEdge {
  const total = Math.max(snap.edge.lengthM, 1)
  const lengthM = towards === 'a' ? snap.chainageM : snap.edge.lengthM - snap.chainageM
  const fraction = Math.min(1, Math.max(0, lengthM / total))
  return {
    id: `${snap.edge.id}-${idSuffix}`,
    a: virtualId,
    b: towards === 'a' ? snap.edge.a : snap.edge.b,
    name: snap.edge.name,
    navigableClass: snap.edge.navigableClass,
    lengthM,
    narrowLocks: Math.round(snap.edge.narrowLocks * fraction),
    broadLocks: Math.round(snap.edge.broadLocks * fraction),
    tunnelM: snap.edge.tunnelM * fraction,
    geometry: sliceGeometry(snap, towards),
  }
}

export interface PlannedRoute {
  line: LonLat[]
  distanceM: number
  narrowLocks: number
  broadLocks: number
  durationLabel: string
  cruisingDays: number
}

function summarize(edges: Array<{ edge: WaterwayEdge; forward: boolean }>): PlannedRoute {
  const line: LonLat[] = []
  let narrowLocks = 0
  let broadLocks = 0
  let distanceM = 0
  for (const { edge, forward } of edges) {
    const geometry = forward ? edge.geometry : [...edge.geometry].reverse()
    line.push(...(line.length > 0 ? geometry.slice(1) : geometry))
    narrowLocks += edge.narrowLocks
    broadLocks += edge.broadLocks
    distanceM += edge.lengthM
  }
  const estimate = estimateJourney(
    edges.map(({ edge }) => ({ edge: edgeToTimingEdge(edge), direction: 1 as const })),
  )
  return {
    line,
    distanceM,
    narrowLocks,
    broadLocks,
    durationLabel: formatJourneyDuration(estimate.totalSeconds),
    cruisingDays: estimate.cruisingDays,
  }
}

const VIRTUAL_START = -1
const VIRTUAL_END = -2

export function planRoute(graph: WaterwayGraph, from: LonLat, to: LonLat): PlannedRoute | null {
  const start = snapToNetwork(graph, from)
  const end = snapToNetwork(graph, to)
  if (!start || !end) return null

  // Both points on the same edge: the route is just the slice between them.
  if (start.edge.id === end.edge.id) {
    const [near, far] = start.chainageM <= end.chainageM ? [start, end] : [end, start]
    const geometry = [
      near.point,
      ...near.edge.geometry.slice(near.segmentIndex + 1, far.segmentIndex + 1),
      far.point,
    ]
    const lengthM = far.chainageM - near.chainageM
    const fraction = lengthM / Math.max(near.edge.lengthM, 1)
    const slice: WaterwayEdge = {
      ...near.edge,
      id: `${near.edge.id}-slice`,
      lengthM,
      narrowLocks: Math.round(near.edge.narrowLocks * fraction),
      broadLocks: Math.round(near.edge.broadLocks * fraction),
      tunnelM: near.edge.tunnelM * fraction,
      geometry,
    }
    return summarize([{ edge: slice, forward: start.chainageM <= end.chainageM }])
  }

  const augmented: WaterwayGraph = {
    vertices: graph.vertices,
    edges: [
      ...graph.edges,
      partialEdge(start, 'a', VIRTUAL_START, 'sa'),
      partialEdge(start, 'b', VIRTUAL_START, 'sb'),
      partialEdge(end, 'a', VIRTUAL_END, 'ea'),
      partialEdge(end, 'b', VIRTUAL_END, 'eb'),
    ],
  }
  const route = shortestRoute(augmented, VIRTUAL_START, VIRTUAL_END)
  if (!route || route.legs.length === 0) return null

  // Legs touching the virtual vertices are stored outward-from-snap; flip
  // the final leg so its geometry flows towards the destination.
  const legs = route.legs.map((leg) => ({ edge: leg.edge, forward: leg.forward }))
  const last = legs[legs.length - 1]!
  if (last.edge.a === VIRTUAL_END) last.forward = !last.forward
  return summarize(legs)
}
