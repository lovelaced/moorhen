import Feather from '@expo/vector-icons/Feather'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { FilterSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NativeSyntheticEvent } from 'react-native'
import { Alert, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getMoorings } from '../../lib/artifacts'
import { MooringCaptureSheet, runSpeedTest } from '../../components/mooring-capture-sheet'
import { MoorhenLoader } from '../../components/moorhen-loader'
import { NearMeSheet, type Nearest } from '../../components/near-me-sheet'
import { PhotoPin } from '../../components/photo-pin'
import { RouteStopsSheet } from '../../components/route-stops-sheet'
import { communityConfigured, fetchSharedMoorings, shareMooring } from '../../lib/community'
import {
  deleteMooring,
  loadMoorings,
  mooringsToGeoJSON,
  saveMooring,
  subscribeMoorings,
  updateMooring,
  type SavedMooring,
} from '../../lib/moorings-store'
import { SearchModal, type SearchEntry } from '../../components/search-modal'
import { boatWarnings, useBoat } from '../../lib/boat-store'
import { useSettings } from '../../lib/settings-store'
import { loadPlacesIndex, nearestNamed, type PlaceEntry } from '../../lib/places-index'
import { plannerStore, usePlanner } from '../../lib/planner-store'
import type { RouteStop } from '../../lib/route-stops'
import {
  DetailSheet,
  pubMooringNote,
  selectFacility,
  selectLock,
  selectMooring,
  selectNotice,
  selectPoi,
  selectWaterway,
  type SelectedFeature,
} from '../../components/detail-sheet'
import { urls } from '../../data'
import { basemapUri } from '../../lib/offline'
import { REGION_BOUNDS } from '../../lib/regions'
import { protomapsOfflineStyle } from '../../lib/protomaps-style'
import { day, font, radius, shadow } from '../../theme'

/**
 * Map home. MapLibre needs a dev build (native module), so inside Expo Go we
 * render a styled placeholder; in a dev/production build the real map loads
 * OpenFreeMap's liberty style until our own PMTiles basemap ships.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

// Rough Great Britain bounding box. A fix outside it (holiday abroad, GPS
// nonsense) keeps the Braunston default rather than opening on empty map.
const inCoverage = (coords: { latitude: number; longitude: number }) =>
  coords.longitude >= -8.7 &&
  coords.longitude <= 1.8 &&
  coords.latitude >= 49.8 &&
  coords.latitude <= 60.9

type MapLibreModule = typeof import('@maplibre/maplibre-react-native')

function loadMapLibre(): MapLibreModule | null {
  if (inExpoGo) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@maplibre/maplibre-react-native') as MapLibreModule
}

const MapLibre = loadMapLibre()

/** Marker badges rendered from the icon font at build time (src/assets/markers). */
/* eslint-disable @typescript-eslint/no-require-imports -- RN static assets */
// Keys are namespaced: the basemap sprite also has icons called "water",
// "shop", "fuel", "laundry", and whether the sprite or our runtime image wins
// that name is a load-order race — it flip-flopped between builds, drawing
// the sprite's sepia droplet where our water badge belongs. "moorhen-*" can
// never collide.
const MARKER_IMAGES = {
  'moorhen-pub': require('../../assets/markers/pub.png'),
  'moorhen-shop': require('../../assets/markers/shop.png'),
  'moorhen-laundry': require('../../assets/markers/laundry.png'),
  'moorhen-fuel': require('../../assets/markers/fuel.png'),
  'moorhen-chandlery': require('../../assets/markers/chandlery.png'),
  'moorhen-water': require('../../assets/markers/water.png'),
  'moorhen-elsan': require('../../assets/markers/elsan.png'),
  'moorhen-station': require('../../assets/markers/station.png'),
  'moorhen-bins': require('../../assets/markers/bins.png'),
  'moorhen-stoppage': require('../../assets/markers/stoppage.png'),
  'moorhen-facility': require('../../assets/markers/facility.png'),
  'moorhen-mooring': require('../../assets/markers/mooring.png'),
  'moorhen-winding': require('../../assets/markers/winding.png'),
  'moorhen-pumpout': require('../../assets/markers/pumpout.png'),
  'moorhen-shower': require('../../assets/markers/shower.png'),
  'moorhen-reach': require('../../assets/markers/reach.png'),
  'moorhen-community': require('../../assets/markers/community.png'),
  'moorhen-tree': require('../../assets/markers/tree.png'),
}

// Liberty minus the basemap's own POI sprites (sepia droplets, shop glyphs):
// half badge size, not tappable — they read as broken versions of our badges.
// Bundled by scripts/make-basemap-style.mjs, so boot skips a style fetch too.
const HOSTED_STYLE = require('../../assets/styles/liberty-moorhen.json') as StyleSpecification
/* eslint-enable @typescript-eslint/no-require-imports */

type ChipKey =
  | 'canalside'
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
  | 'trees'

const LAYER_CHIPS: Array<{
  key: ChipKey
  label: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
}> = [
  { key: 'canalside', label: 'Canalside', icon: 'map-marker-distance' },
  { key: 'moorings', label: 'Moorings', icon: 'anchor' },
  { key: 'water', label: 'Water', icon: 'faucet' },
  { key: 'elsan', label: 'Elsan', icon: 'toilet' },
  { key: 'pumpout', label: 'Pump-out', icon: 'water-pump' },
  { key: 'diesel', label: 'Diesel', icon: 'gas-station' },
  { key: 'pubs', label: 'Pubs', icon: 'glass-mug-variant' },
  { key: 'shops', label: 'Shops', icon: 'storefront' },
  { key: 'laundry', label: 'Laundry', icon: 'washing-machine' },
  { key: 'bins', label: 'Bins', icon: 'trash-can-outline' },
  { key: 'trains', label: 'Trains', icon: 'train' },
  { key: 'stoppages', label: 'Stoppages', icon: 'alert' },
]

