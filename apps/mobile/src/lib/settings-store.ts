import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore } from 'react'

/**
 * App-wide toggles. Currently just the easter egg: seven taps on the version
 * row (More tab) unlock the veteran-trees map layer. Unlocks persist —
 * old trees don't forget.
 */

export interface Settings {
  treesUnlocked: boolean
}

const KEY = 'moorhen.settings.v1'
const DEFAULT: Settings = { treesUnlocked: false }

let state: Settings = DEFAULT
const listeners = new Set<() => void>()

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<Settings>
    state = { treesUnlocked: parsed.treesUnlocked === true }
    for (const listener of listeners) listener()
  })
  .catch(() => {})

export function setSettings(patch: Partial<Settings>): void {
  state = { ...state, ...patch }
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {})
  for (const listener of listeners) listener()
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}
