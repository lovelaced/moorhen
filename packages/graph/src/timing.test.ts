import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIMING_PROFILE,
  edgeTraversalSeconds,
  effectiveSpeedMps,
  estimateJourney,
  formatJourneyDuration,
  type TimingEdge,
} from './timing'

const MILE = 1609.344

describe('effectiveSpeedMps', () => {
  it('applies the section speed factor', () => {
    const clear: TimingEdge = { lengthM: 1000, waterwayClass: 'narrow-canal' }
    const shallow: TimingEdge = { ...clear, speedFactor: 0.7 }
    expect(effectiveSpeedMps(shallow, 1)).toBeCloseTo(effectiveSpeedMps(clear, 1) * 0.7, 5)
  })

  it('is direction-dependent when there is current (the Llangollen problem)', () => {
    // Llangollen-ish: narrow, shallow, and flowing against you on the way up
    const edge: TimingEdge = {
      lengthM: 1000,
      waterwayClass: 'narrow-canal',
      speedFactor: 0.75,
      currentMps: -0.25, // flow runs toward decreasing chainage (down from the Dee feeder)
    }
    const up = effectiveSpeedMps(edge, 1)
    const down = effectiveSpeedMps(edge, -1)
    expect(up).toBeLessThan(down)
    expect(down - up).toBeCloseTo(0.5, 5)
  })

  it('never drops below the floor or exceeds the cap', () => {
    const crawling: TimingEdge = {
      lengthM: 1000,
      waterwayClass: 'narrow-canal',
      speedFactor: 0.1,
      currentMps: -2,
    }
    expect(effectiveSpeedMps(crawling, 1)).toBe(DEFAULT_TIMING_PROFILE.minSpeedMps)
    const racing: TimingEdge = { lengthM: 1000, waterwayClass: 'tidal-river', currentMps: 3 }
    expect(effectiveSpeedMps(racing, 1)).toBe(DEFAULT_TIMING_PROFILE.maxSpeedMps)
  })
})

describe('edgeTraversalSeconds', () => {
  it('matches the lock-miles folk formula within tolerance on a classic leg', () => {
    // 10 miles + 10 narrow locks ≈ 20 lock-miles ≈ 5–6.5 h by the ÷3–4 rule
    const edge: TimingEdge = {
      lengthM: 10 * MILE,
      waterwayClass: 'narrow-canal',
      narrowLocks: 10,
    }
    const hours = edgeTraversalSeconds(edge, 1) / 3600
    expect(hours).toBeGreaterThan(5)
    expect(hours).toBeLessThan(6.5)
  })

  it('charges flight locks at the cheaper rate', () => {
    const solo: TimingEdge = { lengthM: 1000, waterwayClass: 'narrow-canal', narrowLocks: 10 }
    const flight: TimingEdge = { lengthM: 1000, waterwayClass: 'narrow-canal', flightLocks: 10 }
    expect(edgeTraversalSeconds(flight, 1)).toBeLessThan(edgeTraversalSeconds(solo, 1))
    const savedMinutes = (edgeTraversalSeconds(solo, 1) - edgeTraversalSeconds(flight, 1)) / 60
    expect(savedMinutes).toBeCloseTo(
      10 *
        (DEFAULT_TIMING_PROFILE.minutesPerNarrowLock - DEFAULT_TIMING_PROFILE.minutesPerFlightLock),
      5,
    )
  })

  it('traverses tunnel metres at tunnel speed', () => {
    const open: TimingEdge = { lengthM: 3000, waterwayClass: 'narrow-canal' }
    const tunnelled: TimingEdge = { ...open, tunnelM: 2500 } // Harecastle-ish
    expect(edgeTraversalSeconds(tunnelled, 1)).toBeGreaterThan(edgeTraversalSeconds(open, 1))
  })

  it('adds movable bridge time', () => {
    const noBridges: TimingEdge = { lengthM: 5000, waterwayClass: 'broad-canal' }
    const bridges: TimingEdge = { ...noBridges, movableBridges: 4 }
    expect(
      (edgeTraversalSeconds(bridges, 1) - edgeTraversalSeconds(noBridges, 1)) / 60,
    ).toBeCloseTo(4 * DEFAULT_TIMING_PROFILE.minutesPerMovableBridge, 5)
  })
})

describe('estimateJourney', () => {
  // A recognisable benchmark: Braunston → Birmingham (Grand Union main line),
  // ~37 miles with ~35 locks — guides quote "two long days", i.e. ~18–20 boating
  // hours. Assert hours (what guides quote), not 7-h cruising days.
  it('estimates the Braunston→Birmingham benchmark at ~18-22 boating hours', () => {
    const legs = [
      {
        edge: {
          lengthM: 37 * MILE,
          waterwayClass: 'broad-canal',
          broadLocks: 23,
          flightLocks: 12,
        } satisfies TimingEdge,
        direction: 1 as const,
      },
    ]
    const estimate = estimateJourney(legs)
    expect(estimate.lockCount).toBe(35)
    const hours = estimate.totalSeconds / 3600
    expect(hours).toBeGreaterThan(17)
    expect(hours).toBeLessThan(22)
    // at the default 7 gentler hours/day that's a 3-day cruise
    expect(Math.ceil(estimate.cruisingDays)).toBe(3)
  })

  it('breaks the total into cruising, lock, and bridge time', () => {
    const legs = [
      {
        edge: {
          lengthM: 2 * MILE,
          waterwayClass: 'narrow-canal',
          narrowLocks: 2,
          movableBridges: 1,
        } satisfies TimingEdge,
        direction: 1 as const,
      },
    ]
    const e = estimateJourney(legs)
    expect(e.totalSeconds).toBeCloseTo(e.cruisingSeconds + e.lockSeconds + e.bridgeSeconds, 5)
    expect(e.lockSeconds).toBe(2 * DEFAULT_TIMING_PROFILE.minutesPerNarrowLock * 60)
    expect(e.bridgeSeconds).toBe(DEFAULT_TIMING_PROFILE.minutesPerMovableBridge * 60)
  })

  it('a Llangollen out-and-back is slower on the way up', () => {
    const edge: TimingEdge = {
      lengthM: 10 * MILE,
      waterwayClass: 'narrow-canal',
      speedFactor: 0.75,
      currentMps: -0.25,
    }
    const up = estimateJourney([{ edge, direction: 1 }])
    const down = estimateJourney([{ edge, direction: -1 }])
    expect(up.totalSeconds).toBeGreaterThan(down.totalSeconds * 1.2)
  })
})

describe('formatJourneyDuration', () => {
  it('formats sub-day journeys in hours and minutes (rounded to 5)', () => {
    expect(formatJourneyDuration(6 * 3600 + 42 * 60)).toBe('6 h 40 min')
    expect(formatJourneyDuration(35 * 60)).toBe('35 min')
    expect(formatJourneyDuration(2 * 3600)).toBe('2 h')
  })

  it('formats multi-day journeys in cruising days', () => {
    const day = DEFAULT_TIMING_PROFILE.cruisingHoursPerDay * 3600
    expect(formatJourneyDuration(2 * day)).toBe('2 days')
    expect(formatJourneyDuration(day + 3 * 3600)).toBe('1 day 3 h')
  })
})
