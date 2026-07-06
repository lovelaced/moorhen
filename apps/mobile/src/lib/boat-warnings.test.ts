import { describe, expect, it } from 'vitest'
import { boatWarnings } from './boat-warnings'

describe('boatWarnings', () => {
  it('narrowboat fits everywhere', () => {
    expect(boatWarnings({ lengthFt: 57, beamFt: 6.8 }, 30, 20)).toEqual([])
  })
  it('widebeam warned on narrow locks only', () => {
    const warnings = boatWarnings({ lengthFt: 60, beamFt: 10 }, 5, 20)
    expect(warnings).toHaveLength(2) // beam + length vs narrow
    expect(warnings[0]).toContain("won't fit the 5 narrow locks")
    expect(boatWarnings({ lengthFt: 60, beamFt: 10 }, 0, 20)).toEqual([])
  })
  it('over-length warned on broad locks', () => {
    // boats over 72 ft can't be configured (clamped), but the check guards
    expect(boatWarnings({ lengthFt: 73, beamFt: 10 }, 0, 3)).toHaveLength(1)
  })
})
