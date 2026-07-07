import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg'
import { day, font } from '../theme'

/**
 * The loading moorhen, mid-sprint. Ported from the hand-rigged SVG mascot
 * (mh-run mode): one 600 ms master value drives the thigh→shin→foot chains,
 * with the far leg half a stride out of phase; the body carries the sprint
 * crouch while the head pumps twice per stride. Toe articulation from the
 * source rig is omitted — sub-pixel at loader sizes.
 */

const AnimatedG = Animated.createAnimatedComponent(G)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * Rotate children about a fixed pivot. react-native-svg ignores `origin`
 * once `rotation` is animated (it recomputes the matrix from the changed
 * prop alone), so sandwich the spin between static translate groups.
 */
function Spin({
  pivot,
  rotation,
  children,
}: {
  pivot: readonly [number, number]
  rotation: Animated.AnimatedInterpolation<number>
  children: ReactNode
}) {
  return (
    <G x={pivot[0]} y={pivot[1]}>
      <AnimatedG rotation={rotation}>
        <G x={-pivot[0]} y={-pivot[1]}>
          {children}
        </G>
      </AnimatedG>
    </G>
  )
}

/** CSS keyframes → interpolation. `shift` plays the cycle offset (fraction). */
function keyframes(
  value: Animated.Value,
  keys: ReadonlyArray<readonly [number, number]>,
  shift = 0,
): Animated.AnimatedInterpolation<number> {
  const at = (p: number): number => {
    for (let i = 1; i < keys.length; i++) {
      const [p0, v0] = keys[i - 1]!
      const [p1, v1] = keys[i]!
      if (p <= p1) return p1 === p0 ? v1 : v0 + ((p - p0) / (p1 - p0)) * (v1 - v0)
    }
    return keys[keys.length - 1]![1]
  }
  const stops = new Set<number>([0, 1])
  for (const [p] of keys) stops.add(Number(((p - shift + 1) % 1).toFixed(6)))
  const inputRange = [...stops].sort((a, b) => a - b)
  return value.interpolate({
    inputRange,
    outputRange: inputRange.map((x) => at((x + shift) % 1)),
  })
}

// sprint cycle: contact 0, stance 12, toe-off 22, full extension 38, bird-fold 58, forward reach 80
const THIGH = [
  [0, -30],
  [0.16, 2],
  [0.28, 40],
  [0.44, 70],
  [0.58, 6],
  [0.8, -52],
  [1, -30],
] as const
const SHIN = [
  [0, 4],
  [0.16, 4],
  [0.28, 8],
  [0.44, 12],
  [0.58, -64],
  [0.8, -4],
  [1, 4],
] as const
const FOOT = [
  [0, 36],
  [0.08, 10],
  [0.16, -5],
  [0.24, -14],
  [0.32, 26],
  [0.44, 58],
  [0.58, 195],
  [0.8, 60],
  [1, 36],
] as const
const BOUNCE = [
  [0, -3],
  [0.08, -6],
  [0.26, -8],
  [0.44, -15],
  [0.5, -3],
  [0.58, -6],
  [0.76, -8],
  [0.94, -15],
  [1, -3],
] as const
// head pump and tail run at half the stride period — two beats per cycle
const PUMP_X = [
  [0, 10],
  [0.225, 15],
  [0.5, 10],
  [0.725, 15],
  [1, 10],
] as const
const PUMP_Y = [
  [0, 6],
  [0.225, 9],
  [0.5, 6],
  [0.725, 9],
  [1, 6],
] as const
const PUMP_ROT = [
  [0, 12],
  [0.225, 17],
  [0.5, 12],
  [0.725, 17],
  [1, 12],
] as const
const TAIL = [
  [0, -16],
  [0.225, -22],
  [0.5, -16],
  [0.725, -22],
  [1, -16],
] as const
// double-blink now and then, on its own slow clock
const BLINK = [
  [0, 0],
  [0.34, 0],
  [0.355, 1],
  [0.37, 1],
  [0.385, 0],
  [0.63, 0],
  [0.645, 1],
  [0.658, 1],
  [0.668, 0],
  [0.678, 1],
  [0.69, 1],
  [0.705, 0],
  [1, 0],
] as const

