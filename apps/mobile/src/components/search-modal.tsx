import Feather from '@expo/vector-icons/Feather'
import { MoorhenLoader } from './moorhen-loader'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { loadPlacesIndex, type PlaceEntry } from '../lib/places-index'
import { day, font, radius } from '../theme'

/**
 * Offline-style search over the published artifacts: locks, named POIs
 * (pubs, shops, stations…) and named moorings. The index is fetched once
 * per session and searched in memory.
 */

export type SearchEntry = PlaceEntry

const KIND_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Junction: 'source-branch',
  Lock: 'chevron-double-up',
  Pub: 'glass-mug-variant',
  Shop: 'storefront',
  'Railway station': 'train',
  Mooring: 'anchor',
  Laundry: 'washing-machine',
  'Water point': 'faucet',
  'Winding hole': 'autorenew',
  Place: 'map-marker',
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
      loadPlacesIndex()
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
        {!index && <MoorhenLoader label="Loading the network…" />}
        <FlatList
          data={results}
          keyExtractor={(entry, i) => `${entry.name}-${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item)}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons
                  name={KIND_ICONS[item.kind] ?? 'map-marker'}
                  size={17}
                  color={day.greenDark}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowKind}>
                  {item.kind}
                  {item.waterway ? ` · ${item.waterway}` : ''}
                </Text>
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
