/**
 * Live FSA food-hygiene lookup for pubs/shops, on tap. One small request per
 * place, cached for the session — no API key, official public API. England,
 * Wales & NI use 0–5 ratings (FHRS); Scotland's FHIS uses Pass / Improvement
 * Required, which we show verbatim.
 */

export interface HygieneRating {
  business: string
  /** "5", "4"… or "Pass" / "Improvement Required" (FHIS). */
  rating: string
  authority: string
}

const cache = new Map<string, Promise<HygieneRating | null>>()

const normalize = (name: string) =>
  name
    .toLowerCase()
    .replace(/^(the|ye olde?)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function fetchHygieneRating(
  name: string,
  point: [number, number],
): Promise<HygieneRating | null> {
  const key = `${name}@${point[0].toFixed(4)},${point[1].toFixed(4)}`
  let existing = cache.get(key)
  if (!existing) {
    existing = lookup(name, point).catch(() => null)
    cache.set(key, existing)
  }
  return existing
}

async function lookup(name: string, point: [number, number]): Promise<HygieneRating | null> {
  // NB the API's maxDistanceLimit doesn't actually limit (results come back
  // alphabetical for the whole district) — search by name, sort by distance,
  // then verify the hit is genuinely nearby.
  const params = new URLSearchParams({
    name,
    latitude: String(point[1]),
    longitude: String(point[0]),
    sortOptionKey: 'distance',
    pageSize: '10',
  })
  const response = await fetch(`https://api.ratings.food.gov.uk/Establishments?${params}`, {
    headers: { 'x-api-version': '2', Accept: 'application/json' },
  })
  if (!response.ok) return null
  const data = (await response.json()) as {
    establishments?: Array<{
      BusinessName?: string
      RatingValue?: string
      LocalAuthorityName?: string
      geocode?: { latitude?: string; longitude?: string }
    }>
  }
  const wanted = normalize(name)
  for (const est of data.establishments ?? []) {
    if (!est.BusinessName || !est.RatingValue) continue
    if (['AwaitingInspection', 'Exempt', 'AwaitingPublication'].includes(est.RatingValue)) continue
    const lat = Number(est.geocode?.latitude)
    const lon = Number(est.geocode?.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const dLat = (lat - point[1]) * 111_320
      const dLon = (lon - point[0]) * 111_320 * Math.cos((point[1] * Math.PI) / 180)
      if (Math.hypot(dLat, dLon) > 600) continue // same-name pub in the next village
    }
    const got = normalize(est.BusinessName)
    if (got === wanted || got.includes(wanted) || wanted.includes(got)) {
      return {
        business: est.BusinessName,
        rating: est.RatingValue,
        authority: est.LocalAuthorityName ?? 'FSA',
      }
    }
  }
  return null
}
