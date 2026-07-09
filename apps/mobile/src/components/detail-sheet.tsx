import Feather from '@expo/vector-icons/Feather'
import { useEffect, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  communityConfigured,
  fetchFacilityReports,
  submitStatusReport,
  type CommunityReport,
  type FacilityStatus,
} from '../lib/community'
import { fetchContributedHours, submitHours } from '../lib/community'
import { formatOpeningHours, isOpenNow } from '../lib/format-hours'
import { fetchRiverLevel, type RiverLevel } from '../lib/ea'
import { fetchHygieneRating, type HygieneRating } from '../lib/hygiene'
import { day, font, radius, shadow } from '../theme'

/**
 * Tap-a-feature detail sheet. Every place on the map opens one of these;
 * unknown facts render as prompts ("edge type unknown — help confirm"),
 * because surfacing the data gap is how the community fills it.
 */

export interface SelectedFeature {
  title: string
  subtitle: string
  details: string[]
  coords: [number, number]
  /** Optional primary link (e.g. the CRT notice page) shown beside Street View. */
  link?: { label: string; url: string }
  /** Stable id enabling community status reports on this facility. */
  facilityId?: string
  /** Set for pubs/shops: look up the FSA food-hygiene rating live. */
  hygieneLookup?: { name: string; point: [number, number] }
  /** Computed from opening hours when the grammar is evaluable. */
  openNow?: boolean
  /** River navigations: fetch the nearest EA level station live. */
  riverLevelAt?: [number, number]
  /** Extra buttons (delete a private mooring, retest signal…). */
  actions?: Array<{ label: string; destructive?: boolean; onPress: () => void }>
  /** Place id + point — enables "suggest opening hours". */
  placeEdit?: { placeId: string; point: [number, number]; name: string }
}

const CATEGORY_LABELS: Record<string, string> = {
  'water-point': 'Water point',
  elsan: 'Elsan disposal',
  'winding-hole': 'Winding hole',
  pub: 'Pub',
  shop: 'Shop',
  laundry: 'Laundry',
  fuel: 'Boat fuel',
  chandlery: 'Chandlery',
  'drinking-water': 'Drinking water',
  'lock-gate': 'Lock gate',
  station: 'Railway station',
  'notable-tree': 'Notable tree',
}

/** The OSM denotation splits the easter-egg layer into its two kinds. */
function treeLabel(props: Props): string {
  return props['denotation'] === 'landmark' ? 'Landmark tree' : 'Veteran tree'
}

const FACILITY_SERVICES: Array<[string, string]> = [
  ['water', 'Water'],
  ['elsan', 'Elsan'],
  ['pumpOutUserOperated', 'Pump-out (self-service)'],
  ['pumpOutStaffOperated', 'Pump-out (staffed)'],
  ['toilet', 'Toilets'],
  ['shower', 'Showers'],
  ['washingMachine', 'Washing machine'],
  ['tumbleDryer', 'Tumble dryer'],
  ['refuse', 'Bins'],
  ['recycling', 'Recycling'],
]

type Props = Record<string, unknown>

function pointOf(feature: GeoJSON.Feature): [number, number] {
  const geometry = feature.geometry
  if (geometry.type === 'Point') return geometry.coordinates as [number, number]
  if (geometry.type === 'LineString') {
    const line = geometry.coordinates as [number, number][]
    return line[Math.floor(line.length / 2)] ?? [0, 0]
  }
  return [0, 0]
}

function walkNote(props: Props): string | null {
  const walkM = Number(props['walkM'])
  if (!Number.isFinite(walkM)) return null
  const minutes = Math.max(1, Math.round(walkM / 80)) // ~4.8 km/h
  return `~${minutes} min walk from the cut`
}

/** Can you moor at this pub? OSM tag first, then proximity to the mooring layer. */
export function pubMooringNote(props: Record<string, unknown>): string | null {
  if (props['category'] !== 'pub') return null
  const tag = props['mooring'] as string | undefined
  if (tag === 'yes' || tag === 'customer') return 'Boat mooring at the pub'
  if (tag === 'private' || tag === 'no') return 'No visitor mooring at the pub'
  const mooringM = Number(props['mooringM'])
  if (Number.isFinite(mooringM)) {
    if (mooringM <= 100) return 'Mooring right outside'
    return `Nearest mooring ~${Math.round(mooringM / 10) * 10} m away`
  }
  return 'No mooring recorded nearby'
}

/** These live ON the water — "walk from the cut" would be noise. */
const ON_WATER_CATEGORIES = new Set([
  'water-point',
  'elsan',
  'winding-hole',
  'lock-gate',
  'junction',
  'drinking-water',
])

