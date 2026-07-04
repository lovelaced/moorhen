import { z } from 'zod'
import type { LonLat } from './notices'

/**
 * CRT legacy boater-facility layers (ArcGIS FeatureServer, last refreshed
 * Dec 2019 — still the only official source of facility locations).
 * Flags arrive as "Yes"/"No" strings; parsing is defensive because the
 * layers predate any schema guarantees and are due a migration.
 */

const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number()).min(2),
})

export const rawFacilityFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: pointSchema.nullish(),
  properties: z
    .object({
      SAP_FUNC_LOC: z.string().min(1),
      SAP_DESCRIPTION: z.string().nullish(),
    })
    .catchall(z.unknown()),
})

export const rawFacilitiesPageSchema = z.object({
  type: z.literal('FeatureCollection'),
  properties: z.object({ exceededTransferLimit: z.boolean().nullish() }).nullish(),
  features: z.array(z.unknown()),
})

export type RawFacilityFeature = z.infer<typeof rawFacilityFeatureSchema>

export interface FacilityServices {
  water: boolean
  elsan: boolean
  pumpOutUserOperated: boolean
  pumpOutStaffOperated: boolean
  toilet: boolean
  shower: boolean
  washingMachine: boolean
  tumbleDryer: boolean
  refuse: boolean
  /** Any of the *_RECYCLING flags. */
  recycling: boolean
  lighting: boolean
}

export interface Facility {
  /** CRT SAP functional location, e.g. "AL-002-027" — stable identifier. */
  id: string
  name: string
  point: LonLat
  services: FacilityServices
}

const yes = (props: Record<string, unknown>, key: string): boolean =>
  typeof props[key] === 'string' && props[key].toLowerCase() === 'yes'

const RECYCLING_KEYS = [
  'PAPER_RECYCLING',
  'PLASTIC_RECYCLING',
  'BATTERY_RECYCLING',
  'COMPOSTING',
  'OIL_RECYCLING',
  'METAL_RECYCLING',
  'GLASS_RECYCLING',
] as const

export function toFacility(feature: RawFacilityFeature): Facility | null {
  if (!feature.geometry) return null
  const props = feature.properties
  return {
    id: props.SAP_FUNC_LOC,
    name: props.SAP_DESCRIPTION ?? props.SAP_FUNC_LOC,
    point: [feature.geometry.coordinates[0]!, feature.geometry.coordinates[1]!],
    services: {
      water: yes(props, 'WATER_POINT'),
      elsan: yes(props, 'ELSAN_POINT'),
      pumpOutUserOperated: yes(props, 'PUMP_OUT_USER_OPERATED'),
      pumpOutStaffOperated: yes(props, 'PUMP_OUT_STAFF_OPERATED'),
      toilet: yes(props, 'TOILET'),
      shower: yes(props, 'SHOWER'),
      washingMachine: yes(props, 'WASHING_MACHINE'),
      tumbleDryer: yes(props, 'TUMBLE_DRYER'),
      refuse: yes(props, 'REFUSE_DISPOSAL'),
      recycling: RECYCLING_KEYS.some((key) => yes(props, key)),
      lighting: yes(props, 'LIGHTING'),
    },
  }
}

export interface ParseFacilitiesPageResult {
  facilities: Facility[]
  errors: string[]
  /** ArcGIS sets this when more pages remain. */
  exceededTransferLimit: boolean
  featureCount: number
}

export function parseFacilitiesPage(json: unknown): ParseFacilitiesPageResult {
  const page = rawFacilitiesPageSchema.safeParse(json)
  if (!page.success) {
    return {
      facilities: [],
      errors: [`response is not an ArcGIS GeoJSON page: ${page.error.message}`],
      exceededTransferLimit: false,
      featureCount: 0,
    }
  }
  const facilities: Facility[] = []
  const errors: string[] = []
  page.data.features.forEach((feature, index) => {
    const parsed = rawFacilityFeatureSchema.safeParse(feature)
    if (!parsed.success) {
      errors.push(
        `feature[${index}]: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
      return
    }
    const facility = toFacility(parsed.data)
    if (facility) facilities.push(facility)
  })
  return {
    facilities,
    errors,
    exceededTransferLimit: page.data.properties?.exceededTransferLimit === true,
    featureCount: page.data.features.length,
  }
}
