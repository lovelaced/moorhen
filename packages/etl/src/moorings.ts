import type { OplData, OplNode, OplWay } from './osm/opl'

/**
 * OSM bank moorings (`mooring=*` on ways along the towpath side) — the seed
 * for the mooring layer. Coverage is patchy and edge-type tags (rings vs
 * armco vs pins) are rare, which is exactly the completeness gap the
 * community capture sheet fills over time (docs/product-notes.md); every
 * feature carries what OSM knows so unknowns render as "help us confirm".
 */

export type MooringAccess = 'public' | 'private' | 'no'

export interface MooringFeature {
  id: number
  access: MooringAccess
  name: string | null
  /** rings | wall | pontoon | … when tagged; usually null (the data gap). */
  mooringType: string | null
  maxStay: string | null
  line: [number, number][]
}

function accessOf(value: string): MooringAccess | null {
  if (value === 'yes' || value === 'public' || value === 'guest') return 'public'
  if (value === 'private') return 'private'
  if (value === 'no') return 'no'
  return null
}

function coords(way: OplWay, nodes: ReadonlyMap<number, OplNode>): [number, number][] {
  const points: [number, number][] = []
  for (const ref of way.nodeRefs) {
    const node = nodes.get(ref)
    if (node) points.push([node.lon, node.lat])
  }
  return points
}

export function extractMoorings(data: OplData): MooringFeature[] {
  const moorings: MooringFeature[] = []
  for (const way of data.ways) {
    const raw = way.tags['mooring']
    if (!raw) continue
    const access = accessOf(raw)
    if (!access) continue
    const line = coords(way, data.nodes)
    if (line.length < 2) continue
    moorings.push({
      id: way.id,
      access,
      name: way.tags['name'] ?? null,
      mooringType: way.tags['mooring:type'] ?? null,
      maxStay: way.tags['maxstay'] ?? null,
      line,
    })
  }
  return moorings
}

/** Derelict / unrestored canals — shown on the map, never routed. */
export interface DerelictWay {
  id: number
  name: string | null
  line: [number, number][]
}

export function extractDerelictCanals(data: OplData): DerelictWay[] {
  const results: DerelictWay[] = []
  for (const way of data.ways) {
    const tags = way.tags
    const isDerelict =
      tags['waterway'] === 'derelict_canal' ||
      (tags['waterway'] === 'canal' && (tags['disused'] === 'yes' || tags['abandoned'] === 'yes'))
    if (!isDerelict) continue
    const line = coords(way, data.nodes)
    if (line.length < 2) continue
    results.push({ id: way.id, name: tags['name'] ?? null, line })
  }
  return results
}
