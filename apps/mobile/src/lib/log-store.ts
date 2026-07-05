import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * The private cruise log: one entry per ended cruise. Stays on-device —
 * this is the seed of the CC evidence pack (export lands later).
 */

export interface CruiseSession {
  id: string
  startedAtMs: number
  endedAtMs: number
  distanceM: number
  /** Waterway the cruise ended on, when known. */
  waterway: string | null
}

const KEY = 'moorhen.log.v1'

let cache: CruiseSession[] | null = null
const listeners = new Set<(sessions: CruiseSession[]) => void>()

export async function loadSessions(): Promise<CruiseSession[]> {
  if (cache) return cache
  try {
    const raw = await AsyncStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as CruiseSession[]) : []
  } catch {
    cache = []
  }
  return cache
}

export function subscribeSessions(listener: (sessions: CruiseSession[]) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function appendSession(session: Omit<CruiseSession, 'id'>): Promise<void> {
  const list = await loadSessions()
  cache = [{ ...session, id: String(session.endedAtMs) }, ...list].slice(0, 500)
  await AsyncStorage.setItem(KEY, JSON.stringify(cache))
  for (const listener of listeners) listener(cache)
}
