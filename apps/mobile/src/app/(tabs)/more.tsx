import Feather from '@expo/vector-icons/Feather'
import Constants from 'expo-constants'
import { Link } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { alertsAvailable, unsubscribeWaterway, useAlertSubscriptions } from '../../lib/alerts'
import { setBoat, useBoat } from '../../lib/boat-store'
import { setSettings, useSettings } from '../../lib/settings-store'
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
              <Feather name="download" size={18} color={day.accentDark} />
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

        <AlertsCard />

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

        <VersionRow />
      </ScrollView>
    </SafeAreaView>
  )
}

/** Seven taps on the version number wake the old trees (the map grows a
 * hidden layer of veteran & landmark oaks near the cut). Android-style. */
const UNLOCK_TAPS = 7

function VersionRow() {
  const { treesUnlocked } = useSettings()
  const taps = useRef(0)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const version = Constants.expoConfig?.version ?? '0.0.1'

  const onTap = () => {
    if (treesUnlocked) {
      setHint('The old trees already know you 🌳')
      return
    }
    taps.current += 1
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      taps.current = 0
      setHint(null)
    }, 2000)
    const remaining = UNLOCK_TAPS - taps.current
    if (remaining <= 0) {
      setSettings({ treesUnlocked: true })
      setHint('🌳 The veteran trees reveal themselves — look for Old trees on the map')
    } else if (taps.current >= 3) {
      setHint(remaining === 1 ? 'One more…' : `${remaining} taps from something ancient…`)
    }
  }

  return (
    <Pressable style={styles.versionRow} onPress={onTap}>
      <Text style={styles.versionText}>Moorhen v{version}</Text>
      {hint && <Text style={styles.versionHint}>{hint}</Text>}
    </Pressable>
  )
}

function AlertsCard() {
  const subscriptions = useAlertSubscriptions()
  if (!alertsAvailable() || subscriptions.length === 0) return null
  return (
    <View style={[styles.card, shadow.card]}>
      <Text style={styles.sectionTitle}>Stoppage alerts</Text>
      <Text style={styles.attribution}>
        Push notifications for navigation closures on these waterways.
      </Text>
      {subscriptions.map((name) => (
        <View key={name} style={styles.alertRow}>
          <Feather name="bell" size={14} color={day.accentDark} />
          <Text style={styles.alertName}>{name}</Text>
          <Pressable hitSlop={8} onPress={() => void unsubscribeWaterway(name)}>
            <Feather name="x" size={16} color={day.ink3} />
          </Pressable>
        </View>
      ))}
    </View>
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
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertName: { fontFamily: font.medium, fontSize: 14, color: day.ink, flex: 1 },
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
    backgroundColor: day.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, gap: 2 },
  linkTitle: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  linkMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  attribution: { fontFamily: font.regular, fontSize: 12, color: day.ink2, lineHeight: 18 },
  versionRow: { alignItems: 'center', paddingVertical: 10, gap: 4 },
  versionText: { fontFamily: font.regular, fontSize: 12, color: day.ink3 },
  versionHint: {
    fontFamily: font.medium,
    fontSize: 12,
    color: day.accentDark,
    textAlign: 'center',
  },
})
