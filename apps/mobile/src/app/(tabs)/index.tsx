import Feather from '@expo/vector-icons/Feather'
import type { FilterSpecification } from '@maplibre/maplibre-gl-style-spec'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NativeSyntheticEvent } from 'react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  DetailSheet,
  selectFacility,
  selectLock,
  selectMooring,
  selectNotice,
  selectPoi,
  type SelectedFeature,
} from '../../components/detail-sheet'
import { urls } from '../../data'
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

/** Marker badges rendered from the icon font at build time (src/assets/markers). */
/* eslint-disable @typescript-eslint/no-require-imports -- RN static assets */
const MARKER_IMAGES = {
  pub: require('../../assets/markers/pub.png'),
  shop: require('../../assets/markers/shop.png'),
  laundry: require('../../assets/markers/laundry.png'),
  fuel: require('../../assets/markers/fuel.png'),
  chandlery: require('../../assets/markers/chandlery.png'),
  water: require('../../assets/markers/water.png'),
  elsan: require('../../assets/markers/elsan.png'),
  station: require('../../assets/markers/station.png'),
  bins: require('../../assets/markers/bins.png'),
  stoppage: require('../../assets/markers/stoppage.png'),
  facility: require('../../assets/markers/facility.png'),
}
/* eslint-enable @typescript-eslint/no-require-imports */

type ChipKey =
  | 'moorings'
  | 'water'
  | 'elsan'
  | 'pumpout'
  | 'diesel'
  | 'pubs'
  | 'shops'
  | 'laundry'
  | 'bins'
  | 'trains'
  | 'stoppages'

const LAYER_CHIPS: Array<{ key: ChipKey; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'moorings', label: 'Moorings', icon: 'anchor' },
  { key: 'water', label: 'Water', icon: 'droplet' },
  { key: 'elsan', label: 'Elsan', icon: 'rotate-ccw' },
  { key: 'pumpout', label: 'Pump-out', icon: 'arrow-up-circle' },
  { key: 'diesel', label: 'Diesel', icon: 'zap' },
  { key: 'pubs', label: 'Pubs', icon: 'coffee' },
  { key: 'shops', label: 'Shops', icon: 'shopping-bag' },
  { key: 'laundry', label: 'Laundry', icon: 'refresh-cw' },
  { key: 'bins', label: 'Bins', icon: 'trash-2' },
  { key: 'trains', label: 'Trains', icon: 'chevrons-right' },
  { key: 'stoppages', label: 'Stoppages', icon: 'alert-triangle' },
]

/** Which OSM POI categories each chip switches on. */
const CHIP_POI_CATEGORIES: Partial<Record<ChipKey, string[]>> = {
  water: ['water-point', 'drinking-water'],
  elsan: ['elsan'],
  diesel: ['fuel', 'chandlery'],
  pubs: ['pub'],
  shops: ['shop'],
  laundry: ['laundry'],
}

/** Which CRT facility service flags each chip switches on. */
const CHIP_FACILITY_SERVICES: Partial<Record<ChipKey, string[]>> = {
  water: ['water'],
  elsan: ['elsan'],
  pumpout: ['pumpOutUserOperated', 'pumpOutStaffOperated'],
  laundry: ['washingMachine', 'tumbleDryer'],
  bins: ['refuse', 'recycling'],
}

/** ~20 minutes at towpath pace. */
const MAX_WALK_M = 1600

const POI_ICON: unknown = [
  'match',
  ['get', 'category'],
  'pub',
  'pub',
  'shop',
  'shop',
  'laundry',
  'laundry',
  'fuel',
  'fuel',
  'chandlery',
  'chandlery',
  'water-point',
  'water',
  'drinking-water',
  'water',
  'elsan',
  'elsan',
  'facility',
]

type FeaturePress = NativeSyntheticEvent<{ features: GeoJSON.Feature[] }>

interface NoticesFile {
  notices: Array<{
    id: string
    title: string
    type: string
    reason: string | null
    start: string | null
    end: string | null
    url: string | null
    isNavigationBlocking: boolean
    points: [number, number][]
  }>
}

