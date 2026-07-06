import Feather from '@expo/vector-icons/Feather'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import {
  DEFAULT_TIMING_PROFILE,
  journeyReach,
  type JourneyDay,
  type ReachPoint,
} from '@moorhen/graph'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SearchModal } from '../../components/search-modal'
import {
  alertsAvailable,
  subscribeWaterways,
  unsubscribeWaterway,
  useAlertSubscriptions,
} from '../../lib/alerts'
import { boatWarnings, useBoat } from '../../lib/boat-store'
import {
  bestFrontierName,
  loadPlacesIndex,
  nearestNamed,
  type PlaceEntry,
} from '../../lib/places-index'
import { plannerStore, usePlanner } from '../../lib/planner-store'
import type { RouteNotice } from '../../lib/route-notices'
import { loadGraph } from '../../lib/route-graph'
import { day as dayTheme, font, radius, shadow } from '../../theme'

/**
 * The journey-planning home. Shares the planner store with the Map tab —
 * pick endpoints on either screen and both stay in sync; this one adds the
 * day-by-day breakdown ("day 2 ends near Norton Junction") and pace tuning.
 */
export default function PlanScreen() {
  const { from, to, route, planning, stops, routeNotices, hoursPerDay } = usePlanner()
  const boat = useBoat()
  const [expandedNotice, setExpandedNotice] = useState<string | null>(null)
  const subscriptions = useAlertSubscriptions()
  const routeAlerted =
    route !== null &&
    route.waterways.length > 0 &&
    route.waterways.every((name) => subscriptions.includes(name))
  const warnings = route ? boatWarnings(boat, route.narrowLocks, route.broadLocks) : []
  const [searchTarget, setSearchTarget] = useState<'from' | 'to' | null>(null)
  const [places, setPlaces] = useState<PlaceEntry[] | null>(null)
  const [mode, setMode] = useState<'route' | 'reach'>('route')
  const [reachDays, setReachDays] = useState(2)
  const [reach, setReach] = useState<ReachPoint[] | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadPlacesIndex()
      .then(setPlaces)
      .catch(() => setPlaces(null))
  }, [])

  // "how far can I get?" — recompute when the inputs move
  useEffect(() => {
    if (mode !== 'reach' || !from) {
      setReach(null)
      return
    }
    let cancelled = false
    loadGraph()
      .then((graph) => {
        if (cancelled) return
        const budget = reachDays * hoursPerDay * 3600
        const frontier = journeyReach(graph, from.point, budget)
        setReach(frontier)
        plannerStore.setReach(frontier)
      })
      .catch(() => setReach(null))
    return () => {
      cancelled = true
    }
  }, [mode, from, reachDays, hoursPerDay])

  const mph = DEFAULT_TIMING_PROFILE.cruiseSpeedMps['narrow-canal'] / 0.44704

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Plan a cruise</Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modePill, mode === 'route' && styles.modePillActive]}
            onPress={() => setMode('route')}
          >
            <Text style={[styles.modeText, mode === 'route' && styles.modeTextActive]}>
              To a destination
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modePill, mode === 'reach' && styles.modePillActive]}
            onPress={() => setMode('reach')}
          >
            <Text style={[styles.modeText, mode === 'reach' && styles.modeTextActive]}>
              How far can I get?
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, shadow.card]}>
          <Pressable style={styles.field} onPress={() => setSearchTarget('from')}>
            <View style={styles.dotStart} />
            <Text style={from ? styles.fieldValue : styles.fieldPlaceholder} numberOfLines={1}>
              {from?.name ?? 'Choose start…'}
            </Text>
          </Pressable>
          {mode === 'route' && (
            <Pressable style={styles.field} onPress={() => setSearchTarget('to')}>
              <View style={styles.dotEnd} />
              <Text style={to ? styles.fieldValue : styles.fieldPlaceholder} numberOfLines={1}>
                {to?.name ?? 'Choose destination…'}
              </Text>
            </Pressable>
          )}
          {mode === 'reach' && (
            <View style={styles.reachRow}>
              <Text style={styles.reachLabel}>
                for {reachDays} day{reachDays === 1 ? '' : 's'} × {hoursPerDay} h
              </Text>
              <Pressable
                style={styles.paceButton}
                hitSlop={8}
                disabled={reachDays <= 1}
                onPress={() => setReachDays((d) => Math.max(1, d - 1))}
              >
                <Feather
                  name="minus"
                  size={15}
                  color={reachDays <= 1 ? dayTheme.ink3 : dayTheme.ink}
                />
              </Pressable>
              <Pressable
                style={styles.paceButton}
                hitSlop={8}
                disabled={reachDays >= 14}
                onPress={() => setReachDays((d) => Math.min(14, d + 1))}
              >
                <Feather
                  name="plus"
                  size={15}
                  color={reachDays >= 14 ? dayTheme.ink3 : dayTheme.ink}
                />
              </Pressable>
            </View>
          )}
          <View style={styles.fieldActions}>
            {mode === 'route' && (
              <Pressable style={styles.actionChip} onPress={() => plannerStore.swap()} hitSlop={8}>
                <Feather name="repeat" size={14} color={dayTheme.ink2} />
                <Text style={styles.actionChipText}>Swap</Text>
              </Pressable>
            )}
            {(from || to) && (
              <Pressable style={styles.actionChip} onPress={() => plannerStore.clear()} hitSlop={8}>
                <Feather name="x" size={14} color={dayTheme.ink2} />
                <Text style={styles.actionChipText}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        {mode === 'reach' && reach && places && (
          <>
            <Pressable style={styles.mapButton} onPress={() => router.navigate('/')}>
              <Feather name="map" size={15} color="#FFFFFF" />
              <Text style={styles.mapButtonText}>Show reach on map</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>Within reach</Text>
            {dedupeReach(reach, places).map((entry) => (
              <View key={entry.name} style={styles.dayRow}>
                <View style={styles.dayDot}>
                  <Feather name="flag" size={13} color={dayTheme.greenDark} />
                </View>
                <View style={styles.dayCol}>
                  <Text style={styles.dayTitle}>{entry.name}</Text>
                  <Text style={styles.dayMeta}>
                    {entry.kind} · {(entry.distanceM / 1609.344).toFixed(1)} mi away
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {mode === 'route' && planning && (
          <View style={[styles.card, shadow.card, styles.planningRow]}>
            <ActivityIndicator color={dayTheme.green} />
            <Text style={styles.planningText}>Planning route…</Text>
          </View>
        )}

        {mode === 'route' && route && (
          <>
            <View style={[styles.card, shadow.card]}>
              <View style={styles.summaryTop}>
                <Text style={styles.bigTime}>{route.durationLabel}</Text>
                <View style={styles.pacePill}>
                  <Text style={styles.pacePillText}>
                    {Math.ceil(route.cruisingDays)} day
                    {Math.ceil(route.cruisingDays) === 1 ? '' : 's'} at your pace
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <Stat
                  icon="map-marker-distance"
                  value={`${(route.distanceM / 1609.344).toFixed(1)} mi`}
                  label="distance"
                />
                <Stat
                  icon="chevron-double-up"
                  value={String(route.narrowLocks + route.broadLocks)}
                  label="locks"
                />
                <Stat
                  icon="faucet"
                  value={String(stops?.filter((s) => s.icon === 'water').length ?? '—')}
                  label="water points"
                />
                <Stat
                  icon="glass-mug-variant"
                  value={String(stops?.filter((s) => s.icon === 'pub').length ?? '—')}
                  label="pubs"
                />
              </View>
              <Pressable style={styles.mapButton} onPress={() => router.navigate('/')}>
                <Feather name="map" size={15} color="#FFFFFF" />
                <Text style={styles.mapButtonText}>View on map</Text>
              </Pressable>
              {alertsAvailable() && route.waterways.length > 0 && (
                <Pressable
                  style={styles.alertButton}
                  onPress={() => {
                    if (routeAlerted) {
                      for (const name of route.waterways) void unsubscribeWaterway(name)
                    } else {
                      void subscribeWaterways(route.waterways)
                    }
                  }}
                >
                  <Feather
                    name={routeAlerted ? 'bell-off' : 'bell'}
                    size={15}
                    color={dayTheme.greenDark}
                  />
                  <Text style={styles.alertButtonText} numberOfLines={2}>
                    {routeAlerted
                      ? 'Alerts on — tap to turn off'
                      : `Alert me about stoppages on ${route.waterways.join(' & ')}`}
                  </Text>
                </Pressable>
              )}
            </View>

            {warnings.length > 0 && (
              <View style={styles.warnCard}>
                <Feather name="alert-octagon" size={18} color="#9C4A32" />
                <View style={styles.warnCol}>
                  {warnings.map((warning) => (
                    <Text key={warning} style={styles.warnBody}>
                      {warning}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {routeNotices && routeNotices.length > 0 && (
              <View style={styles.warnCard}>
                <Feather name="alert-triangle" size={18} color="#B98A16" />
                <View style={styles.warnCol}>
                  {routeNotices
                    .slice(0, expandedNotice === null ? 3 : routeNotices.length)
                    .map((notice) => (
                      <NoticeRow
                        key={notice.id}
                        notice={notice}
                        expanded={expandedNotice === notice.id}
                        onToggle={() =>
                          setExpandedNotice(expandedNotice === notice.id ? null : notice.id)
                        }
                      />
                    ))}
                  {expandedNotice === null && routeNotices.length > 3 && (
                    <Text style={styles.warnBody}>
                      +{routeNotices.length - 3} more on this route
                    </Text>
                  )}
                </View>
              </View>
            )}

            {route.days.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Day by day</Text>
                {route.days.map((journeyDay) => (
                  <DayRow
                    key={journeyDay.day}
                    journeyDay={journeyDay}
                    places={places}
                    final={journeyDay.day === route.days.length}
                    destination={to?.name ?? null}
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={[styles.paceCard, shadow.pill]}>
          <Feather name="sliders" size={18} color={dayTheme.ink2} />
          <View style={styles.paceCol}>
            <Text style={styles.paceTitle}>Your pace</Text>
            <Text style={styles.paceMeta}>
              {mph.toFixed(1)} mph on narrow canals · {hoursPerDay} h cruising per day
            </Text>
          </View>
          <Pressable
            style={styles.paceButton}
            hitSlop={8}
            disabled={hoursPerDay <= 3}
            onPress={() => plannerStore.adjustPace(-1)}
          >
            <Feather
              name="minus"
              size={15}
              color={hoursPerDay <= 3 ? dayTheme.ink3 : dayTheme.ink}
            />
          </Pressable>
          <Pressable
            style={styles.paceButton}
            hitSlop={8}
            disabled={hoursPerDay >= 12}
            onPress={() => plannerStore.adjustPace(1)}
          >
            <Feather
              name="plus"
              size={15}
              color={hoursPerDay >= 12 ? dayTheme.ink3 : dayTheme.ink}
            />
          </Pressable>
        </View>

        {mode === 'route' && !route && !planning && (
          <Text style={styles.emptyHint}>
            Pick a start and destination — locks, junctions, moorings, pubs and places are all
            searchable. The map draws the route; this screen breaks it into cruising days.
          </Text>
        )}
      </ScrollView>

      <SearchModal
        visible={searchTarget !== null}
        onClose={() => setSearchTarget(null)}
        onSelect={(entry) => {
          if (searchTarget) plannerStore.setEndpoint(searchTarget, entry)
          setSearchTarget(null)
        }}
        placeholder={
          searchTarget === 'from'
            ? 'Route start: lock, mooring, place…'
            : 'Route destination: lock, mooring, place…'
        }
      />
    </SafeAreaView>
  )
}

/** Frontier points collapsed to one row per named place, furthest first. */
function dedupeReach(
  reach: ReachPoint[],
  places: PlaceEntry[],
): Array<{ name: string; kind: string; distanceM: number }> {
  const seen = new Map<string, { kind: string; distanceM: number }>()
  for (const point of reach) {
    const near = bestFrontierName(places, point.point as [number, number])
    if (!near) continue
    const existing = seen.get(near.name)
    if (existing === undefined || point.distanceM > existing.distanceM) {
      seen.set(near.name, { kind: near.kind, distanceM: point.distanceM })
    }
  }
  return [...seen.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.distanceM - a.distanceM)
    .slice(0, 8)
}

function NoticeRow({
  notice,
  expanded,
  onToggle,
}: {
  notice: RouteNotice
  expanded: boolean
  onToggle: () => void
}) {
  const kind = /restriction/i.test(notice.title) ? 'Restriction' : 'Stoppage'
  return (
    <Pressable onPress={onToggle}>
      <View style={styles.noticeHead}>
        <Text style={styles.warnTitle}>
          {kind} at mile {(notice.chainageM / 1609.344).toFixed(1)}
        </Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={dayTheme.ink3} />
      </View>
      <Text style={styles.warnBody} numberOfLines={expanded ? undefined : 1}>
        {notice.title}
      </Text>
      {expanded && (
        <>
          {(notice.start || notice.end) && (
            <Text style={styles.warnBody}>
              {fmtDate(notice.start)} – {notice.end ? fmtDate(notice.end) : 'until further notice'}
            </Text>
          )}
          {notice.url && (
            <Pressable hitSlop={6} onPress={() => Linking.openURL(notice.url!)}>
              <Text style={styles.warnLink}>View CRT notice</Text>
            </Pressable>
          )}
        </>
      )}
    </Pressable>
  )
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '…'

function DayRow({
  journeyDay,
  places,
  final,
  destination,
}: {
  journeyDay: JourneyDay
  places: PlaceEntry[] | null
  final: boolean
  destination: string | null
}) {
  const roundedMinutes = Math.round(journeyDay.seconds / 60 / 5) * 5
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60
  const near =
    final && destination
      ? destination
      : places
        ? nearestNamed(places, journeyDay.endPoint as [number, number])?.name
        : null

  return (
    <View style={styles.dayRow}>
      <View style={styles.dayDot}>
        <Text style={styles.dayDotText}>{journeyDay.day}</Text>
      </View>
      <View style={styles.dayCol}>
        <Text style={styles.dayTitle}>
          {(journeyDay.distanceM / 1609.344).toFixed(1)} mi
          {journeyDay.lockCount > 0
            ? ` · ${journeyDay.lockCount} lock${journeyDay.lockCount === 1 ? '' : 's'}`
            : ''}
          {` · ${hours} h${minutes > 0 ? ` ${minutes} min` : ''}`}
        </Text>
        <Text style={styles.dayMeta}>
          {final ? 'arrive ' : 'ends near '}
          {near ?? 'the cut'}
        </Text>
      </View>
    </View>
  )
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  value: string
  label: string
}) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={17} color={dayTheme.ink3} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dayTheme.bg },
  content: { padding: 20, gap: 14 },
  title: { fontFamily: font.semibold, fontSize: 24, color: dayTheme.ink, letterSpacing: -0.4 },
  card: { backgroundColor: dayTheme.surface, borderRadius: radius.card, padding: 16, gap: 10 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: radius.control,
    backgroundColor: dayTheme.surfaceMuted,
    paddingHorizontal: 14,
  },
  fieldValue: { fontFamily: font.medium, fontSize: 14, color: dayTheme.ink, flex: 1 },
  fieldPlaceholder: { fontFamily: font.regular, fontSize: 14, color: dayTheme.ink3, flex: 1 },
  dotStart: { width: 10, height: 10, borderRadius: 5, backgroundColor: dayTheme.green },
  dotEnd: { width: 10, height: 10, borderRadius: 3, backgroundColor: dayTheme.shieldRed },
  fieldActions: { flexDirection: 'row', gap: 8 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: dayTheme.surfaceMuted,
  },
  actionChipText: { fontFamily: font.medium, fontSize: 12, color: dayTheme.ink2 },
  planningRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planningText: { fontFamily: font.semibold, fontSize: 15, color: dayTheme.ink },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigTime: { fontFamily: font.bold, fontSize: 30, color: dayTheme.ink, letterSpacing: -1 },
  pacePill: {
    backgroundColor: dayTheme.greenSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
  },
  pacePillText: { fontFamily: font.semibold, fontSize: 12, color: dayTheme.greenDark },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  stat: { alignItems: 'center', gap: 3, minWidth: 64 },
  statValue: { fontFamily: font.semibold, fontSize: 15, color: dayTheme.ink },
  statLabel: { fontFamily: font.regular, fontSize: 11, color: dayTheme.ink3 },
  mapButton: {
    marginTop: 6,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: dayTheme.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapButtonText: { fontFamily: font.semibold, fontSize: 14, color: '#FFFFFF' },
  alertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: dayTheme.greenSoft,
  },
  alertButtonText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: dayTheme.greenDark,
    flex: 1,
    lineHeight: 17,
  },
  sectionTitle: { fontFamily: font.semibold, fontSize: 15, color: dayTheme.ink, marginTop: 4 },
  warnCard: {
    backgroundColor: dayTheme.amberSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: '#E8B83066',
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  warnCol: { flex: 1, gap: 6 },
  warnTitle: { fontFamily: font.semibold, fontSize: 13, color: dayTheme.ink },
  noticeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  warnLink: { fontFamily: font.semibold, fontSize: 12, color: dayTheme.green, marginTop: 2 },
  warnBody: { fontFamily: font.regular, fontSize: 12, color: dayTheme.ink2, lineHeight: 17 },
  dayRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: dayTheme.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotText: { fontFamily: font.semibold, fontSize: 12, color: dayTheme.greenDark },
  dayCol: { flex: 1, gap: 2 },
  dayTitle: { fontFamily: font.semibold, fontSize: 14, color: dayTheme.ink },
  dayMeta: { fontFamily: font.regular, fontSize: 12, color: dayTheme.ink2 },
  paceCard: {
    backgroundColor: dayTheme.surface,
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paceCol: { flex: 1, gap: 2 },
  paceTitle: { fontFamily: font.semibold, fontSize: 13, color: dayTheme.ink },
  paceMeta: { fontFamily: font.regular, fontSize: 12, color: dayTheme.ink2 },
  paceButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: dayTheme.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modePill: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: dayTheme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePillActive: { backgroundColor: dayTheme.green },
  modeText: { fontFamily: font.medium, fontSize: 13, color: dayTheme.ink2 },
  modeTextActive: { color: '#FFFFFF', fontFamily: font.semibold },
  reachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  reachLabel: { flex: 1, fontFamily: font.medium, fontSize: 14, color: dayTheme.ink },
  emptyHint: {
    fontFamily: font.regular,
    fontSize: 13,
    color: dayTheme.ink2,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
})
