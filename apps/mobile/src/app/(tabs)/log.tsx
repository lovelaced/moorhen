import Feather from '@expo/vector-icons/Feather'
import { Directory, File, Paths } from 'expo-file-system'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { sessionsToCsv, sessionsToHtml } from '../../lib/evidence'
import { loadSessions, subscribeSessions, type CruiseSession } from '../../lib/log-store'
import { day, font, radius, shadow } from '../../theme'

async function exportCsv(sessions: CruiseSession[]): Promise<void> {
  const dir = new Directory(Paths.cache, 'exports')
  if (!dir.exists) dir.create({ intermediates: true })
  const file = new File(dir, `moorhen-log-${new Date().toISOString().slice(0, 10)}.csv`)
  if (file.exists) file.delete()
  file.write(sessionsToCsv(sessions))
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export cruise log' })
}

async function exportPdf(sessions: CruiseSession[]): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: sessionsToHtml(sessions) })
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export cruise log' })
}

/**
 * The private cruise log — one entry per cruise, recorded automatically when
 * you end a cruise on the Cruise tab. The CC evidence pack (PDF/CSV export,
 * 14-day countdowns) builds on this.
 */
export default function LogScreen() {
  const [sessions, setSessions] = useState<CruiseSession[] | null>(null)

  useEffect(() => {
    loadSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
    return subscribeSessions(setSessions)
  }, [])

  const totalMi = (sessions ?? []).reduce((sum, s) => sum + s.distanceM, 0) / 1609.344

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Cruise log</Text>
        {sessions && sessions.length > 0 ? (
          <>
            <Text style={styles.summary}>
              {sessions.length} entr{sessions.length === 1 ? 'y' : 'ies'} · {totalMi.toFixed(1)} mi
              logged · private to this device
            </Text>
            <View style={styles.exportRow}>
              <Pressable
                style={styles.exportButton}
                onPress={() => exportCsv(sessions).catch(() => {})}
              >
                <Feather name="download" size={14} color={day.greenDark} />
                <Text style={styles.exportText}>Export CSV</Text>
              </Pressable>
              <Pressable
                style={styles.exportButton}
                onPress={() => exportPdf(sessions).catch(() => {})}
              >
                <Feather name="file-text" size={14} color={day.greenDark} />
                <Text style={styles.exportText}>Export PDF</Text>
              </Pressable>
            </View>
            <FlatList
              data={sessions}
              keyExtractor={(session) => session.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <SessionRow session={item} />}
            />
          </>
        ) : (
          <View style={[styles.card, shadow.card]}>
            <View style={styles.iconCircle}>
              <Feather name="book-open" size={20} color={day.greenDark} />
            </View>
            <Text style={styles.cardTitle}>No cruises logged yet</Text>
            <Text style={styles.cardBody}>
              End a cruise on the Cruise tab and it lands here automatically — date, distance and
              waterway. Mooring countdowns and the PDF/CSV evidence pack build on this log.
              {'\n\n'}Private by default — nothing is shared, ever, unless you export it yourself.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

function SessionRow({ session }: { session: CruiseSession }) {
  const started = new Date(session.startedAtMs)
  const hours = (session.endedAtMs - session.startedAtMs) / 3_600_000
  const duration =
    hours < 1
      ? `${Math.round(hours * 60)} min`
      : `${Math.floor(hours)} h ${Math.round((hours % 1) * 60)} min`
  return (
    <View style={[styles.row, shadow.pill]}>
      <View style={styles.iconCircleSmall}>
        <Feather name="navigation" size={15} color={day.greenDark} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {(session.distanceM / 1609.344).toFixed(1)} mi · {duration}
        </Text>
        <Text style={styles.rowMeta}>
          {started.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
          {session.waterway ? ` · ${session.waterway}` : ''}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: day.bg },
  content: { padding: 20, gap: 14, flex: 1 },
  title: { fontFamily: font.semibold, fontSize: 26, color: day.ink, letterSpacing: -0.5 },
  summary: { fontFamily: font.regular, fontSize: 13, color: day.ink2 },
  exportRow: { flexDirection: 'row', gap: 8 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
  },
  exportText: { fontFamily: font.semibold, fontSize: 12, color: day.greenDark },
  list: { gap: 10, paddingBottom: 20 },
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
  iconCircleSmall: {
    width: 34,
    height: 34,
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
    lineHeight: 20,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 14,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  rowMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
})
