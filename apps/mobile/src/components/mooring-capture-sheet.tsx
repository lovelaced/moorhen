import Feather from '@expo/vector-icons/Feather'
import * as ImagePicker from 'expo-image-picker'
import * as Network from 'expo-network'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { night, font, radius } from '../theme'

/**
 * Moored-up capture: one-tap speed test + photo, plus quick edge-type chips.
 * Everything is private to the device by default; sharing to the community
 * layer is a separate explicit opt-in (docs/product-notes.md). Over time this
 * builds the boater's own map of good moorings and cell coverage.
 */

const EDGE_TYPES = ['Rings', 'Armco', 'Piling', 'Pins', 'Bank'] as const

export interface MooringCapture {
  point: [number, number]
  edgeType: string | null
  photoUri: string | null
  speed: SpeedResult | null
  savedAtMs: number
}

interface SpeedResult {
  downMbps: number
  latencyMs: number
  networkType: string
}

// 2 MB from a fast public CDN test file; measures real throughput on the
// boat's connection. Cloudflare's speed endpoint is CORS-open and free.
const SPEED_URL = 'https://speed.cloudflare.com/__down?bytes=2000000'
const SPEED_BYTES = 2_000_000

async function runSpeedTest(): Promise<SpeedResult> {
  const networkState = await Network.getNetworkStateAsync()
  const networkType = String(networkState.type ?? 'unknown').toLowerCase()

  const latencyStart = Date.now()
  await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store' })
  const latencyMs = Date.now() - latencyStart

  const start = Date.now()
  const response = await fetch(SPEED_URL, { cache: 'no-store' })
  await response.arrayBuffer()
  const seconds = (Date.now() - start) / 1000
  const downMbps = (SPEED_BYTES * 8) / seconds / 1_000_000

  return { downMbps, latencyMs, networkType }
}

export function MooringCaptureSheet({
  point,
  onSave,
  onDismiss,
}: {
  point: [number, number]
  onSave: (capture: MooringCapture) => void
  onDismiss: () => void
}) {
  const [edgeType, setEdgeType] = useState<string | null>(null)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [speed, setSpeed] = useState<SpeedResult | null>(null)
  const [testing, setTesting] = useState(false)

  const test = useCallback(async () => {
    setTesting(true)
    try {
      setSpeed(await runSpeedTest())
    } catch {
      setSpeed(null)
    } finally {
      setTesting(false)
    }
  }, [])

  const addPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      exif: false, // strip location metadata on capture
    })
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri)
  }, [])

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Moored up?</Text>
          <Text style={styles.subtitle}>Log this spot — private to you</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={12}>
          <Feather name="x" size={20} color={night.ink2} />
        </Pressable>
      </View>

      <Text style={styles.label}>Edge</Text>
      <View style={styles.chips}>
        {EDGE_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => setEdgeType(edgeType === type ? null : type)}
            style={[styles.chip, edgeType === type && styles.chipActive]}
          >
            <Text style={[styles.chipText, edgeType === type && styles.chipTextActive]}>
              {type}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={test} disabled={testing}>
          {testing ? (
            <ActivityIndicator color={night.trail} />
          ) : (
            <Feather name="wifi" size={20} color={night.trail} />
          )}
          <Text style={styles.actionText}>
            {speed
              ? `${speed.downMbps.toFixed(1)} Mbps · ${Math.round(speed.latencyMs)} ms`
              : 'Speed test'}
          </Text>
          {speed && <Text style={styles.actionMeta}>{speed.networkType}</Text>}
        </Pressable>

        <Pressable style={styles.action} onPress={addPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.thumb} />
          ) : (
            <Feather name="camera" size={20} color={night.trail} />
          )}
          <Text style={styles.actionText}>{photoUri ? 'Photo added' : 'Add photo'}</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.save}
        onPress={() => onSave({ point, edgeType, photoUri, speed, savedAtMs: Date.now() })}
      >
        <Feather name="anchor" size={16} color="#FFFFFF" />
        <Text style={styles.saveText}>Save mooring</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: night.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: night.border,
    padding: 16,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: font.semibold, fontSize: 18, color: night.ink, letterSpacing: -0.2 },
  subtitle: { fontFamily: font.regular, fontSize: 12, color: night.ink2 },
  label: { fontFamily: font.medium, fontSize: 12, color: night.ink2, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: 32,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: night.bg,
    borderWidth: 1,
    borderColor: night.border,
  },
  chipActive: { backgroundColor: '#2E6B45', borderColor: '#2E6B45' },
  chipText: { fontFamily: font.medium, fontSize: 13, color: night.ink2 },
  chipTextActive: { color: '#FFFFFF', fontFamily: font.semibold },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  action: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.control,
    backgroundColor: night.bg,
    borderWidth: 1,
    borderColor: night.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
  },
  actionText: { fontFamily: font.semibold, fontSize: 12, color: night.ink, textAlign: 'center' },
  actionMeta: { fontFamily: font.regular, fontSize: 11, color: night.ink2 },
  thumb: { width: 28, height: 28, borderRadius: 6 },
  save: {
    marginTop: 4,
    height: 48,
    borderRadius: radius.control,
    backgroundColor: '#2E6B45',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: { fontFamily: font.semibold, fontSize: 15, color: '#FFFFFF' },
})
