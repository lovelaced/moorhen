import Feather from '@expo/vector-icons/Feather'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import * as Location from 'expo-location'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { getFacilities, getMoorings, getPois } from '../lib/artifacts'
import { day, font, radius, shadow } from '../theme'

/**
 * "What's closest to me?" — the nearest of each kind to the boat's GPS
 * position, grouped into Facilities (services on the water) and Places
 * (ashore). Tap to fly there.
 */

export interface Nearest {
  label: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  name: string
  point: [number, number]
  distanceM: number
  group: 'Facilities' | 'Places'
}

const POI_KINDS: Array<{
  category: string
  label: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  group: 'Facilities' | 'Places'
}> = [
  { category: 'water-point', label: 'Water point', icon: 'faucet', group: 'Facilities' },
  { category: 'elsan', label: 'Elsan', icon: 'toilet', group: 'Facilities' },
  { category: 'fuel', label: 'Boat fuel', icon: 'gas-station', group: 'Facilities' },
  { category: 'pub', label: 'Pub', icon: 'glass-mug-variant', group: 'Places' },
  { category: 'shop', label: 'Shop', icon: 'storefront', group: 'Places' },
  { category: 'laundry', label: 'Laundry', icon: 'washing-machine', group: 'Places' },
  { category: 'chandlery', label: 'Chandlery', icon: 'hammer-wrench', group: 'Places' },
  { category: 'station', label: 'Railway station', icon: 'train', group: 'Places' },
]

function distanceM(a: [number, number], b: [number, number]): number {
  const dLat = (a[1] - b[1]) * 111_320
  const dLon = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

function pointOf(f: GeoJSON.Feature): [number, number] | null {
  if (f.geometry.type === 'Point') return f.geometry.coordinates as [number, number]
  if (f.geometry.type === 'LineString') {
    const line = f.geometry.coordinates as [number, number][]
    return line[Math.floor(line.length / 2)] ?? null
  }
  return null
}

async function findNearest(here: [number, number]): Promise<Nearest[]> {
  const [pois, facilities, moorings] = await Promise.all([
    getPois(),
    getFacilities(),
    getMoorings(),
  ])
  const results: Nearest[] = []

  for (const kind of POI_KINDS) {
    let best: Nearest | null = null
    for (const f of (pois as GeoJSON.FeatureCollection).features) {
      if (f.properties?.['category'] !== kind.category) continue
      const point = pointOf(f)
      if (!point) continue
      const d = distanceM(here, point)
      if (!best || d < best.distanceM) {
        best = {
          label: kind.label,
          icon: kind.icon,
          name: (f.properties?.['name'] as string) || kind.label,
          point,
          distanceM: d,
          group: kind.group,
        }
      }
    }
    if (best) results.push(best)
  }

  // CRT services (water/elsan/pump-out/bins) — often closer than OSM points
  const services: Array<{
    key: string
    label: string
    icon: keyof typeof MaterialCommunityIcons.glyphMap
  }> = [
    { key: 'pumpOutUserOperated', label: 'Pump-out', icon: 'water-pump' },
    { key: 'refuse', label: 'Rubbish disposal', icon: 'trash-can-outline' },
  ]
  for (const service of services) {
    let best: Nearest | null = null
    for (const f of (facilities as GeoJSON.FeatureCollection).features) {
      if (f.properties?.[service.key] !== true) continue
      const point = pointOf(f)
      if (!point) continue
      const d = distanceM(here, point)
      if (!best || d < best.distanceM) {
        best = {
          label: service.label,
          icon: service.icon,
          name: (f.properties?.['name'] as string) || service.label,
          point,
          distanceM: d,
          group: 'Facilities',
        }
      }
    }
    if (best) results.push(best)
  }

  // nearest public mooring
  let bestMooring: Nearest | null = null
  for (const f of (moorings as GeoJSON.FeatureCollection).features) {
    if (f.properties?.['access'] !== 'public') continue
    const point = pointOf(f)
    if (!point) continue
    const d = distanceM(here, point)
    if (!bestMooring || d < bestMooring.distanceM) {
      bestMooring = {
        label: 'Visitor mooring',
        icon: 'anchor',
        name: (f.properties?.['name'] as string) || 'Visitor mooring',
        point,
        distanceM: d,
        group: 'Facilities',
      }
    }
  }
  if (bestMooring) results.push(bestMooring)

  results.sort((a, b) => a.distanceM - b.distanceM)
  return results
}

/** watchPositionAsync delivers on emulators/devices where one-shot reads fail. */
function watchOneShot(): Promise<Location.LocationObject | null> {
  return new Promise((resolve) => {
    let subscription: Location.LocationSubscription | null = null
    const timer = setTimeout(() => {
      subscription?.remove()
      resolve(null)
    }, 6000)
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 500, distanceInterval: 0 },
      (position) => {
        clearTimeout(timer)
        subscription?.remove()
        resolve(position)
      },
    )
      .then((sub) => {
        subscription = sub
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(null)
      })
  })
}

const label = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1609.344).toFixed(1)} mi`

export function NearMeSheet({
  onSelect,
  onClose,
}: {
  onSelect: (nearest: Nearest) => void
  onClose: () => void
}) {
  const [results, setResults] = useState<Nearest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        if (!cancelled) setError('Location permission needed')
        return
      }
      const position =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
          () => null,
        )) ??
        (await watchOneShot())
      if (!position) {
        if (!cancelled) setError('Could not find your position')
        return
      }
      const found = await findNearest([position.coords.longitude, position.coords.latitude])
      if (!cancelled) setResults(found)
    })().catch(() => {
      if (!cancelled) setError('Could not find your position')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows: Array<{ header: string } | Nearest> = []
  if (results) {
    for (const group of ['Facilities', 'Places'] as const) {
      const members = results.filter((r) => r.group === group)
      if (members.length === 0) continue
      rows.push({ header: group })
      rows.push(...members)
    }
  }

  return (
    <View style={[styles.sheet, shadow.card]}>
      <View style={styles.header}>
        <Text style={styles.title}>Nearest to you</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={20} color={day.ink3} />
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {!results && !error && (
        <View style={styles.loading}>
          <ActivityIndicator color={day.green} />
          <Text style={styles.loadingText}>Finding what's around you…</Text>
        </View>
      )}
      {results && (
        <FlatList
          data={rows}
          keyExtractor={(row) => ('header' in row ? row.header : row.label)}
          style={styles.list}
          renderItem={({ item }) =>
            'header' in item ? (
              <Text style={styles.groupHeader}>{item.header}</Text>
            ) : (
              <Pressable style={styles.row} onPress={() => onSelect(item)}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name={item.icon} size={16} color={day.greenDark} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.label} · {label(item.distanceM)} away
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={day.ink3} />
              </Pressable>
            )
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '60%',
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 16,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.semibold, fontSize: 17, color: day.ink, letterSpacing: -0.2 },
  error: { fontFamily: font.medium, fontSize: 13, color: day.shieldRed },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { fontFamily: font.regular, fontSize: 13, color: day.ink2 },
  list: { marginTop: 2 },
  groupHeader: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: day.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowName: { fontFamily: font.medium, fontSize: 14, color: day.ink },
  rowMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
})