export function selectPoi(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const rawCategory = String(props['category'])
  const category =
    rawCategory === 'notable-tree' ? treeLabel(props) : (CATEGORY_LABELS[rawCategory] ?? 'Place')
  const rawHours = typeof props['hours'] === 'string' ? props['hours'] : null
  const hours = rawHours ? formatOpeningHours(rawHours).join('\n') : null
  const open = rawHours ? isOpenNow(rawHours) : null
  const walk = ON_WATER_CATEGORIES.has(rawCategory) ? null : walkNote(props)
  const species = typeof props['species'] === 'string' ? `Species: ${props['species']}` : null
  const details = [walk, species, pubMooringNote(props), hours].filter(
    (line): line is string => line !== null,
  )
  const coords = pointOf(feature)
  const name = (props['name'] as string) || category
  const wantsHygiene = (rawCategory === 'pub' || rawCategory === 'shop') && !!props['name']
  const editable = rawCategory === 'pub' || rawCategory === 'shop'
  return {
    title: name,
    subtitle: `${category} · OpenStreetMap`,
    details,
    coords,
    ...(open !== null ? { openNow: open } : {}),
    ...(wantsHygiene ? { hygieneLookup: { name, point: coords } } : {}),
    ...(editable && feature.id !== undefined
      ? { placeEdit: { placeId: `osm:${feature.id}`, point: coords, name } }
      : {}),
  }
}

export function selectFacility(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const services = FACILITY_SERVICES.filter(([key]) => props[key] === true).map(
    ([, label]) => label,
  )
  return {
    title: (props['name'] as string) || 'CRT facility',
    subtitle: 'Boater facility · Canal & River Trust',
    details: services.length > 0 ? [services.join(' · ')] : [],
    coords: pointOf(feature),
    facilityId: typeof feature.id === 'string' ? feature.id : undefined,
  }
}

export function selectLock(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const gauge = props['gauge'] === 'narrow' ? 'Narrow lock (~7 ft)' : 'Broad lock (~14 ft)'
  return {
    title: (props['name'] as string) || 'Lock',
    subtitle: `${gauge} · ${(props['waterway'] as string) ?? 'unknown waterway'}`,
    details: ['Marker points uphill'],
    coords: pointOf(feature),
  }
}

export function selectMooring(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const access = String(props['access'] ?? 'public')
  const details: string[] = []
  details.push(
    props['mooringType']
      ? `Edge: ${String(props['mooringType'])}`
      : 'Edge type unknown — help confirm (rings / armco / pins)',
  )
  if (props['maxStay']) details.push(`Max stay ${String(props['maxStay'])}`)
  const coords = pointOf(feature)
  return {
    title: (props['name'] as string) || 'Mooring',
    subtitle: access === 'public' ? 'Visitor mooring · OpenStreetMap' : `Mooring (${access})`,
    details,
    coords,
  }
}

export function selectNotice(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const dates =
    props['start'] && props['end']
      ? `${String(props['start']).slice(0, 10)} → ${String(props['end']).slice(0, 10)}`
      : null
  return {
    title: (props['title'] as string) || 'Stoppage',
    subtitle: `${String(props['type'] ?? 'Notice')}${props['reason'] ? ` · ${String(props['reason'])}` : ''}`,
    details: dates ? [dates] : [],
    coords: pointOf(feature),
    link: props['url'] ? { label: 'Full notice', url: String(props['url']) } : undefined,
  }
}

function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

