import { bearingDegrees, classifyWaterway, lockGaugeFromTags, type LockGauge } from '@moorhen/graph'
import type { OplData, OplNode, OplWay } from './osm/opl'

/**
 * Lock point features for the map: one per chamber, with the uphill bearing
 * so the marker can show which way the flight climbs.
 *
 * UK waterways mapping convention draws lock ways pointing downhill/downstream
 * (WikiProject United Kingdom Waterways), so uphill = reverse of the way
 * bearing. Chambers are grouped by lock_name/lock_ref within a waterway —
 * the same rule the graph builder uses, so counts always agree.
 */

export interface LockFeature {
  id: string
  name: string | null
  gauge: LockGauge
  waterway: string | null
  point: [number, number]
  /** Degrees clockwise from north, pointing uphill. */
  bearingUpDeg: number
}

function coords(way: OplWay, nodes: ReadonlyMap<number, OplNode>): [number, number][] {
  const points: [number, number][] = []
  for (const ref of way.nodeRefs) {
    const node = nodes.get(ref)
    if (node) points.push([node.lon, node.lat])
  }
  return points
}

export function extractLocks(data: OplData): LockFeature[] {
  const chambers = new Map<string, { ways: OplWay[]; tags: Record<string, string> }>()

  for (const way of data.ways) {
    if (way.tags['lock'] !== 'yes') continue
    const waterway = way.tags['waterway'] ?? ''
    if (waterway !== 'canal' && waterway !== 'river') continue
    const chamberId = way.tags['lock_name'] ?? way.tags['lock_ref'] ?? `way:${way.id}`
    const key = `${way.tags['name'] ?? ''}::${chamberId}`
    const existing = chambers.get(key)
    if (existing) existing.ways.push(way)
    else chambers.set(key, { ways: [way], tags: way.tags })
  }

  const locks: LockFeature[] = []
  for (const [key, { ways, tags }] of chambers) {
    // Longest segment of the chamber carries the geometry.
    let best: [number, number][] = []
    for (const way of ways) {
      const points = coords(way, data.nodes)
      if (points.length > best.length) best = points
    }
    if (best.length < 2) continue
    const mid = best[Math.floor(best.length / 2)]!
    const bearingDown = bearingDegrees(best[0]!, best[best.length - 1]!)
    locks.push({
      id: key,
      name: tags['lock_name'] ?? tags['lock_ref'] ?? null,
      gauge: lockGaugeFromTags(tags, classifyWaterway(tags).lockGauge),
      waterway: tags['name'] ?? null,
      point: mid,
      bearingUpDeg: (bearingDown + 180) % 360,
    })
  }
  return locks
}
