import AsyncStorage from '@react-native-async-storage/async-storage'
import { PermissionsAndroid, Platform } from 'react-native'
import { useSyncExternalStore } from 'react'

/**
 * Stoppage push alerts: the notices worker publishes one FCM topic per
 * waterway (ww-<slug>); subscribing here means CRT navigation closures on
 * those waterways arrive as system notifications, even with the app closed.
 */

// Keep in sync with workers/notices/src/topics.ts — same slug, same topics.
export function waterwayTopic(waterwayName: string): string {
  const slug = waterwayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return `ww-${slug || 'unknown'}`
}

import type messagingDefault from '@react-native-firebase/messaging'

type MessagingFactory = typeof messagingDefault

/** Guarded: resolves null in environments without the native module. */
function messagingModule(): MessagingFactory | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@react-native-firebase/messaging') as { default: MessagingFactory }).default
  } catch {
    return null
  }
}

export const alertsAvailable = (): boolean => messagingModule() !== null

const KEY = 'moorhen.alerts.v1'

let subscriptions: string[] = []
const listeners = new Set<() => void>()

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return
    subscriptions = JSON.parse(raw) as string[]
    for (const listener of listeners) listener()
  })
  .catch(() => {})

function persist(): void {
  AsyncStorage.setItem(KEY, JSON.stringify(subscriptions)).catch(() => {})
  for (const listener of listeners) listener()
}

export function useAlertSubscriptions(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => subscriptions,
  )
}

async function ensurePermission(): Promise<boolean> {
  const messaging = messagingModule()
  if (!messaging) return false
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS!,
    )
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false
  }
  await messaging().requestPermission()
  return true
}

/** Subscribe to stoppage alerts for the given waterway names. */
export async function subscribeWaterways(names: readonly string[]): Promise<boolean> {
  const messaging = messagingModule()
  if (!messaging) return false
  if (!(await ensurePermission())) return false
  const fresh = [...new Set(names)].filter((name) => !subscriptions.includes(name))
  for (const name of fresh) {
    await messaging().subscribeToTopic(waterwayTopic(name))
  }
  if (fresh.length > 0) {
    subscriptions = [...subscriptions, ...fresh].sort()
    persist()
  }
  return true
}

export async function unsubscribeWaterway(name: string): Promise<void> {
  const messaging = messagingModule()
  if (messaging) {
    await messaging()
      .unsubscribeFromTopic(waterwayTopic(name))
      .catch(() => {})
  }
  subscriptions = subscriptions.filter((existing) => existing !== name)
  persist()
}
