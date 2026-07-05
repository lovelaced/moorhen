import {
  createDirectionTracker,
  snapToNetwork,
  stoppageAhead,
  type Direction,
  type NetworkSnap,
  type WaterwayGraph,
} from '@moorhen/graph'
import { getNotices, type NoticeRecord } from './artifacts'
import { loadGraph } from './route-graph'

/**
 * Cruise session state, decoupled from React so it survives the location
 * task's background firings (which happen with no mounted component). The
 * background task pushes fixes in; the UI subscribes for renders; both read
 * the same singleton. Position never leaves the device.
 */

const AHEAD_SEARCH_M = 50_000
const AHEAD_RECOMPUTE_MS = 60_000
/** Stationary >1 h within this radius → prompt to log the mooring. */
const MOORED_RADIUS_M = 50
const MOORED_MS = 60 * 60_000

export interface StoppageAhead {
  title: string
  reason: string | null
  url: string | null
  distanceM: number
}

export interface TrackPoint {
  lon: number
  lat: number
  timestampMs: number
}

export interface CruiseSnapshot {
  active: boolean
  waterway: string | null
  speedMph: number | null
  direction: Direction
  distanceM: number
  ahead: StoppageAhead | null
  /** Fixes recorded this session (for the diary / moored-up detection). */
  points: TrackPoint[]
  /** Set when the boat has been stationary long enough to prompt a mooring log. */
  mooredPrompt: MooredPrompt | null
  error: string | null
}

export interface MooredPrompt {
  point: [number, number]
  /** How long we've been stationary here, ms. */
  stationaryMs: number
}

type Listener = (snapshot: CruiseSnapshot) => void

interface NoticeStoppage {
  id: string
  point: [number, number]
  notice: NoticeRecord
}

function fastDistanceM(a: [number, number], b: [number, number]): number {
  const dLat = (a[1] - b[1]) * 111_320
  const dLon = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
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

class CruiseStore {
  private snapshot: CruiseSnapshot = {
    active: false,
    waterway: null,
    speedMph: null,
    direction: 0,
    distanceM: 0,
    ahead: null,
    points: [],
    mooredPrompt: null,
    error: null,
  }
  private listeners = new Set<Listener>()
  private tracker = createDirectionTracker()
  private graph: WaterwayGraph | null = null
  private notices: NoticeRecord[] = []
  private lastEdgeId: string | null = null
  private lastSnapPoint: [number, number] | null = null
  private lastAheadAt = 0
  private stationarySince: { point: [number, number]; timestampMs: number } | null = null
  private mooredDismissedAt: [number, number] | null = null

  getSnapshot(): CruiseSnapshot {
    return this.snapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(patch: Partial<CruiseSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  /** Load graph + notices ahead of tracking; safe to call repeatedly. */
  async prime(): Promise<void> {
    if (!this.graph) {
      const [graph, notices] = await Promise.all([loadGraph(), getNotices().catch(() => [])])
      this.graph = graph
      this.notices = notices
    }
  }

  begin(): void {
    this.tracker.reset()
    this.lastEdgeId = null
    this.lastSnapPoint = null
    this.lastAheadAt = 0
    this.snapshot = {
      active: true,
      waterway: null,
      speedMph: null,
      direction: 0,
      distanceM: 0,
      ahead: null,
      points: [],
      mooredPrompt: null,
      error: null,
    }
    this.stationarySince = null
    this.mooredDismissedAt = null
    this.emit({})
  }

  end(): void {
    this.emit({ active: false })
  }

  dismissMooredPrompt(): void {
    if (this.snapshot.mooredPrompt) this.mooredDismissedAt = this.snapshot.mooredPrompt.point
    this.stationarySince = null
    this.emit({ mooredPrompt: null })
  }

  setError(message: string): void {
    this.emit({ error: message })
  }

  /** Called by the background location task for each fix. */
  ingest(point: TrackPoint, speedMps: number | null): void {
    if (!this.snapshot.active || !this.graph) return
    const coord: [number, number] = [point.lon, point.lat]
    const snap = snapToNetwork(this.graph, coord, 1_000)
    const points = [...this.snapshot.points, point].slice(-5_000)

    if (!snap) {
      this.emit({ waterway: null, points })
      return
    }
    if (this.lastEdgeId !== snap.edge.id) {
      this.tracker.reset()
      this.lastEdgeId = snap.edge.id
    }
    const direction = this.tracker.update({
      chainageMeters: snap.chainageM,
      timestampMs: point.timestampMs,
    })

    let distanceM = this.snapshot.distanceM
    if (this.lastSnapPoint) {
      const step = fastDistanceM(this.lastSnapPoint, snap.point as [number, number])
      if (step < 200) distanceM += step
    }
    this.lastSnapPoint = snap.point as [number, number]

    let ahead = this.snapshot.ahead
    if (direction === 0) {
      ahead = null
    } else if (point.timestampMs - this.lastAheadAt > AHEAD_RECOMPUTE_MS || !ahead) {
      this.lastAheadAt = point.timestampMs
      ahead = findAhead(this.graph, snap, direction, this.notices)
    }

    // Moored-up detection: stationary within MOORED_RADIUS_M for MOORED_MS.
    const raw: [number, number] = coord
    let mooredPrompt = this.snapshot.mooredPrompt
    if (!this.stationarySince || fastDistanceM(this.stationarySince.point, raw) > MOORED_RADIUS_M) {
      this.stationarySince = { point: raw, timestampMs: point.timestampMs }
      mooredPrompt = null
    } else {
      const stationaryMs = point.timestampMs - this.stationarySince.timestampMs
      const dismissedHere =
        this.mooredDismissedAt != null &&
        fastDistanceM(this.mooredDismissedAt, raw) <= MOORED_RADIUS_M
      if (stationaryMs >= MOORED_MS && !dismissedHere) {
        mooredPrompt = { point: this.stationarySince.point, stationaryMs }
      }
    }

    this.emit({
      waterway: snap.edge.name,
      speedMph: speedMps != null && speedMps >= 0 ? speedMps * 2.23694 : null,
      direction,
      distanceM,
      ahead,
      points,
      mooredPrompt,
      error: null,
    })
  }
}

export const cruiseStore = new CruiseStore()
