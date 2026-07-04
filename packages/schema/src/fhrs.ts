import { z } from 'zod'
import type { LonLat } from './notices'

/**
 * FSA Food Hygiene Rating Scheme establishments (England/Wales/NI numeric
 * 0–5; Scotland's FHIS uses "Pass"/"Improvement Required"). Geocode
 * lon/lat arrive as strings.
 */

export const rawEstablishmentSchema = z.object({
  FHRSID: z.number().int(),
  BusinessName: z.string(),
  BusinessType: z.string().nullish(),
  RatingValue: z.string().nullish(),
  RatingDate: z.string().nullish(),
  AddressLine1: z.string().nullish(),
  AddressLine2: z.string().nullish(),
  AddressLine3: z.string().nullish(),
  PostCode: z.string().nullish(),
  LocalAuthorityName: z.string().nullish(),
  geocode: z
    .object({
      longitude: z.string().nullish(),
      latitude: z.string().nullish(),
    })
    .nullish(),
})

export const rawEstablishmentsResponseSchema = z.object({
  establishments: z.array(z.unknown()),
})

export interface HygieneRating {
  /** Numeric 0–5 where the scheme is numeric; null for FHIS/exempt/awaiting. */
  score: number | null
  /** Raw scheme value: "5", "Pass", "AwaitingInspection", "Exempt", … */
  value: string | null
  date: string | null
}

export interface Establishment {
  id: number
  name: string
  businessType: string | null
  rating: HygieneRating
  point: LonLat | null
  address: string | null
  authority: string | null
}

function toEstablishment(raw: z.infer<typeof rawEstablishmentSchema>): Establishment {
  const lon = raw.geocode?.longitude ? Number.parseFloat(raw.geocode.longitude) : Number.NaN
  const lat = raw.geocode?.latitude ? Number.parseFloat(raw.geocode.latitude) : Number.NaN
  const numeric = raw.RatingValue != null ? Number.parseInt(raw.RatingValue, 10) : Number.NaN
  const address = [raw.AddressLine1, raw.AddressLine2, raw.AddressLine3, raw.PostCode]
    .filter((part): part is string => !!part)
    .join(', ')
  return {
    id: raw.FHRSID,
    name: raw.BusinessName,
    businessType: raw.BusinessType ?? null,
    rating: {
      score: Number.isFinite(numeric) ? numeric : null,
      value: raw.RatingValue ?? null,
      date: raw.RatingDate ?? null,
    },
    point: Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null,
    address: address.length > 0 ? address : null,
    authority: raw.LocalAuthorityName ?? null,
  }
}

export interface ParseEstablishmentsResult {
  establishments: Establishment[]
  errors: string[]
}

export function parseEstablishmentsResponse(json: unknown): ParseEstablishmentsResult {
  const response = rawEstablishmentsResponseSchema.safeParse(json)
  if (!response.success) {
    return {
      establishments: [],
      errors: [`response has no establishments array: ${response.error.message}`],
    }
  }
  const establishments: Establishment[] = []
  const errors: string[] = []
  response.data.establishments.forEach((raw, index) => {
    const parsed = rawEstablishmentSchema.safeParse(raw)
    if (parsed.success) establishments.push(toEstablishment(parsed.data))
    else
      errors.push(
        `establishment[${index}]: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
  })
  return { establishments, errors }
}
