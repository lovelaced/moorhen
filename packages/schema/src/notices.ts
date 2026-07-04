import { z } from 'zod'

/**
 * CRT stoppage/navigation notice schemas.
 *
 * The upstream API is undocumented and breakage-prone, so parsing is defensive:
 * unknown properties are tolerated (zod strips them), unknown typeId/reasonId
 * values are labelled rather than rejected, and one malformed feature never
 * fails the whole batch.
 *
 * Field semantics verified against the live API 2026-07-04
 * (fixture: packages/etl/test/fixtures/notices-2026-07-04.json).
 */

export const NOTICE_TYPES: Readonly<Record<number, string>> = {
  1: 'Navigation Closure',
  2: 'Navigation Restriction',
  3: 'Towpath Closure',
  4: 'Advice',
  8: 'Towpath Restriction',
  9: 'Navigation and Towpath Closure',
  10: 'Customer Service Facility',
  11: 'Navigation Restriction and Towpath Closure',
}

/** Notice types that block or restrict navigation (relevant for routing/alerts). */
export const NAVIGATION_BLOCKING_TYPE_IDS: ReadonlySet<number> = new Set([1, 2, 9, 11])

/** Facility outage notices (water points, Elsan, etc.). */
export const FACILITY_TYPE_ID = 10

export const NOTICE_REASONS: Readonly<Record<number, string>> = {
  2: 'Third-Party Works',
  5: 'Inspections',
  6: 'Maintenance',
  8: 'Repair',
  9: 'Suspected Vandalism',
  10: 'Vegetation',
  12: 'Information',
  13: 'Event',
  14: 'Boating Incident',
  15: 'Emergency Services Incident',
  16: 'Underwater Obstruction',
  17: 'Vehicle Incident',
  18: 'Low Water Levels',
  19: 'High Water Levels',
  20: 'Pollution Incident',
}

const pointGeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number()).min(2),
})

/**
 * `image` is null or an object with a srcset string ("url1 320w, url2 360w, …")
 * of site-relative URLs (observed live 2026-07-04). A plain string is tolerated
 * in case older/newer API versions used one.
 */
const noticeImageSchema = z.object({
  alt: z.string().nullish(),
  srcset: z
    .object({
      default: z.string().nullish(),
      avif: z.string().nullish(),
    })
    .nullish(),
})

const geometryCollectionSchema = z.object({
  type: z.literal('GeometryCollection'),
  geometries: z.array(z.unknown()),
})

export const rawNoticeFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.union([pointGeometrySchema, geometryCollectionSchema]).nullish(),
  properties: z.object({
    id: z.string().min(1),
    title: z.string(),
    region: z.string().nullish(),
    waterways: z.string().nullish(),
    path: z.string().nullish(),
    typeId: z.number().int(),
    reasonId: z.number().int().nullish(),
    programmeId: z.number().int().nullish(),
    start: z.string().nullish(),
    end: z.string().nullish(),
    state: z.string(),
    image: z.union([noticeImageSchema, z.string()]).nullish(),
  }),
})

export const rawNoticesResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()),
})

export type RawNoticeFeature = z.infer<typeof rawNoticeFeatureSchema>

/** Longitude/latitude pair (GeoJSON axis order). */
export type LonLat = [number, number]

export interface Notice {
  id: string
  title: string
  region: string | null
  /** Waterway names, split from the API's comma-separated string. May be truncated upstream. */
  waterways: string[]
  /** Absolute URL of the human-readable notice detail page. */
  url: string | null
  typeId: number
  /** Human label for typeId, or `Unknown type N` for values we haven't seen. */
  type: string
  reasonId: number | null
  reason: string | null
  programmeId: number | null
  /** ISO 8601, as supplied upstream. */
  start: string | null
  end: string | null
  state: 'Published' | 'Completed' | 'Cancelled' | (string & {})
  /** Largest available notice photo, with absolute URL, or null. */
  image: { url: string; alt: string | null } | null
  /** Notice locations. Usually 1–2 points bracketing the affected stretch. */
  points: LonLat[]
  isNavigationBlocking: boolean
  isFacilityNotice: boolean
}

const CRT_BASE_URL = 'https://canalrivertrust.org.uk'

function extractImage(image: RawNoticeFeature['properties']['image']): Notice['image'] {
  if (!image) return null
  if (typeof image === 'string') {
    return { url: new URL(image, CRT_BASE_URL).toString(), alt: null }
  }
  const srcset = image.srcset?.default ?? image.srcset?.avif
  if (!srcset) return null
  // srcset format: "url1 320w, url2 360w, …" — take the last (largest) candidate
  const candidates = srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((url): url is string => !!url)
  const largest = candidates[candidates.length - 1]
  if (!largest) return null
  return { url: new URL(largest, CRT_BASE_URL).toString(), alt: image.alt ?? null }
}

function extractPoints(geometry: RawNoticeFeature['geometry']): LonLat[] {
  if (!geometry) return []
  if (geometry.type === 'Point') {
    return [[geometry.coordinates[0]!, geometry.coordinates[1]!]]
  }
  const points: LonLat[] = []
  for (const member of geometry.geometries) {
    const parsed = pointGeometrySchema.safeParse(member)
    if (parsed.success) {
      points.push([parsed.data.coordinates[0]!, parsed.data.coordinates[1]!])
    }
  }
  return points
}

export function toNotice(feature: RawNoticeFeature): Notice {
  const p = feature.properties
  const waterways = (p.waterways ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
  return {
    id: p.id,
    title: p.title,
    region: p.region ?? null,
    waterways,
    url: p.path ? new URL(p.path, CRT_BASE_URL).toString() : null,
    typeId: p.typeId,
    type: NOTICE_TYPES[p.typeId] ?? `Unknown type ${p.typeId}`,
    reasonId: p.reasonId ?? null,
    reason:
      p.reasonId != null ? (NOTICE_REASONS[p.reasonId] ?? `Unknown reason ${p.reasonId}`) : null,
    programmeId: p.programmeId ?? null,
    start: p.start ?? null,
    end: p.end ?? null,
    state: p.state,
    image: extractImage(p.image),
    points: extractPoints(feature.geometry),
    isNavigationBlocking: NAVIGATION_BLOCKING_TYPE_IDS.has(p.typeId),
    isFacilityNotice: p.typeId === FACILITY_TYPE_ID,
  }
}

export interface ParseNoticesResult {
  notices: Notice[]
  /** Per-feature parse failures. Non-empty errors with non-empty notices = partial data (alert, don't discard). */
  errors: string[]
}

export function parseNoticesResponse(json: unknown): ParseNoticesResult {
  const collection = rawNoticesResponseSchema.safeParse(json)
  if (!collection.success) {
    return {
      notices: [],
      errors: [`response is not a GeoJSON FeatureCollection: ${collection.error.message}`],
    }
  }
  const notices: Notice[] = []
  const errors: string[] = []
  collection.data.features.forEach((feature, index) => {
    const parsed = rawNoticeFeatureSchema.safeParse(feature)
    if (parsed.success) {
      notices.push(toNotice(parsed.data))
    } else {
      errors.push(
        `feature[${index}]: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
    }
  })
  return { notices, errors }
}
