#!/usr/bin/env node
/**
 * Compares consecutive nightly manifests. A count moving more than ±20%
 * usually means an upstream source broke or migrated (CRT layers vanishing,
 * OSM filter regression) — fail loudly instead of publishing a gutted build.
 * Notices are exempt (they legitimately swing with the winter programme).
 */
import { readFileSync } from 'node:fs'

const [previousPath, currentPath] = process.argv.slice(2)
if (!previousPath || !currentPath) {
  console.error('usage: check-drift.mjs <previous-manifest.json> <current-manifest.json>')
  process.exit(2)
}

const TRACKED = ['edges', 'vertices', 'locks', 'osmPois', 'crtFacilities']
const TOLERANCE = 0.2

const previous = JSON.parse(readFileSync(previousPath, 'utf8'))
const current = JSON.parse(readFileSync(currentPath, 'utf8'))

const problems = []
for (const key of TRACKED) {
  const before = previous[key]
  const after = current[key]
  if (typeof before !== 'number' || typeof after !== 'number') continue
  if (before === 0) continue
  const change = Math.abs(after - before) / before
  const line = `${key}: ${before} → ${after} (${(change * 100).toFixed(1)}%)`
  if (change > TOLERANCE) problems.push(line)
  else console.log(`ok  ${line}`)
}

if (problems.length > 0) {
  console.error('Drift check FAILED:\n' + problems.map((p) => `  ✗ ${p}`).join('\n'))
  process.exit(1)
}
console.log('Drift check passed.')
