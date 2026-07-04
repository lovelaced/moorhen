/**
 * Minimal OPL (Object Per Line) parser — the line-based OSM format osmium
 * emits with `osmium cat -f opl`. We parse only what the waterway pipeline
 * needs: nodes (id, lon/lat, tags) and ways (id, node refs, tags).
 *
 * OPL escapes special characters (space, comma, =, %, unicode…) as `%HEX%`
 * where HEX is the Unicode code point, e.g. `Grand%20%Union%20%Canal`.
 */

export interface OplNode {
  id: number
  lon: number
  lat: number
  tags: Record<string, string>
}

export interface OplWay {
  id: number
  nodeRefs: number[]
  tags: Record<string, string>
}

export interface OplData {
  nodes: Map<number, OplNode>
  ways: OplWay[]
}

const ESCAPE_RE = /%([0-9a-fA-F]+)%/g

export function decodeOplString(value: string): string {
  return value.replace(ESCAPE_RE, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
}

function parseTags(field: string): Record<string, string> {
  const tags: Record<string, string> = {}
  if (field.length === 0) return tags
  for (const pair of field.split(',')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    tags[decodeOplString(pair.slice(0, eq))] = decodeOplString(pair.slice(eq + 1))
  }
  return tags
}

export function parseOpl(text: string): OplData {
  const nodes = new Map<number, OplNode>()
  const ways: OplWay[] = []

  for (const line of text.split('\n')) {
    if (line.length === 0) continue
    const kind = line[0]
    if (kind !== 'n' && kind !== 'w') continue

    let id = 0
    let lon = Number.NaN
    let lat = Number.NaN
    let tags: Record<string, string> = {}
    let nodeRefs: number[] = []

    for (const field of line.split(' ')) {
      const marker = field[0]
      const rest = field.slice(1)
      switch (marker) {
        case 'n':
        case 'w':
          if (field === line.split(' ')[0]) id = Number(rest)
          break
        case 'x':
          lon = Number(rest)
          break
        case 'y':
          lat = Number(rest)
          break
        case 'T':
          tags = parseTags(rest)
          break
        case 'N':
          nodeRefs = rest.length > 0 ? rest.split(',').map((r) => Number(r.slice(1))) : []
          break
        default:
          break
      }
    }

    if (kind === 'n') {
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        nodes.set(id, { id, lon, lat, tags })
      }
    } else {
      ways.push({ id, nodeRefs, tags })
    }
  }

  return { nodes, ways }
}
