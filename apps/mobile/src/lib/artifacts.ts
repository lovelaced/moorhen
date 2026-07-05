import { urls } from '../data'

/**
 * Session-cached fetchers for the published artifacts — search, route stops
 * and future features share one download of each file.
 */

const cache = new Map<string, Promise<GeoJSON.FeatureCollection>>()

function fetchCollection(url: string): Promise<GeoJSON.FeatureCollection> {
  let existing = cache.get(url)
  if (!existing) {
    existing = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`)
      return response.json() as Promise<GeoJSON.FeatureCollection>
    })
    cache.set(url, existing)
  }
  return existing
}

export const getPois = () => fetchCollection(urls.pois)
export const getFacilities = () => fetchCollection(urls.facilities)
export const getMoorings = () => fetchCollection(urls.moorings)
export const getLocks = () => fetchCollection(urls.locks)

export interface NoticeRecord {
  id: string
  title: string
  type: string
  reason: string | null
  start: string | null
  end: string | null
  url: string | null
  state: string
  isNavigationBlocking: boolean
  points: [number, number][]
}

let noticesPromise: Promise<NoticeRecord[]> | null = null

export function getNotices(): Promise<NoticeRecord[]> {
  noticesPromise ??= fetch(urls.notices)
    .then((response) => {
      if (!response.ok) throw new Error(`notices fetch: HTTP ${response.status}`)
      return response.json() as Promise<{ notices: NoticeRecord[] }>
    })
    .then((file) => file.notices)
  return noticesPromise
}
