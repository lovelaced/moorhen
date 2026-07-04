import { parseFacilitiesPage, type Facility } from '@moorhen/schema'
import { ETL_USER_AGENT } from './notices.js'

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
