import Feather from '@expo/vector-icons/Feather'
import { Link } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { setBoat, useBoat } from '../../lib/boat-store'
import { day, font, radius, shadow } from '../../theme'

/**
 * Settings & attribution. The attribution list is licence-required
 * (docs/licensing.md) — every data source credited, always visible.
 */
const ATTRIBUTIONS = [
  '© OpenStreetMap contributors (ODbL)',
  '© The Canal & River Trust copyright and database rights reserved 2026',
  'This uses Environment Agency flood and river level data from the real-time data API (Beta)',
  'Contains Food Standards Agency data © Crown copyright',
  'Contains OS data © Crown copyright and database right',
  'Weather data by Open-Meteo.com (CC-BY 4.0)',
  'Imagery © Mapillary contributors (CC BY-SA 4.0)',
]

export default function MoreScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Moorhen</Text>
        <Text style={styles.tagline}>
          Free forever, ad-free forever, open source (GPL-3.0). Built by boaters, for boaters.
        </Text>

        <Link href="/downloads" asChild>
          <Pressable style={StyleSheet.flatten([styles.linkRow, shadow.card])}>
            <View style={styles.linkIcon}>
              <Feather name="download" size={18} color={day.greenDark} />
            </View>
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Offline maps</Text>
              <Text style={styles.linkMeta}>Download your region for no-signal cruising</Text>
            </View>
            <Feather name="chevron-right" size={18} color={day.ink3} />
          </Pressable>
        </Link>

        <View style={[styles.card, shadow.card]}>
          <Text style={styles.sectionTitle}>Your boat</Text>
          <Text style={styles.attribution}>
            Length and beam drive "will I fit?" warnings on planned routes.
          </Text>
          <BoatRow label="Length" unit="ft" field="lengthFt" step={1} />
          <BoatRow label="Beam" unit="ft" field="beamFt" step={0.1} />
        </View>

        <View style={[styles.card, shadow.card]}>
          <Text style={styles.sectionTitle}>Data sources & thanks</Text>
          {ATTRIBUTIONS.map((line) => (
            <Text key={line} style={styles.attribution}>
              {line}
            </Text>
          ))}
        </View>

        <View style={[styles.card, shadow.card]}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <Text style={styles.attribution}>
            No public boat positions, ever. Reviews attach to places, not boats. Your movement log
            never leaves the device unless you export it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function BoatRow({
  label,
  unit,
  field,
  step,
}: {
  label: string
  unit: string
  field: 'lengthFt' | 'beamFt'
  step: number
}) {
  const boat = useBoat()
  const value = boat[field]
  return (
    <View style={styles.boatRow}>
      <Text style={styles.boatLabel}>{label}</Text>
      <Text style={styles.boatValue}>
        {step < 1 ? value.toFixed(1) : Math.round(value)} {unit}
      </Text>
      <Pressable
        style={styles.boatButton}
        hitSlop={8}
        onPress={() => setBoat({ [field]: value - step })}
      >
        <Feather name="minus" size={15} color={day.ink} />
      </Pressable>
      <Pressable
        style={styles.boatButton}
        hitSlop={8}
        onPress={() => setBoat({ [field]: value + step })}
      >
        <Feather name="plus" size={15} color={day.ink} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  boatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boatLabel: { fontFamily: font.medium, fontSize: 14, color: day.ink, width: 64 },
  boatValue: { fontFamily: font.semibold, fontSize: 14, color: day.ink, flex: 1 },
  boatButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: day.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  root: { flex: 1, backgroundColor: day.bg },
  content: { padding: 20, gap: 16 },
  title: { fontFamily: font.semibold, fontSize: 26, color: day.ink, letterSpacing: -0.5 },
  tagline: { fontFamily: font.regular, fontSize: 13, color: day.ink2, lineHeight: 19 },
  card: {
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 18,
    gap: 10,
  },
  sectionTitle: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 16,
  },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, gap: 2 },
  linkTitle: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  linkMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  attribution: { fontFamily: font.regular, fontSize: 12, color: day.ink2, lineHeight: 18 },
})
