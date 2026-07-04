import { haversineMeters, type LonLat } from './chainage.js'
import {
  classifyWaterway,
  lockGaugeFromTags,
  type Classification,
  type NavigableClass,
} from './classification.js'

/**
 * Builds the routable waterway graph from OSM-shaped input:
 * ways are split at shared junction nodes, then degree-2 chains are collapsed
 * into edges carrying everything routing and timing need — length, geometry,
 * narrow/broad lock counts, tunnel metres, waterway class.
 */

export interface SourceNode {
  lon: number
  lat: number
}

export interface SourceWay {
  id: number
  nodeRefs: number[]
  tags: Record<string, string>
}

export interface WaterwayEdge {
  id: string
  /** Vertex (OSM node) ids at each end. */
  a: number
  b: number
  /** Dominant waterway name along the edge (by length), e.g. "Grand Union Canal". */
  name: string | null
  navigableClass: NavigableClass
  lengthM: number
  narrowLocks: number
  broadLocks: number
  tunnelM: number
  /** Geometry oriented from vertex `a` to vertex `b`. */
  geometry: LonLat[]
}

export interface WaterwayGraph {
  vertices: Map<number, { lon: number; lat: number; degree: number }>
  edges: WaterwayEdge[]
}

const NAVIGABLE_WATERWAYS = new Set(['canal', 'river'])

function isNavigableWay(tags: Record<string, string>): boolean {
  if (!NAVIGABLE_WATERWAYS.has(tags['waterway'] ?? '')) return false
  if (tags['disused'] === 'yes' || tags['abandoned'] === 'yes') return false
  return true
}

interface Segment {
  a: number
  b: number
  wayId: number
  lengthM: number
  /** Oriented a → b. */
  geometry: LonLat[]
  isLock: boolean
  isTunnel: boolean
  name: string | null
  tags: Record<string, string>
  cls: Classification
}

export function buildWaterwayGraph(
  nodes: ReadonlyMap<number, SourceNode>,
  ways: readonly SourceWay[],
): WaterwayGraph {
  const kept = ways
    .map((way) => ({
      ...way,
      // extracts clipped at a bbox may reference nodes we don't have
      nodeRefs: way.nodeRefs.filter((ref) => nodes.has(ref)),
    }))
    .filter((way) => isNavigableWay(way.tags) && way.nodeRefs.length >= 2)

  // A node is a vertex if it is used more than once across all kept ways
  // (junction or chain connection) — way endpoints become vertices implicitly.
  const usage = new Map<number, number>()
  for (const way of kept) {
    for (const ref of way.nodeRefs) {
      usage.set(ref, (usage.get(ref) ?? 0) + 1)
    }
  }

  // Split ways into segments at interior vertices.
  const segments: Segment[] = []
  for (const way of kept) {
    const cls = classifyWaterway(way.tags)
    const name = way.tags['name'] ?? null
    const isLock = way.tags['lock'] === 'yes'
    const isTunnel = way.tags['tunnel'] === 'yes' || way.tags['tunnel'] === 'building_passage'
    let start = 0
    for (let i = 1; i < way.nodeRefs.length; i++) {
      const isLast = i === way.nodeRefs.length - 1
      const isVertex = (usage.get(way.nodeRefs[i]!) ?? 0) >= 2
      if (!isLast && !isVertex) continue
      const refs = way.nodeRefs.slice(start, i + 1)
      const geometry: LonLat[] = refs.map((ref) => {
        const n = nodes.get(ref)!
        return [n.lon, n.lat]
      })
      let lengthM = 0
      for (let j = 1; j < geometry.length; j++) {
        lengthM += haversineMeters(geometry[j - 1]!, geometry[j]!)
      }
      segments.push({
        a: refs[0]!,
        b: refs[refs.length - 1]!,
        wayId: way.id,
        lengthM,
        geometry,
        isLock,
        isTunnel,
        name,
        tags: way.tags,
        cls,
      })
      start = i
    }
  }

  // Adjacency over segment endpoints.
  const incident = new Map<number, Segment[]>()
  for (const segment of segments) {
    for (const end of [segment.a, segment.b]) {
      const list = incident.get(end)
      if (list) list.push(segment)
      else incident.set(end, [segment])
    }
  }
  const degree = (vertex: number) => incident.get(vertex)?.length ?? 0

  // Collapse degree-2 chains into edges.
  const visited = new Set<Segment>()
  const edges: WaterwayEdge[] = []

  function walkChain(startVertex: number, first: Segment): void {
    const chain: Segment[] = []
    const orientations: boolean[] = [] // true = segment flows in stored a→b order
    let vertex = startVertex
    let segment: Segment | undefined = first
    while (segment) {
      visited.add(segment)
      const forward = segment.a === vertex
      chain.push(segment)
      orientations.push(forward)
      vertex = forward ? segment.b : segment.a
      if (degree(vertex) !== 2) break
      segment = incident.get(vertex)?.find((s) => !visited.has(s))
    }
    edges.push(buildEdge(chain, orientations, startVertex, vertex, edges.length))
  }

  for (const [vertex, list] of incident) {
    if (list.length === 2) continue
    for (const segment of list) {
      if (!visited.has(segment)) walkChain(vertex, segment)
    }
  }
  // Pure loops (every vertex degree 2) — rare, but rings clipped at a bbox can produce them.
  for (const segment of segments) {
    if (!visited.has(segment)) walkChain(segment.a, segment)
  }

  const vertices = new Map<number, { lon: number; lat: number; degree: number }>()
  for (const edge of edges) {
    for (const [vertex, point] of [
      [edge.a, edge.geometry[0]!],
      [edge.b, edge.geometry[edge.geometry.length - 1]!],
    ] as const) {
      const existing = vertices.get(vertex)
      if (existing) existing.degree += 1
      else vertices.set(vertex, { lon: point[0], lat: point[1], degree: 1 })
    }
  }

  return { vertices, edges }
}

