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
