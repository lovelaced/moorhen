import Feather from '@expo/vector-icons/Feather'
import * as Linking from 'expo-linking'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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

export function selectPoi(feature: GeoJSON.Feature): SelectedFeature {
  const props = (feature.properties ?? {}) as Props
  const category = CATEGORY_LABELS[String(props['category'])] ?? 'Place'
  const walk = walkNote(props)
  return {
    title: (props['name'] as string) || category,
    subtitle: `${category} · OpenStreetMap`,
    details: walk ? [walk] : [],
    coords: pointOf(feature),
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
  return {
    title: (props['name'] as string) || 'Mooring',
    subtitle: access === 'public' ? 'Visitor mooring · OpenStreetMap' : `Mooring (${access})`,
    details,
    coords: pointOf(feature),
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

export function DetailSheet({
  selected,
  onClose,
}: {
  selected: SelectedFeature
  onClose: () => void
}) {
  const [lon, lat] = selected.coords
  return (
    <View style={[styles.sheet, shadow.card]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{selected.title}</Text>
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
    </View>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: day.green,
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