function CommunityStatus({ facilityId, coords }: { facilityId: string; coords: [number, number] }) {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchFacilityReports(facilityId).then((found) => {
      if (!cancelled) setReports(found)
    })
    return () => {
      cancelled = true
    }
  }, [facilityId])

  if (!communityConfigured()) return null

  const report = async (status: FacilityStatus) => {
    try {
      await submitStatusReport(facilityId, status, coords)
      setSent(true)
      setReports(await fetchFacilityReports(facilityId))
    } catch {
      // stay quiet — community layer is best-effort
    }
  }

  return (
    <View style={styles.community}>
      {reports[0] && (
        <Text style={styles.communityLatest}>
          {reports[0].status === 'working' ? '✓' : '⚠'} Reported {reports[0].status}{' '}
          {timeAgo(reports[0].created_at)}
        </Text>
      )}
      {sent ? (
        <Text style={styles.communityThanks}>Thanks — logged for other boaters</Text>
      ) : (
        <View style={styles.communityRow}>
          <Pressable style={styles.communityButton} onPress={() => report('working')}>
            <Feather name="check" size={14} color={day.accentDark} />
            <Text style={styles.communityButtonText}>Working</Text>
          </Pressable>
          <Pressable style={styles.communityButton} onPress={() => report('broken')}>
            <Feather name="alert-triangle" size={14} color={day.shieldRed} />
            <Text style={styles.communityButtonText}>Problem</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

function RiverLevelRow({ point }: { point: [number, number] }) {
  const [level, setLevel] = useState<RiverLevel | null | 'loading'>('loading')
  useEffect(() => {
    let cancelled = false
    fetchRiverLevel(point).then((found) => {
      if (!cancelled) setLevel(found)
    })
    return () => {
      cancelled = true
    }
  }, [point])
  if (level === 'loading' || level === null) return null
  return (
    <View style={styles.hygieneRow}>
      <Feather name="bar-chart-2" size={13} color={day.waterDeep} />
      <Text style={styles.hygieneText}>
        River level at {level.station}: {level.levelM.toFixed(2)} m · Environment Agency
      </Text>
    </View>
  )
}

function HygieneRow({ lookup }: { lookup: { name: string; point: [number, number] } }) {
  const [rating, setRating] = useState<HygieneRating | null | 'loading'>('loading')
  useEffect(() => {
    let cancelled = false
    fetchHygieneRating(lookup.name, lookup.point).then((found) => {
      if (!cancelled) setRating(found)
    })
    return () => {
      cancelled = true
    }
  }, [lookup])
  if (rating === 'loading' || rating === null) return null
  const numeric = Number(rating.rating)
  return (
    <View style={styles.hygieneRow}>
      <Feather name="check-circle" size={13} color={day.accentDark} />
      <Text style={styles.hygieneText}>
        Food hygiene:{' '}
        {Number.isFinite(numeric) ? `${'★'.repeat(numeric)} ${rating.rating}/5` : rating.rating}
        {' · '}
        {rating.authority}
      </Text>
    </View>
  )
}

function SuggestHoursBlock({
  place,
}: {
  place: { placeId: string; point: [number, number]; name: string }
}) {
  const [contributed, setContributed] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchContributedHours(place.placeId).then((found) => {
      if (!cancelled) setContributed(found)
    })
    return () => {
      cancelled = true
    }
  }, [place.placeId])

  if (!communityConfigured()) return null

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      await submitHours(place.placeId, place.point, trimmed)
      setSent(true)
      setEditing(false)
    } catch {
      setEditing(false)
    }
  }

  return (
    <View style={styles.community}>
      {contributed && (
        <Text style={styles.communityLatest}>
          Hours (boater-reported): {formatOpeningHours(contributed).join(' · ')}
        </Text>
      )}
      {sent ? (
        <Text style={styles.communityThanks}>Hours suggested — thanks!</Text>
      ) : editing ? (
        <View style={styles.hoursEditRow}>
          <TextInput
            style={styles.hoursInput}
            placeholder="e.g. Mon–Fri 12:00–23:00, Sat–Sun 10:00–00:00"
            placeholderTextColor={day.ink3}
            value={value}
            onChangeText={setValue}
            autoFocus
          />
          <Pressable style={styles.communityButton} onPress={submit}>
            <Feather name="check" size={14} color={day.accentDark} />
            <Text style={styles.communityButtonText}>Send</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.communityButton} onPress={() => setEditing(true)}>
          <Feather name="clock" size={14} color={day.accentDark} />
          <Text style={styles.communityButtonText}>Suggest opening hours</Text>
        </Pressable>
      )}
    </View>
  )
}

