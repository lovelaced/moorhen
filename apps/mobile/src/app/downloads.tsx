import Feather from '@expo/vector-icons/Feather'
import { Stack } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  deleteRegion,
  downloadRegion,
  useRegions,
  useRegionStatus,
  type RegionInfo,
} from '../lib/offline'
import { day, font, radius, shadow } from '../theme'

/**
 * Offline downloads. Grab your region(s) so the map, network and services
 * work with no signal on the cut. Regions are ~100–250 MB (the densest,
 * Midlands, is 98 MB); the full network stays available online.
 */
export default function DownloadsScreen() {
  const regions = useRegions()

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Offline maps', headerBackTitle: 'More' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Download your region so the map and every water point, mooring and pub work with no
          signal. Roughly 100–250 MB each.
        </Text>
        {regions.map((region) => (
          <RegionRow key={region.id} region={region} />
        ))}
        {regions.length === 0 && <Text style={styles.empty}>Loading regions…</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

function RegionRow({ region }: { region: RegionInfo }) {
  const status = useRegionStatus(region.id)

  return (
    <View style={[styles.row, shadow.pill]}>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{region.name}</Text>
        <Text style={styles.rowMeta}>
          {region.networkKm} km of network
          {status.downloaded && status.bytes > 0
            ? ` · ${(status.bytes / 1_000_000).toFixed(0)} MB downloaded`
            : ''}
        </Text>
      </View>
      {status.downloading ? (
        <View style={styles.button}>
          <Feather name="loader" size={16} color={day.green} />
          <Text style={styles.buttonText}>Downloading…</Text>
        </View>
      ) : status.downloaded ? (
        <Pressable style={styles.buttonDone} onPress={() => deleteRegion(region.id)}>
          <Feather name="check-circle" size={16} color={day.greenDark} />
          <Text style={styles.buttonDoneText}>Saved</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.button} onPress={() => downloadRegion(region.id)}>
          <Feather name="download" size={16} color={day.green} />
          <Text style={styles.buttonText}>Download</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: day.bg },
  content: { padding: 16, gap: 10 },
  intro: {
    fontFamily: font.regular,
    fontSize: 13,
    color: day.ink2,
    lineHeight: 19,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: day.surface,
    borderRadius: radius.card,
    padding: 16,
    gap: 12,
  },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: font.semibold, fontSize: 15, color: day.ink },
  rowMeta: { fontFamily: font.regular, fontSize: 12, color: day.ink2 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: day.greenSoft,
  },
  buttonText: { fontFamily: font.semibold, fontSize: 13, color: day.greenDark },
  buttonDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: day.surfaceMuted,
  },
  buttonDoneText: { fontFamily: font.semibold, fontSize: 13, color: day.greenDark },
  empty: { fontFamily: font.regular, fontSize: 13, color: day.ink2, padding: 12 },
})
