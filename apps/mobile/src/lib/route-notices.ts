import { buildChainage, projectOntoChainage, type LonLat } from '@moorhen/graph'
import type { NoticeRecord } from './artifacts'

/**
 * Navigation-blocking notices that sit ON a planned route, in journey order —
 * "there's a stoppage at mile 12.3 of this trip". Same projection machinery
 * as canalside places, tighter corridor (notices sit on the water).
 */

export const ROUTE_NOTICE_MAX_OFFSET_M = 250

export interface RouteNotice {
  id: string
  title: string
  url: string | null
  start: string | null
  end: string | null
  chainageM: number
}

const CELL_DEG = 0.02

function cellOf(lon: number, lat: number): string {
  return `${Math.floor(lon / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`
}

function corridorCells(line: readonly LonLat[]): Set<string> {
  const cells = new Set<string>()
  for (let i = 0; i < line.length; i += 2) {
    const [lon, lat] = line[i]!
    const cx = Math.floor(lon / CELL_DEG)
    const cy = Math.floor(lat / CELL_DEG)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        cells.add(`${cx + dx},${cy + dy}`)
      }
    }
  }
  return cells
}

export function findRouteNotices(
  routeLine: readonly LonLat[],
  notices: readonly NoticeRecord[],
  now: Date = new Date(),
): RouteNotice[] {
  const cells = corridorCells(routeLine)
  const chain = buildChainage(routeLine as LonLat[])
  const found = new Map<string, RouteNotice>()

  for (const notice of notices) {
    if (!notice.isNavigationBlocking || notice.state !== 'Published') continue
    // an already-reopened stoppage isn't a stoppage
    if (notice.end && new Date(notice.end) < now) continue
    for (const point of notice.points) {
      if (!cells.has(cellOf(point[0], point[1]))) continue
      const projection = projectOntoChainage(chain, point)
      if (projection.offsetMeters > ROUTE_NOTICE_MAX_OFFSET_M) continue
      const existing = found.get(notice.id)
      if (!existing || projection.chainageMeters < existing.chainageM) {
        found.set(notice.id, {
          id: notice.id,
          title: notice.title,
          url: notice.url,
          start: notice.start,
          end: notice.end,
          chainageM: projection.chainageMeters,
        })
      }
    }
  }
  return [...found.values()].sort((a, b) => a.chainageM - b.chainageM)
}
