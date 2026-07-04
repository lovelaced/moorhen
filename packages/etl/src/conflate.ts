import { haversineMeters, type LonLat } from '@moorhen/graph'

/**
 * Provenance-preserving point conflation.
 *
 * Matches records from two independently-licensed datasets (e.g. a CRT water
 * point and the OSM node for the same tap) into one *display* feature while
 * keeping each source's attributes in separate fields — the licensing
 * architecture forbids merging them into one deduplicated table
 * (docs/licensing.md, three-store rule).
 *
 * Greedy nearest-pair matching: closest pairs first, each record used at most
 * once, cutoff at maxDistanceM. At canal scale (facilities are tens of metres
 * apart at minimum) this is unambiguous in practice.
 */

export interface ConflatablePoint {
  point: LonLat
}

export interface ConflatedPair<A, B> {
  primary: A
  secondary: B
  distanceM: number
}

export interface ConflationResult<A, B> {
  matched: ConflatedPair<A, B>[]
  unmatchedPrimary: A[]
  unmatchedSecondary: B[]
}

export function conflatePoints<A extends ConflatablePoint, B extends ConflatablePoint>(
  primary: readonly A[],
  secondary: readonly B[],
  options: {
    maxDistanceM: number
    /** Optional compatibility predicate (e.g. both must be water points). */
    compatible?: (a: A, b: B) => boolean
  },
): ConflationResult<A, B> {
  const { maxDistanceM, compatible } = options
  const candidates: { i: number; j: number; distanceM: number }[] = []

  primary.forEach((a, i) => {
    secondary.forEach((b, j) => {
      if (compatible && !compatible(a, b)) return
      // cheap bbox reject before haversine: 1° latitude ≈ 111 km
      if (Math.abs(a.point[1] - b.point[1]) * 111_000 > maxDistanceM * 2) return
      const distanceM = haversineMeters(a.point, b.point)
      if (distanceM <= maxDistanceM) candidates.push({ i, j, distanceM })
    })
  })

  candidates.sort((p, q) => p.distanceM - q.distanceM)

  const usedPrimary = new Set<number>()
  const usedSecondary = new Set<number>()
  const matched: ConflatedPair<A, B>[] = []
  for (const { i, j, distanceM } of candidates) {
    if (usedPrimary.has(i) || usedSecondary.has(j)) continue
    usedPrimary.add(i)
    usedSecondary.add(j)
    matched.push({ primary: primary[i]!, secondary: secondary[j]!, distanceM })
  }

  return {
    matched,
    unmatchedPrimary: primary.filter((_, i) => !usedPrimary.has(i)),
    unmatchedSecondary: secondary.filter((_, j) => !usedSecondary.has(j)),
  }
}
