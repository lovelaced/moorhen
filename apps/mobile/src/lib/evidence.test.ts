import { describe, expect, it } from 'vitest'
import { sessionsToCsv } from './evidence'
import type { CruiseSession } from './log-store'

const session: CruiseSession = {
  id: '1',
  kind: 'cruise',
  startedAtMs: Date.UTC(2026, 6, 5, 9, 0),
  endedAtMs: Date.UTC(2026, 6, 5, 11, 30),
  distanceM: 8046.72,
  waterway: 'Coventry Canal',
}

describe('sessionsToCsv', () => {
  it('builds a well-formed CSV with escaped names', () => {
    const csv = sessionsToCsv([{ ...session, waterway: 'Wey & Arun "Canal"' }])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('date,kind,start_utc,end_utc,duration_h,distance_miles,waterway')
    expect(lines[1]).toContain('2026-07-05,cruise,09:00,11:30,2.50,5.00')
    expect(lines[1]).toContain('"Wey & Arun ""Canal"""')
  })
})
