import { describe, expect, it } from 'vitest'
import type { LonLat, WaterwayEdge, WaterwayGraph } from './index'
import { journeyReach } from './index'

/**
 * Synthetic T-shaped network centred on a junction: a long mainline running
 * east, a long branch running north, and a short dead-end stub running south
 * — the marina-entrance shape that used to spray meaningless "furthest
 * point" flags.
 */

const M_PER_DEG_LAT = 111_320

function straightEdge(
  id: string,
  a: number,
  b: number,
  from: LonLat,
  lengthM: number,
  bearing: 'east' | 'north' | 'south',
): { edge: WaterwayEdge; end: LonLat } {
  const dLat = lengthM / M_PER_DEG_LAT
  const dLon = lengthM / (M_PER_DEG_LAT * Math.cos((from[1] * Math.PI) / 180))
  const end: LonLat =
    bearing === 'east'
      ? [from[0] + dLon, from[1]]
      : bearing === 'north'
        ? [from[0], from[1] + dLat]
        : [from[0], from[1] - dLat]
  const mid: LonLat = [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2]
  return {
    edge: {
      id,
      a,
      b,
      name: id,
      navigableClass: 'narrow-canal',
      lengthM,
      narrowLocks: 0,
      broadLocks: 0,
      tunnelM: 0,
      locks: [],
      geometry: [from, mid, end],
    },
    end,
  }
}

function tGraph(stubM: number): { graph: WaterwayGraph; junction: LonLat } {
  const junction: LonLat = [-1.2, 52.3]
  const east = straightEdge('mainline', 1, 2, junction, 8000, 'east')
  const north = straightEdge('branch', 1, 3, junction, 8000, 'north')
  const south = straightEdge('stub', 1, 4, junction, stubM, 'south')
  const vertices = new Map<number, { lon: number; lat: number; degree: number }>([
    [1, { lon: junction[0], lat: junction[1], degree: 3 }],
    [2, { lon: east.end[0], lat: east.end[1], degree: 1 }],
    [3, { lon: north.end[0], lat: north.end[1], degree: 1 }],
    [4, { lon: south.end[0], lat: south.end[1], degree: 1 }],
  ])
  return { graph: { vertices, edges: [east.edge, north.edge, south.edge] }, junction }
}

describe('journeyReach short arms', () => {
  it('drops frontier points on dead-end arms under 1 km', () => {
    const { graph, junction } = tGraph(600)
    // one hour at narrow pace ≈ 4 km: budget dies mid-mainline, mid-branch,
    // and the 600 m stub tip is reached with time to spare
    const frontier = journeyReach(graph, junction, 3600)
    expect(frontier.length).toBe(2)
    for (const p of frontier) {
      expect(p.distanceM).toBeGreaterThan(2000)
    }
  })

  it('keeps dead-end arms of 1 km or more', () => {
    const { graph, junction } = tGraph(1500)
    const frontier = journeyReach(graph, junction, 3600)
    // the 1.5 km arm tip is a legitimate destination now
    expect(frontier.length).toBe(3)
    const nearest = Math.min(...frontier.map((p) => p.distanceM))
    expect(nearest).toBeCloseTo(1500, -2)
  })
})
