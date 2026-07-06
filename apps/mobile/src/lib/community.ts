import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MooringCapture } from '../components/mooring-capture-sheet'

/**
 * Community layer client — anonymous-first Supabase. Everything is a no-op
 * until EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are set (the app must work fully
 * without the community backend). First write signs the device in
 * anonymously; a later magic-link upgrade keeps the same account.
 *
 * Privacy: reports and shares attach to PLACES. No tracks, no boat
 * positions, no history leaves the device.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

let client: SupabaseClient | null | undefined

export function communityClient(): SupabaseClient | null {
  if (client !== undefined) return client
  client =
    URL && ANON_KEY
      ? createClient(URL, ANON_KEY, {
          auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          },
        })
      : null
  return client
}

export const communityConfigured = (): boolean => communityClient() !== null

async function ensureSignedIn(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error || !anon.user) throw new Error(error?.message ?? 'anonymous sign-in failed')
  return anon.user.id
}

export type FacilityStatus = 'working' | 'broken' | 'gone' | 'queue'

/** One-tap "water point working / broken" report. */
export async function submitStatusReport(
  facilityId: string,
  status: FacilityStatus,
  point: [number, number],
  note?: string,
): Promise<void> {
  const supabase = communityClient()
  if (!supabase) throw new Error('community backend not configured')
  const author = await ensureSignedIn(supabase)
  const { error } = await supabase.from('status_reports').insert({
    facility_id: facilityId,
    status,
    lon: point[0],
    lat: point[1],
    note: note ?? null,
    author,
  })
  if (error) throw new Error(error.message)
}

/** Opt-in share of a privately captured mooring (photo upload comes later). */
export async function shareMooring(capture: MooringCapture): Promise<void> {
  const supabase = communityClient()
  if (!supabase) throw new Error('community backend not configured')
  const author = await ensureSignedIn(supabase)
  const { error } = await supabase.from('shared_moorings').insert({
    lon: capture.point[0],
    lat: capture.point[1],
    edge_type: capture.edgeType?.toLowerCase() ?? null,
    down_mbps: capture.speed?.downMbps ?? null,
    network_type: capture.speed?.networkType ?? null,
    author,
  })
  if (error) throw new Error(error.message)
}

/** Suggest opening hours for a place (pending until autoconfirmed). */
export async function submitHours(
  placeId: string,
  point: [number, number],
  value: string,
): Promise<void> {
  const supabase = communityClient()
  if (!supabase) throw new Error('community backend not configured')
  const author = await ensureSignedIn(supabase)
  const { error } = await supabase.from('place_edits').insert({
    place_id: placeId,
    field: 'opening_hours',
    value,
    lon: point[0],
    lat: point[1],
    author,
  })
  if (error) throw new Error(error.message)
}

/** Latest visible contributed hours for a place, if any. */
export async function fetchContributedHours(placeId: string): Promise<string | null> {
  const supabase = communityClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('place_edits')
    .select('value')
    .eq('place_id', placeId)
    .eq('field', 'opening_hours')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  return data[0]!.value
}

export interface CommunityReport {
  status: FacilityStatus
  note: string | null
  created_at: string
}

/** Latest community reports for one facility, freshest first. */
export async function fetchFacilityReports(facilityId: string): Promise<CommunityReport[]> {
  const supabase = communityClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('status_reports')
    .select('status, note, created_at')
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) return []
  return data as CommunityReport[]
}
