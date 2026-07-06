import Feather from '@expo/vector-icons/Feather'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import * as Linking from 'expo-linking'
import * as Location from 'expo-location'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MooringCaptureSheet, type MooringCapture } from '../../components/mooring-capture-sheet'
import { shareMooring } from '../../lib/community'
import { cruiseStore } from '../../lib/cruise-store'
import { saveMooring } from '../../lib/moorings-store'
import { useCruise } from '../../lib/use-cruise'
import { fetchWeather, type CurrentWeather } from '../../lib/weather'
import { font, night, radius } from '../../theme'

/**
 * Cruise mode — night theme by design (boaters cruise at dusk). Live GPS
 * snapped to the network, direction from chainage progression, and the
 * headline feature: stoppages ahead in your direction of travel.
 * v1 tracks while the app is open; the background service comes with the
 * mooring-capture phase.
 */
export default function CruiseScreen() {
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const position =
        (await Location.getLastKnownPositionAsync().catch(() => null)) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
          () => null,
        ))
      if (!position) return
      const found = await fetchWeather([position.coords.longitude, position.coords.latitude])
      if (!cancelled) setWeather(found)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const { state, start, stop } = useCruise()

  const onSaveMooring = (capture: MooringCapture) => {
    saveMooring(capture)
    if (capture.share) shareMooring(capture).catch(() => {}) // best-effort
    cruiseStore.dismissMooredPrompt()
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.content}>
        {state.active ? (
          <>
            <View style={styles.topRow}>
              <View style={styles.pill}>
                <View style={styles.liveDot} />
                <Text style={styles.pillText} numberOfLines={1}>
                  CRUISING{state.waterway ? ` · ${state.waterway}` : ''}
                </Text>
              </View>
              {weather && (
                <View style={styles.pill}>
                  <MaterialCommunityIcons name="weather-windy" size={15} color={night.trail} />
                  <Text style={styles.pillText}>
                    {Math.round(weather.windMph)} mph {weather.windDirection}
                  </Text>
                </View>
              )}
              <View style={styles.pill}>
                <MaterialCommunityIcons name="speedometer" size={15} color={night.trail} />
                <Text style={styles.pillText}>
                  {state.speedMph != null ? `${state.speedMph.toFixed(1)} mph` : '—'}
                </Text>
              </View>
            </View>

            <View style={styles.spacer} />

            {!state.waterway && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Looking for the cut…</Text>
                <Text style={styles.cardMeta}>
                  You seem to be more than 1 km from a navigable waterway.
                </Text>
              </View>
            )}

            {state.waterway && state.direction === 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Get underway to lock direction</Text>
                <Text style={styles.cardMeta}>
                  After ~40 m of travel the compass locks on and stoppages ahead light up.
                </Text>
              </View>
            )}

            {state.ahead ? (
              <View style={styles.alertCard}>
                <View style={styles.alertHead}>
                  <View style={styles.alertIcon}>
                    <Feather name="alert-triangle" size={17} color="#FFFFFF" />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.alertTitle}>Stoppage ahead — in your direction</Text>
                    <Text style={styles.alertSub}>
                      {(state.ahead.distanceM / 1609.344).toFixed(1)} mi ahead
                      {state.ahead.reason ? ` · ${state.ahead.reason}` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.alertBody}>{state.ahead.title}</Text>
                {state.ahead.url && (
                  <Pressable
                    style={styles.alertButton}
                    onPress={() => Linking.openURL(state.ahead!.url!)}
                  >
                    <Text style={styles.alertButtonText}>Notice details</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              state.waterway &&
              state.direction !== 0 && (
                <View style={styles.card}>
                  <Feather name="check-circle" size={18} color={night.trail} />
                  <Text style={styles.cardTitle}>No stoppages ahead</Text>
                  <Text style={styles.cardMeta}>
                    Nothing navigation-blocking within 30 miles in your direction.
                  </Text>
                </View>
              )
            )}

            <View style={styles.bottomBar}>
              <View>
                <Text style={styles.bottomTitle}>
                  {(state.distanceM / 1609.344).toFixed(1)} mi this cruise
                </Text>
                <Text style={styles.bottomMeta}>logging to your cruise diary</Text>
              </View>
              <Pressable style={styles.endPill} onPress={stop}>
                <Text style={styles.endText}>End cruise</Text>
              </Pressable>
            </View>

            {state.mooredPrompt && (
              <MooringCaptureSheet
                point={state.mooredPrompt.point}
                onSave={onSaveMooring}
                onDismiss={() => cruiseStore.dismissMooredPrompt()}
              />
            )}
          </>
        ) : (
          <View style={styles.idle}>
            <View style={styles.idleIcon}>
              <Feather name="navigation" size={26} color={night.trail} />
            </View>
            <Text style={styles.idleTitle}>Ready to cast off?</Text>
            {weather && (
              <Text style={styles.idleWeather}>
                Wind {Math.round(weather.windMph)} mph {weather.windDirection} ·{' '}
                {Math.round(weather.tempC)}°C
                {weather.precipitationMm > 0 ? ' · rain' : ''}
              </Text>
            )}
            <Text style={styles.idleBody}>
              Cruise mode tracks you along the cut, locks onto your direction of travel, and warns
              about stoppages ahead — with the last good mooring before them.
              {'\n\n'}v1 tracks while the app is open. Position stays on this device.
            </Text>
            {state.error && <Text style={styles.error}>{state.error}</Text>}
            <Pressable style={styles.startButton} onPress={start}>
              <Feather name="navigation" size={18} color="#FFFFFF" />
              <Text style={styles.startText}>Start cruise</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bg },
  content: { flex: 1, padding: 16, gap: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
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
    flexShrink: 1,
  },
  pillText: { fontFamily: font.semibold, fontSize: 13, color: night.ink, flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#54B87E' },
  spacer: { flex: 1 },
  col: { flex: 1, gap: 2 },
  card: {
    backgroundColor: night.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: night.border,
    padding: 16,
    gap: 6,
  },
  cardTitle: { fontFamily: font.semibold, fontSize: 15, color: night.ink },
  cardMeta: { fontFamily: font.regular, fontSize: 12, color: night.ink2, lineHeight: 18 },
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
  alertButton: {
    height: 40,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: night.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertButtonText: { fontFamily: font.semibold, fontSize: 13, color: night.ink },
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
  idle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 12 },
  idleIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: night.surface,
    borderWidth: 1,
    borderColor: night.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleTitle: { fontFamily: font.semibold, fontSize: 20, color: night.ink, letterSpacing: -0.3 },
  idleWeather: { fontFamily: font.medium, fontSize: 13, color: night.ink2 },
  idleBody: {
    fontFamily: font.regular,
    fontSize: 13,
    color: night.ink2,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: { fontFamily: font.medium, fontSize: 13, color: night.alert },
  startButton: {
    marginTop: 6,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    backgroundColor: '#2E6B45',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startText: { fontFamily: font.semibold, fontSize: 15, color: '#FFFFFF' },
})
