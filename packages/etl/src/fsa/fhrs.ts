import { parseEstablishmentsResponse, type ParseEstablishmentsResult } from '@moorhen/schema'
import { ETL_USER_AGENT } from '../crt/notices'

/** Licence-registry id — checked by scripts/check-registry.mjs. */
export const SOURCE_ID = 'fsa-fhrs'

const API_BASE = 'https://api.ratings.food.gov.uk'

export interface FhrsQuery {
  latitude: number
  longitude: number
  /** Miles — the API's unit. */
  maxDistanceMiles: number
  pageSize?: number
  businessTypeId?: number
}

export function buildEstablishmentsUrl(query: FhrsQuery): string {
  const params = new URLSearchParams({
    latitude: String(query.latitude),
    longitude: String(query.longitude),
    maxDistanceLimit: String(query.maxDistanceMiles),
    pageSize: String(query.pageSize ?? 200),
  })
  if (query.businessTypeId != null) params.set('businessTypeId', String(query.businessTypeId))
  return `${API_BASE}/Establishments?${params}`
}

/** The API requires the x-api-version header and rejects anonymous UAs. */
export async function fetchEstablishmentsNear(
  query: FhrsQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<ParseEstablishmentsResult> {
  const response = await fetchImpl(buildEstablishmentsUrl(query), {
    headers: {
      'x-api-version': '2',
      'User-Agent': ETL_USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`FHRS API returned HTTP ${response.status}`)
  }
  return parseEstablishmentsResponse(await response.json())
}
