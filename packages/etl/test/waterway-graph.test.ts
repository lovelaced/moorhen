import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildWaterwayGraph,
  edgeToTimingEdge,
  estimateJourney,
  shortestRoute,
} from '@moorhen/graph'
import { parseOpl } from '../src/osm/opl'

/**
 * Golden tests against a real OSM extract around Braunston (the crossroads of
 * the canal system): Grand Union main line with the Braunston (6) and Buckby
 * (7) broad flights and Braunston Tunnel (2,042 yd ≈ 1,867 m); Braunston Turn
 * junction with the narrow Oxford Canal; Norton Junction onto the Leicester
 * Line with the narrow Watford flight (7 chambers, incl. a 4-lock staircase)
 * and Crick Tunnel (1,528 yd ≈ 1,397 m).
 *
 * Fixture: packages/etl/test/fixtures/braunston-waterways.opl
 * (osmium extract bbox -1.35,52.23,-1.08,52.34 of geofabrik northamptonshire,
 * captured 2026-07-04 — deliberately includes railway-tunnel noise to prove
 * the builder filters by waterway tags.)
 */

const opl = parseOpl(
  readFileSync(new URL('./fixtures/braunston-waterways.opl', import.meta.url), 'utf8'),
)
const graph = buildWaterwayGraph(opl.nodes, opl.ways)

const GU = 'Grand Union Canal'
const LEICESTER = 'Grand Union Canal (Leicester Line)'
const OXFORD = 'Oxford Canal'

const edgesNamed = (name: string) => graph.edges.filter((e) => e.name === name)
const sumLocks = (name: string) =>
  edgesNamed(name).reduce(
    (sum, e) => ({ narrow: sum.narrow + e.narrowLocks, broad: sum.broad + e.broadLocks }),
    { narrow: 0, broad: 0 },
  )
const sumTunnel = (name: string) => edgesNamed(name).reduce((s, e) => s + e.tunnelM, 0)

describe('parseOpl on the Braunston fixture', () => {
  it('parses nodes and ways with decoded tags', () => {
    expect(opl.ways.length).toBe(197)
    expect(opl.nodes.size).toBe(2809)
    expect(opl.ways.some((w) => w.tags['name'] === GU)).toBe(true)
  })
})

describe('buildWaterwayGraph on the Braunston fixture', () => {
  it('keeps only navigable waterways (railway tunnels in the fixture are noise)', () => {
    for (const edge of graph.edges) {
      expect(edge.name ?? '').not.toMatch(/Kilsby|West Coast Main Line|Loop Line/)
    }
    expect(edgesNamed(GU).length).toBeGreaterThan(0)
    expect(edgesNamed(OXFORD).length).toBeGreaterThan(0)
    expect(edgesNamed(LEICESTER).length).toBeGreaterThan(0)
  })

  it('counts the GU main line broad flights exactly: Braunston 6 + Buckby 7', () => {
    expect(sumLocks(GU)).toEqual({ narrow: 0, broad: 13 })
  })

  it('counts the Watford narrow flight exactly, staircase included: 7 chambers', () => {
    expect(sumLocks(LEICESTER)).toEqual({ narrow: 7, broad: 0 })
  })

  it('classifies gauge from the curated table: GU broad, Leicester Line & Oxford narrow', () => {
    for (const e of edgesNamed(GU)) expect(e.navigableClass).toBe('broad-canal')
    for (const e of edgesNamed(LEICESTER)) expect(e.navigableClass).toBe('narrow-canal')
    for (const e of edgesNamed(OXFORD)) expect(e.navigableClass).toBe('narrow-canal')
  })

  it('measures Braunston Tunnel (~1867 m) and Crick Tunnel (~1397 m) from geometry', () => {
    expect(sumTunnel(GU)).toBeGreaterThan(1820)
    expect(sumTunnel(GU)).toBeLessThan(1920)
    expect(sumTunnel(LEICESTER)).toBeGreaterThan(1350)
    expect(sumTunnel(LEICESTER)).toBeLessThan(1450)
  })

  it('has junction vertices where three ways meet (Braunston Turn, Norton Junction)', () => {
    const junctions = [...graph.vertices.values()].filter((v) => v.degree >= 3)
    expect(junctions.length).toBeGreaterThanOrEqual(2)
  })
})

