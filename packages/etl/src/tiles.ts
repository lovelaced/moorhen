import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { MultiPolygon, Position } from 'geojson'
import type { LonLat, WaterwayGraph } from '@moorhen/graph'

const execFileAsync = promisify(execFile)

/**
 * Tile artifacts:
 *
 * 1. `corridor.geojson` — a coarse polygon around the waterway network,
 *    built from grid cells (~0.05° ≈ 3.5–5.5 km) touched by any edge plus
 *    their neighbours. Used to clip the offline basemap (`pmtiles extract
 *    --region`) so boaters download the canal corridor, not all of GB.
 *
 * 2. `overlay.pmtiles` — our own vector layers (waterways, POIs, facilities)
 *    rendered by tippecanoe, drawn on top of any basemap.
 */

export interface CorridorOptions {
  /** Cell size in degrees. Default 0.05 (~5.5 km lon × 3.5 km lat in GB). */
  cellDeg?: number
}

/**
 * Grid-cell corridor around the network. Cells sharing edges is tolerated by
 * every consumer we target (pmtiles extract, osmium extract -p); column runs
 * are merged into rectangles to keep the polygon count sane.
 */
export function buildCorridorPolygon(
  geometries: Iterable<readonly LonLat[]>,
  options: CorridorOptions = {},
): MultiPolygon {
  const cell = options.cellDeg ?? 0.05
  const cells = new Set<string>()
  for (const line of geometries) {
    for (const [lon, lat] of line) {
      const cx = Math.floor(lon / cell)
      const cy = Math.floor(lat / cell)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          cells.add(`${cx + dx},${cy + dy}`)
        }
      }
    }
  }

  // Merge vertically-contiguous cells per column into rectangles.
  const byColumn = new Map<number, number[]>()
  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number) as [number, number]
    const rows = byColumn.get(cx)
    if (rows) rows.push(cy)
    else byColumn.set(cx, [cy])
  }

  const polygons: Position[][][] = []
  for (const [cx, rows] of byColumn) {
    rows.sort((a, b) => a - b)
    let runStart = rows[0]!
    let previous = rows[0]!
    const flush = (endRow: number) => {
      const west = cx * cell
      const east = (cx + 1) * cell
      const south = runStart * cell
      const north = (endRow + 1) * cell
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
    for (const row of rows.slice(1)) {
      if (row !== previous + 1) {
        flush(previous)
        runStart = row
      }
      previous = row
    }
    flush(previous)
  }

  return { type: 'MultiPolygon', coordinates: polygons }
}

export function corridorFromGraph(graph: WaterwayGraph, options?: CorridorOptions) {
  return buildCorridorPolygon(
    graph.edges.map((edge) => edge.geometry),
    options,
  )
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command])
    return true
  } catch {
    return false
  }
}

export interface OverlayTilesOptions {
  artifactsDir: string
  /** Layer name → GeoJSON filename inside artifactsDir. */
  layers?: Record<string, string>
  minZoom?: number
  maxZoom?: number
}

/**
 * Builds overlay.pmtiles from the GeoJSON artifacts with tippecanoe.
 * Returns the output path, or null when tippecanoe isn't installed
 * (the build degrades — GeoJSON artifacts still ship).
 */
export async function buildOverlayTiles(options: OverlayTilesOptions): Promise<string | null> {
  if (!(await commandExists('tippecanoe'))) return null
  const layers = options.layers ?? {
    waterways: 'waterways.geojson',
    pois: 'osm-pois.geojson',
    facilities: 'crt-facilities.geojson',
  }
  const output = join(options.artifactsDir, 'overlay.pmtiles')
  const args = [
    '-o',
    output,
    '--force',
    '--quiet',
    `--minimum-zoom=${options.minZoom ?? 6}`,
    `--maximum-zoom=${options.maxZoom ?? 14}`,
    '--drop-densest-as-needed',
    '--no-tile-compression', // range-request friendly for MapLibre pmtiles://
  ]
  let layerCount = 0
  for (const [name, file] of Object.entries(layers)) {
    const path = join(options.artifactsDir, file)
    if (!existsSync(path)) continue // offline builds may not have every layer
    args.push('-L', `${name}:${path}`)
    layerCount += 1
  }
  if (layerCount === 0) return null
  await execFileAsync('tippecanoe', args)
  return output
}

export async function writeCorridor(artifactsDir: string, corridor: MultiPolygon): Promise<string> {
  const path = join(artifactsDir, 'corridor.geojson')
  await writeFile(path, JSON.stringify({ type: 'Feature', properties: {}, geometry: corridor }))
  return path
}
