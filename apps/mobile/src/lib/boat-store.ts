import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore } from 'react'
import type { BoatProfile } from './boat-warnings'

export { boatWarnings, type BoatProfile } from './boat-warnings'

/**
 * The boat's vital statistics — length and beam drive dimension warnings on
 * planned routes (narrow locks are ~7 ft × 57 ft; broad ~14 ft × 72 ft).
 */

const KEY = 'moorhen.boat.v1'
const DEFAULT: BoatProfile = { lengthFt: 57, beamFt: 6.8 }

let state: BoatProfile = DEFAULT
const listeners = new Set<() => void>()

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<BoatProfile>
    if (typeof parsed.lengthFt === 'number' && typeof parsed.beamFt === 'number') {
      state = { lengthFt: parsed.lengthFt, beamFt: parsed.beamFt }
      for (const listener of listeners) listener()
    }
  })
  .catch(() => {})

export function getBoat(): BoatProfile {
  return state
}

export function setBoat(patch: Partial<BoatProfile>): void {
  state = {
    lengthFt: Math.min(72, Math.max(20, patch.lengthFt ?? state.lengthFt)),
    beamFt: Math.min(14, Math.max(6, patch.beamFt ?? state.beamFt)),
  }
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {})
  for (const listener of listeners) listener()
}

export function useBoat(): BoatProfile {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}
