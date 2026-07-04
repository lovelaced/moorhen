#!/usr/bin/env node
/**
 * Licence-registry CI gate.
 *
 * Every ETL/worker module that touches an external data source must declare
 *   export const SOURCE_ID = '<registry id>'
 * This script fails the build if:
 *   - a declared SOURCE_ID is missing from data/registry/sources.json
 *   - a declared SOURCE_ID has ingestion !== 'allowed'
 *   - the registry itself is malformed
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const REGISTRY_PATH = join(ROOT, 'data/registry/sources.json')
const SCAN_DIRS = ['packages', 'workers', 'apps'].map((d) => join(ROOT, d))
const SOURCE_ID_RE = /SOURCE_ID\s*=\s*['"]([^'"]+)['"]/g

function walk(dir, files = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) files.push(full)
  }
  return files
}

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
const sources = new Map(registry.sources.map((s) => [s.id, s]))
const problems = []

for (const [id, s] of sources) {
  if (!['allowed', 'pending', 'prohibited'].includes(s.ingestion)) {
    problems.push(`registry entry '${id}' has invalid ingestion status '${s.ingestion}'`)
  }
}

const declared = new Map() // id -> [files]
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(SOURCE_ID_RE)) {
      const id = match[1]
      if (!declared.has(id)) declared.set(id, [])
      declared.get(id).push(relative(ROOT, file))
    }
  }
}

for (const [id, files] of declared) {
  const entry = sources.get(id)
  if (!entry) {
    problems.push(`SOURCE_ID '${id}' (${files.join(', ')}) is not in data/registry/sources.json`)
  } else if (entry.ingestion !== 'allowed') {
    problems.push(
      `SOURCE_ID '${id}' (${files.join(', ')}) has ingestion='${entry.ingestion}' — code must not ingest it`,
    )
  }
}

if (problems.length > 0) {
  console.error('Licence registry check FAILED:\n' + problems.map((p) => `  ✗ ${p}`).join('\n'))
  process.exit(1)
}

console.log(
  `Licence registry check passed: ${declared.size} source(s) declared in code, ${sources.size} registered.`,
)
for (const [id, files] of declared) console.log(`  ✓ ${id} ← ${files.join(', ')}`)
