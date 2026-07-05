import { parseFacilitiesPage, type Facility } from '@moorhen/schema'
import { ETL_USER_AGENT } from './notices'

/** Licence-registry id — checked by scripts/check-registry.mjs. */
export const SOURCE_ID = 'crt-legacy-facilities'

const FEATURE_SERVER_BASE = 'https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services'

/** The legacy 2019 *_View_Public layers — still the only official facility source. */
export const CRT_FACILITY_SERVICES = [
  'Customer_Service_Facilities_View_Public',
  'Water_Point_View_Public',
  'Elsan_View_Public',
  'Pump_Out_View_Public',
  'Refuse_Disposal_View_Public',
  'Mooring_Site_View_Public',
  'Boatyards_View_Public',
] as const

export type CrtFacilityService = (typeof CRT_FACILITY_SERVICES)[number]

export function buildFacilityPageUrl(
  service: CrtFacilityService,
  offset: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
  })
  return `${FEATURE_SERVER_BASE}/${service}/FeatureServer/0/query?${params}`
}

export interface FetchFacilitiesResult {
  facilities: Facility[]
  errors: string[]
  pages: number
}

/**
 * Fetches every feature from a legacy facility layer, following ArcGIS
 * transfer-limit paging (layers cap pages at 1000–2000 records). A hard page
 * cap guards against a runaway loop if the API misreports the limit flag.
 */
export async function fetchAllFacilities(
  service: CrtFacilityService,
  fetchImpl: typeof fetch = fetch,
  pageSize = 1000,
  maxPages = 50,
): Promise<FetchFacilitiesResult> {
  const facilities: Facility[] = []
  const errors: string[] = []
  let offset = 0
  let pages = 0

  for (;;) {
    if (pages >= maxPages) {
      throw new Error(`${service}: exceeded ${maxPages} pages — aborting (misbehaving API?)`)
    }
    const response = await fetchImpl(buildFacilityPageUrl(service, offset, pageSize), {
      headers: { 'User-Agent': ETL_USER_AGENT, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`${service} returned HTTP ${response.status} at offset ${offset}`)
    }
    const page = parseFacilitiesPage(await response.json())
    facilities.push(...page.facilities)
    errors.push(...page.errors)
    pages += 1
    if (!page.exceededTransferLimit && page.featureCount < pageSize) break
    offset += page.featureCount
    if (page.featureCount === 0) break
  }

  return { facilities, errors, pages }
}

/**
 * The legacy layers carry duplicate records (same site exported twice, or
 * once per service view). Merge facilities sharing a normalized name within
 * `maxDistanceM`, OR-ing their service flags so nothing is lost.
 */
export function dedupeFacilities(facilities: Facility[], maxDistanceM = 150): Facility[] {
  const normalize = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const kept: Facility[] = []
  const byName = new Map<string, Facility[]>()

  for (const facility of facilities) {
    const key = normalize(facility.name)
    const group = byName.get(key) ?? []
    const twin = group.find((candidate) => {
      const dLat = (candidate.point[1] - facility.point[1]) * 111_320
      const dLon =
        (candidate.point[0] - facility.point[0]) *
        111_320 *
        Math.cos((facility.point[1] * Math.PI) / 180)
      return Math.hypot(dLat, dLon) <= maxDistanceM
    })
    if (twin) {
      for (const service of Object.keys(twin.services) as Array<keyof typeof twin.services>) {
        twin.services[service] = twin.services[service] || facility.services[service]
      }
      continue
    }
    group.push(facility)
    byName.set(key, group)
    kept.push(facility)
  }
  return kept
}
