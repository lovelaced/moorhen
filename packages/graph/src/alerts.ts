import { buildChainage, projectOntoChainage, type LonLat } from './chainage'
import type { WaterwayGraph } from './builder'
import { planJourney } from './plan'
import { snapToNetwork, type NetworkSnap } from './plan'

/**
 * Direction-aware stoppage detection — the headline cruise feature.
 *
 * A stoppage is "ahead" only if the route to it leaves the boat's current
 * edge in the boat's direction of travel. Direction is +1 (towards the edge's
 * `b` vertex / increasing chainage) or -1; it comes from the chainage-based
 * direction tracker, never GPS bearing (useless at 3 mph).
 */

export interface Stoppage {
  id: string
  point: LonLat
}

export interface StoppageAhead<T extends Stoppage> {
  stoppage: T
  distanceM: number
}

function fastDistanceM(a: LonLat, b: LonLat): number {
  const dLat = (a[1] - b[1]) * 111_320
  const dLon = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/**
 * The nearest stoppage that lies ahead in the direction of travel, by route
 * distance. `direction` is the chainage-progression sign on `snap.edge`.
 * Returns null if nothing blocking is ahead within `maxDistanceM`.
 */
/** How far along the route to sample when reading its initial direction. */
const DIRECTION_PROBE_M = 200

/**
 * Which way the route leaves the current edge: project a point ~200 m along
 * the route onto the edge's chainage and compare to the boat's chainage.
 * Robust where a single geometry step is too short to read. Returns 0 if the
 * route never meaningfully touches the current edge (e.g. it turns off almost
 * immediately at a junction right beside the boat).
 */
function routeLeavingDirection(snap: NetworkSnap, routeLine: readonly LonLat[]): 1 | -1 | 0 {
  const edgeChain = buildChainage(snap.edge.geometry)
  const probe = pointAlong(routeLine, DIRECTION_PROBE_M)
  const projected = projectOntoChainage(edgeChain, probe)
  // Only trust the projection if the probe is genuinely near the current edge.
  if (projected.offsetMeters > 120) return 0
  const delta = projected.chainageMeters - snap.chainageM
  if (Math.abs(delta) < 5) return 0
  return delta > 0 ? 1 : -1
}

function pointAlong(line: readonly LonLat[], distanceM: number): LonLat {
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    const seg = fastDistanceM(line[i - 1]!, line[i]!)
    if (acc + seg >= distanceM) {
      const t = seg === 0 ? 0 : (distanceM - acc) / seg
      return [
        line[i - 1]![0] + t * (line[i]![0] - line[i - 1]![0]),
        line[i - 1]![1] + t * (line[i]![1] - line[i - 1]![1]),
      ]
    }
    acc += seg
  }
  return line[line.length - 1]!
}

export function stoppageAhead<T extends Stoppage>(
  graph: WaterwayGraph,
  snap: NetworkSnap,
  direction: 1 | -1,
  stoppages: readonly T[],
  maxDistanceM = 48_000,
): StoppageAhead<T> | null {
  let best: StoppageAhead<T> | null = null
  for (const stoppage of stoppages) {
    if (fastDistanceM(snap.point, stoppage.point) > maxDistanceM) continue
    const journey = planJourney(graph, snap.point, stoppage.point)
    if (!journey || journey.distanceM > maxDistanceM || journey.line.length < 2) continue
    const leaving = routeLeavingDirection(snap, journey.line)
    if (leaving !== direction) continue
    if (!best || journey.distanceM < best.distanceM) {
      best = { stoppage, distanceM: journey.distanceM }
    }
  }
  return best
}

export { snapToNetwork }
export type { NetworkSnap }
