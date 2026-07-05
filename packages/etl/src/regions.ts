import type { MultiPolygon } from 'geojson'
import type { LonLat } from '@moorhen/graph'
import { cellKey } from './pois'

/**
 * Offline download regions. The full-GB corridor basemap is ~900 MB — too
 * heavy as a single download — so boaters grab their region(s). Bounds are
 * generous rectangles over each cluster of the network; the actual downloaded
 * tiles are still clipped to the canal corridor within the bounds, so a
 * region is a fraction of its rectangle.
 */

export interface RegionDef {
  id: string
  name: string
  /** [west, south, east, north] */
  bounds: [number, number, number, number]
}

export const REGIONS: RegionDef[] = [
  { id: 'london-se', name: 'London & South East', bounds: [-1.0, 51.0, 1.2, 52.2] },
  { id: 'midlands', name: 'Midlands', bounds: [-2.6, 52.0, -0.6, 53.1] },
  { id: 'north-west', name: 'North West', bounds: [-3.2, 53.0, -1.9, 54.3] },
  { id: 'yorkshire-ne', name: 'Yorkshire & North East', bounds: [-2.0, 53.3, -0.2, 54.6] },
  { id: 'south-west', name: 'South West', bounds: [-3.2, 51.0, -1.0, 52.2] },
  { id: 'wales-borders', name: 'Wales & Borders', bounds: [-4.2, 51.5, -2.4, 53.2] },
  { id: 'scotland', name: 'Scotland', bounds: [-5.5, 55.6, -3.0, 57.6] },
]

export function regionOf(point: LonLat): RegionDef | null {
  for (const region of REGIONS) {
    const [w, s, e, n] = region.bounds
    if (point[0] >= w && point[0] <= e && point[1] >= s && point[1] <= n) return region
  }
  return null
}

/** Corridor polygon for a region: the shared corridor cells clipped to bounds. */
export function regionCorridor(
  region: RegionDef,
  corridorCellKeys: ReadonlySet<string>,
  cellDeg = 0.05,
): MultiPolygon {
  const [w, s, e, n] = region.bounds
  const polygons: number[][][][] = []
  for (const key of corridorCellKeys) {
    const [cx, cy] = key.split(',').map(Number) as [number, number]
    const west = cx * cellDeg
    const south = cy * cellDeg
    // cell must overlap the region bounds
    if (west + cellDeg < w || west > e || south + cellDeg < s || south > n) continue
    const east = west + cellDeg
    const north = south + cellDeg
    polygons.push([
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ])
  }
  return { type: 'MultiPolygon', coordinates: polygons }
}

/** Grid-cell keys touched by the network, for regionCorridor(). */
export function corridorCellKeys(
  geometries: Iterable<readonly LonLat[]>,
  cellDeg = 0.05,
): Set<string> {
  const cells = new Set<string>()
  for (const line of geometries) {
    for (const point of line) cells.add(cellKey(point, cellDeg))
  }
  return cells
}
