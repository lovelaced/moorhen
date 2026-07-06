/**
 * Dimension warnings — pure logic, shared by the Plan screen and route card.
 * Documented UK lock gauge limits (approximate, the usual planning numbers).
 */

export interface BoatProfile {
  lengthFt: number
  beamFt: number
}

export const NARROW_BEAM_FT = 6.9
export const NARROW_LENGTH_FT = 57
export const BROAD_LENGTH_FT = 72

/** Dimension warnings for a route with the given lock mix. */
export function boatWarnings(boat: BoatProfile, narrowLocks: number, broadLocks: number): string[] {
  const warnings: string[] = []
  if (narrowLocks > 0 && boat.beamFt > NARROW_BEAM_FT) {
    warnings.push(
      `Your ${boat.beamFt.toFixed(1)} ft beam won't fit the ${narrowLocks} narrow lock${narrowLocks === 1 ? '' : 's'} on this route (~7 ft)`,
    )
  }
  if (narrowLocks > 0 && boat.lengthFt > NARROW_LENGTH_FT) {
    warnings.push(
      `At ${Math.round(boat.lengthFt)} ft you may not fit narrow locks (~${NARROW_LENGTH_FT} ft) — check the waterway's limit`,
    )
  }
  if (broadLocks > 0 && boat.lengthFt > BROAD_LENGTH_FT) {
    warnings.push(
      `At ${Math.round(boat.lengthFt)} ft you exceed the usual broad-lock length (~${BROAD_LENGTH_FT} ft)`,
    )
  }
  return warnings
}
