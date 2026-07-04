import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { parseOpl, type OplData } from './opl'

/** Licence-registry id — checked by scripts/check-registry.mjs. */
export const SOURCE_ID = 'osm-geofabrik-gb'

const execFileAsync = promisify(execFile)

export const GEOFABRIK_GB_URL = 'https://download.geofabrik.de/europe/great-britain-latest.osm.pbf'

/**
 * Tag filter for the waterway pipeline. Deliberately does NOT include a bare
 * `w/tunnel` (that drags in railway/road tunnels); canal tunnels already
 * carry waterway=canal. POI node filters ride along for the facilities layer.
 */
export const WATERWAY_FILTER_ARGS = [
  'w/waterway=canal,river',
  'w/lock=yes',
  'n/waterway=lock_gate,water_point,sanitary_dump_station,turning_point',
  'nw/waterway=fuel',
  'nw/amenity=pub,drinking_water',
  'nw/shop=convenience,supermarket,farm,bakery,butcher,greengrocer,deli,laundry,dry_cleaning,boat',
] as const

/**
 * Runs `osmium tags-filter` then `osmium cat -f opl` to produce a parseable
 * waterway extract. Requires osmium-tool on PATH.
 */
export async function filterWaterwaysToOpl(inputPbf: string, outputOpl: string): Promise<void> {
  const filteredPbf = `${outputOpl}.filtered.osm.pbf`
  await execFileAsync('osmium', [
    'tags-filter',
    inputPbf,
    ...WATERWAY_FILTER_ARGS,
    '-o',
    filteredPbf,
    '--overwrite',
  ])
  await execFileAsync('osmium', ['cat', filteredPbf, '-f', 'opl', '-o', outputOpl, '--overwrite'])
}

export async function loadOpl(path: string): Promise<OplData> {
  return parseOpl(await readFile(path, 'utf8'))
}
