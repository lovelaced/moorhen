import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { day, font } from '../theme'

/**
 * The loading moorhen. PLACEHOLDER ART: a minimal vector moorhen (dark body,
 * red frontal shield, yellow beak-tip) bobbing on ripples — to be replaced by
 * the real animated moorhen SVG (idle / running / swimming) when it's ready.
 * Keep the component API: <MoorhenLoader label="…" /> so the swap is a
 * one-file change.
 */
export function MoorhenLoader({ label, size = 44 }: { label?: string; size?: number }) {
  const bob = useRef(new Animated.Value(0)).current
  const ripple = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const bobbing = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    const rippling = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    )
    bobbing.start()
    rippling.start()
    return () => {
      bobbing.stop()
      rippling.stop()
    }
  }, [bob, ripple])

  const s = size / 44 // scale factor from the base design size

  return (
    <View style={styles.row}>
      <View style={{ width: size, height: size, alignItems: 'center' }}>
        <Animated.View
          style={{
            transform: [
              { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 3 * s] }) },
              { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) },
            ],
          }}
        >
          {/* body */}
          <View
            style={{
              width: 26 * s,
              height: 18 * s,
              borderRadius: 10 * s,
              backgroundColor: '#2E3230',
            }}
          />
          {/* head */}
          <View
            style={{
              position: 'absolute',
              left: 18 * s,
              top: -7 * s,
              width: 11 * s,
              height: 11 * s,
              borderRadius: 6 * s,
              backgroundColor: '#2E3230',
            }}
          />
          {/* the red frontal shield + yellow beak tip — unmistakably a moorhen */}
          <View
            style={{
              position: 'absolute',
              left: 27 * s,
              top: -4 * s,
              width: 5 * s,
              height: 3.2 * s,
              borderRadius: 1.5 * s,
              backgroundColor: '#C94B33',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 31 * s,
              top: -3.6 * s,
              width: 2.6 * s,
              height: 2.4 * s,
              borderRadius: 1 * s,
              backgroundColor: '#E8B830',
            }}
          />
        </Animated.View>
        {/* ripples */}
        <Animated.View
          style={{
            marginTop: 6 * s,
            width: 34 * s,
            height: 2,
            borderRadius: 1,
            backgroundColor: day.water,
            opacity: ripple.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.25, 0.7] }),
            transform: [
              {
                scaleX: ripple.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.8, 1.15, 0.8],
                }),
              },
            ],
          }}
        />
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { fontFamily: font.regular, fontSize: 13, color: day.ink2, flexShrink: 1 },
})