const BODY =
  'M336 226 C352 246 352 276 334 294 C326 302 316 308 304 312 C300 322 290 323 286 316 C280 324 268 324 264 317 C258 324 246 323 242 316 C236 322 224 320 220 312 C214 318 204 314 200 305 C194 312 186 305 184 294 C166 278 156 244 168 220 C182 196 214 182 250 182 C286 182 320 200 336 226 Z'
const WING =
  'M320 206 C332 226 330 250 310 268 C268 292 216 288 178 262 C166 254 154 240 148 232 L160 226 L146 218 C186 206 230 188 274 190 C296 191 308 197 320 206 Z'
const BEAK = 'M372 144 C390 144 404 151 408 158 C404 166 390 172 372 172 C374 162 374 153 372 144 Z'

/** One leg: thigh→shin→foot chain. Near leg is brighter; far leg sits behind. */
function Leg({
  t,
  shift,
  hip,
  knee,
  ankle,
  toes,
  leg,
  claw,
  band,
  thighW,
  shinW,
}: {
  t: Animated.Value
  shift: number
  hip: readonly [number, number]
  knee: readonly [number, number]
  ankle: readonly [number, number]
  toes: ReadonlyArray<readonly [string, number, string, number]>
  leg: string
  claw: string
  band: string
  thighW: number
  shinW: number
}) {
  return (
    <Spin pivot={hip} rotation={keyframes(t, THIGH, shift)}>
      <Path
        d={`M${hip[0]} ${hip[1]} L${knee[0]} ${knee[1]}`}
        stroke={leg}
        strokeWidth={thighW}
        strokeLinecap="round"
        fill="none"
      />
      <Rect x={knee[0] - 1} y={hip[1] + 20} width={thighW + 3} height={10} rx={5} fill={band} />
      <Spin pivot={knee} rotation={keyframes(t, SHIN, shift)}>
        <Circle cx={knee[0]} cy={knee[1]} r={thighW / 2} fill={leg} />
        <Path
          d={`M${knee[0]} ${knee[1]} L${ankle[0]} ${ankle[1]}`}
          stroke={leg}
          strokeWidth={shinW}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={ankle[0]} cy={ankle[1]} r={shinW / 2} fill={leg} />
        <Spin pivot={ankle} rotation={keyframes(t, FOOT, shift)}>
          {toes.map(([d, w, clawD, clawW], i) => (
            <G key={i}>
              <Path d={d} stroke={leg} strokeWidth={w} strokeLinecap="round" fill="none" />
              <Path d={clawD} stroke={claw} strokeWidth={clawW} strokeLinecap="round" fill="none" />
            </G>
          ))}
        </Spin>
      </Spin>
    </Spin>
  )
}

