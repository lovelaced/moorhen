import Feather from '@expo/vector-icons/Feather'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { day, font, radius, shadow } from '../../theme'

/**
 * Continuous-cruiser movement log. Private by default; the evidence-pack
 * export (PDF/CSV for CRT licence disputes) lands with the community phase.
 */
export default function LogScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Cruise log</Text>
        <View style={[styles.card, shadow.card]}>
          <View style={styles.iconCircle}>
            <Feather name="book-open" size={20} color={day.greenDark} />
          </View>
          <Text style={styles.cardTitle}>Your movement log lives here</Text>
          <Text style={styles.cardBody}>
            Mooring history with 14-day countdowns, geotagged photos, range statistics, and a
            PDF/CSV evidence pack for licence renewals.{'\n\n'}Private by default — nothing is
            shared, ever, unless you export it yourself.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: day.bg },
  content: { padding: 20, gap: 16 },
  title: { fontFamily: font.semibold, fontSize: 26, color: day.ink, letterSpacing: -0.5 },
  card: {
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: font.semibold, fontSize: 16, color: day.ink },
  cardBody: {
    fontFamily: font.regular,
    fontSize: 13,
    color: day.ink2,
    textAlign: 'center',
    lineHeight: 19,
  },
})
