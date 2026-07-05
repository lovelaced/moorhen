/**
 * Journey-time model.
 *
 * The goal is estimates boaters can trust to the quarter-hour: the *shape*
 * of the model captures everything that actually slows a boat down —
 * per-section speed factors (shallow water, heavy moorings), direction-
 * dependent current (the Llangollen problem), lock types, flights, movable
 * bridges, tunnels — and every number lives in a user-tunable profile.
 *
 * Edge factors are populated by the ETL from heuristics (OSM mooring density
 * along the edge, known shallow feeder canals, river flow direction) and are
 * designed to be refined later from users' own logged cruise tracks — real
 * observed section speeds, which no incumbent has.
 */

export type WaterwayClass =
  'narrow-canal' | 'broad-canal' | 'commercial-waterway' | 'river' | 'tidal-river'

export interface TimingEdge {
  lengthM: number
  waterwayClass: WaterwayClass
  /** Locks charged at the solo rate. */
  narrowLocks?: number
  broadLocks?: number
  /** Locks inside a flight, charged at the (cheaper) in-flight rate. */
  flightLocks?: number
  /** Swing/lift bridges that must be operated. */
  movableBridges?: number
  /** Metres of tunnel within the edge (traversed at tunnel speed). */
  tunnelM?: number
  /**
   * 0–1 multiplier on cruise speed for this section: shallow water, heavy
   * online moorings, narrows. E.g. ~0.6–0.75 for the Llangollen narrows,
   * ~0.8 through a long lined-out mooring stretch. Default 1.
   */
  speedFactor?: number
  /**
   * Water current in m/s along the direction of *increasing chainage*.
   * Traversal direction +1 gets `+currentMps` ground speed, direction -1
   * gets `-currentMps`. Rivers and flowing feeders only; 0 for still canals.
   */
  currentMps?: number
}

export interface TimingProfile {
  /** Still-water cruise speed per waterway class, m/s. */
  cruiseSpeedMps: Record<WaterwayClass, number>
  minutesPerNarrowLock: number
  minutesPerBroadLock: number
  /** Locks in a flight go faster (crew stays out, paddles pre-set). */
  minutesPerFlightLock: number
  minutesPerMovableBridge: number
  tunnelSpeedMps: number
  /** Floor on effective speed after factors/current — you can always make *some* way. */
  minSpeedMps: number
  /** Cap on effective speed — the 4 mph limit (and hull speed) still applies downstream. */
  maxSpeedMps: number
  cruisingHoursPerDay: number
}

const MPH = 0.44704

/**
 * Defaults calibrated against real cruises (golden tests pin both):
 * - Broad: Braunston Top Lock → Hatton Bottom Lock = 20 mi 5½ fl, 30 locks,
 *   ~12½ h → ~3.2 mph on broad water and ~12 min per broad lock.
 * - Narrow: Marston Junction → Hartshill (Coventry Canal) = 5.6 mi, no
 *   locks, ~2¼ h logged on the water → ~2.5 mph. Narrow canals run slower
 *   than the boat can: moored boats, blind bridge holes, shallow edges.
 * Every value stays user-tunable.
 */
