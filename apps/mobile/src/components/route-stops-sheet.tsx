import Feather from '@expo/vector-icons/Feather'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { RouteStop } from '../lib/route-stops'
import { day, font, radius, shadow } from '../theme'

/**
 * Stops along the planned route, in journey order. Everything listed is
 * within a ~10 minute walk of the water.
 */

/** Everything en route is either a boater facility or a place ashore. */
const FACILITY_ICON_KEYS = new Set([
  'water',
  'elsan',
  'pumpout',
  'bins',
  'shower',
  'facility',
  'mooring',
  'fuel',
])
const groupOf = (iconKey: string): 'Facilities' | 'Places' =>
  FACILITY_ICON_KEYS.has(iconKey) ? 'Facilities' : 'Places'

const ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  water: 'faucet',
  elsan: 'toilet',
  pumpout: 'water-pump',
  bins: 'trash-can-outline',
  shower: 'shower-head',
  pub: 'glass-mug-variant',
  shop: 'storefront',
  laundry: 'washing-machine',
  fuel: 'gas-station',
  chandlery: 'hammer-wrench',
  station: 'train',
  facility: 'dots-horizontal',
  mooring: 'anchor',
}

export function RouteStopsSheet({
  stops,
  onSelect,
  onClose,
}: {
  stops: RouteStop[]
  onSelect: (stop: RouteStop) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<string | null>(null)

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const stop of stops) counts.set(stop.category, (counts.get(stop.category) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [stops])

  const visible = useMemo(
    () => (filter ? stops.filter((stop) => stop.category === filter) : stops),
    [stops, filter],
  )

  // grouped: facilities first (journey order preserved within each group)
  const listData = useMemo(() => {
    const rows: Array<{ header: string } | RouteStop> = []
    for (const group of ['Facilities', 'Places'] as const) {
      const members = visible.filter((stop) => groupOf(stop.icon) === group)
      if (members.length === 0) continue
      rows.push({ header: group })
      rows.push(...members)
    }
    return rows
  }, [visible])

  return (
    <View style={[styles.sheet, shadow.card]}>
      <View style={styles.header}>
        <Text style={styles.title}>Along your route</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={20} color={day.ink3} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        {visible.length} canalside place{visible.length === 1 ? '' : 's'} along your route
      </Text>
      <View style={styles.filterWrap}>
        <Pressable
          onPress={() => setFilter(null)}
          style={[styles.filterChip, filter === null && styles.filterChipActive]}
        >
          <Text style={[styles.filterLabel, filter === null && styles.filterLabelActive]}>All</Text>
        </Pressable>
        {categories.map(([category, count]) => (
          <Pressable
            key={category}
            onPress={() => setFilter(filter === category ? null : category)}
            style={[styles.filterChip, filter === category && styles.filterChipActive]}
          >
            <Text style={[styles.filterLabel, filter === category && styles.filterLabelActive]}>
              {category} · {count}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={listData}
        keyExtractor={(row, i) => ('header' in row ? row.header : `${row.name}-${i}`)}
        style={styles.list}
        renderItem={({ item }) =>
          'header' in item ? (
            <Text style={styles.groupHeader}>{item.header}</Text>
          ) : (
            <Pressable style={styles.row} onPress={() => onSelect(item)}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons
                  name={ICONS[item.icon] ?? 'map-marker'}
                  size={16}
                  color={day.greenDark}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.category} · mile {(item.chainageM / 1609.344).toFixed(1)} ·{' '}
                  {Math.max(1, Math.round(item.offsetM / 80))} min walk
                </Text>
              </View>
            </Pressable>
          )
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '55%',
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 16,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.semibold, fontSize: 17, color: day.ink, letterSpacing: -0.2 },
  subtitle: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  list: { marginTop: 6 },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  groupHeader: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: day.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 2,
  },
  filterChip: {
    height: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: day.surfaceMuted,
  },
  filterChipActive: { backgroundColor: day.green },
  filterLabel: { fontFamily: font.medium, fontSize: 12, color: day.ink2 },
  filterLabelActive: { color: day.surface, fontFamily: font.semibold },
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
