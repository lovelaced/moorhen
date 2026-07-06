/**
 * EA real-time river levels (flood-monitoring API, OGL v3 — attribution on
 * the More screen). For river navigations: the nearest level station and its
 * latest reading, so "is the river up?" has an answer in the app.
 */

export interface RiverLevel {
  station: string
  river: string | null
  levelM: number
  readAt: string
}

const cache = new Map<string, Promise<RiverLevel | null>>()

export function fetchRiverLevel(point: [number, number]): Promise<RiverLevel | null> {
  const key = `${point[0].toFixed(2)},${point[1].toFixed(2)}`
  let existing = cache.get(key)
  if (!existing) {
    existing = lookup(point).catch(() => null)
    cache.set(key, existing)
  }
  return existing
}

async function lookup(point: [number, number]): Promise<RiverLevel | null> {
  const base = 'https://environment.data.gov.uk/flood-monitoring'
  const stationsRes = await fetch(
    `${base}/id/stations?lat=${point[1]}&long=${point[0]}&dist=10&parameter=level&_limit=5`,
  )
  if (!stationsRes.ok) return null
  const stations = (await stationsRes.json()) as {
    items?: Array<{
      '@id'?: string
      label?: string
      riverName?: string
      measures?: unknown
    }>
  }
  for (const station of stations.items ?? []) {
    const id = station['@id']?.split('/').pop()
    if (!id) continue
    const readingRes = await fetch(
      `${base}/id/stations/${id}/readings?latest&parameter=level&_limit=1`,
    )
    if (!readingRes.ok) continue
    const readings = (await readingRes.json()) as {
      items?: Array<{ value?: number; dateTime?: string }>
    }
    const reading = readings.items?.[0]
    if (reading?.value == null) continue
    return {
      station: String(station.label ?? id),
      river: station.riverName ?? null,
      levelM: reading.value,
      readAt: reading.dateTime ?? '',
    }
  }
  return null
}