function buildEdge(
  chain: Segment[],
  orientations: boolean[],
  a: number,
  b: number,
  index: number,
): WaterwayEdge {
  // Dominant (longest total length) non-lock name and class describe the edge.
  const nameLengths = new Map<string, number>()
  const classLengths = new Map<NavigableClass, number>()
  let lengthM = 0
  let tunnelM = 0
  for (const segment of chain) {
    lengthM += segment.lengthM
    if (segment.isTunnel) tunnelM += segment.lengthM
    classLengths.set(
      segment.cls.navigableClass,
      (classLengths.get(segment.cls.navigableClass) ?? 0) + segment.lengthM,
    )
    if (segment.name && !segment.isLock) {
      nameLengths.set(segment.name, (nameLengths.get(segment.name) ?? 0) + segment.lengthM)
    }
  }
  const name = pickDominant(nameLengths)
  const navigableClass = pickDominant(classLengths) ?? 'narrow-canal'

  // Lock counting: consecutive lock segments form a run (staircase chambers
  // are adjacent, and one chamber can be split across several segments of the
  // same way). Within a run, distinct chambers are identified by lock_name /
  // lock_ref (UK waterways convention — the way's `name` is usually just the
  // canal), falling back to the source way id. This keeps staircases honest
  // (Watford = 7 chambers) without double-counting split chambers.
  let narrowLocks = 0
  let broadLocks = 0
  let run: Segment[] = []
  const flushRun = () => {
    if (run.length === 0) return
    const chambers = new Map<string, Segment>()
    for (const segment of run) {
      const key =
        segment.tags['lock_name'] ??
        segment.tags['lock_ref'] ??
        (segment.name && segment.name !== name ? segment.name : `way:${segment.wayId}`)
      if (!chambers.has(key)) chambers.set(key, segment)
    }
    for (const member of chambers.values()) {
      const gauge = lockGaugeFromTags(member.tags, member.cls.lockGauge)
      if (gauge === 'narrow') narrowLocks += 1
      else broadLocks += 1
    }
    run = []
  }
  for (const segment of chain) {
    if (segment.isLock) run.push(segment)
    else flushRun()
  }
  flushRun()

  // Concatenate geometry oriented a → b.
  const geometry: LonLat[] = []
  chain.forEach((segment, i) => {
    const points = orientations[i] ? segment.geometry : [...segment.geometry].reverse()
    geometry.push(...(geometry.length > 0 ? points.slice(1) : points))
  })

  return {
    id: `e${index}`,
    a,
    b,
    name,
    navigableClass,
    lengthM,
    narrowLocks,
    broadLocks,
    tunnelM,
    geometry,
  }
}

function pickDominant<K>(lengths: Map<K, number>): K | null {
  let best: K | null = null
  let bestLength = -1
  for (const [key, length] of lengths) {
    if (length > bestLength) {
      best = key
      bestLength = length
    }
  }
  return best
}
