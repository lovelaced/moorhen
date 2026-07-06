import { Image, Pressable, StyleSheet, View } from 'react-native'

/**
 * Google-style photo pin: the photo full-bleed in a white circle, soft
 * shadow, short rounded tail on the spot. A real React view (rendered via a
 * map Marker), so any rectangular camera photo is clipped perfectly round —
 * no image compositing, no pixel seams.
 */
export function PhotoPin({ uri, onPress }: { uri: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={styles.tail} />
      <View style={styles.circle}>
        <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { width: 68, height: 78, alignItems: 'center' },
  circle: {
    position: 'absolute',
    top: 0,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2b2620',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  photo: { width: 56, height: 56, borderRadius: 28 },
  // short rounded wedge, like the reference — a rotated rounded square
  tail: {
    position: 'absolute',
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
    elevation: 4,
    shadowColor: '#2b2620',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
})
