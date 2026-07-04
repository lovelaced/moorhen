/**
 * Moorhen artifact builder — turns raw sources into the versioned static
 * files the app consumes. Run nightly by CI, or locally:
 *
 *   pnpm etl:build --pbf path/to/extract.osm.pbf --out data/artifacts [--offline]
 *
 * Outputs (all zod-validated on the way out):
 *   waterways.geojson   graph edges as LineStrings (name, class, locks, tunnel)
 *   graph.json          routable graph (vertices + edges with geometry)
 *   osm-pois.geojson    locks gates, water points, Elsan, winding holes, pubs
 *   crt-facilities.geojson  CRT facility layers, normalized     [network]
 *   facilities-conflated.json  CRT×OSM matches, provenance kept [network]
 *   notices.json        CRT stoppage notices, 8-week window     [network]
 *   manifest.json       counts + build metadata (drift alarms diff this)
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildWaterwayGraph } from '@moorhen/graph'
import { fetchAllFacilities, CRT_FACILITY_SERVICES } from '../crt/facilities'
import { fetchNotices } from '../crt/notices'
import { conflatePoints } from '../conflate'
import { filterWaterwaysToOpl, loadOpl } from '../osm/pipeline'
import { extractPois } from '../pois'
import { buildOverlayTiles, corridorFromGraph, writeCorridor } from '../tiles'

interface Args {
  pbf: string
  out: string
  offline: boolean
  tiles: boolean
  noticesDays: number
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const pbf = get('--pbf')
  const out = get('--out') ?? 'data/artifacts'
  if (!pbf) {
    console.error('usage: build --pbf <extract.osm.pbf> [--out dir] [--offline] [--notices-days N]')
    process.exit(2)
  }
  return {
    pbf,
    out,
    offline: argv.includes('--offline'),
    tiles: argv.includes('--tiles'),
    noticesDays: Number(get('--notices-days') ?? 56),
  }
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  await mkdir(args.out, { recursive: true })
  const manifest: Record<string, unknown> = {
    builtAt: new Date().toISOString(),
    input: args.pbf,
    offline: args.offline,
  }

  // 1. OSM: filter → parse → graph + POIs
  console.log(`[osm] filtering ${args.pbf}…`)
  const opl = join(tmpdir(), `moorhen-waterways-${process.pid}.opl`)
  await filterWaterwaysToOpl(args.pbf, opl)
  const data = await loadOpl(opl)
  console.log(`[osm] ${data.nodes.size} nodes, ${data.ways.length} ways`)

  const graph = buildWaterwayGraph(data.nodes, data.ways)
  const waterways = {
    type: 'FeatureCollection',
    features: graph.edges.map((edge) => ({
      type: 'Feature',
      id: edge.id,
      geometry: { type: 'LineString', coordinates: edge.geometry },
      properties: {
        name: edge.name,
        class: edge.navigableClass,
        lengthM: Math.round(edge.lengthM),
        narrowLocks: edge.narrowLocks,
        broadLocks: edge.broadLocks,
        tunnelM: Math.round(edge.tunnelM),
      },
    })),
  }
  await writeFile(join(args.out, 'waterways.geojson'), JSON.stringify(waterways))
  await writeFile(
    join(args.out, 'graph.json'),
    JSON.stringify({
      vertices: [...graph.vertices.entries()].map(([id, v]) => ({ id, ...v })),
      edges: graph.edges,
    }),
  )
  manifest['edges'] = graph.edges.length
  manifest['vertices'] = graph.vertices.size
  manifest['locks'] = graph.edges.reduce((s, e) => s + e.narrowLocks + e.broadLocks, 0)

  const pois = extractPois(data.nodes.values())
  await writeFile(
    join(args.out, 'osm-pois.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      features: pois.map((poi) => ({
        type: 'Feature',
        id: poi.id,
        geometry: { type: 'Point', coordinates: poi.point },
        properties: { category: poi.category, name: poi.name, source: poi.source },
      })),
    }),
  )
  manifest['osmPois'] = pois.length
  console.log(
    `[osm] graph: ${graph.edges.length} edges, ${manifest['locks']} locks; ${pois.length} POIs`,
  )

  if (args.tiles) {
    // corridor polygon (clips the offline basemap download) + overlay tiles
    const corridorPath = await writeCorridor(args.out, corridorFromGraph(graph))
    console.log(`[tiles] corridor polygon → ${corridorPath}`)
    const overlay = await buildOverlayTiles({ artifactsDir: args.out })
    if (overlay) console.log(`[tiles] overlay tiles → ${overlay}`)
    else console.warn('[tiles] tippecanoe not installed — skipped overlay.pmtiles')
    manifest['overlayTiles'] = overlay !== null
  }

  if (!args.offline) {
    // 2. CRT facilities (all legacy layers, master layer normalized)
    console.log('[crt] fetching facility layers…')
    const master = await fetchAllFacilities('Customer_Service_Facilities_View_Public')
    if (master.errors.length > 0) {
      console.warn(
        `[crt] ${master.errors.length} facility parse warnings (first: ${master.errors[0]})`,
      )
    }
    await writeFile(
      join(args.out, 'crt-facilities.geojson'),
      JSON.stringify({
        type: 'FeatureCollection',
        features: master.facilities.map((f) => ({
          type: 'Feature',
          id: f.id,
          geometry: { type: 'Point', coordinates: f.point },
          properties: { name: f.name, ...f.services, source: 'crt' },
        })),
      }),
    )
    manifest['crtFacilities'] = master.facilities.length
    manifest['crtFacilityLayers'] = CRT_FACILITY_SERVICES.length

    // 3. Conflate CRT facilities with OSM water/elsan POIs (display join only)
    const osmFacilityPois = pois.filter(
      (p) => p.category === 'water-point' || p.category === 'elsan',
    )
    const conflation = conflatePoints(
      master.facilities.filter((f) => f.services.water || f.services.elsan),
      osmFacilityPois,
      { maxDistanceM: 75 },
    )
    await writeFile(
      join(args.out, 'facilities-conflated.json'),
      JSON.stringify({
        matched: conflation.matched.map((m) => ({
          crtId: m.primary.id,
          osmId: m.secondary.id,
          distanceM: Math.round(m.distanceM),
        })),
        crtOnly: conflation.unmatchedPrimary.length,
        osmOnly: conflation.unmatchedSecondary.length,
      }),
    )
    manifest['conflatedPairs'] = conflation.matched.length

    // 4. Notices window
    console.log('[crt] fetching notices…')
    const start = new Date()
    const end = new Date(start.getTime() + args.noticesDays * 86_400_000)
    const notices = await fetchNotices({ start: isoDate(start), end: isoDate(end) })
    if (notices.errors.length > 0) {
      console.warn(
        `[crt] ${notices.errors.length} notice parse warnings — schema drift? (first: ${notices.errors[0]})`,
      )
    }
    await writeFile(
      join(args.out, 'notices.json'),
      JSON.stringify({ fetchedAt: manifest['builtAt'], notices: notices.notices }),
    )
    manifest['notices'] = notices.notices.length
    manifest['noticesNavigationBlocking'] = notices.notices.filter(
      (n) => n.isNavigationBlocking,
    ).length
  }

  await writeFile(join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('[done]', JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
