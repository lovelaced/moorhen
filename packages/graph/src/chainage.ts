/**
 * Linear referencing ("chainage") along canal centrelines.
 *
 * Everything here is pure and runs identically in the app (offline, on-device)
 * and in the ETL. Distances are metres. Coordinates are GeoJSON axis order
 * [longitude, latitude]. Accuracy targets canal scales (metres over tens of
 * kilometres), where a local equirectangular approximation is ample.
 */

export type LonLat = readonly [number, number]

const EARTH_RADIUS_M = 6_371_008.8
const DEG_TO_RAD = Math.PI / 180

export function haversineMeters(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * DEG_TO_RAD
  const dLon = (b[0] - a[0]) * DEG_TO_RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG_TO_RAD) * Math.cos(b[1] * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface PolylineChainage {
  line: LonLat[]
  /** cumulative[i] = metres along the line from its start to vertex i. */
  cumulative: number[]
  totalMeters: number
}

export function buildChainage(line: LonLat[]): PolylineChainage {
  if (line.length < 2) {
    throw new Error(`polyline needs at least 2 vertices, got ${line.length}`)
  }
  const cumulative: number[] = [0]
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineMeters(line[i - 1]!, line[i]!))
  }
  return { line, cumulative, totalMeters: cumulative[cumulative.length - 1]! }
}

export interface Projection {
  /** Metres along the line to the snapped point. */
  chainageMeters: number
  /** Perpendicular offset from the line to the query point. */
  offsetMeters: number
  /** The snapped point on the line. */
  point: LonLat
  segmentIndex: number
}

/** Local equirectangular projection to metres around a reference latitude. */
function toLocalMeters(p: LonLat, refLatRad: number): [number, number] {
  return [
    p[0] * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(refLatRad),
    p[1] * DEG_TO_RAD * EARTH_RADIUS_M,
  ]
}

/**
 * Projects a point (e.g. a GPS fix, or a stoppage location) onto the polyline,
 * returning its chainage and perpendicular offset. O(n) over vertices — canal
 * edge geometries are small, and callers with a route already know which edge
 * they're on.
 */
export function projectOntoChainage(chainage: PolylineChainage, p: LonLat): Projection {
  const refLatRad = p[1] * DEG_TO_RAD
  const [px, py] = toLocalMeters(p, refLatRad)

  let best: Projection | null = null
  for (let i = 0; i < chainage.line.length - 1; i++) {
    const a = chainage.line[i]!
    const b = chainage.line[i + 1]!
    const [ax, ay] = toLocalMeters(a, refLatRad)
    const [bx, by] = toLocalMeters(b, refLatRad)
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    const t =
      lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
    const sx = ax + t * dx
    const sy = ay + t * dy
    const offset = Math.hypot(px - sx, py - sy)
    if (best === null || offset < best.offsetMeters) {
      const segmentLength = chainage.cumulative[i + 1]! - chainage.cumulative[i]!
      best = {
        chainageMeters: chainage.cumulative[i]! + t * segmentLength,
        offsetMeters: offset,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        segmentIndex: i,
      }
    }
  }
  return best! // line has ≥2 vertices, so ≥1 segment
}

/** Returns the point at `s` metres along the line (clamped to [0, total]). */
export function pointAtChainage(chainage: PolylineChainage, s: number): LonLat {
  const { line, cumulative, totalMeters } = chainage
  const target = Math.max(0, Math.min(totalMeters, s))
  // binary search for the segment containing target
  let lo = 0
  let hi = cumulative.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid]! <= target) lo = mid
    else hi = mid
  }
  const segmentLength = cumulative[lo + 1]! - cumulative[lo]!
  const t = segmentLength === 0 ? 0 : (target - cumulative[lo]!) / segmentLength
  const a = line[lo]!
  const b = line[lo + 1]!
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

/**
 * Distance from the boat to a target along the line **in the direction of
 * travel**, or null if the target is behind the boat.
 */
export function distanceAheadMeters(
  boatChainageMeters: number,
  targetChainageMeters: number,
  direction: 1 | -1,
): number | null {
  const d = (targetChainageMeters - boatChainageMeters) * direction
  return d >= 0 ? d : null
}