describe('routing across the network', () => {
  // Westernmost Oxford Canal vertex (towards Napton) → northernmost Leicester
  // Line vertex (towards Crick): must cross Braunston Turn, climb the
  // Braunston broad flight, pass the tunnel, turn at Norton Junction and
  // climb the Watford narrow flight. Buckby (south of Norton Jn) must NOT be
  // on this route.
  const oxfordStart = edgesNamed(OXFORD)
    .flatMap((e) => [
      { vertex: e.a, lon: e.geometry[0]![0] },
      { vertex: e.b, lon: e.geometry[e.geometry.length - 1]![0] },
    ])
    .sort((p, q) => p.lon - q.lon)[0]!
  const leicesterEnd = edgesNamed(LEICESTER)
    .flatMap((e) => [
      { vertex: e.a, lat: e.geometry[0]![1] },
      { vertex: e.b, lat: e.geometry[e.geometry.length - 1]![1] },
    ])
    .sort((p, q) => q.lat - p.lat)[0]!

  const route = shortestRoute(graph, oxfordStart.vertex, leicesterEnd.vertex)

  it('finds a route from the Oxford Canal to the Leicester Line', () => {
    expect(route).not.toBeNull()
    expect(route!.legs.length).toBeGreaterThan(2)
  })

  it('the route climbs exactly Braunston (6 broad) + Watford (7 narrow)', () => {
    const locks = route!.legs.reduce(
      (sum, leg) => ({
        narrow: sum.narrow + leg.edge.narrowLocks,
        broad: sum.broad + leg.edge.broadLocks,
      }),
      { narrow: 0, broad: 0 },
    )
    expect(locks).toEqual({ narrow: 7, broad: 6 })
  })

  it('produces a sane journey estimate through the timing model', () => {
    const estimate = estimateJourney(
      route!.legs.map((leg) => ({ edge: edgeToTimingEdge(leg.edge), direction: 1 as const })),
    )
    expect(estimate.lockCount).toBe(13)
    const hours = estimate.totalSeconds / 3600
    // ~10 miles + 13 locks + two tunnels ≈ 23 lock-miles → 6–8 h by the folk formula
    expect(hours).toBeGreaterThan(5)
    expect(hours).toBeLessThan(9)
  })
})

describe('planJourney with exact per-chamber lock counting', () => {
  it('a mid-flight start counts only the chambers actually passed', async () => {
    const { planJourney, snapToNetwork } = await import('@moorhen/graph')
    // Start on the Oxford Canal west of Braunston Turn, end past the tunnel
    // on the GU — must pass the six Braunston chambers exactly.
    const journey = planJourney(graph, [-1.24, 52.277], [-1.15, 52.29])
    expect(journey).not.toBeNull()
    expect(journey!.broadLocks).toBe(6)
    expect(journey!.narrowLocks).toBe(0)
    // sanity: snapping reports a nearby edge, not a junction miles away
    const snap = snapToNetwork(graph, [-1.24, 52.277])
    expect(snap!.distanceM).toBeLessThan(800)
  })

  it('edges carry per-chamber chainage consistent with their counts', () => {
    for (const edge of graph.edges) {
      expect(edge.locks.length).toBe(edge.narrowLocks + edge.broadLocks)
      for (const lock of edge.locks) {
        expect(lock.chainageM).toBeGreaterThanOrEqual(0)
        expect(lock.chainageM).toBeLessThanOrEqual(edge.lengthM + 1)
      }
    }
  })
})

describe('stoppageAhead — direction-aware', () => {
  it('flags a closure ahead in the travel direction, ignores the one behind', async () => {
    const { snapToNetwork, stoppageAhead } = await import('@moorhen/graph')
    // On the Grand Union west of Braunston, heading east (up the flight).
    const snap = snapToNetwork(graph, [-1.19, 52.283])
    expect(snap).not.toBeNull()
    const toB = snap!.edge.geometry[snap!.edge.geometry.length - 1]!
    // direction that points towards the edge's b vertex
    const eastIsB = toB[0] > snap!.edge.geometry[0]![0]
    const forward: 1 | -1 = eastIsB ? 1 : -1

    const ahead = { id: 'ahead', point: [-1.15, 52.29] as [number, number] } // up towards the tunnel
    const behind = { id: 'behind', point: [-1.24, 52.277] as [number, number] } // back towards Napton

    const result = stoppageAhead(graph, snap!, forward, [ahead, behind])
    expect(result).not.toBeNull()
    expect(result!.stoppage.id).toBe('ahead')

    // reverse the boat: now only the one behind is "ahead"
    const reversed = stoppageAhead(graph, snap!, (forward * -1) as 1 | -1, [ahead, behind])
    expect(reversed?.stoppage.id).toBe('behind')
  })
})

describe('offline regions', () => {
  it('assigns network edges to sensible regions and builds region corridors', async () => {
    const { regionOf, corridorCellKeys, regionCorridor, REGIONS } = await import('@moorhen/etl')
    // Braunston is in the Midlands
    const midlands = regionOf([-1.21, 52.29])
    expect(midlands?.id).toBe('midlands')

    const keys = corridorCellKeys(graph.edges.map((e) => e.geometry))
    const midlandsDef = REGIONS.find((r) => r.id === 'midlands')!
    const corridor = regionCorridor(midlandsDef, keys)
    expect(corridor.type).toBe('MultiPolygon')
    expect(corridor.coordinates.length).toBeGreaterThan(0)

    // a point in the sea belongs to no region
    expect(regionOf([-8, 55])).toBeNull()
  })
})

