import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractLocks } from '../src/locks'
import { extractDerelictCanals, extractMoorings } from '../src/moorings'
import { parseOpl } from '../src/osm/opl'

const braunston = parseOpl(
  readFileSync(new URL('./fixtures/braunston-waterways.opl', import.meta.url), 'utf8'),
)

describe('extractLocks on the Braunston fixture', () => {
  const locks = extractLocks(braunston)

  it('finds every chamber the graph counts: 13 broad + 7 narrow', () => {
    expect(locks.filter((l) => l.gauge === 'broad')).toHaveLength(13)
    expect(locks.filter((l) => l.gauge === 'narrow')).toHaveLength(7)
  })

  it('gives every lock a point on the canal and an uphill bearing', () => {
    for (const lock of locks) {
      expect(lock.point[0]).toBeGreaterThan(-1.35)
      expect(lock.point[0]).toBeLessThan(-1.08)
      expect(lock.bearingUpDeg).toBeGreaterThanOrEqual(0)
      expect(lock.bearingUpDeg).toBeLessThan(360)
    }
  })

  it('the Braunston flight climbs roughly east (uphill bearing 45–135°)', () => {
    // The flight rises from Braunston village up towards the tunnel (east).
    const gu = locks.filter(
      (l) => l.waterway === 'Grand Union Canal' && l.point[0] > -1.21 && l.point[0] < -1.17,
    )
    expect(gu.length).toBeGreaterThanOrEqual(5)
    for (const lock of gu) {
      expect(lock.bearingUpDeg).toBeGreaterThan(30)
      expect(lock.bearingUpDeg).toBeLessThan(160)
    }
  })
})

describe('extractMoorings / extractDerelictCanals (synthetic)', () => {
  const opl = parseOpl(
    [
      'n1 v1 dV c0 t2026-01-01T00:00:00Z i0 u T x-1.20 y52.29',
      'n2 v1 dV c0 t2026-01-01T00:00:00Z i0 u T x-1.201 y52.291',
      'n3 v1 dV c0 t2026-01-01T00:00:00Z i0 u T x-1.202 y52.292',
      'w10 v1 dV c0 t2026-01-01T00:00:00Z i0 u Tmooring=yes,maxstay=48%20%hours Nn1,n2',
      'w11 v1 dV c0 t2026-01-01T00:00:00Z i0 u Tmooring=private Nn2,n3',
      'w12 v1 dV c0 t2026-01-01T00:00:00Z i0 u Tmooring=maybe Nn1,n3',
      'w13 v1 dV c0 t2026-01-01T00:00:00Z i0 u Twaterway=derelict_canal,name=Wendover%20%Arm Nn1,n2,n3',
      'w14 v1 dV c0 t2026-01-01T00:00:00Z i0 u Twaterway=canal,disused=yes Nn1,n3',
    ].join('\n'),
  )

  it('classifies mooring access and keeps maxstay', () => {
    const moorings = extractMoorings(opl)
    expect(moorings).toHaveLength(2)
    expect(moorings[0]).toMatchObject({ access: 'public', maxStay: '48 hours' })
    expect(moorings[1]!.access).toBe('private')
  })

  it('collects derelict canals from both tagging styles', () => {
    const derelict = extractDerelictCanals(opl)
    expect(derelict).toHaveLength(2)
    expect(derelict[0]!.name).toBe('Wendover Arm')
  })
})
