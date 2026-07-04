import { parseNoticesResponse, type ParseNoticesResult } from '@moorhen/schema'

/** Licence-registry id — checked by scripts/check-registry.mjs. */
export const SOURCE_ID = 'crt-notices-api'

export const ETL_USER_AGENT =
  'Moorhen-ETL/0.1 (open-source non-commercial UK canal app; +https://github.com/moorhen-app/moorhen)'

const NOTICES_ENDPOINT = 'https://canalrivertrust.org.uk/api/stoppage/notices'

/**
 * The exact field list the notices page itself requests. Do not trim it:
 * the API requires the `fields` param and returns HTTP 500 without it.
 */
const NOTICE_FIELDS =
  'title,region,waterways,path,typeId,reasonId,programmeId,start,end,state,image'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface NoticeDateRange {
  /** YYYY-MM-DD */
  start: string
  /** YYYY-MM-DD */
  end: string
}

/**
 * Builds the notices URL with the exact five-parameter signature the API requires
 * (any subset returns HTTP 500, verified 2026-07-04). Query is assembled manually
 * so commas in `fields` stay unencoded, byte-identical to the browser's request.
 */
export function buildNoticesUrl(range: NoticeDateRange): string {
  if (!ISO_DATE.test(range.start) || !ISO_DATE.test(range.end)) {
    throw new Error(
      `notice date range must be YYYY-MM-DD, got start=${range.start} end=${range.end}`,
    )
  }
  const query = [
    'consult=false',
    'geometry=point', // geometry=line is broken server-side (HTTP 500)
    `start=${range.start}`,
    `end=${range.end}`,
    `fields=${NOTICE_FIELDS}`,
  ].join('&')
  return `${NOTICES_ENDPOINT}?${query}`
}

/**
 * Fetches and normalizes CRT notices for a date window.
 *
 * Throws on transport/HTTP errors (caller keeps its last-good cache).
 * Per-feature parse failures come back in `errors` alongside the notices
 * that did parse — partial schema drift degrades, it doesn't blank the map.
 */
export async function fetchNotices(
  range: NoticeDateRange,
  fetchImpl: typeof fetch = fetch,
): Promise<ParseNoticesResult> {
  const response = await fetchImpl(buildNoticesUrl(range), {
    headers: {
      'User-Agent': ETL_USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`CRT notices API returned HTTP ${response.status}`)
  }
  return parseNoticesResponse(await response.json())
}
