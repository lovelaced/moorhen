import { describe, expect, it } from 'vitest'
import type { NoticeRecord } from './artifacts'
import { findRouteNotices } from './route-notices'

const notice = (overrides: Partial<NoticeRecord>): NoticeRecord => ({
  id: 'n1',
  title: 'Lock closure',
  type: 'Navigation Closure',
  reason: 'Repair',
  start: '2026-07-01T00:00:00Z',
  end: '2026-09-01T00:00:00Z',
  url: 'https://example.org',
  state: 'Published',
  isNavigationBlocking: true,
  points: [[-1.205, 52.2891]],
  ...overrides,
})

// a straight east-west line through Braunston-ish coordinates
const line: [number, number][] = Array.from({ length: 40 }, (_, i) => [-1.24 + i * 0.002, 52.289])

describe('findRouteNotices', () => {
  const now = new Date('2026-07-06T00:00:00Z')

  it('finds an on-route notice with its mile and drops off-route ones', () => {
    const onRoute = notice({ id: 'on', points: [[-1.205, 52.2895]] }) // ~60 m off the line
    const offRoute = notice({ id: 'off', points: [[-1.205, 52.35]] }) // ~7 km away
    const found = findRouteNotices(line, [onRoute, offRoute], now)
    expect(found.map((n) => n.id)).toEqual(['on'])
    // ~0.035° east of the start ≈ 2.4 km along
    expect(found[0]!.chainageM).toBeGreaterThan(2000)
    expect(found[0]!.chainageM).toBeLessThan(3000)
  })

  it('ignores ended, unpublished and non-blocking notices', () => {
    const ended = notice({ id: 'ended', end: '2026-06-01T00:00:00Z' })
    const draft = notice({ id: 'draft', state: 'Draft' })
    const towpath = notice({ id: 'towpath', isNavigationBlocking: false })
    expect(findRouteNotices(line, [ended, draft, towpath], now)).toEqual([])
  })

  it('dedupes multi-point notices to their first crossing', () => {
    const multi = notice({
      id: 'multi',
      points: [
        [-1.21, 52.289],
        [-1.2, 52.289],
      ],
    })
    const found = findRouteNotices(line, [multi], now)
    expect(found).toHaveLength(1)
    expect(found[0]!.chainageM).toBeLessThan(2200)
  })
})
