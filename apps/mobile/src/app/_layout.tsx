import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from '@expo-google-fonts/outfit'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import '../lib/cruise-task'
import { loadPlacesIndex } from '../lib/places-index'
import { day } from '../theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  // pre-warm the search index so first search is instant (persisted after
  // first build, so this is a local file read on every later launch)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadPlacesIndex().catch(() => {})
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: day.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="downloads" options={{ headerShown: true }} />
      </Stack>
    </>
  )
}
