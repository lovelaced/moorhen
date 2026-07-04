import { describe, expect, it } from 'vitest'
import { createDirectionTracker } from './direction'

/** Simulated cruise: emit fixes every `intervalMs`, moving `speedMps` along the chainage. */
function cruise(
  tracker: ReturnType<typeof createDirectionTracker>,
  opts: {
    startS: number
    startT: number
    speedMps: number
    seconds: number
    intervalMs?: number
    jitterM?: number
  },
) {
  const intervalMs = opts.intervalMs ?? 10_000
  let s = opts.startS
  let t = opts.startT
  // deterministic pseudo-jitter (no Math.random in tests)
  let phase = 0
  for (let elapsed = 0; elapsed < opts.seconds * 1000; elapsed += intervalMs) {
    t += intervalMs
    s += opts.speedMps * (intervalMs / 1000)
    phase++
    const jitter = opts.jitterM ? Math.sin(phase * 2.399) * opts.jitterM : 0
    tracker.update({ chainageMeters: s + jitter, timestampMs: t })
  }
  return { s, t }
}

describe('createDirectionTracker', () => {
  it('starts with no direction', () => {
    expect(createDirectionTracker().direction).toBe(0)
  })

  it('detects forward travel at narrowboat speed (1.5 m/s)', () => {
    const tracker = createDirectionTracker()
    cruise(tracker, { startS: 1000, startT: 0, speedMps: 1.5, seconds: 60 })
    expect(tracker.direction).toBe(1)
  })

  it('detects reverse travel', () => {
    const tracker = createDirectionTracker()
    cruise(tracker, { startS: 5000, startT: 0, speedMps: -1.5, seconds: 60 })
    expect(tracker.direction).toBe(-1)
  })

  it('does not flip on GPS jitter while moored', () => {
    const tracker = createDirectionTracker()
    const { s, t } = cruise(tracker, { startS: 1000, startT: 0, speedMps: 1.5, seconds: 120 })
    expect(tracker.direction).toBe(1)
    // moored: stationary with ±15 m jitter for 10 minutes
    cruise(tracker, { startS: s, startT: t, speedMps: 0, seconds: 600, jitterM: 15 })
    expect(tracker.direction).toBe(1)
  })

  it('holds direction through a lock stop, then flips after a genuine reversal', () => {
    const tracker = createDirectionTracker()
    let pos = cruise(tracker, { startS: 1000, startT: 0, speedMps: 1.5, seconds: 120 })
    expect(tracker.direction).toBe(1)
    // 15-minute lock stop
    pos = cruise(tracker, { startS: pos.s, startT: pos.t, speedMps: 0, seconds: 900 })
    expect(tracker.direction).toBe(1)
    // winded (turned around) and heading back: flips only after >40 m of reverse progress
    cruise(tracker, { startS: pos.s, startT: pos.t, speedMps: -1.5, seconds: 60 })
    expect(tracker.direction).toBe(-1)
  })

  it('needs more than the hysteresis distance to declare a direction', () => {
    const tracker = createDirectionTracker({ hysteresisMeters: 40 })
    tracker.update({ chainageMeters: 1000, timestampMs: 0 })
    tracker.update({ chainageMeters: 1030, timestampMs: 30_000 })
    expect(tracker.direction).toBe(0) // only 30 m of progress
    tracker.update({ chainageMeters: 1045, timestampMs: 45_000 })
    expect(tracker.direction).toBe(1) // 45 m within the window
  })

  it('ignores out-of-order fixes', () => {
    const tracker = createDirectionTracker()
    tracker.update({ chainageMeters: 1000, timestampMs: 60_000 })
    tracker.update({ chainageMeters: 900, timestampMs: 30_000 }) // stale fix
    expect(tracker.direction).toBe(0)
  })

  it('reset clears state', () => {
    const tracker = createDirectionTracker()
    cruise(tracker, { startS: 0, startT: 0, speedMps: 2, seconds: 60 })
    expect(tracker.direction).toBe(1)
    tracker.reset()
    expect(tracker.direction).toBe(0)
  })
})
