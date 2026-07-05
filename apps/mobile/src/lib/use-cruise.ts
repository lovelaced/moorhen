import {
  createDirectionTracker,
  snapToNetwork,
  stoppageAhead,
  type Direction,
  type NetworkSnap,
  type WaterwayGraph,
} from '@moorhen/graph'
import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getNotices, type NoticeRecord } from './artifacts'
import { loadGraph } from './route-graph'

/**
 * Cruise tracking (v1: while the app is foregrounded). Each GPS fix is
 * snapped to the network; travel direction comes from chainage progression
 * on the current edge (GPS bearing is useless at 3 mph). Stoppages ahead are
 * found by routing to each nearby navigation-blocking notice and checking
 * that the first leg leaves in the direction of travel.
 */

const AHEAD_SEARCH_M = 50_000
const AHEAD_RECOMPUTE_MS = 60_000

export interface StoppageAhead {
  title: string
  reason: string | null
  url: string | null
  distanceM: number
}

export interface CruiseState {
  active: boolean
  waterway: string | null
  speedMph: number | null
  direction: Direction
  distanceTodayM: number
  ahead: StoppageAhead | null
  error: string | null
}

const IDLE: CruiseState = {
  active: false,
  waterway: null,
  speedMph: null,
  direction: 0,
  distanceTodayM: 0,
  ahead: null,
  error: null,
}

function fastDistanceM(a: [number, number], b: [number, number]): number {
  const dLat = (a[1] - b[1]) * 111_320
  const dLon = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

interface NoticeStoppage {
  id: string
  point: [number, number]
  notice: NoticeRecord
}

function findAhead(
  graph: WaterwayGraph,
  snap: NetworkSnap,
  direction: Direction,
  notices: NoticeRecord[],
): StoppageAhead | null {
  if (direction === 0) return null
  const stoppages: NoticeStoppage[] = []
  for (const notice of notices) {
    if (!notice.isNavigationBlocking || notice.state !== 'Published') continue
    const point = notice.points[0]
    if (point) stoppages.push({ id: notice.id, point, notice })
  }
  const result = stoppageAhead(graph, snap, direction, stoppages, AHEAD_SEARCH_M)
  if (!result) return null
  return {
    title: result.stoppage.notice.title,
    reason: result.stoppage.notice.reason,
    url: result.stoppage.notice.url,
    distanceM: result.distanceM,
  }
}

export function useCruise() {
  const [state, setState] = useState<CruiseState>(IDLE)
  const subscription = useRef<Location.LocationSubscription | null>(null)
  const tracker = useRef(createDirectionTracker())
  const lastEdgeId = useRef<string | null>(null)
  const lastPoint = useRef<[number, number] | null>(null)
  const distanceM = useRef(0)
  const lastAheadAt = useRef(0)
  const aheadRef = useRef<StoppageAhead | null>(null)

  const stop = useCallback(() => {
    subscription.current?.remove()
    subscription.current = null
    tracker.current.reset()
    lastEdgeId.current = null
    lastPoint.current = null
    distanceM.current = 0
    aheadRef.current = null
    setState(IDLE)
  }, [])

  const start = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) {
      setState({ ...IDLE, error: 'Location permission is needed to cruise' })
      return
    }
    const [graph, notices] = await Promise.all([loadGraph(), getNotices().catch(() => [])])
    setState({ ...IDLE, active: true })

    try {
      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4_000,
          distanceInterval: 10,
        },
        (position) => {
          const point: [number, number] = [position.coords.longitude, position.coords.latitude]
          const snap = snapToNetwork(graph, point, 1_000)
          if (!snap) {
            setState((current) => ({ ...current, waterway: null }))
            return
          }
          if (lastEdgeId.current !== snap.edge.id) {
            tracker.current.reset()
            lastEdgeId.current = snap.edge.id
          }
          const direction = tracker.current.update({
            chainageMeters: snap.chainageM,
            timestampMs: position.timestamp,
          })
          if (lastPoint.current) {
            const step = fastDistanceM(lastPoint.current, snap.point as [number, number])
            if (step < 200) distanceM.current += step
          }
          lastPoint.current = snap.point as [number, number]

          const now = position.timestamp
          if (
            direction !== 0 &&
            (now - lastAheadAt.current > AHEAD_RECOMPUTE_MS || !aheadRef.current)
          ) {
            lastAheadAt.current = now
            aheadRef.current = findAhead(graph, snap, direction, notices)
          }
          if (direction === 0) aheadRef.current = null

          const speed = position.coords.speed
          setState({
            active: true,
            waterway: snap.edge.name,
            speedMph: speed != null && speed >= 0 ? speed * 2.23694 : null,
            direction,
            distanceTodayM: distanceM.current,
            ahead: aheadRef.current,
            error: null,
          })
        },
      )
    } catch {
      setState({ ...IDLE, active: true, error: 'Waiting for a GPS fix…' })
    }
  }, [])

  useEffect(() => stop, [stop])

  return { state, start, stop }
}
