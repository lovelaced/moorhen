/**
 * Travel-direction detection for boats.
 *
 * GPS course and compass bearings are unreliable below ~2 m/s, and a
 * narrowboat cruises at 1.3–1.8 m/s — so direction is inferred from the sign
 * of chainage progression over a time window, with hysteresis so GPS jitter
 * and lock stops don't flip it.
 */

export type Direction = 1 | -1 | 0

export interface DirectionSample {
  /** Metres along the current route/edge (from projectOntoChainage). */
  chainageMeters: number
  /** Caller-supplied clock (GPS fix time). */
  timestampMs: number
}

export interface DirectionTrackerOptions {
  /** Window over which progression is measured. Default 60 s. */
  windowMs?: number
  /** Minimum |Δchainage| within the window before declaring/flipping direction. Default 40 m. */
  hysteresisMeters?: number
}

export interface DirectionTracker {
  readonly direction: Direction
  /** Feed a fix; returns the (possibly updated) direction. Out-of-order fixes are ignored. */
  update(sample: DirectionSample): Direction
  /** Forget history (e.g. after a junction turn or route change). */
  reset(): void
}

export function createDirectionTracker(options: DirectionTrackerOptions = {}): DirectionTracker {
  const windowMs = options.windowMs ?? 60_000
  const hysteresisMeters = options.hysteresisMeters ?? 40
  let samples: DirectionSample[] = []
  let direction: Direction = 0

  return {
    get direction() {
      return direction
    },
    update(sample: DirectionSample): Direction {
      const last = samples[samples.length - 1]
      if (last && sample.timestampMs <= last.timestampMs) {
        return direction
      }
      samples.push(sample)
      const cutoff = sample.timestampMs - windowMs
      // keep one sample at/before the cutoff so the window always spans windowMs
      let firstInWindow = 0
      while (
        firstInWindow + 1 < samples.length &&
        samples[firstInWindow + 1]!.timestampMs <= cutoff
      ) {
        firstInWindow++
      }
      samples = samples.slice(firstInWindow)
      const delta = sample.chainageMeters - samples[0]!.chainageMeters
      if (Math.abs(delta) >= hysteresisMeters) {
        direction = delta > 0 ? 1 : -1
      }
      return direction
    },
    reset() {
      samples = []
      direction = 0
    },
  }
}
