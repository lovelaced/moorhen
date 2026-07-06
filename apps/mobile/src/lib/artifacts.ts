import { urls } from '../data'
import { offlineDataFile } from './offline'

/**
 * Session-cached fetchers for the published artifacts — search, route stops
 * and future features share one download of each file.
 */

const cache = new Map<string, Promise<GeoJSON.FeatureCollection>>()

/** Network first; the downloaded offline pack when there's no signal. */
async function loadWithOfflineFallback<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`)
    return (await response.json()) as T
  } catch (error) {
    const name = url.split('/').pop()!
    const local = offlineDataFile(name)
    if (local) return (await local.json()) as T
    throw error
  }
}

function fetchCollection(url: string): Promise<GeoJSON.FeatureCollection> {
  let existing = cache.get(url)
  if (!existing) {
    existing = loadWithOfflineFallback<GeoJSON.FeatureCollection>(url)
    // a rejected promise must not poison the cache — allow retries
    existing.catch(() => cache.delete(url))
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
  if (!noticesPromise) {
    noticesPromise = loadWithOfflineFallback<{ notices: NoticeRecord[] }>(urls.notices).then(
      (file) => file.notices,
    )
    noticesPromise.catch(() => {
      noticesPromise = null
    })
  }
  return noticesPromise
}