export function MoorhenLoader({ label, size = 44 }: { label?: string; size?: number }) {
  const t = useRef(new Animated.Value(0)).current
  const blink = useRef(new Animated.Value(0)).current
  const [animate, setAnimate] = useState(true)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => setAnimate(!reduced))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!animate) return
    const stride = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 600,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    const blinking = Animated.loop(
      Animated.timing(blink, {
        toValue: 1,
        duration: 7500,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    stride.start()
    blinking.start()
    return () => {
      stride.stop()
      blinking.stop()
    }
  }, [animate, t, blink])

  return (
    <View style={styles.row}>
      {/* the full stride envelope: the backward kick streams to x≈7 and the
          head-pump pushes the beak past x≈450, so the box is much wider than
          the resting pose */}
      <Svg width={(size * 464) / 348} height={size} viewBox="0 138 464 348">
        <Defs>
          <ClipPath id="mh-body-clip">
            <Path d={BODY} />
          </ClipPath>
          <ClipPath id="mh-tophalf">
            <Rect x={0} y={0} width={512} height={262} />
          </ClipPath>
          <ClipPath id="mh-headtop">
            <Rect x={0} y={0} width={512} height={158} />
          </ClipPath>
          <ClipPath id="mh-head-clip">
            <Circle cx={344} cy={158} r={31} />
          </ClipPath>
          <ClipPath id="mh-wing-clip">
            <Path d={WING} />
          </ClipPath>
          <ClipPath id="mh-beak-clip">
            <Path d={BEAK} />
          </ClipPath>
        </Defs>

        <Ellipse cx={256} cy={454} rx={132} ry={19} fill="#1A1D22" opacity={0.1} />

        <AnimatedG y={keyframes(t, BOUNCE)}>
          <Leg
            t={t}
            shift={0.5}
            hip={[254, 294]}
            knee={[242, 346]}
            ankle={[256, 424]}
            leg="#8CA53F"
            claw="#5E6E2C"
            band="#C93A2E"
            thighW={14}
            shinW={11}
            toes={[
              ['M256 424 L318 438 L342 443', 8, 'M342 443 L352 445', 3],
              ['M256 424 L300 446 L322 455', 8, 'M322 455 L331 459', 3],
              ['M256 424 L282 450 L294 466', 8, 'M294 466 L299 475', 3],
              ['M256 424 L230 440 L214 446', 7.5, 'M214 446 L205 449', 2.8],
            ]}
          />
          <Leg
            t={t}
            shift={0}
            hip={[224, 296]}
            knee={[210, 348]}
            ankle={[224, 426]}
            leg="#A9C44F"
            claw="#6E7F33"
            band="#E8503C"
            thighW={15}
            shinW={12}
            toes={[
              ['M224 426 L286 440 L312 445', 8.5, 'M312 445 L323 447', 3.2],
              ['M224 426 L268 448 L290 458', 8.5, 'M290 458 L299 462', 3.2],
              ['M224 426 L250 452 L262 470', 8.5, 'M262 470 L267 480', 3.2],
              ['M224 426 L198 442 L182 448', 8, 'M182 448 L173 451', 3],
            ]}
          />

          {/* the sprint crouch: leaned in, squashed a touch */}
          <G transform="translate(256 250) translate(2 7) rotate(4) scale(1.07 0.93) translate(-256 -250)">
            <Spin pivot={[200, 226]} rotation={keyframes(t, TAIL)}>
              <Path
                d="M192 240 C172 227 154 210 142 192 C138 185 145 180 151 185 C167 200 183 218 197 234 Z"
                fill="#FFFFFF"
              />
              <Path
                d="M194 248 C172 236 152 220 140 202 C136 195 143 189 149 194 C166 209 182 228 200 242 Z"
                fill="#252A32"
              />
              <Path
                d="M196 232 C172 214 150 190 138 162 C134 152 144 145 152 152 C172 172 192 200 206 224 Z"
                fill="#2A2F38"
              />
              <Path
                d="M206 230 C188 214 170 194 160 172 C157 164 165 159 171 165 C186 184 200 208 214 226 Z"
                fill="#31363F"
              />
            </Spin>

            <G>
              <Path d={BODY} fill="#2B303A" />
              <Path d={BODY} y={-6} fill="#363B45" clipPath="url(#mh-body-clip)" />
              <Ellipse
                cx={250}
                cy={290}
                rx={78}
                ry={24}
                fill="#414957"
                clipPath="url(#mh-body-clip)"
              />
              <Ellipse
                cx={248}
                cy={308}
                rx={66}
                ry={14}
                fill="#262B34"
                opacity={0.45}
                clipPath="url(#mh-body-clip)"
              />
              <G clipPath="url(#mh-body-clip)">
                <Path
                  d={BODY}
                  fill="none"
                  stroke="#464D5B"
                  strokeWidth={9}
                  opacity={0.55}
                  clipPath="url(#mh-tophalf)"
                />
              </G>
              <G>
                <Path d={WING} fill="#35342E" />
                <Path d={WING} y={-5} fill="#43423A" clipPath="url(#mh-wing-clip)" />
                <G clipPath="url(#mh-wing-clip)">
                  <Path
                    d={WING}
                    fill="none"
                    stroke="#565448"
                    strokeWidth={7}
                    opacity={0.5}
                    clipPath="url(#mh-tophalf)"
                  />
                </G>
                <Path
                  d="M230 268 C258 274 288 268 306 252 M206 258 C232 266 262 262 282 250"
                  stroke="#2C2B26"
                  strokeWidth={3}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.55}
                />
                <Path
                  d="M158 236 C178 254 204 266 232 272 M152 224 C170 236 190 246 210 252"
                  stroke="#FFFFFF"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.8}
                />
              </G>
              <Path
                d="M214 272 L232 284 M240 278 L258 288 M266 280 L284 288 M292 276 L308 282"
                stroke="#FFFFFF"
                strokeWidth={6.5}
                strokeLinecap="round"
                fill="none"
                opacity={0.95}
              />
            </G>

            <G>
              <Path
                d="M 270.0 183.8 C 292 188 303 174 315 168.5 C 328 163 343 162.5 351 167 C 359 171.5 363 181 363 192 C 363 206 356 219 351 228 C 348.2 236 343.1 239.7 345.7 245.0 C 330 240 300 212 270.0 183.8 Z"
                fill="#363B45"
              />
              <Path
                d="M 286 184 C 298 186 306 178 316 171"
                stroke="#464D5B"
                strokeWidth={5}
                strokeLinecap="round"
                fill="none"
                opacity={0.5}
              />
            </G>

            <AnimatedG x={keyframes(t, PUMP_X)} y={keyframes(t, PUMP_Y)}>
              <Spin pivot={[330, 190]} rotation={keyframes(t, PUMP_ROT)}>
                <Path
                  d="M 319.6 139 C 314 146 309.5 160 306 176 C 314 178 323 173.5 331 167 C 339 160.5 342 152 342 146 C 335 140 326 138 319.6 139 Z"
                  fill="#363B45"
                />
                <Circle cx={307} cy={174} r={6} fill="#363B45" />
                <Path
                  d="M 317.5 143 C 313 151 310 160 307.5 169"
                  stroke="#464D5B"
                  strokeWidth={4}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.5}
                />
                <Path
                  d="M346 170 C336 182 326 192 316 202"
                  stroke="#363B45"
                  strokeWidth={30}
                  strokeLinecap="round"
                  fill="none"
                />
                <Ellipse cx={342} cy={177} rx={25} ry={20} fill="#363B45" />
                <Circle cx={344} cy={158} r={31} fill="#2B303A" />
                <Circle cx={344} cy={154} r={31} fill="#363B45" clipPath="url(#mh-head-clip)" />
                <G clipPath="url(#mh-head-clip)">
                  <Circle
                    cx={344}
                    cy={158}
                    r={31}
                    fill="none"
                    stroke="#464D5B"
                    strokeWidth={6}
                    opacity={0.5}
                    clipPath="url(#mh-headtop)"
                  />
                </G>
                {/* the red frontal shield + yellow beak tip — unmistakably a moorhen */}
                <Path
                  d="M374 164 C375 148 370 136 358 128 C352 124 345 127 347 133 C351 144 353 154 354 164 Z"
                  fill="#E8503C"
                />
                <G>
                  <Path d={BEAK} fill="#E8503C" />
                  <Rect
                    x={395}
                    y={138}
                    width={18}
                    height={40}
                    fill="#FFC93C"
                    clipPath="url(#mh-beak-clip)"
                  />
                  <Path
                    d="M374 159 Q390 163 405 158"
                    stroke="#C23A28"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    fill="none"
                    clipPath="url(#mh-beak-clip)"
                  />
                  <Circle cx={382} cy={152} r={1.6} fill="#1A1D22" opacity={0.4} />
                </G>
                <G>
                  <Circle cx={341} cy={152} r={7} fill="#A83B30" />
                  <Circle cx={341.5} cy={152} r={3.2} fill="#1E2126" />
                  <Circle cx={339} cy={149.5} r={1.6} fill="#FFFFFF" opacity={0.9} />
                </G>
                <AnimatedCircle
                  cx={341}
                  cy={152}
                  r={8.5}
                  fill="#363B45"
                  opacity={keyframes(blink, BLINK)}
                />
              </Spin>
            </AnimatedG>
          </G>
        </AnimatedG>
      </Svg>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { fontFamily: font.regular, fontSize: 13, color: day.ink2, flexShrink: 1 },
})