export default function MapScreen() {
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const [active, setActive] = useState<Set<ChipKey>>(new Set(['moorings', 'water']))
  const [stoppages, setStoppages] = useState<GeoJSON.FeatureCollection | null>(null)
  const cameraRef = useRef<import('@maplibre/maplibre-react-native').CameraRef>(null)

  useEffect(() => {
    fetch(urls.notices)
      .then((response) => response.json())
      .then((file: NoticesFile) => {
        const features: GeoJSON.Feature[] = file.notices
          .filter((notice) => notice.isNavigationBlocking)
          .flatMap((notice) =>
            notice.points.map((point, index) => ({
              type: 'Feature' as const,
              id: `${notice.id}-${index}`,
              geometry: { type: 'Point' as const, coordinates: point },
              properties: {
                title: notice.title,
                type: notice.type,
                reason: notice.reason,
                start: notice.start,
                end: notice.end,
                url: notice.url,
              },
            })),
          )
        setStoppages({ type: 'FeatureCollection', features })
      })
      .catch(() => setStoppages(null))
  }, [])

  const toggleChip = useCallback((key: ChipKey) => {
    setActive((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const onFeaturePress = useCallback(
    (select: (feature: GeoJSON.Feature) => SelectedFeature) => (event: FeaturePress) => {
      const feature = event.nativeEvent.features[0]
      if (feature) setSelected(select(feature))
    },
    [],
  )

  const locateMe = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) return
    const position = await Location.getCurrentPositionAsync({})
    cameraRef.current?.easeTo({
      center: [position.coords.longitude, position.coords.latitude],
      zoom: 13,
      duration: 800,
    })
  }, [])

  const activePoiCategories = useMemo(
    () => [...active].flatMap((key) => CHIP_POI_CATEGORIES[key] ?? []),
    [active],
  )
  const activeFacilityServices = useMemo(
    () => [...active].flatMap((key) => CHIP_FACILITY_SERVICES[key] ?? []),
    [active],
  )

  return (
    <View style={styles.root}>
      {MapLibre ? (
        <MapLibre.Map
          style={StyleSheet.absoluteFill}
          mapStyle="https://tiles.openfreemap.org/styles/liberty"
          onPress={() => setSelected(null)}
          compass={true}
          compassPosition={{ top: 118, right: 10 }}
        >
          {/* Braunston — the crossroads of the network — until location wiring lands */}
          <MapLibre.Camera
            ref={cameraRef}
            initialViewState={{ center: [-1.21, 52.29], zoom: 11 }}
          />
          <MapLibre.UserLocation />
          <MapLibre.Images images={MARKER_IMAGES} />

          <MapLibre.GeoJSONSource id="waterways" data={urls.waterways}>
            {/* derelict/unrestored: pale, dashed, clearly not navigable */}
            <MapLibre.Layer
              type="line"
              id="waterway-derelict"
              filter={['==', ['get', 'class'], 'derelict-canal']}
              paint={{
                'line-color': '#A9B6BC',
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 3.5],
                'line-dasharray': [2, 2.5],
              }}
            />
            <MapLibre.Layer
              type="line"
              id="waterway-casing"
              filter={['!=', ['get', 'class'], 'derelict-canal']}
              paint={{
                'line-color': '#CFE0E6',
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 12],
              }}
              layout={{ 'line-cap': 'round' }}
            />
            <MapLibre.Layer
              type="line"
              id="waterway-line"
              filter={['!=', ['get', 'class'], 'derelict-canal']}
              paint={{
                // wide vs narrow is first-class: broad canals draw heavier & deeper
                'line-color': [
                  'match',
                  ['get', 'class'],
                  'broad-canal',
                  day.waterDeep,
                  'narrow-canal',
                  day.water,
                  '#7FA8B8', // rivers
                ],
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  8,
                  ['match', ['get', 'class'], 'broad-canal', 2.2, 1.6],
                  14,
                  ['match', ['get', 'class'], 'broad-canal', 9, 6],
                ],
              }}
              layout={{ 'line-cap': 'round' }}
            />
          </MapLibre.GeoJSONSource>

          <MapLibre.GeoJSONSource
            id="moorings"
            data={urls.moorings}
            onPress={onFeaturePress(selectMooring)}
          >
            <MapLibre.Layer
              type="line"
              id="mooring-lines"
              minzoom={11}
              filter={['==', ['get', 'access'], 'public']}
              layout={{ visibility: active.has('moorings') ? 'visible' : 'none' }}
              paint={{
                'line-color': day.green,
                'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 8],
                'line-opacity': 0.85,
              }}
            />
          </MapLibre.GeoJSONSource>

          <MapLibre.GeoJSONSource
            id="facilities"
            data={urls.facilities}
            onPress={onFeaturePress(selectFacility)}
          >
            <MapLibre.Layer
              type="symbol"
              id="facility-badges"
              minzoom={9}
              filter={
                activeFacilityServices.length > 0
                  ? ([
                      'any',
                      ...activeFacilityServices.map((service) => ['==', ['get', service], true]),
                    ] as unknown as FilterSpecification)
                  : ['==', ['get', 'name'], '__none__']
              }
              layout={{
                'icon-image': 'facility',
                'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 14, 0.55],
                'icon-allow-overlap': true,
              }}
            />
          </MapLibre.GeoJSONSource>

          <MapLibre.GeoJSONSource id="pois" data={urls.pois} onPress={onFeaturePress(selectPoi)}>
            <MapLibre.Layer
              type="symbol"
              id="poi-badges"
              minzoom={11}
              filter={
                [
                  'all',
                  ['<=', ['get', 'walkM'], MAX_WALK_M],
                  ['in', ['get', 'category'], ['literal', activePoiCategories]],
                ] as unknown as FilterSpecification
              }
              layout={{
                'icon-image': POI_ICON as string,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 14, 0.58],
                'icon-allow-overlap': false,
              }}
            />
            {/* stations get their own layer: visible further out, labelled */}
            <MapLibre.Layer
              type="symbol"
              id="station-badges"
              minzoom={8}
              filter={
                [
                  'all',
                  ['==', ['get', 'category'], 'station'],
                  ['<=', ['get', 'walkM'], MAX_WALK_M],
                ] as unknown as FilterSpecification
              }
              layout={{
                visibility: active.has('trains') ? 'visible' : 'none',
                'icon-image': 'station',
                'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.32, 13, 0.55],
                'icon-allow-overlap': true,
                'text-field': ['step', ['zoom'], '', 11, ['get', 'name']],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
                'text-offset': [0, 1.4],
                'text-anchor': 'top',
                'text-optional': true,
              }}
              paint={{
                'text-color': day.ink,
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 1.4,
              }}
            />
            {/* winding holes: where you can actually turn — bigger, ringed */}
            <MapLibre.Layer
              type="circle"
              id="winding-holes"
              minzoom={10}
              filter={['==', ['get', 'category'], 'winding-hole']}
              paint={{
                'circle-color': day.surface,
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 8],
                'circle-stroke-color': day.waterDeep,
                'circle-stroke-width': 2.5,
              }}
            />
          </MapLibre.GeoJSONSource>

          <MapLibre.GeoJSONSource id="locks" data={urls.locks} onPress={onFeaturePress(selectLock)}>
            {/* chevron points uphill; narrow locks lighter than broad */}
            <MapLibre.Layer
              type="symbol"
              id="lock-symbols"
              minzoom={10}
              layout={{
                'text-field': '^',
                'text-font': ['Noto Sans Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 14, 22],
                'text-rotate': ['get', 'bearingUpDeg'],
                'text-rotation-alignment': 'map',
                'text-allow-overlap': true,
                'text-anchor': 'center',
              }}
              paint={{
                'text-color': ['match', ['get', 'gauge'], 'narrow', day.water, day.waterDeep],
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 1.8,
              }}
            />
          </MapLibre.GeoJSONSource>

          {stoppages && (
            <MapLibre.GeoJSONSource
              id="stoppages"
              data={stoppages}
              onPress={onFeaturePress(selectNotice)}
            >
              {/* rare but important: visible from system-map zooms */}
              <MapLibre.Layer
                type="symbol"
                id="stoppage-badges"
                minzoom={5}
                layout={{
                  visibility: active.has('stoppages') ? 'visible' : 'none',
                  'icon-image': 'stoppage',
                  'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 12, 0.6],
                  'icon-allow-overlap': true,
                }}
              />
            </MapLibre.GeoJSONSource>
          )}
        </MapLibre.Map>
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
          {LAYER_CHIPS.map((chip) => {
            const isActive = active.has(chip.key)
            return (
              <Pressable
                key={chip.key}
                onPress={() => toggleChip(chip.key)}
                style={[styles.chip, shadow.pill, isActive && styles.chipActive]}
              >
                <Feather name={chip.icon} size={14} color={isActive ? day.surface : day.ink2} />
                <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                  {chip.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </SafeAreaView>

      <Pressable style={[styles.locateButton, shadow.pill]} onPress={locateMe}>
        <Feather name="crosshair" size={20} color={day.ink} />
      </Pressable>

      {selected && <DetailSheet selected={selected} onClose={() => setSelected(null)} />}
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
  locateButton: {
    position: 'absolute',
    right: 12,
    bottom: 24,
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