export function DetailSheet({
  selected,
  onClose,
}: {
  selected: SelectedFeature
  onClose: () => void
}) {
  const [lon, lat] = selected.coords
  // slide up on mount so swapping with the places sheet reads as an exchange
  const rise = useRef(new Animated.Value(80)).current
  useEffect(() => {
    rise.setValue(80)
    Animated.timing(rise, { toValue: 0, duration: 220, useNativeDriver: true }).start()
  }, [selected, rise])
  return (
    <Animated.View style={[styles.sheet, shadow.card, { transform: [{ translateY: rise }] }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{selected.title}</Text>
            {selected.openNow !== undefined && (
              <View style={[styles.openTag, !selected.openNow && styles.closedTag]}>
                <Text style={[styles.openTagText, !selected.openNow && styles.closedTagText]}>
                  {selected.openNow ? 'Open now' : 'Closed now'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>{selected.subtitle}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={20} color={day.ink3} />
        </Pressable>
      </View>
      {selected.details.map((line) => (
        <Text key={line} style={styles.detail}>
          {line}
        </Text>
      ))}
      {selected.riverLevelAt && <RiverLevelRow point={selected.riverLevelAt} />}
      {selected.hygieneLookup && <HygieneRow lookup={selected.hygieneLookup} />}
      {selected.placeEdit && <SuggestHoursBlock place={selected.placeEdit} />}
      {selected.facilityId && (
        <CommunityStatus facilityId={selected.facilityId} coords={selected.coords} />
      )}
      {selected.actions && (
        <View style={styles.actionsRow}>
          {selected.actions.map((action) => (
            <Pressable key={action.label} style={styles.communityButton} onPress={action.onPress}>
              <Feather
                name={action.destructive ? 'trash-2' : 'refresh-cw'}
                size={14}
                color={action.destructive ? day.shieldRed : day.accentDark}
              />
              <Text
                style={[styles.communityButtonText, action.destructive && { color: day.shieldRed }]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.linksRow}>
        <Pressable
          hitSlop={6}
          onPress={() =>
            Linking.openURL(
              `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`,
            )
          }
        >
          <Text style={styles.linkText}>Walking directions</Text>
        </Pressable>
        <Pressable
          hitSlop={6}
          onPress={() =>
            Linking.openURL(`https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17`)
          }
        >
          <Text style={styles.linkText}>Towpath imagery</Text>
        </Pressable>
      </View>
      <View style={styles.buttons}>
        {selected.link ? (
          <Pressable
            style={styles.buttonPrimary}
            onPress={() => Linking.openURL(selected.link!.url)}
          >
            <Feather name="file-text" size={15} color="#FFFFFF" />
            <Text style={styles.buttonPrimaryText}>{selected.link.label}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.buttonPrimary}
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`,
              )
            }
          >
            <Feather name="external-link" size={15} color="#FFFFFF" />
            <Text style={styles.buttonPrimaryText}>Street View</Text>
          </Pressable>
        )}
        <Pressable style={styles.buttonSecondary} onPress={onClose}>
          <Text style={styles.buttonSecondaryText}>Close</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  openTag: {
    backgroundColor: day.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    height: 20,
    justifyContent: 'center',
  },
  openTagText: { fontFamily: font.semibold, fontSize: 11, color: day.accentDark },
  closedTag: { backgroundColor: '#F3DCD3' },
  closedTagText: { color: '#9C4A32' },
  linksRow: { flexDirection: 'row', gap: 16 },
  linkText: { fontFamily: font.semibold, fontSize: 12, color: day.accent },
  actionsRow: { flexDirection: 'row', gap: 8 },
  hoursEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hoursInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: day.surfaceMuted,
    paddingHorizontal: 10,
    fontFamily: font.regular,
    fontSize: 13,
    color: day.ink,
  },
  hygieneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hygieneText: { fontFamily: font.medium, fontSize: 12, color: day.ink2 },
  community: { gap: 6, marginTop: 2 },
  communityLatest: { fontFamily: font.medium, fontSize: 12, color: day.ink2 },
  communityThanks: { fontFamily: font.medium, fontSize: 12, color: day.accentDark },
  communityRow: { flexDirection: 'row', gap: 8 },
  communityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: day.surfaceMuted,
  },
  communityButtonText: { fontFamily: font.semibold, fontSize: 12, color: day.ink },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: font.semibold, fontSize: 17, color: day.ink, letterSpacing: -0.2 },
  subtitle: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  detail: { fontFamily: font.regular, fontSize: 13, color: day.ink2, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  buttonPrimary: {
    flex: 1,
    height: 42,
    backgroundColor: day.accent,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonPrimaryText: { fontFamily: font.semibold, fontSize: 13, color: '#FFFFFF' },
  buttonSecondary: {
    flex: 1,
    height: 42,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: day.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondaryText: { fontFamily: font.semibold, fontSize: 13, color: day.ink },
})

export function selectWaterway(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const classLabels: Record<string, string> = {
    'narrow-canal': 'Narrow canal (~7 ft locks)',
    'broad-canal': 'Broad canal (~14 ft locks)',
    river: 'River navigation',
    'tidal-river': 'Tidal river',
    'commercial-waterway': 'Commercial waterway',
    'derelict-canal': 'Derelict canal — not navigable',
  }
  const details: string[] = []
  const narrow = Number(props['narrowLocks'] ?? 0)
  const broad = Number(props['broadLocks'] ?? 0)
  if (narrow + broad > 0) {
    const parts = []
    if (broad > 0) parts.push(`${broad} broad`)
    if (narrow > 0) parts.push(`${narrow} narrow`)
    details.push(`${narrow + broad} locks on this stretch (${parts.join(', ')})`)
  }
  const lengthM = Number(props['lengthM'])
  if (Number.isFinite(lengthM) && lengthM > 0) {
    details.push(`${(lengthM / 1609.344).toFixed(1)} mi stretch`)
  }
  const cls = String(props['class'] ?? '')
  const isRiver = cls === 'river' || cls === 'tidal-river'
  const coords = pointOf(feature)
  return {
    ...(isRiver ? { riverLevelAt: coords } : {}),
    title: (props['name'] as string) || 'Waterway',
    subtitle: classLabels[String(props['class'])] ?? 'Waterway',
    details,
    coords,
  }
}
