import { Directory, File, Paths } from 'expo-file-system'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { CDN } from '../data'

/**
 * Offline region downloads. A region grabs its basemap PMTiles (~100–250 MB)
 * plus the small national data artifacts (waterways, POIs, locks, moorings —
 * a few MB, shared across regions). Once a region is downloaded the map can
 * render its basemap with no signal.
 */

export interface RegionInfo {
  id: string
  name: string
  bounds: [number, number, number, number]
  networkKm: number
}

export interface RegionsFile {
  regions: RegionInfo[]
}

export interface RegionStatus {
  downloaded: boolean
  downloading: boolean
  progress: number
  bytes: number
}

const DATA_FILES = ['waterways.geojson', 'osm-pois.geojson', 'locks.geojson', 'moorings.geojson']

const offlineDir = new Directory(Paths.document, 'moorhen-offline')

function ensureDir(): void {
  if (!offlineDir.exists) offlineDir.create({ intermediates: true })
}

export function basemapFile(regionId: string): File {
  return new File(offlineDir, `basemap-${regionId}.pmtiles`)
}

function dataFile(name: string): File {
  return new File(offlineDir, name)
}

/** file:// URI of a downloaded region basemap, or null if not present. */
export function basemapUri(regionId: string): string | null {
  const file = basemapFile(regionId)
  return file.exists ? file.uri : null
}

/** Local data file URIs when the shared data pack is present, else null. */
export function offlineDataUris(): Record<string, string> | null {
  const present = DATA_FILES.every((name) => dataFile(name).exists)
  if (!present) return null
  return Object.fromEntries(DATA_FILES.map((name) => [name, dataFile(name).uri]))
}

// --- reactive status store ---

const statuses = new Map<string, RegionStatus>()
const listeners = new Set<() => void>()

function statusOf(regionId: string): RegionStatus {
  // Must return a STABLE reference between renders or useSyncExternalStore
  // loops forever — so the initial status is created once and cached.
  let status = statuses.get(regionId)
  if (!status) {
    const file = basemapFile(regionId)
    const exists = file.exists
    status = {
      downloaded: exists,
      downloading: false,
      progress: 0,
      bytes: exists ? (file.size ?? 0) : 0,
    }
    statuses.set(regionId, status)
  }
  return status
}

function setStatus(regionId: string, patch: Partial<RegionStatus>): void {
  statuses.set(regionId, { ...statusOf(regionId), ...patch })
  for (const listener of listeners) listener()
}

export function useRegionStatus(regionId: string): RegionStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => statusOf(regionId),
  )
}

export async function downloadRegion(regionId: string): Promise<void> {
  ensureDir()
  setStatus(regionId, { downloading: true, progress: 0 })
  try {
    // shared data pack first (small); skip files already present
    for (const name of DATA_FILES) {
      const file = dataFile(name)
      if (!file.exists) await File.downloadFileAsync(`${CDN}/data/latest/${name}`, file)
    }
    // basemap (large) — the bulk of the download
    const basemap = basemapFile(regionId)
    if (basemap.exists) basemap.delete()
    await File.downloadFileAsync(`${CDN}/data/latest/basemap-${regionId}.pmtiles`, basemap)
    setStatus(regionId, {
      downloading: false,
      downloaded: true,
      progress: 1,
      bytes: basemap.size ?? 0,
    })
  } catch {
    setStatus(regionId, { downloading: false, downloaded: basemapFile(regionId).exists })
  }
}

export function deleteRegion(regionId: string): void {
  const basemap = basemapFile(regionId)
  if (basemap.exists) basemap.delete()
  setStatus(regionId, { downloaded: false, downloading: false, progress: 0, bytes: 0 })
}

export function useRegions(): RegionInfo[] {
  const [regions, setRegions] = useState<RegionInfo[]>([])
  useEffect(() => {
    fetch(`${CDN}/data/latest/regions.json`)
      .then((response) => response.json() as Promise<RegionsFile>)
      .then((file) => setRegions(file.regions))
      .catch(() => setRegions([]))
  }, [])
  return regions
}
