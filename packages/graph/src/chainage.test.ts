import { describe, expect, it } from 'vitest'
import {
  buildChainage,
  distanceAheadMeters,
  haversineMeters,
  pointAtChainage,
  projectOntoChainage,
  type LonLat,
} from './chainage.js'

// A straight north–south "canal" near Braunston (~52.29°N): vertices every
// 0.001° latitude ≈ 111.2 m apart.
const LON = -1.207
const straightCanal: LonLat[] = Array.from({ length: 11 }, (_, i) => [LON, 52.29 + i * 0.001])

describe('haversineMeters', () => {
  it('measures ~111.2 km per degree of latitude', () => {
    expect(haversineMeters([0, 0], [0, 1])).toBeCloseTo(111_195, -3)
  })

  it('is zero for identical points', () => {
    expect(haversineMeters([-1.2, 52.3], [-1.2, 52.3])).toBe(0)
  })
})

describe('buildChainage', () => {
  it('accumulates segment lengths', () => {
    const c = buildChainage(straightCanal)
    expect(c.cumulative).toHaveLength(11)
    expect(c.cumulative[0]).toBe(0)
    expect(c.totalMeters).toBeCloseTo(10 * 111.2, 0)
  })

  it('rejects degenerate polylines', () => {
    expect(() => buildChainage([[0, 0]])).toThrow(/at least 2 vertices/)
  })
})

describe('projectOntoChainage', () => {
  const c = buildChainage(straightCanal)

  it('projects a point beside the canal onto the correct chainage', () => {
    // halfway along (5.5 vertices up), offset ~50 m to the east
    const p: LonLat = [LON + 0.00073, 52.2955]
    const proj = projectOntoChainage(c, p)
    expect(proj.chainageMeters).toBeCloseTo(5.5 * 111.2, -1)
    expect(proj.offsetMeters).toBeGreaterThan(40)
    expect(proj.offsetMeters).toBeLessThan(60)
  })

  it('clamps to the line ends', () => {
    const before = projectOntoChainage(c, [LON, 52.28])
    expect(before.chainageMeters).toBe(0)
    const after = projectOntoChainage(c, [LON, 52.35])
    expect(after.chainageMeters).toBeCloseTo(c.totalMeters, 5)
  })
})

describe('pointAtChainage', () => {
  const c = buildChainage(straightCanal)

  it('round-trips with projection', () => {
    const p = pointAtChainage(c, 500)
    const proj = projectOntoChainage(c, p)
    expect(proj.chainageMeters).toBeCloseTo(500, 0)
    expect(proj.offsetMeters).toBeCloseTo(0, 0)
  })

  it('clamps out-of-range chainage', () => {
    expect(pointAtChainage(c, -100)).toEqual(straightCanal[0])
    expect(pointAtChainage(c, 1e9)).toEqual(straightCanal[10])
  })
})

describe('distanceAheadMeters', () => {
  it('returns positive distance for targets ahead', () => {
    expect(distanceAheadMeters(1000, 3500, 1)).toBe(2500)
    expect(distanceAheadMeters(3500, 1000, -1)).toBe(2500)
  })

  it('returns null for targets behind the direction of travel', () => {
    expect(distanceAheadMeters(3500, 1000, 1)).toBeNull()
    expect(distanceAheadMeters(1000, 3500, -1)).toBeNull()
  })
})
