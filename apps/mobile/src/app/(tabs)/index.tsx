import Feather from '@expo/vector-icons/Feather'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { day, font, radius, shadow } from '../../theme'

/**
 * Map home. MapLibre needs a dev build (native module), so inside Expo Go we
 * render a styled placeholder; in a dev/production build the real map loads
 * OpenFreeMap's liberty style until our own PMTiles basemap ships.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

type MapLibreModule = typeof import('@maplibre/maplibre-react-native')

function loadMapLibre(): MapLibreModule | null {
  if (inExpoGo) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@maplibre/maplibre-react-native') as MapLibreModule
}

const MapLibre = loadMapLibre()

const LAYER_CHIPS = [
  { key: 'moorings', label: 'Moorings', icon: 'anchor', active: true },
  { key: 'water', label: 'Water', icon: 'droplet', active: false },
  { key: 'bins', label: 'Bins', icon: 'trash-2', active: false },
  { key: 'pubs', label: 'Pubs & shops', icon: 'coffee', active: false },
  { key: 'stoppages', label: 'Stoppages', icon: 'alert-triangle', active: false },
] as const

export default function MapScreen() {
  return (
    <View style={styles.root}>
      {MapLibre ? (
        <MapLibre.Map
          style={StyleSheet.absoluteFill}
          mapStyle="https://tiles.openfreemap.org/styles/liberty"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder]}>
          <Feather name="map" size={40} color={day.water} />
          <Text style={styles.placeholderTitle}>Map preview</Text>
          <Text style={styles.placeholderBody}>
            The live map needs a development build{'\n'}(MapLibre native module).
          </Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <View style={[styles.searchPill, shadow.pill]}>
            <Feather name="search" size={18} color={day.ink3} />
            <Text style={styles.searchText}>Search locks, moorings, places…</Text>
          </View>
          <View style={[styles.roundButton, shadow.pill]}>
            <Feather name="layers" size={20} color={day.ink} />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {LAYER_CHIPS.map((chip) => (
            <View
              key={chip.key}
              style={[styles.chip, shadow.pill, chip.active && styles.chipActive]}
            >
              <Feather name={chip.icon} size={14} color={chip.active ? day.surface : day.ink2} />
              <Text style={[styles.chipLabel, chip.active && styles.chipLabelActive]}>
                {chip.label}
              </Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: day.land },
  mapPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: day.land,
  },
  placeholderTitle: { fontFamily: font.semibold, fontSize: 18, color: day.ink },
  placeholderBody: {
    fontFamily: font.regular,
    fontSize: 13,
    color: day.ink2,
    textAlign: 'center',
    lineHeight: 19,
  },
  overlay: { paddingHorizontal: 16, gap: 12 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchPill: {
    flex: 1,
    height: 48,
    backgroundColor: day.surface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  searchText: { fontFamily: font.regular, fontSize: 15, color: day.ink3 },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: day.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: { gap: 8, paddingRight: 16 },
  chip: {
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: day.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  chipActive: { backgroundColor: day.green },
  chipLabel: { fontFamily: font.medium, fontSize: 13, color: day.ink2 },
  chipLabelActive: { fontFamily: font.semibold, color: day.surface },
})
