import { useSyncExternalStore } from 'react'
import { cruiseStore, type CruiseSnapshot } from './cruise-store'
import { startCruiseTracking, stopCruiseTracking } from './cruise-task'

/**
 * Thin React binding over the cruise store. Tracking itself runs in the
 * foreground-location task (cruise-task.ts), so a cruise survives the app
 * being backgrounded or the screen locking; this hook just renders the
 * store's snapshot and exposes start/stop.
 */
export function useCruise() {
  const state = useSyncExternalStore<CruiseSnapshot>(
    (listener) => cruiseStore.subscribe(listener),
    () => cruiseStore.getSnapshot(),
  )

  const start = async () => {
    const result = await startCruiseTracking()
    if (!result.ok && result.error) cruiseStore.setError(result.error)
  }

  return { state, start, stop: stopCruiseTracking }
}
