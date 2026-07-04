import Feather from '@expo/vector-icons/Feather'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { font, night, radius } from '../../theme'

/**
 * Cruise mode — night theme by design (boaters cruise at dusk). Static demo
 * of the directional stoppage alert until cruise tracking lands (the
 * chainage/direction engine already exists in @moorhen/graph).
 */
export default function CruiseScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.pill}>
            <View style={styles.liveDot} />
            <Text style={styles.pillText}>CRUISING · Grand Union Canal</Text>
          </View>
          <View style={styles.pill}>
            <Feather name="compass" size={15} color={night.trail} />
            <Text style={styles.pillText}>N · 2.8 mph</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.nextCard}>
          <View style={styles.nextIcon}>
            <Feather name="chevrons-up" size={18} color="#7FB3C8" />
          </View>
          <View style={styles.col}>
            <Text style={styles.nextTitle}>Next: Buckby Top Lock</Text>
            <Text style={styles.nextMeta}>1.2 mi · about 35 min · flight of 7</Text>
          </View>
        </View>

        <View style={styles.alertCard}>
          <View style={styles.alertHead}>
            <View style={styles.alertIcon}>
              <Feather name="alert-triangle" size={17} color="#FFFFFF" />
            </View>
            <View style={styles.col}>
              <Text style={styles.alertTitle}>Stoppage ahead — in your direction</Text>
              <Text style={styles.alertSub}>Whilton Locks · 4.8 mi ahead</Text>
            </View>
          </View>
          <Text style={styles.alertBody}>
            Navigation closed — suspected vandalism (CRT notice 14:05). Last good mooring before it:
            Weedon Wharf, 3.1 mi ahead · ★ 4.5 · rings.
          </Text>
          <View style={styles.alertButtons}>
            <View style={styles.alertPrimary}>
              <Feather name="anchor" size={15} color="#FFFFFF" />
              <Text style={styles.alertPrimaryText}>Moor before it</Text>
            </View>
            <View style={styles.alertSecondary}>
              <Text style={styles.alertSecondaryText}>Notice details</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomBar}>
          <View>
            <Text style={styles.bottomTitle}>Day 3 · 6.2 mi · 9 locks</Text>
            <Text style={styles.bottomMeta}>logging to your cruise diary</Text>
          </View>
          <View style={styles.endPill}>
            <Text style={styles.endText}>End cruise</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bg },
  content: { flex: 1, padding: 16, gap: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pill: {
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: night.surface,
    borderWidth: 1,
    borderColor: night.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  pillText: { fontFamily: font.semibold, fontSize: 13, color: night.ink },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#54B87E' },
  spacer: { flex: 1 },
  col: { flex: 1, gap: 2 },
  nextCard: {
    backgroundColor: night.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: night.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: '#26373F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTitle: { fontFamily: font.semibold, fontSize: 15, color: night.ink },
  nextMeta: { fontFamily: font.regular, fontSize: 12, color: night.ink2 },
  alertCard: {
    backgroundColor: night.surface,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: night.shieldRed,
    padding: 14,
    gap: 10,
  },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: night.shieldRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { fontFamily: font.bold, fontSize: 15, color: night.alert },
  alertSub: { fontFamily: font.regular, fontSize: 12, color: night.ink2 },
  alertBody: { fontFamily: font.regular, fontSize: 12, color: night.ink2, lineHeight: 18 },
  alertButtons: { flexDirection: 'row', gap: 10 },
  alertPrimary: {
    flex: 1,
    height: 42,
    borderRadius: radius.control,
    backgroundColor: night.shieldRed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  alertPrimaryText: { fontFamily: font.semibold, fontSize: 13, color: '#FFFFFF' },
  alertSecondary: {
    flex: 1,
    height: 42,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: night.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertSecondaryText: { fontFamily: font.semibold, fontSize: 13, color: night.ink },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomTitle: { fontFamily: font.semibold, fontSize: 14, color: night.ink },
  bottomMeta: { fontFamily: font.regular, fontSize: 11, color: night.ink2 },
  endPill: {
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#F58D7766',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  endText: { fontFamily: font.semibold, fontSize: 13, color: night.alert },
})
