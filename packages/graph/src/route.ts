import type { WaterwayEdge, WaterwayGraph } from './builder'

/**
 * Shortest-path routing over the waterway graph. Small graph (a few thousand
 * edges for all of Great Britain), so a simple binary-heap Dijkstra is ample
 * and runs fine on-device, offline.
 */

export interface RouteLeg {
  edge: WaterwayEdge
  /** true = traversed a→b (increasing chainage along edge.geometry). */
  forward: boolean
}

export interface Route {
  legs: RouteLeg[]
  totalLengthM: number
  /** Sum of the traversal weights (equals totalLengthM for the default weight). */
  totalCost: number
}

export type EdgeWeightFn = (edge: WaterwayEdge, forward: boolean) => number

const byLength: EdgeWeightFn = (edge) => edge.lengthM

class MinHeap {
  private items: { vertex: number; cost: number }[] = []

  push(vertex: number, cost: number): void {
    this.items.push({ vertex, cost })
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent]!.cost <= this.items[i]!.cost) break
      ;[this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!]
      i = parent
    }
  }

  pop(): { vertex: number; cost: number } | undefined {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < this.items.length && this.items[left]!.cost < this.items[smallest]!.cost)
          smallest = left
        if (right < this.items.length && this.items[right]!.cost < this.items[smallest]!.cost)
          smallest = right
        if (smallest === i) break
        ;[this.items[smallest], this.items[i]] = [this.items[i]!, this.items[smallest]!]
        i = smallest
      }
    }
    return top
  }

  get size(): number {
    return this.items.length
  }
}

export function shortestRoute(
  graph: WaterwayGraph,
  from: number,
  to: number,
  weight: EdgeWeightFn = byLength,
): Route | null {
  if (from === to) return { legs: [], totalLengthM: 0, totalCost: 0 }

  const adjacency = new Map<number, { edge: WaterwayEdge; forward: boolean; next: number }[]>()
  const addAdjacent = (
    vertex: number,
    entry: { edge: WaterwayEdge; forward: boolean; next: number },
  ) => {
    const list = adjacency.get(vertex)
    if (list) list.push(entry)
    else adjacency.set(vertex, [entry])
  }
  for (const edge of graph.edges) {
    addAdjacent(edge.a, { edge, forward: true, next: edge.b })
    addAdjacent(edge.b, { edge, forward: false, next: edge.a })
  }

  const costs = new Map<number, number>([[from, 0]])
  const previous = new Map<number, RouteLeg & { from: number }>()
  const done = new Set<number>()
  const heap = new MinHeap()
  heap.push(from, 0)

  while (heap.size > 0) {
    const current = heap.pop()!
    if (done.has(current.vertex)) continue
    done.add(current.vertex)
    if (current.vertex === to) break
    for (const { edge, forward, next } of adjacency.get(current.vertex) ?? []) {
      if (done.has(next)) continue
      const cost = current.cost + weight(edge, forward)
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost)
        previous.set(next, { edge, forward, from: current.vertex })
        heap.push(next, cost)
      }
    }
  }

  if (!costs.has(to) || !done.has(to)) return null

  const legs: RouteLeg[] = []
  let cursor = to
  while (cursor !== from) {
    const step = previous.get(cursor)
    if (!step) return null
    legs.unshift({ edge: step.edge, forward: step.forward })
    cursor = step.from
  }
  return {
    legs,
    totalLengthM: legs.reduce((sum, leg) => sum + leg.edge.lengthM, 0),
    totalCost: costs.get(to)!,
  }
}
