import Feather from '@expo/vector-icons/Feather'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { RouteStop } from '../lib/route-stops'
import { day, font, radius, shadow } from '../theme'

/**
 * Stops along the planned route, in journey order. Everything listed is
 * within a ~10 minute walk of the water.
 */

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  water: 'droplet',
  elsan: 'rotate-ccw',
  pub: 'coffee',
  shop: 'shopping-bag',
  laundry: 'refresh-cw',
  fuel: 'zap',
  chandlery: 'anchor',
  station: 'chevrons-right',
  facility: 'droplet',
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
  return (
    <View style={[styles.sheet, shadow.card]}>
      <View style={styles.header}>
        <Text style={styles.title}>Along your route</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={20} color={day.ink3} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{stops.length} stops within a 10 min walk of the water</Text>
      <FlatList
        data={stops}
        keyExtractor={(stop, i) => `${stop.name}-${i}`}
        style={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <View style={styles.rowIcon}>
              <Feather name={ICONS[item.icon] ?? 'map-pin'} size={15} color={day.greenDark} />
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
        )}
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
