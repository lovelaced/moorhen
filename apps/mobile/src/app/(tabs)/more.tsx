import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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

const styles = StyleSheet.create({
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
  attribution: { fontFamily: font.regular, fontSize: 12, color: day.ink2, lineHeight: 18 },
})
