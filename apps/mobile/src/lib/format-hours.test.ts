import { describe, expect, it } from 'vitest'
import { formatOpeningHours, isOpenNow } from './format-hours'

// Wed 6 Jul 2026 ? — use fixed dates: 2026-07-08 is a Wednesday
const wedLunch = new Date('2026-07-08T13:00:00')
const wedEarly = new Date('2026-07-08T08:00:00')
const sunLunch = new Date('2026-07-12T13:00:00')
const satLateNight = new Date('2026-07-12T00:15:00') // Sunday 00:15, Sat trading

describe('formatOpeningHours', () => {
  it('prettifies day ranges and times', () => {
    expect(formatOpeningHours('Mo-Fr 12:00-23:00; Sa,Su 10:00-23:30')).toEqual([
      'Mon–Fri  12:00–23:00',
      'Sat, Sun  10:00–23:30',
    ])
  })
  it('handles 24/7', () => {
    expect(formatOpeningHours('24/7')).toEqual(['Open 24 hours'])
  })
})

describe('isOpenNow', () => {
  it('opens within hours and closes outside them', () => {
    expect(isOpenNow('Mo-Fr 12:00-23:00', wedLunch)).toBe(true)
    expect(isOpenNow('Mo-Fr 12:00-23:00', wedEarly)).toBe(false)
    expect(isOpenNow('Mo-Fr 12:00-23:00', sunLunch)).toBe(false)
  })
  it('handles multiple rules and day lists', () => {
    expect(isOpenNow('Mo-Fr 12:00-23:00; Sa,Su 10:00-23:30', sunLunch)).toBe(true)
  })
  it('handles past-midnight closes', () => {
    expect(isOpenNow('Fr,Sa 12:00-01:00', satLateNight)).toBe(true)
  })
  it('handles off days', () => {
    expect(isOpenNow('Tu-Su 12:00-23:00; Mo off', new Date('2026-07-06T13:00:00'))).toBe(false)
  })
  it('is honest about grammar it cannot evaluate', () => {
    expect(isOpenNow('Mo-Fr 12:00-23:00; PH off', wedLunch)).toBe(null)
    expect(isOpenNow('sunrise-sunset', wedLunch)).toBe(null)
  })
  it('24/7 is always open', () => {
    expect(isOpenNow('24/7', wedEarly)).toBe(true)
  })
})
