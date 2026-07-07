import Feather from '@expo/vector-icons/Feather'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { day, font } from '../../theme'

type FeatherName = keyof typeof Feather.glyphMap

function tabIcon(name: FeatherName) {
  return ({ color }: { color: ColorValue }) => <Feather name={name} size={22} color={color} />
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: day.accent,
        tabBarInactiveTintColor: day.tabInactive,
        tabBarStyle: {
          backgroundColor: day.surface,
          borderTopColor: day.border,
          height: 80,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 10 },
        sceneStyle: { backgroundColor: day.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: tabIcon('share-2') }} />
      <Tabs.Screen name="cruise" options={{ title: 'Cruise', tabBarIcon: tabIcon('navigation') }} />
      <Tabs.Screen name="log" options={{ title: 'Log', tabBarIcon: tabIcon('book-open') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('menu') }} />
    </Tabs>
  )
}
