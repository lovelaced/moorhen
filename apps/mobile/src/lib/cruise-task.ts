import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { cruiseStore } from './cruise-store'

/**
 * Foreground-location service so a cruise keeps tracking with the screen
 * locked / app backgrounded. The task is defined at module load (required by
 * expo-task-manager) and feeds fixes into the cruise store.
 */

export const CRUISE_TASK = 'moorhen-cruise-location'

interface LocationTaskData {
  locations: Location.LocationObject[]
}

TaskManager.defineTask(CRUISE_TASK, async ({ data, error }) => {
  if (error) {
    cruiseStore.setError('Location error — tap to retry')
    return
  }
  const { locations } = (data ?? {}) as LocationTaskData
  for (const location of locations ?? []) {
    cruiseStore.ingest(
      {
        lon: location.coords.longitude,
        lat: location.coords.latitude,
        timestampMs: location.timestamp,
      },
      location.coords.speed ?? null,
    )
  }
})

export async function startCruiseTracking(): Promise<{ ok: boolean; error?: string }> {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (!foreground.granted) {
    return { ok: false, error: 'Location permission is needed to cruise' }
  }
  await cruiseStore.prime()
  cruiseStore.begin()

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(CRUISE_TASK).catch(
    () => false,
  )
  if (alreadyRunning) await Location.stopLocationUpdatesAsync(CRUISE_TASK)

  await Location.startLocationUpdatesAsync(CRUISE_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5_000,
    distanceInterval: 15,
    // keeps the OS delivering fixes with the screen off
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Moorhen — cruise in progress',
      notificationBody: 'Tracking your journey and watching for stoppages ahead.',
      notificationColor: '#3D8A5A',
    },
  })
  return { ok: true }
}

export async function stopCruiseTracking(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(CRUISE_TASK).catch(() => false)
  if (running) await Location.stopLocationUpdatesAsync(CRUISE_TASK)
  cruiseStore.end()
}
