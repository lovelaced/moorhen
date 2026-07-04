import Feather from '@expo/vector-icons/Feather'
import {
  DEFAULT_TIMING_PROFILE,
  estimateJourney,
  formatJourneyDuration,
  type TimingEdge,
} from '@moorhen/graph'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { day, font, radius, shadow } from '../../theme'

/**
 * Route planner. The numbers on screen are computed live by the shared
 * timing model in @moorhen/graph — the same code the ETL and alerts use.
 * Demo journey until the routable graph artifact is wired in.
 */
const MILE = 1609.344

const DEMO_LEGS = [
  {
    edge: {
      lengthM: 37 * MILE,
      waterwayClass: 'broad-canal',
      broadLocks: 23,
      flightLocks: 12,
      tunnelM: 1867,
    } satisfies TimingEdge,
    direction: 1 as const,
  },
]

const DAYS = [
  {
    n: 1,
    title: 'Braunston → Weedon Bec',
    meta: '7 h 05 · 13 locks · Braunston Tunnel · moor at Weedon Wharf ★ 4.5',
  },
  {
    n: 2,
    title: 'Weedon Bec → Leamington Spa',
    meta: '6 h 50 · 10 locks · water at Braunston Turn · Tesco 6 min from mooring',
  },
  {
    n: 3,
    title: 'Leamington Spa → Birmingham',
    meta: '5 h 45 · 12 locks (Hatton flight — allow extra) · arrive Gas Street Basin',
  },
]

export default function PlanScreen() {
  const estimate = estimateJourney(DEMO_LEGS)
  const profile = DEFAULT_TIMING_PROFILE

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Braunston → Birmingham</Text>
            <Text style={styles.subtitle}>Grand Union main line · via Braunston Tunnel</Text>
          </View>
        </View>

        <View style={[styles.card, shadow.card]}>
          <View style={styles.summaryTop}>
            <Text style={styles.bigTime}>{formatJourneyDuration(estimate.totalSeconds)}</Text>
            <View style={styles.pacePill}>
              <Text style={styles.pacePillText}>
                {Math.ceil(estimate.cruisingDays)} days at your pace
              </Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <Stat icon="flag" value="37.2 mi" label="distance" />
            <Stat icon="chevrons-up" value={String(estimate.lockCount)} label="locks" />
            <Stat icon="circle" value="1" label="tunnel" />
            <Stat icon="droplet" value="6" label="water points" />
          </View>
        </View>

        <View style={styles.warnCard}>
          <Feather name="alert-triangle" size={20} color="#B98A16" />
          <View style={styles.warnCol}>
            <Text style={styles.warnTitle}>Winter works clash with your dates</Text>
            <Text style={styles.warnBody}>
              Buckby Locks close 5 Nov – 20 Dec. At your pace you'd arrive 12 Nov. Leave 8 days
              earlier, or reroute via the Leicester line.
            </Text>
            <Text style={styles.warnLink}>See options</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Day by day</Text>
        {DAYS.map((dayPlan) => (
          <View key={dayPlan.n} style={styles.dayRow}>
            <View style={styles.dayDot}>
              <Text style={styles.dayDotText}>{dayPlan.n}</Text>
            </View>
            <View style={styles.dayCol}>
              <Text style={styles.dayTitle}>{dayPlan.title}</Text>
              <Text style={styles.dayMeta}>{dayPlan.meta}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.paceCard, shadow.pill]}>
          <Feather name="sliders" size={18} color={day.ink2} />
          <View style={styles.dayCol}>
            <Text style={styles.paceTitle}>Your pace</Text>
            <Text style={styles.paceMeta}>
              {(profile.cruiseSpeedMps['broad-canal'] / 0.44704).toFixed(1)} mph ·{' '}
              {profile.minutesPerBroadLock} min per lock · {profile.cruisingHoursPerDay} h cruising
              days
            </Text>
          </View>
          <Text style={styles.paceAdjust}>Adjust</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Feather.glyphMap
  value: string
  label: string
}) {
  return (
    <View style={styles.stat}>
      <Feather name={icon} size={16} color={day.ink3} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: day.bg },
  content: { padding: 20, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: font.semibold, fontSize: 18, color: day.ink, letterSpacing: -0.2 },
  subtitle: { fontFamily: font.regular, fontSize: 12, color: day.ink2, marginTop: 2 },
  card: {
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 18,
    gap: 14,
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigTime: { fontFamily: font.bold, fontSize: 32, color: day.ink, letterSpacing: -1 },
  pacePill: {
    backgroundColor: day.greenSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
  },
  pacePillText: { fontFamily: font.semibold, fontSize: 12, color: day.greenDark },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', gap: 3 },
  statValue: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  statLabel: { fontFamily: font.regular, fontSize: 11, color: day.ink3 },
  warnCard: {
    backgroundColor: day.amberSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: '#E8B83066',
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  warnCol: { flex: 1, gap: 3 },
  warnTitle: { fontFamily: font.semibold, fontSize: 14, color: day.ink },
  warnBody: { fontFamily: font.regular, fontSize: 12, color: day.ink2, lineHeight: 17 },
  warnLink: { fontFamily: font.semibold, fontSize: 12, color: day.green },
  sectionTitle: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  dayRow: { flexDirection: 'row', gap: 12 },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotText: { fontFamily: font.semibold, fontSize: 12, color: day.greenDark },
  dayCol: { flex: 1, gap: 2 },
  dayTitle: { fontFamily: font.semibold, fontSize: 14, color: day.ink },
  dayMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2, lineHeight: 17 },
  paceCard: {
    backgroundColor: day.surface,
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paceTitle: { fontFamily: font.semibold, fontSize: 13, color: day.ink },
  paceMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  paceAdjust: { fontFamily: font.semibold, fontSize: 12, color: day.green },
})
