import AsyncStorage from '@react-native-async-storage/async-storage'
import type { JourneyDay, ReachPoint } from '@moorhen/graph'
import { useSyncExternalStore } from 'react'
import type { SearchEntry } from '../components/search-modal'
import { loadGraph, planRoute, type PlannedRoute } from './route-graph'
import { findRouteStops, type RouteStop } from './route-stops'

/**
 * Journey-planner state, shared by the Map and Plan tabs: choose endpoints
 * on either screen and both stay in sync — the map draws the line, the Plan
 * tab shows the day-by-day breakdown.
 */

export interface PlannerState {
  from: SearchEntry | null
  to: SearchEntry | null
  planning: boolean
  route: (PlannedRoute & { days: JourneyDay[] }) | null
  stops: RouteStop[] | null
  hoursPerDay: number
  /** "How far can I get?" frontier — drawn on the map as flags. */
  reach: ReachPoint[] | null
}

type Listener = () => void

const PACE_KEY = 'moorhen.pace.hoursPerDay'

class PlannerStore {
  private state: PlannerState = {
    from: null,
    to: null,
    planning: false,
    route: null,
    stops: null,
    hoursPerDay: 7,
    reach: null,
  }
  private listeners = new Set<Listener>()
  private planGeneration = 0

  constructor() {
    AsyncStorage.getItem(PACE_KEY)
      .then((saved) => {
        const parsed = Number(saved)
        if (Number.isFinite(parsed) && parsed >= 3 && parsed <= 12) {
          this.patch({ hoursPerDay: parsed })
        }
      })
      .catch(() => {})
  }

  getState = (): PlannerState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private patch(partial: Partial<PlannerState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener()
  }

  setEndpoint(which: 'from' | 'to', entry: SearchEntry | null): void {
    this.patch(which === 'from' ? { from: entry } : { to: entry })
    void this.replan()
  }

  swap(): void {
    this.patch({ from: this.state.to, to: this.state.from })
    void this.replan()
  }

  clear(): void {
    this.planGeneration++
    this.patch({ from: null, to: null, route: null, stops: null, planning: false, reach: null })
  }

  setReach(reach: ReachPoint[] | null): void {
    this.patch({ reach })
  }

  adjustPace(delta: number): void {
    const next = Math.min(12, Math.max(3, this.state.hoursPerDay + delta))
    if (next === this.state.hoursPerDay) return
    this.patch({ hoursPerDay: next })
    AsyncStorage.setItem(PACE_KEY, String(next)).catch(() => {})
    void this.replan()
  }

  private async replan(): Promise<void> {
    const { from, to, hoursPerDay } = this.state
    if (!from || !to) {
      this.patch({ route: null, stops: null, planning: false })
      return
    }
    const generation = ++this.planGeneration
    this.patch({ planning: true, route: null, stops: null })
    try {
      const graph = await loadGraph()
      const route = planRoute(graph, from.point, to.point, hoursPerDay)
      if (generation !== this.planGeneration) return
      this.patch({ route, planning: false })
      if (route) {
        const stops = await findRouteStops(route.line)
        if (generation !== this.planGeneration) return
        this.patch({ stops })
      }
    } catch {
      if (generation === this.planGeneration) this.patch({ planning: false })
    }
  }
}

export const plannerStore = new PlannerStore()

export function usePlanner(): PlannerState {
  return useSyncExternalStore(plannerStore.subscribe, plannerStore.getState)
}