export const DEFAULT_TIMING_PROFILE: TimingProfile = {
  cruiseSpeedMps: {
    'narrow-canal': 2.5 * MPH,
    'broad-canal': 3.2 * MPH,
    'commercial-waterway': 3.6 * MPH,
    river: 3.6 * MPH,
    'tidal-river': 4.5 * MPH,
  },
  minutesPerNarrowLock: 10,
  minutesPerBroadLock: 12,
  minutesPerFlightLock: 8,
  minutesPerMovableBridge: 5,
  tunnelSpeedMps: 2.0 * MPH,
  minSpeedMps: 1.0 * MPH,
  maxSpeedMps: 4.5 * MPH,
  cruisingHoursPerDay: 7,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Effective over-the-ground cruise speed for an edge in a given direction:
 * class speed × section factor, plus/minus current, clamped to sane bounds.
 */
export function effectiveSpeedMps(
  edge: TimingEdge,
  direction: 1 | -1,
  profile: TimingProfile = DEFAULT_TIMING_PROFILE,
): number {
  const still = profile.cruiseSpeedMps[edge.waterwayClass] * (edge.speedFactor ?? 1)
  const overGround = still + (edge.currentMps ?? 0) * direction
  return clamp(overGround, profile.minSpeedMps, profile.maxSpeedMps)
}

/** Seconds to traverse one edge in the given direction. */
export function edgeTraversalSeconds(
  edge: TimingEdge,
  direction: 1 | -1,
  profile: TimingProfile = DEFAULT_TIMING_PROFILE,
): number {
  const tunnelM = Math.min(edge.tunnelM ?? 0, edge.lengthM)
  const openM = edge.lengthM - tunnelM
  let seconds = openM / effectiveSpeedMps(edge, direction, profile)
  seconds += tunnelM / profile.tunnelSpeedMps
  seconds +=
    60 *
    ((edge.narrowLocks ?? 0) * profile.minutesPerNarrowLock +
      (edge.broadLocks ?? 0) * profile.minutesPerBroadLock +
      (edge.flightLocks ?? 0) * profile.minutesPerFlightLock +
      (edge.movableBridges ?? 0) * profile.minutesPerMovableBridge)
  return seconds
}

export interface JourneyLeg {
  edge: TimingEdge
  direction: 1 | -1
}

export interface JourneyEstimate {
  totalSeconds: number
  cruisingSeconds: number
  lockSeconds: number
  bridgeSeconds: number
  /** Whole cruising days at profile.cruisingHoursPerDay, e.g. 2.4 → "2 days + ~3 h". */
  cruisingDays: number
  lockCount: number
}

export function estimateJourney(
  legs: readonly JourneyLeg[],
  profile: TimingProfile = DEFAULT_TIMING_PROFILE,
): JourneyEstimate {
  let cruisingSeconds = 0
  let lockSeconds = 0
  let bridgeSeconds = 0
  let lockCount = 0
  for (const { edge, direction } of legs) {
    const tunnelM = Math.min(edge.tunnelM ?? 0, edge.lengthM)
    cruisingSeconds += (edge.lengthM - tunnelM) / effectiveSpeedMps(edge, direction, profile)
    cruisingSeconds += tunnelM / profile.tunnelSpeedMps
    const narrow = edge.narrowLocks ?? 0
    const broad = edge.broadLocks ?? 0
    const flight = edge.flightLocks ?? 0
    lockCount += narrow + broad + flight
    lockSeconds +=
      60 *
      (narrow * profile.minutesPerNarrowLock +
        broad * profile.minutesPerBroadLock +
        flight * profile.minutesPerFlightLock)
    bridgeSeconds += 60 * (edge.movableBridges ?? 0) * profile.minutesPerMovableBridge
  }
  const totalSeconds = cruisingSeconds + lockSeconds + bridgeSeconds
  return {
    totalSeconds,
    cruisingSeconds,
    lockSeconds,
    bridgeSeconds,
    cruisingDays: totalSeconds / (profile.cruisingHoursPerDay * 3600),
    lockCount,
  }
}

/** "6 h 40 min", "2 days 3 h" (days = profile cruising days). */
export function formatJourneyDuration(
  totalSeconds: number,
  profile: TimingProfile = DEFAULT_TIMING_PROFILE,
): string {
  const daySeconds = profile.cruisingHoursPerDay * 3600
  if (totalSeconds < daySeconds) {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.round((totalSeconds % 3600) / 60 / 5) * 5
    if (h === 0) return `${m} min`
    return m === 0 ? `${h} h` : `${h} h ${m} min`
  }
  const days = Math.floor(totalSeconds / daySeconds)
  const remainderH = Math.round((totalSeconds - days * daySeconds) / 3600)
  return remainderH === 0
    ? `${days} day${days > 1 ? 's' : ''}`
    : `${days} day${days > 1 ? 's' : ''} ${remainderH} h`
}

import type { WaterwayEdge } from './builder'

/** Adapts a graph edge to the timing model's shape. */
export function edgeToTimingEdge(edge: WaterwayEdge): TimingEdge {
  return {
    lengthM: edge.lengthM,
    waterwayClass: edge.navigableClass,
    narrowLocks: edge.narrowLocks,
    broadLocks: edge.broadLocks,
    tunnelM: edge.tunnelM,
  }
}