/** Easter egg (7 taps on the version row): veteran & landmark trees. */
const TREE_CHIP: (typeof LAYER_CHIPS)[number] = { key: 'trees', label: 'Old trees', icon: 'tree' }

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
/** Right on the cut — the Canalside chip swaps to this. */
const CANALSIDE_WALK_M = 120
/** Old trees keep a tighter circle: ~10 minutes at towpath pace. */
const TREE_WALK_M = 800

/** One size for every badge — toggling a chip shouldn't shrink its icons. */
const BADGE_ICON_SIZE: unknown = ['interpolate', ['linear'], ['zoom'], 9, 0.3, 14, 0.58]

const POI_ICON: unknown = [
  'match',
  ['get', 'category'],
  'pub',
  'moorhen-pub',
  'shop',
  'moorhen-shop',
  'laundry',
  'moorhen-laundry',
  'fuel',
  'moorhen-fuel',
  'chandlery',
  'moorhen-chandlery',
  'water-point',
  'moorhen-water',
  'drinking-water',
  'moorhen-water',
  'elsan',
  'moorhen-elsan',
  'moorhen-facility',
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

// dropped pins read like a boater would say it ("Near Braunston Turn"),
// falling back to a plain pin when nothing named is within 3 km
let placeSnapshot: PlaceEntry[] | null = null
function droppedPin(point: [number, number]): SearchEntry {
  const near = placeSnapshot ? nearestNamed(placeSnapshot, point) : null
  if (near) {
    const dLat = (near.point[1] - point[1]) * 111_320
    const dLon = (near.point[0] - point[0]) * 111_320 * Math.cos((point[1] * Math.PI) / 180)
    if (Math.hypot(dLat, dLon) < 3000) {
      return { name: `Near ${near.name}`, kind: 'Map point', point }
    }
  }
  return { name: 'Dropped pin', kind: 'Map point', point }
}

export default function MapScreen() {
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const [active, setActive] = useState<Set<ChipKey>>(new Set(['moorings', 'water']))
  const [myMoorings, setMyMoorings] = useState<SavedMooring[]>([])
  const [stoppages, setStoppages] = useState<GeoJSON.FeatureCollection | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  // mirrored into a ref so the stable feature-press handlers see fresh state
  const plannerOpenRef = useRef(false)
  useEffect(() => {
    plannerOpenRef.current = plannerOpen
  }, [plannerOpen])
  const [searchTarget, setSearchTarget] = useState<'place' | 'from' | 'to'>('place')
  const [mapReady, setMapReady] = useState(false)
  const [stopsOpen, setStopsOpen] = useState(false)
  const [nearMeOpen, setNearMeOpen] = useState(false)
  const [captureAt, setCaptureAt] = useState<[number, number] | null>(null)
  const {
    from: fromEntry,
    to: toEntry,
    route,
    planning,
    stops,
    routeNotices,
    hoursPerDay,
    reach,
    reachFocus,
  } = usePlanner()
  const adjustPace = useCallback((delta: number) => plannerStore.adjustPace(delta), [])
  const cameraRef = useRef<import('@maplibre/maplibre-react-native').CameraRef>(null)
  // Once the user drags the map (or taps locate), boot auto-centering stands down.
  const userDroveCameraRef = useRef(false)
  const { treesUnlocked } = useSettings()

  // Ask for location up front and open the map on the boat, not Braunston.
  // Last known fix first so the map lands somewhere real immediately; the
  // fresh fix nudges the camera afterwards unless the user has taken over.
  useEffect(() => {
    let cancelled = false
    const centerOn = (position: Location.LocationObject, animate: boolean) => {
      if (cancelled || userDroveCameraRef.current) return
      if (!inCoverage(position.coords)) return
      const center: [number, number] = [position.coords.longitude, position.coords.latitude]
      if (animate) cameraRef.current?.easeTo({ center, zoom: 13, duration: 700 })
      else cameraRef.current?.jumpTo({ center, zoom: 13 })
    }
    ;(async () => {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted || cancelled) return
      const last = await Location.getLastKnownPositionAsync()
      if (last) centerOn(last, false)
      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null)
      if (fresh) centerOn(fresh, true)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const layerChips = useMemo(
    () => (treesUnlocked ? [...LAYER_CHIPS, TREE_CHIP] : LAYER_CHIPS),
    [treesUnlocked],
  )

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

  useEffect(() => {
    loadMoorings()
      .then(setMyMoorings)
      .catch(() => setMyMoorings([]))
    return subscribeMoorings(setMyMoorings)
  }, [])

  const myMooringsShape = useMemo(() => mooringsToGeoJSON(myMoorings), [myMoorings])

  // boater-shared moorings (community layer) — fetched once per session
  const [communityMoorings, setCommunityMoorings] = useState<GeoJSON.FeatureCollection | null>(null)
  useEffect(() => {
    if (!communityConfigured()) return
    fetchSharedMoorings()
      .then(setCommunityMoorings)
      .catch(() => {})
  }, [])

  // public moorings render as anchor badges at their midpoint, not bank lines
  const [mooringPoints, setMooringPoints] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  })
  useEffect(() => {
    getMoorings()
      .then((fc: GeoJSON.FeatureCollection) => {
        setMooringPoints({
          type: 'FeatureCollection',
          features: fc.features
            .filter((f) => f.geometry.type === 'LineString')
            .map((f) => {
              const line = (f.geometry as GeoJSON.LineString).coordinates
              return {
                ...f,
                geometry: {
                  type: 'Point' as const,
                  coordinates: line[Math.floor(line.length / 2)]!,
                },
              }
            }),
        })
      })
      .catch(() => {})
  }, [])

  const toggleChip = useCallback((key: ChipKey) => {
    setActive((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const fillEndpoint = useCallback((entry: SearchEntry) => {
    const state = plannerStore.getState()
    if (!state.from) plannerStore.setEndpoint('from', entry)
    else plannerStore.setEndpoint('to', entry)
    setPlannerOpen(true)
  }, [])

  const setEndpointAt = useCallback(
    (point: [number, number]) => fillEndpoint(droppedPin(point)),
    [fillEndpoint],
  )

  const onFeaturePress = useCallback(
    (select: (feature: GeoJSON.Feature) => SelectedFeature) => (event: FeaturePress) => {
      const feature = event.nativeEvent.features[0]
      if (!feature) return
      // without this the event bubbles to Map.onPress, which clears the selection
      event.stopPropagation()
      // with the planner waiting for an endpoint, taps feed the planner —
      // a named point (lock, junction, pub) becomes the endpoint by name,
      // a waterway line becomes a pin where the finger landed
      const state = plannerStore.getState()
      if (plannerOpenRef.current && (!state.from || !state.to)) {
        if (feature.geometry.type === 'Point') {
          const point = feature.geometry.coordinates as [number, number]
          const name = (feature.properties?.['name'] as string) || null
          fillEndpoint(name ? { name, kind: 'Map point', point } : droppedPin(point))
          return
        }
        const raw = (
          event.nativeEvent as {
            lngLat?: [number, number] | { lng: number; lat: number }
          }
        ).lngLat
        if (raw) {
          fillEndpoint(droppedPin(Array.isArray(raw) ? [raw[0], raw[1]] : [raw.lng, raw.lat]))
          return
        }
      }
      setSelected(select(feature))
    },
    [fillEndpoint],
  )

  // a map press fills the next empty planner slot: start first, then
  // destination; with both set, a long-press moves the destination. Nothing
  // here ever clears a route — that takes the explicit (confirmed) clear.
  const pressPoint = (
    event: NativeSyntheticEvent<{ lngLat?: [number, number] | { lng: number; lat: number } }>,
  ): [number, number] | null => {
    const raw = event.nativeEvent.lngLat
    if (!raw) return null
    return Array.isArray(raw) ? [raw[0], raw[1]] : [raw.lng, raw.lat]
  }

  const onMapPress = useCallback(
    (event: NativeSyntheticEvent<{ lngLat?: [number, number] | { lng: number; lat: number } }>) => {
      const point = pressPoint(event)
      const state = plannerStore.getState()
      if (point && plannerOpen && (!state.from || !state.to)) {
        setEndpointAt(point)
        return
      }
      setSelected(null)
    },
    [plannerOpen, setEndpointAt],
  )

  const onLongPress = useCallback(
    (event: NativeSyntheticEvent<{ lngLat?: [number, number] | { lng: number; lat: number } }>) => {
      const point = pressPoint(event)
      if (point) setEndpointAt(point)
    },
    [setEndpointAt],
  )

  const onSearchSelect = useCallback(
    (entry: SearchEntry) => {
      setSearchOpen(false)
      if (searchTarget === 'from' || searchTarget === 'to') {
        plannerStore.setEndpoint(searchTarget, entry)
        return
      }
      cameraRef.current?.easeTo({ center: entry.point, zoom: 14, duration: 700 })
      setSelected({ title: entry.name, subtitle: entry.kind, details: [], coords: entry.point })
    },
    [searchTarget],
  )

  const boat = useBoat()
  const boatWarningLine = route
    ? (boatWarnings(boat, route.narrowLocks, route.broadLocks)[0] ?? null)
    : null

  const reachShape = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: (reach ?? []).map((point, i) => ({
        type: 'Feature' as const,
        id: i,
        geometry: { type: 'Point' as const, coordinates: point.point as [number, number] },
        properties: { distanceM: Math.round(point.distanceM) },
      })),
    }),
    [reach],
  )

  // fit the camera when a route lands (planning happens in the store)
  useEffect(() => {
    if (!route || !fromEntry || !toEntry) return
    const lons = [fromEntry.point[0], toEntry.point[0]]
    const lats = [fromEntry.point[1], toEntry.point[1]]
    cameraRef.current?.easeTo({
      center: [(lons[0]! + lons[1]!) / 2, (lats[0]! + lats[1]!) / 2],
      zoom: 9.5,
      duration: 900,
    })
  }, [route, fromEntry, toEntry])

  useEffect(() => {
    if (!route) setStopsOpen(false)
  }, [route])

  // "Show reach on map" — fit every frontier flag in view at once
  useEffect(() => {
    if (reachFocus === 0) return
    const state = plannerStore.getState()
    const points = (state.reach ?? []).map((r) => r.point as [number, number])
    if (state.from) points.push(state.from.point)
    if (points.length === 0) return
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const [lon, lat] of points) {
      west = Math.min(west, lon)
      east = Math.max(east, lon)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
    setPlannerOpen(false) // give the frontier the full canvas
    cameraRef.current?.fitBounds([west, south, east, north], {
      padding: { top: 210, right: 60, bottom: 130, left: 60 },
      duration: 900,
    })
  }, [reachFocus])

  // names for dropped pins come from the shared places index
  useEffect(() => {
    loadPlacesIndex()
      .then((entries) => {
        placeSnapshot = entries
      })
      .catch(() => {})
  }, [])

  // the two bottom drawers swap instead of stacking: opening a detail slides
  // the places sheet down; closing it brings the sheet back
  const stopsSlide = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(stopsSlide, {
      toValue: selected ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [selected, stopsSlide])

  const confirmClear = useCallback(() => {
    Alert.alert('Clear this route?', 'Start, destination and the planned line will be removed.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          plannerStore.clear()
          setPlannerOpen(false)
        },
      },
    ])
  }, [])

  const onStopSelect = useCallback((stop: RouteStop) => {
    setStopsOpen(false)
    cameraRef.current?.easeTo({ center: stop.point, zoom: 14.5, duration: 700 })
    const onWater = [
      'Water point',
      'Elsan',
      'Pump-out',
      'Rubbish disposal',
      'Showers',
      'CRT facility',
      'Mooring',
    ].includes(stop.category)
    const details = [
      onWater
        ? `Mile ${(stop.chainageM / 1609.344).toFixed(1)} of your route`
        : `Mile ${(stop.chainageM / 1609.344).toFixed(1)} of your route · ${Math.max(1, Math.round(stop.offsetM / 80))} min walk from the water`,
    ]
    const mooringNote = stop.pubProps ? pubMooringNote(stop.pubProps) : null
    if (mooringNote) details.push(mooringNote)
    setSelected({
      title: stop.name,
      subtitle: stop.category,
      details,
      coords: stop.point,
      ...(stop.category === 'Pub' || stop.category === 'Shop'
        ? { hygieneLookup: { name: stop.name, point: stop.point } }
        : {}),
    })
  }, [])

  const routeShape = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const features: GeoJSON.Feature[] = []
    if (route) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: route.line as [number, number][] },
        properties: { part: 'line' },
      })
    }
    if (!route && fromEntry) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: fromEntry.point },
        properties: { part: 'start' },
      })
    }
    if (features.length === 0) return null
    return { type: 'FeatureCollection', features }
  }, [route, fromEntry])

  const locateMe = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) {
      // canAskAgain false means the system dialog won't show anymore — the
      // tap would otherwise do nothing at all, forever.
      if (!permission.canAskAgain) {
        Alert.alert(
          'Location is off',
          "Moorhen can't jump to your position without location access. You can turn it on in your phone's settings.",
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => Linking.openSettings() },
          ],
        )
      }
      return
    }
    userDroveCameraRef.current = true
    const goTo = (position: Location.LocationObject) =>
      cameraRef.current?.easeTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 13,
        duration: 700,
      })
    // Last known fix first so the tap answers instantly — a cold fresh fix
    // can take ten-plus seconds, which reads as the button doing nothing.
    const last = await Location.getLastKnownPositionAsync()
    if (last) goTo(last)
    const fresh = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null)
    if (fresh) goTo(fresh)
  }, [])

  const activePoiCategories = useMemo(
    () => [...active].flatMap((key) => CHIP_POI_CATEGORIES[key] ?? []),
    [active],
  )
  const activeFacilityServices = useMemo(
    () => [...active].flatMap((key) => CHIP_FACILITY_SERVICES[key] ?? []),
    [active],
  )

  // The badge shows what the facility offers — but a multi-service block must
  // wear the icon of a service you're actually filtering on, or toggling
  // "Bins" appears to surface water taps. Active services first, then the
  // rest in the usual priority order.
  const facilityIcon = useMemo(() => {
    const clauses: unknown[] = ['case']
    const branch = (services: string[], icon: string) => {
      clauses.push(
        services.length === 1
          ? ['==', ['get', services[0]], true]
          : ['any', ...services.map((svc) => ['==', ['get', svc], true])],
        icon,
      )
    }
    const order: Array<[ChipKey, string[], string]> = [
      ['elsan', ['elsan'], 'moorhen-elsan'],
      ['pumpout', ['pumpOutUserOperated', 'pumpOutStaffOperated'], 'moorhen-pumpout'],
      ['water', ['water'], 'moorhen-water'],
      ['bins', ['refuse', 'recycling'], 'moorhen-bins'],
      ['laundry', ['washingMachine', 'tumbleDryer'], 'moorhen-laundry'],
    ]
    for (const [chip, services, icon] of order) {
      if (active.has(chip)) branch(services, icon)
    }
    for (const [, services, icon] of order) branch(services, icon)
    branch(['shower'], 'moorhen-shower')
    clauses.push('moorhen-facility')
    return clauses
  }, [active])

  // Prefer a downloaded offline basemap over the hosted style when one exists.
  const offlineStyle = useMemo(() => {
    for (const region of REGION_BOUNDS) {
      const uri = basemapUri(region.id)
      if (uri) return protomapsOfflineStyle(uri)
    }
    return null
  }, [])

  return (
    <View style={styles.root}>
      {MapLibre ? (
        <MapLibre.Map
          style={StyleSheet.absoluteFill}
          mapStyle={offlineStyle ?? HOSTED_STYLE}
          onPress={onMapPress}
          onLongPress={onLongPress}
          onRegionWillChange={(event) => {
            if (event.nativeEvent.userInteraction) userDroveCameraRef.current = true
          }}
          onDidFinishLoadingMap={() => setMapReady(true)}
          compass={true}
          compassPosition={{ top: 118, right: 10 }}
        >
          {/* Braunston — the crossroads of the network — until the first fix lands */}
          <MapLibre.Camera
            ref={cameraRef}
            initialViewState={{ center: [-1.21, 52.29], zoom: 11 }}
          />
          <MapLibre.UserLocation />
          <MapLibre.Images images={MARKER_IMAGES} />

          <MapLibre.GeoJSONSource
            id="waterways"
            data={urls.waterways}
            onPress={onFeaturePress(selectWaterway)}
          >
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
            data={mooringPoints}
            onPress={onFeaturePress(selectMooring)}
          >
            <MapLibre.Layer
              type="symbol"
              id="mooring-badges"
              filter={['==', ['get', 'access'], 'public']}
              layout={{
                visibility: active.has('moorings') ? 'visible' : 'none',
                'icon-image': 'moorhen-mooring',
                'icon-size': BADGE_ICON_SIZE as number,
                // a toggled-on layer shows everything, like stations — you
                // chose it, you get all of it
                'icon-allow-overlap': true,
              }}
            />
          </MapLibre.GeoJSONSource>

          {communityMoorings && communityMoorings.features.length > 0 && (
            <MapLibre.GeoJSONSource
              id="community-moorings"
              data={communityMoorings}
              onPress={(event: FeaturePress) => {
                const f = event.nativeEvent.features[0]
                if (!f) return
                event.stopPropagation()
                const pt = (f.geometry as GeoJSON.Point).coordinates as [number, number]
                const props = (f.properties ?? {}) as Record<string, unknown>
                const details: string[] = []
                if (props['edgeType']) details.push(`Edge: ${String(props['edgeType'])}`)
                if (props['downMbps'])
                  details.push(`Signal: ${Number(props['downMbps']).toFixed(1)} Mbps`)
                if (props['sharedAt'])
                  details.push(
                    `Shared ${new Date(String(props['sharedAt'])).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}`,
                  )
                setSelected({
                  title: 'Boater-shared mooring',
                  subtitle: 'Community · Moorhen boaters',
                  details,
                  coords: pt,
                })
              }}
            >
              <MapLibre.Layer
                type="symbol"
                id="community-mooring-badges"
                layout={{
                  visibility: active.has('moorings') ? 'visible' : 'none',
                  'icon-image': 'moorhen-community',
                  'icon-size': BADGE_ICON_SIZE as number,
                  // community shares are sparse and load-bearing — always draw
                  'icon-allow-overlap': true,
                }}
              />
            </MapLibre.GeoJSONSource>
          )}

          <MapLibre.GeoJSONSource
            id="facilities"
            data={urls.facilities}
            onPress={onFeaturePress(selectFacility)}
          >
            <MapLibre.Layer
              type="symbol"
              id="facility-badges"
              filter={
                activeFacilityServices.length > 0
                  ? ([
                      'any',
                      ...activeFacilityServices.map((service) => ['==', ['get', service], true]),
                    ] as unknown as FilterSpecification)
                  : ['==', ['get', 'name'], '__none__']
              }
              layout={{
                'icon-image': facilityIcon as unknown as string,
                'icon-size': BADGE_ICON_SIZE as number,
                'icon-allow-overlap': true,
              }}
            />
          </MapLibre.GeoJSONSource>

          <MapLibre.GeoJSONSource id="pois" data={urls.pois} onPress={onFeaturePress(selectPoi)}>
            <MapLibre.Layer
              type="symbol"
              id="poi-badges"
              filter={
                [
                  'all',
                  ['<=', ['get', 'walkM'], active.has('canalside') ? CANALSIDE_WALK_M : MAX_WALK_M],
                  ['in', ['get', 'category'], ['literal', activePoiCategories]],
                ] as unknown as FilterSpecification
              }
              layout={{
                'icon-image': POI_ICON as string,
                'icon-size': BADGE_ICON_SIZE as number,
                // same deal as stations: a chip you switched on hides nothing
                'icon-allow-overlap': true,
              }}
            />
            {/* stations get their own layer: visible further out, labelled */}
            <MapLibre.Layer
              type="symbol"
              id="station-badges"
              filter={
                [
                  'all',
                  ['==', ['get', 'category'], 'station'],
                  ['<=', ['get', 'walkM'], MAX_WALK_M],
                ] as unknown as FilterSpecification
              }
              layout={{
                visibility: active.has('trains') ? 'visible' : 'none',
                'icon-image': 'moorhen-station',
                'icon-size': BADGE_ICON_SIZE as number,
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
            {/* winding holes: where you can actually turn the boat */}
            <MapLibre.Layer
              type="symbol"
              id="winding-holes"
              minzoom={10}
              filter={['==', ['get', 'category'], 'winding-hole']}
              layout={{
                'icon-image': 'moorhen-winding',
                'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.22, 14, 0.5],
                'icon-allow-overlap': true,
              }}
            />
            {/* easter egg: veteran & landmark trees within a 10-minute walk */}
            <MapLibre.Layer
              type="symbol"
              id="tree-badges"
              filter={
                [
                  'all',
                  ['==', ['get', 'category'], 'notable-tree'],
                  ['<=', ['get', 'walkM'], TREE_WALK_M],
                ] as unknown as FilterSpecification
              }
              layout={{
                visibility: treesUnlocked && active.has('trees') ? 'visible' : 'none',
                'icon-image': 'moorhen-tree',
                'icon-size': BADGE_ICON_SIZE as number,
                // ancient trees are rare — every one earns its place on the map
                'icon-allow-overlap': true,
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
                'text-font': ['Noto Sans Regular'],
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

          {myMoorings.length > 0 && (
            <MapLibre.GeoJSONSource
              id="my-moorings"
              data={myMooringsShape}
              onPress={(event: FeaturePress) => {
                const f = event.nativeEvent.features[0]
                if (!f) return
                event.stopPropagation()
                const pt = (f.geometry as GeoJSON.Point).coordinates as [number, number]
                const props = (f.properties ?? {}) as Record<string, unknown>
                const mooringId = String(props['id'] ?? '')
                const details: string[] = ['Your private mooring']
                if (props['edgeType']) details.push(`Edge: ${String(props['edgeType'])}`)
                if (props['downMbps'])
                  details.push(`Signal: ${Number(props['downMbps']).toFixed(1)} Mbps`)
                setSelected({
                  title: 'Saved mooring',
                  subtitle: 'Only visible to you',
                  details,
                  coords: pt,
                  actions: [
                    {
                      label: 'Retest signal',
                      onPress: async () => {
                        const position =
                          (await Location.getLastKnownPositionAsync()) ??
                          (await Location.getCurrentPositionAsync({
                            accuracy: Location.Accuracy.Balanced,
                          }).catch(() => null))
                        if (!position) return
                        const dLat = (position.coords.latitude - pt[1]) * 111_320
                        const dLon =
                          (position.coords.longitude - pt[0]) *
                          111_320 *
                          Math.cos((pt[1] * Math.PI) / 180)
                        if (Math.hypot(dLat, dLon) > 250) {
                          setSelected((current) =>
                            current
                              ? {
                                  ...current,
                                  details: [...details, 'Get within 250 m of the spot to retest'],
                                }
                              : current,
                          )
                          return
                        }
                        const speed = await runSpeedTest().catch(() => null)
                        if (!speed) return
                        void updateMooring(mooringId, { speed })
                        setSelected((current) =>
                          current
                            ? {
                                ...current,
                                details: [
                                  'Your private mooring',
                                  ...(props['edgeType']
                                    ? [`Edge: ${String(props['edgeType'])}`]
                                    : []),
                                  `Signal: ${speed.downMbps.toFixed(1)} Mbps (just now)`,
                                ],
                              }
                            : current,
                        )
                      },
                    },
                    {
                      label: 'Delete',
                      destructive: true,
                      onPress: () => {
                        void deleteMooring(mooringId)
                        setSelected(null)
                      },
                    },
                  ],
                })
              }}
            >
              <MapLibre.Layer
                type="symbol"
                id="my-mooring-icon"
                filter={['!=', ['get', 'hasPhoto'], true]}
                layout={{
                  'icon-image': 'moorhen-mooring',
                  'icon-size': BADGE_ICON_SIZE as number,
                  'icon-allow-overlap': true,
                }}
              />
            </MapLibre.GeoJSONSource>
          )}

          {selected && (
            <MapLibre.GeoJSONSource
              id="selected-highlight"
              data={{
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: selected.coords },
                    properties: {},
                  },
                ],
              }}
            >
              <MapLibre.Layer
                type="circle"
                id="selected-ring"
                paint={{
                  'circle-radius': 13,
                  'circle-color': 'rgba(90, 111, 209, 0.2)',
                  'circle-stroke-color': day.accent,
                  'circle-stroke-width': 2.5,
                }}
              />
            </MapLibre.GeoJSONSource>
          )}

          {reach && reach.length > 0 && (
            <MapLibre.GeoJSONSource
              id="reach"
              data={reachShape}
              onPress={(event: FeaturePress) => {
                const f = event.nativeEvent.features[0]
                if (!f) return
                event.stopPropagation()
                const pt = (f.geometry as GeoJSON.Point).coordinates as [number, number]
                const miles =
                  Number((f.properties as Record<string, unknown>)?.['distanceM']) / 1609.344
                setSelected({
                  title: 'As far as you can get',
                  subtitle: 'Reach frontier',
                  details: [`${miles.toFixed(1)} mi of cruising from your start`],
                  coords: pt,
                })
              }}
            >
              <MapLibre.Layer
                type="symbol"
                id="reach-flags"
                layout={{
                  'icon-image': 'moorhen-reach',
                  'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 0.5],
                  'icon-allow-overlap': true,
                }}
              />
            </MapLibre.GeoJSONSource>
          )}

          {myMoorings
            .filter((mooring) => mooring.photoUri)
            .map((mooring) => (
              <MapLibre.Marker
                key={mooring.id}
                id={`photo-pin-${mooring.id}`}
                lngLat={mooring.point}
                anchor="bottom"
              >
                <PhotoPin
                  uri={mooring.photoUri!}
                  onPress={() => {
                    const details: string[] = ['Your private mooring']
                    if (mooring.edgeType) details.push(`Edge: ${mooring.edgeType}`)
                    if (mooring.speed)
                      details.push(`Signal: ${mooring.speed.downMbps.toFixed(1)} Mbps`)
                    setSelected({
                      title: 'Saved mooring',
                      subtitle: 'Only visible to you',
                      details,
                      coords: mooring.point,
                      actions: [
                        {
                          label: 'Delete',
                          destructive: true,
                          onPress: () => {
                            void deleteMooring(mooring.id)
                            setSelected(null)
                          },
                        },
                      ],
                    })
                  }}
                />
              </MapLibre.Marker>
            ))}

          {routeShape && (
            <MapLibre.GeoJSONSource id="route" data={routeShape}>
              <MapLibre.Layer
                type="line"
                id="route-line"
                filter={['==', ['get', 'part'], 'line']}
                paint={{
                  'line-color': day.accentDark,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 14, 8],
                  'line-opacity': 0.9,
                }}
                layout={{ 'line-cap': 'round' }}
              />
              <MapLibre.Layer
                type="circle"
                id="route-points"
                filter={['==', ['get', 'part'], 'start']}
                paint={{
                  'circle-color': day.accentDark,
                  'circle-radius': 8,
                  'circle-stroke-color': '#FFFFFF',
                  'circle-stroke-width': 2.5,
                }}
              />
            </MapLibre.GeoJSONSource>
          )}

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
                layout={{
                  visibility: active.has('stoppages') ? 'visible' : 'none',
                  'icon-image': 'moorhen-stoppage',
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
          <Pressable
            style={[styles.searchPill, shadow.pill]}
            onPress={() => {
              setSearchTarget('place')
              setSearchOpen(true)
            }}
          >
            <Feather name="search" size={18} color={day.ink3} />
            <Text style={styles.searchText}>Search locks, moorings, places…</Text>
          </Pressable>
          <Pressable
            style={[styles.roundButton, shadow.pill]}
            onPress={() => {
              setSelected(null)
              setNearMeOpen(true)
            }}
          >
            <MaterialCommunityIcons name="map-marker-radius" size={20} color={day.ink} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {layerChips.map((chip) => {
            const isActive = active.has(chip.key)
            return (
              <Pressable
                key={chip.key}
                onPress={() => toggleChip(chip.key)}
                style={[
                  styles.chip,
                  shadow.pill,
                  chip.key === 'canalside' && styles.chipMeta,
                  isActive &&
                    (chip.key === 'canalside' ? styles.chipMetaActive : styles.chipActive),
                ]}
              >
                <MaterialCommunityIcons
                  name={chip.key === 'canalside' ? 'filter-variant' : chip.icon}
                  size={15}
                  color={isActive ? day.surface : day.ink2}
                />
                <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                  {chip.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {plannerOpen && (
          <View style={[styles.plannerCard, shadow.card]}>
            <View style={styles.plannerRows}>
              <Pressable
                style={styles.plannerField}
                onPress={() => {
                  setSearchTarget('from')
                  setSearchOpen(true)
                }}
              >
                <View style={styles.plannerDotStart} />
                <Text style={fromEntry ? styles.plannerValue : styles.plannerPlaceholder}>
                  {fromEntry?.name ?? 'Choose start…'}
                </Text>
                <Pressable
                  hitSlop={10}
                  onPress={async () => {
                    const permission = await Location.requestForegroundPermissionsAsync()
                    if (!permission.granted) return
                    const position =
                      (await Location.getLastKnownPositionAsync()) ??
                      (await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                      }).catch(() => null))
                    if (!position) return
                    plannerStore.setEndpoint('from', {
                      name: 'My location',
                      kind: 'Current position',
                      point: [position.coords.longitude, position.coords.latitude],
                    })
                  }}
                >
                  <Feather name="crosshair" size={16} color={day.accent} />
                </Pressable>
              </Pressable>
              <Pressable
                style={styles.plannerField}
                onPress={() => {
                  setSearchTarget('to')
                  setSearchOpen(true)
                }}
              >
                <View style={styles.plannerDotEnd} />
                <Text style={toEntry ? styles.plannerValue : styles.plannerPlaceholder}>
                  {toEntry?.name ?? 'Choose destination…'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.plannerActions}>
              <Pressable onPress={() => plannerStore.swap()} hitSlop={10}>
                <Feather name="repeat" size={17} color={day.ink2} />
              </Pressable>
              {(fromEntry || toEntry) && (
                <Pressable onPress={confirmClear} hitSlop={10}>
                  <Feather name="trash-2" size={16} color={day.ink3} />
                </Pressable>
              )}
              <Pressable onPress={() => setPlannerOpen(false)} hitSlop={10}>
                <Feather name="x" size={18} color={day.ink3} />
              </Pressable>
            </View>
          </View>
        )}
        {planning && (
          <View style={[styles.routeCard, shadow.card]}>
            <MoorhenLoader label="Planning your route…" />
          </View>
        )}
        {!mapReady && MapLibre && (
          <View style={[styles.mapLoadingPill, shadow.card]}>
            <MoorhenLoader size={30} label="Loading the map…" />
          </View>
        )}
        {plannerOpen && fromEntry && toEntry && !planning && !route && (
          <View style={[styles.routeCard, shadow.card]}>
            <Text style={styles.routeHint}>No route found between those places</Text>
          </View>
        )}
        {plannerOpen && fromEntry && !toEntry && !planning && (
          <View style={[styles.routeCard, shadow.card]}>
            <Text style={styles.routeHint}>
              Start set — tap the map or search for a destination
            </Text>
          </View>
        )}
        {route && (
          <View style={[styles.routeCard, shadow.card]}>
            <View style={styles.routeText}>
              <Text style={styles.routeTitle}>
                {route.durationLabel} · {(route.distanceM / 1609.344).toFixed(1)} mi
              </Text>
              <Text style={styles.routeMeta}>
                {route.narrowLocks + route.broadLocks} lock
                {route.narrowLocks + route.broadLocks === 1 ? '' : 's'}
                {route.narrowLocks + route.broadLocks > 0
                  ? ` (${route.broadLocks} broad, ${route.narrowLocks} narrow)`
                  : ''}
                {route.cruisingDays > 1 ? ` · ~${Math.ceil(route.cruisingDays)} cruising days` : ''}
              </Text>
              {boatWarningLine && <Text style={styles.routeBoatWarn}>⚠ {boatWarningLine}</Text>}
              {routeNotices && routeNotices.length > 0 && (
                <Text style={styles.routeWarn}>
                  ⚠ {routeNotices.length} stoppage{routeNotices.length === 1 ? '' : 's'} on this
                  route — see Plan tab
                </Text>
              )}
              {stops && stops.length > 0 && (
                <Pressable onPress={() => setStopsOpen(true)}>
                  <Text style={styles.routeStopsLink}>
                    {stops.length} canalside places along the way — water, pubs, moorings…
                  </Text>
                </Pressable>
              )}
              {!stops && <MoorhenLoader size={26} label="Finding canalside places…" />}
              <View style={styles.paceRow}>
                <Text style={styles.paceLabel}>at {hoursPerDay} h cruising per day</Text>
                <Pressable
                  style={styles.paceButton}
                  hitSlop={8}
                  disabled={hoursPerDay <= 3}
                  onPress={() => adjustPace(-1)}
                >
                  <Feather name="minus" size={14} color={hoursPerDay <= 3 ? day.ink3 : day.ink} />
                </Pressable>
                <Pressable
                  style={styles.paceButton}
                  hitSlop={8}
                  disabled={hoursPerDay >= 12}
                  onPress={() => adjustPace(1)}
                >
                  <Feather name="plus" size={14} color={hoursPerDay >= 12 ? day.ink3 : day.ink} />
                </Pressable>
              </View>
            </View>
            <Pressable onPress={confirmClear} hitSlop={12}>
              <Feather name="x" size={18} color={day.ink3} />
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <SearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={onSearchSelect}
        placeholder={
          searchTarget === 'from'
            ? 'Route start: lock, mooring, place…'
            : searchTarget === 'to'
              ? 'Destination: lock, mooring, place…'
              : 'Locks, moorings, pubs, stations…'
        }
      />

      <Pressable
        style={[styles.captureButton, shadow.pill]}
        onPress={async () => {
          const permission = await Location.requestForegroundPermissionsAsync()
          if (!permission.granted) return
          const position =
            (await Location.getLastKnownPositionAsync()) ??
            (await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }).catch(() => null))
          if (!position) return
          setSelected(null)
          setCaptureAt([position.coords.longitude, position.coords.latitude])
        }}
      >
        <MaterialCommunityIcons name="anchor" size={20} color={day.surface} />
      </Pressable>
      <Pressable
        style={[styles.routeButton, shadow.pill, plannerOpen && styles.routeButtonActive]}
        onPress={() => setPlannerOpen((open) => !open)}
      >
        <Feather
          name={plannerOpen ? 'x' : 'corner-up-right'}
          size={20}
          color={plannerOpen ? day.surface : day.ink}
        />
      </Pressable>
      <Pressable style={[styles.locateButton, shadow.pill]} onPress={locateMe}>
        <Feather name="crosshair" size={20} color={day.ink} />
      </Pressable>

      {stopsOpen && stops && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateY: stopsSlide.interpolate({ inputRange: [0, 1], outputRange: [0, 700] }),
                },
              ],
            },
          ]}
          pointerEvents={selected ? 'none' : 'box-none'}
        >
          <RouteStopsSheet
            stops={stops}
            onSelect={onStopSelect}
            onClose={() => setStopsOpen(false)}
          />
        </Animated.View>
      )}

      {nearMeOpen && !selected && (
        <NearMeSheet
          onClose={() => setNearMeOpen(false)}
          onSelect={(nearest: Nearest) => {
            setNearMeOpen(false)
            cameraRef.current?.easeTo({ center: nearest.point, zoom: 14.5, duration: 700 })
            setSelected({
              title: nearest.name,
              subtitle: nearest.label,
              details: [`${(nearest.distanceM / 1609.344).toFixed(1)} mi from your position`],
              coords: nearest.point,
              ...(nearest.facilityId ? { facilityId: nearest.facilityId } : {}),
              ...(nearest.label === 'Pub' || nearest.label === 'Shop'
                ? { hygieneLookup: { name: nearest.name, point: nearest.point } }
                : {}),
            })
          }}
        />
      )}

      {captureAt && (
        <MooringCaptureSheet
          appearance="day"
          point={captureAt}
          onSave={(capture) => {
            void saveMooring(capture)
            if (capture.share)
              shareMooring(capture)
                .then(() => fetchSharedMoorings())
                .then((fc) => fc && setCommunityMoorings(fc))
                .catch(() => {})
            setCaptureAt(null)
          }}
          onDismiss={() => setCaptureAt(null)}
        />
      )}

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
  mapLoadingPill: {
    position: 'absolute',
    bottom: 92,
    alignSelf: 'center',
    backgroundColor: day.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
  },
  routeCard: {
    backgroundColor: day.surface,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeText: { flex: 1, gap: 2 },
  routeTitle: { fontFamily: font.semibold, fontSize: 16, color: day.ink, letterSpacing: -0.2 },
  routeMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  routeStopsLink: { fontFamily: font.semibold, fontSize: 12, color: day.accent, marginTop: 2 },
  routeWarn: { fontFamily: font.semibold, fontSize: 12, color: '#B98A16', marginTop: 2 },
  routeBoatWarn: { fontFamily: font.semibold, fontSize: 12, color: '#9C4A32', marginTop: 2 },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  paceLabel: { fontFamily: font.medium, fontSize: 12, color: day.ink2, flex: 1 },
  paceButton: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: day.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeHint: { fontFamily: font.medium, fontSize: 13, color: day.ink2 },
  plannerCard: {
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  plannerRows: { flex: 1, gap: 8 },
  plannerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: day.surfaceMuted,
    borderRadius: radius.control,
  },
  plannerDotStart: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: day.accent,
  },
  plannerDotEnd: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: day.shieldRed,
  },
  plannerValue: { flex: 1, fontFamily: font.medium, fontSize: 14, color: day.ink },
  plannerPlaceholder: { flex: 1, fontFamily: font.regular, fontSize: 14, color: day.ink3 },
  plannerActions: { gap: 14, alignItems: 'center' },
  routeButton: {
    position: 'absolute',
    right: 12,
    bottom: 84,
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: day.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeButtonActive: { backgroundColor: day.accent },
  captureButton: {
    position: 'absolute',
    right: 12,
    bottom: 144,
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: day.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: day.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  chipActive: { backgroundColor: day.accent },
  chipMeta: { borderWidth: 1.5, borderColor: day.ink3, backgroundColor: day.bg },
  chipMetaActive: { backgroundColor: day.ink, borderColor: day.ink },
  chipLabel: { fontFamily: font.medium, fontSize: 13, color: day.ink2 },
  chipLabelActive: { fontFamily: font.semibold, color: day.surface },
})
