// Fetches OpenFreeMap's Liberty style and strips the basemap's own POI
// sprites. Moorhen draws its own POI badges — bigger, tappable, walk-distance
// filtered — and the style's sepia droplets and shop glyphs read as broken
// half-size duplicates next to them. Bundling the result also spares a style
// fetch over boat 4G at every boot.
//
// Rerun when OpenFreeMap changes something worth picking up:
//     node scripts/make-basemap-style.mjs
import { writeFileSync } from 'node:fs'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const OUT = new URL('../apps/mobile/src/assets/styles/liberty-moorhen.json', import.meta.url)

const style = await (await fetch(STYLE_URL)).json()
const dropped = style.layers.filter((layer) => layer['source-layer'] === 'poi')
style.layers = style.layers.filter((layer) => layer['source-layer'] !== 'poi')
writeFileSync(OUT, JSON.stringify(style))
console.log(`stripped: ${dropped.map((layer) => layer.id).join(', ') || 'nothing'}`)
console.log(`${style.layers.length} layers kept -> ${OUT.pathname}`)
