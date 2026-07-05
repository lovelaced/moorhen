import Feather from '@expo/vector-icons/Feather'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { urls } from '../data'
import { day, font, radius } from '../theme'

/**
 * Offline-style search over the published artifacts: locks, named POIs
 * (pubs, shops, stations…) and named moorings. The index is fetched once
 * per session and searched in memory.
 */

export interface SearchEntry {
  name: string
  kind: string
  point: [number, number]
}

const KIND_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Lock: 'chevrons-up',
  Pub: 'coffee',
  Shop: 'shopping-bag',
  'Railway station': 'chevrons-right',
  Mooring: 'anchor',
  Laundry: 'refresh-cw',
  'Water point': 'droplet',
  Place: 'map-pin',
}

const POI_KINDS: Record<string, string> = {
  pub: 'Pub',
  shop: 'Shop',
  station: 'Railway station',
  laundry: 'Laundry',
  'water-point': 'Water point',
  fuel: 'Place',
  chandlery: 'Place',
  elsan: 'Place',
}

let indexPromise: Promise<SearchEntry[]> | null = null

function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= (async () => {
    const entries: SearchEntry[] = []
    const [locks, pois, moorings] = await Promise.all([
      fetch(urls.locks).then((r) => r.json()),
      fetch(urls.pois).then((r) => r.json()),
      fetch(urls.moorings).then((r) => r.json()),
    ])
    for (const f of (locks as GeoJSON.FeatureCollection).features) {
      const name = f.properties?.['name'] as string | null
      const waterway = f.properties?.['waterway'] as string | null
      if (!name) continue
      entries.push({
        name: waterway ? `${name} (${waterway})` : name,
        kind: 'Lock',
        point: (f.geometry as GeoJSON.Point).coordinates as [number, number],
      })
    }
    for (const f of (pois as GeoJSON.FeatureCollection).features) {
      const name = f.properties?.['name'] as string | null
      if (!name) continue
      const kind = POI_KINDS[String(f.properties?.['category'])]
      if (!kind) continue
      entries.push({
        name,
        kind,
        point: (f.geometry as GeoJSON.Point).coordinates as [number, number],
      })
    }
    for (const f of (moorings as GeoJSON.FeatureCollection).features) {
      const name = f.properties?.['name'] as string | null
      if (!name) continue
      const line = (f.geometry as GeoJSON.LineString).coordinates as [number, number][]
      entries.push({ name, kind: 'Mooring', point: line[Math.floor(line.length / 2)]! })
    }
    return entries
  })()
  return indexPromise
}

export function SearchModal({
  visible,
  onClose,
  onSelect,
  placeholder = 'Locks, moorings, pubs, stations…',
}: {
  visible: boolean
  onClose: () => void
  onSelect: (entry: SearchEntry) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<SearchEntry[] | null>(null)

  useEffect(() => {
    if (!visible) return
    setQuery('')
    if (!index) {
      loadIndex()
        .then(setIndex)
        .catch(() => setIndex([]))
    }
  }, [visible, index])

  const results = useMemo(() => {
    if (!index || query.trim().length < 2) return []
    const needle = query.trim().toLowerCase()
    const starts: SearchEntry[] = []
    const contains: SearchEntry[] = []
    for (const entry of index) {
      const haystack = entry.name.toLowerCase()
      if (haystack.startsWith(needle)) starts.push(entry)
      else if (haystack.includes(needle)) contains.push(entry)
      if (starts.length >= 30) break
    }
    return [...starts, ...contains].slice(0, 30)
  }, [index, query])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.inputRow}>
          <Feather name="search" size={18} color={day.ink3} />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={day.ink3}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
          />
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={day.ink2} />
          </Pressable>
        </View>
        {!index && (
          <View style={styles.loading}>
            <ActivityIndicator color={day.green} />
            <Text style={styles.loadingText}>Loading the network…</Text>
          </View>
        )}
        <FlatList
          data={results}
          keyExtractor={(entry, i) => `${entry.name}-${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item)}>
              <View style={styles.rowIcon}>
                <Feather
                  name={KIND_ICONS[item.kind] ?? 'map-pin'}
                  size={16}
                  color={day.greenDark}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowKind}>{item.kind}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            index && query.trim().length >= 2 ? (
              <Text style={styles.empty}>Nothing found for “{query.trim()}”</Text>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: day.bg },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: day.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: day.border,
  },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, color: day.ink },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 20 },
  loadingText: { fontFamily: font.regular, fontSize: 13, color: day.ink2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowName: { fontFamily: font.medium, fontSize: 15, color: day.ink },
  rowKind: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  empty: { fontFamily: font.regular, fontSize: 13, color: day.ink2, padding: 20 },
})
