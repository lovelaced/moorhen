import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MooringCapture } from '../components/mooring-capture-sheet'

/**
 * The boater's own moorings — stored on the device, never uploaded unless the
 * user explicitly shares an entry later. This is the private map of good spots
 * and cell coverage built up over time (docs/product-notes.md).
 */

const KEY = 'moorhen.moorings.v1'

export interface SavedMooring extends MooringCapture {
  id: string
}

let cache: SavedMooring[] | null = null
const listeners = new Set<(moorings: SavedMooring[]) => void>()

export async function loadMoorings(): Promise<SavedMooring[]> {
  if (cache) return cache
  try {
    const raw = await AsyncStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as SavedMooring[]) : []
  } catch {
    cache = []
  }
  return cache
}

export function subscribeMoorings(listener: (moorings: SavedMooring[]) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const listener of listeners) listener(cache ?? [])
}

export async function saveMooring(capture: MooringCapture): Promise<SavedMooring> {
  const list = await loadMoorings()
  const mooring: SavedMooring = {
    ...capture,
    id: `${capture.savedAtMs}-${Math.round(capture.point[0] * 1e5)}`,
  }
  cache = [mooring, ...list]
  await AsyncStorage.setItem(KEY, JSON.stringify(cache))
  emit()
  return mooring
}

export async function deleteMooring(id: string): Promise<void> {
  const list = await loadMoorings()
  cache = list.filter((mooring) => mooring.id !== id)
  await AsyncStorage.setItem(KEY, JSON.stringify(cache))
  emit()
}

/** GeoJSON for the map's private-mooring pin layer. */
export function mooringsToGeoJSON(moorings: SavedMooring[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: moorings.map((mooring) => ({
      type: 'Feature',
      id: mooring.id,
      geometry: { type: 'Point', coordinates: mooring.point },
      properties: {
        id: mooring.id,
        edgeType: mooring.edgeType,
        hasPhoto: mooring.photoUri != null,
        downMbps: mooring.speed?.downMbps ?? null,
        photoUri: mooring.photoUri,
      },
    })),
  }
}