describe('planJourney line geometry', () => {
  it('is continuous, matches distanceM, and ends at the snapped destination', async () => {
    const { planJourney, haversineMeters, snapToNetwork } = await import('@moorhen/graph')
    // destination mid-way along the long collapsed GU edge east of Braunston
    const from: [number, number] = [-1.24, 52.277]
    const to: [number, number] = [-1.16, 52.288]
    const journey = planJourney(graph, from, to)!
    expect(journey).not.toBeNull()

    let lineLen = 0
    for (let i = 1; i < journey.line.length; i++) {
      lineLen += haversineMeters(journey.line[i - 1]!, journey.line[i]!)
    }
    // concatenated geometry length ≈ summed edge lengths — a mis-oriented leg
    // (the bug this pins) inflates the line with a backtrack. NB single
    // segments can legitimately be km-long (Braunston tunnel is one straight
    // 1.9 km segment), so a max-step assertion would be wrong here.
    expect(Math.abs(lineLen - journey.distanceM) / journey.distanceM).toBeLessThan(0.02)
    // the line ends where the destination snapped, not at some edge vertex
    const snap = snapToNetwork(graph, to)!
    const end = journey.line[journey.line.length - 1]!
    expect(haversineMeters(end, snap.point)).toBeLessThan(30)
    // and starts at the origin snap
    const startSnap = snapToNetwork(graph, from)!
    expect(haversineMeters(journey.line[0]!, startSnap.point)).toBeLessThan(30)
  })
})

describe('planJourney day breakdown', () => {
  it('splits a multi-day journey into sane cruising days', async () => {
    const { planJourney } = await import('@moorhen/graph')
    const journey = planJourney(graph, [-1.24, 52.277], [-1.16, 52.288])!
    // short trip: single day, ending at the destination
    expect(journey.days.length).toBe(1)
    expect(journey.days[0]!.endPoint).toEqual(journey.line[journey.line.length - 1])

    // force multi-day with a tiny cruising day
    const { DEFAULT_TIMING_PROFILE } = await import('@moorhen/graph')
    const slow = { ...DEFAULT_TIMING_PROFILE, cruisingHoursPerDay: 1 }
    const multi = planJourney(graph, [-1.24, 52.277], [-1.16, 52.288], slow)!
    expect(multi.days.length).toBeGreaterThan(1)
    const totalM = multi.days.reduce((sum, d) => sum + d.distanceM, 0)
    expect(Math.abs(totalM - multi.distanceM) / multi.distanceM).toBeLessThan(0.01)
    const totalS = multi.days.reduce((sum, d) => sum + d.seconds, 0)
    expect(Math.abs(totalS - multi.totalSeconds)).toBeLessThan(60)
    // every day except the last is a full cruising day
    for (const d of multi.days.slice(0, -1)) {
      expect(Math.abs(d.seconds - 3600)).toBeLessThan(1)
    }
  })
})

describe('day breakdown lock apportioning', () => {
  it('splits a leg-spanning lock count across days and preserves the total', async () => {
    const { planJourney, DEFAULT_TIMING_PROFILE } = await import('@moorhen/graph')
    const slow = { ...DEFAULT_TIMING_PROFILE, cruisingHoursPerDay: 1 }
    const journey = planJourney(graph, [-1.24, 52.277], [-1.16, 52.288], slow)!
    const totalLocks = journey.days.reduce((sum, d) => sum + d.lockCount, 0)
    expect(totalLocks).toBe(journey.narrowLocks + journey.broadLocks)
    // the 6 Braunston chambers shouldn't all land on one tiny day
    const maxDayLocks = Math.max(...journey.days.map((d) => d.lockCount))
    expect(maxDayLocks).toBeLessThan(journey.narrowLocks + journey.broadLocks)
  })
})

describe('journeyReach', () => {
  it('finds frontier points at the time budget and sane distances', async () => {
    const { journeyReach } = await import('@moorhen/graph')
    const start: [number, number] = [-1.21, 52.29] // Braunston
    const oneHour = journeyReach(graph, start, 3600)
    expect(oneHour.length).toBeGreaterThan(0)
    // at ~3 mph nothing should be further than ~4 miles in an hour
    for (const p of oneHour) {
      expect(p.distanceM).toBeLessThan(4.2 * 1609)
    }
    // more time → the furthest frontier point is further away
    const threeHours = journeyReach(graph, start, 3 * 3600)
    expect(threeHours[0]!.distanceM).toBeGreaterThan(oneHour[0]!.distanceM)
  })
})
