import { buildChainage, projectOntoChainage, type LonLat } from './chainage'
import type { EdgeLock, WaterwayEdge, WaterwayGraph } from './builder'
import { shortestRoute } from './route'
import {
  DEFAULT_TIMING_PROFILE,
  edgeToTimingEdge,
  estimateJourney,
  type TimingProfile,
} from './timing'

/**
 * Point-to-point journey planning with exact snapping: start and end project
 * onto the nearest edge, which is split at the projection into partial edges
 * joined by virtual vertices. Because edges carry per-chamber chainage,
 * split edges count exactly the locks they contain — no apportioning.
 */

const M_PER_DEG_LAT = 111_320

function fastDistanceM(a: LonLat, b: LonLat): number {
  const dLat = (a[1] - b[1]) * M_PER_DEG_LAT
  const dLon = (a[0] - b[0]) * M_PER_DEG_LAT * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

export interface NetworkSnap {
  edge: WaterwayEdge
  /** Metres along the edge geometry (a → b). */
  chainageM: number
  point: LonLat
  distanceM: number
  segmentIndex: number
}

/** Exact nearest point on the network: coarse edge scan, then precise projection. */
export function snapToNetwork(
  graph: WaterwayGraph,
  point: LonLat,
  maxDistanceM = 5_000,
): NetworkSnap | null {
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
  if (!bestEdge || bestD > maxDistanceM) return null
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

function locksBetween(edge: WaterwayEdge, fromM: number, toM: number): EdgeLock[] {
  return (edge.locks ?? []).filter((lock) => lock.chainageM >= fromM && lock.chainageM <= toM)
}

function lockCounts(locks: EdgeLock[]): { narrowLocks: number; broadLocks: number } {
  const narrowLocks = locks.filter((lock) => lock.gauge === 'narrow').length
  return { narrowLocks, broadLocks: locks.length - narrowLocks }
}

/** Geometry of the edge up to / after a snap point, oriented outward from the snap. */
function sliceGeometry(snap: NetworkSnap, towards: 'a' | 'b'): LonLat[] {
  const geometry = snap.edge.geometry
  if (towards === 'a') {
    const head = geometry.slice(0, snap.segmentIndex + 1)
    return [snap.point, ...head.reverse()]
  }
  const tail = geometry.slice(snap.segmentIndex + 1)
  return [snap.point, ...tail]
}

function partialEdge(snap: NetworkSnap, towards: 'a' | 'b', virtualId: number): WaterwayEdge {
  const total = Math.max(snap.edge.lengthM, 1)
  const lengthM = towards === 'a' ? snap.chainageM : snap.edge.lengthM - snap.chainageM
  const fraction = Math.min(1, Math.max(0, lengthM / total))
  const locks = (
    towards === 'a'
      ? locksBetween(snap.edge, 0, snap.chainageM)
      : locksBetween(snap.edge, snap.chainageM, snap.edge.lengthM)
  ).map((lock) => ({
    chainageM: towards === 'a' ? snap.chainageM - lock.chainageM : lock.chainageM - snap.chainageM,
    gauge: lock.gauge,
  }))
  return {
    id: `${snap.edge.id}-${towards}${virtualId}`,
    a: virtualId,
    b: towards === 'a' ? snap.edge.a : snap.edge.b,
    name: snap.edge.name,
    navigableClass: snap.edge.navigableClass,
    lengthM,
    ...lockCounts(locks),
    tunnelM: snap.edge.tunnelM * fraction,
    locks,
    geometry: sliceGeometry(snap, towards),
  }
}

export interface PlannedJourney {
  line: LonLat[]
  distanceM: number
  narrowLocks: number
  broadLocks: number
  totalSeconds: number
  cruisingDays: number
}

function summarize(
  legs: Array<{ edge: WaterwayEdge; forward: boolean }>,
  profile: TimingProfile,
): PlannedJourney {
  const line: LonLat[] = []
  let narrowLocks = 0
  let broadLocks = 0
  let distanceM = 0
  for (const { edge, forward } of legs) {
    const geometry = forward ? edge.geometry : [...edge.geometry].reverse()
    line.push(...(line.length > 0 ? geometry.slice(1) : geometry))
    narrowLocks += edge.narrowLocks
    broadLocks += edge.broadLocks
    distanceM += edge.lengthM
  }
  const estimate = estimateJourney(
    legs.map(({ edge }) => ({ edge: edgeToTimingEdge(edge), direction: 1 as const })),
    profile,
  )
  return {
    line,
    distanceM,
    narrowLocks,
    broadLocks,
    totalSeconds: estimate.totalSeconds,
    cruisingDays: estimate.cruisingDays,
  }
}

const VIRTUAL_START = -1
const VIRTUAL_END = -2

export function planJourney(
  graph: WaterwayGraph,
  from: LonLat,
  to: LonLat,
  profile: TimingProfile = DEFAULT_TIMING_PROFILE,
): PlannedJourney | null {
  const start = snapToNetwork(graph, from)
  const end = snapToNetwork(graph, to)
  if (!start || !end) return null

  // Both points on the same edge: the route is the slice between them.
  if (start.edge.id === end.edge.id) {
    const [near, far] = start.chainageM <= end.chainageM ? [start, end] : [end, start]
    const geometry = [
      near.point,
      ...near.edge.geometry.slice(near.segmentIndex + 1, far.segmentIndex + 1),
      far.point,
    ]
    const lengthM = far.chainageM - near.chainageM
    const locks = locksBetween(near.edge, near.chainageM, far.chainageM).map((lock) => ({
      chainageM: lock.chainageM - near.chainageM,
      gauge: lock.gauge,
    }))
    const slice: WaterwayEdge = {
      ...near.edge,
      id: `${near.edge.id}-slice`,
      lengthM,
      ...lockCounts(locks),
      tunnelM: near.edge.tunnelM * (lengthM / Math.max(near.edge.lengthM, 1)),
      locks,
      geometry,
    }
    return summarize([{ edge: slice, forward: start.chainageM <= end.chainageM }], profile)
  }

  const augmented: WaterwayGraph = {
    vertices: graph.vertices,
    edges: [
      ...graph.edges,
      partialEdge(start, 'a', VIRTUAL_START),
      partialEdge(start, 'b', VIRTUAL_START),
      partialEdge(end, 'a', VIRTUAL_END),
      partialEdge(end, 'b', VIRTUAL_END),
    ],
  }
  const route = shortestRoute(augmented, VIRTUAL_START, VIRTUAL_END)
  if (!route || route.legs.length === 0) return null

  // Legs touching the virtual vertices are stored outward-from-snap; flip
  // the final leg so its geometry flows towards the destination.
  const legs = route.legs.map((leg) => ({ edge: leg.edge, forward: leg.forward }))
  const last = legs[legs.length - 1]!
  if (last.edge.a === VIRTUAL_END) last.forward = !last.forward
  return summarize(legs, profile)
}
