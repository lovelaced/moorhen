/**
 * Waterway classification: navigable type + lock gauge (wide vs narrow).
 *
 * Gauge matters constantly to boaters — a 12' 6" widebeam cannot enter a 7'
 * narrow lock, wide locks take longer single-handed, and route warnings
 * depend on it. OSM rarely tags lock widths, so classification starts from a
 * curated per-waterway table of public-knowledge facts, refined by per-lock
 * OSM tags (`maxwidth`) where present.
 *
 * KNOWN LIMITATION: some canals change gauge mid-route (Trent & Mersey is
 * wide from Derwent Mouth to Burton and through Cheshire's Big Lock, narrow
 * between). The table carries the gauge of the *majority* of each canal's
 * locks; per-section overrides land with community data. Entries are matched
 * against the OSM `name` tag.
 */

export type LockGauge = 'narrow' | 'broad'

export type NavigableClass =
  'narrow-canal' | 'broad-canal' | 'commercial-waterway' | 'river' | 'tidal-river'

/** Majority lock gauge per waterway, keyed by OSM name. Public-knowledge facts. */
export const WATERWAY_GAUGES: Readonly<Record<string, LockGauge>> = {
  // Wide/broad
  'Grand Union Canal': 'broad',
  'Grand Union Canal (Paddington Arm)': 'broad',
  'Regent’s Canal': 'broad',
  "Regent's Canal": 'broad',
  'Hertford Union Canal': 'broad',
  'Kennet and Avon Canal': 'broad',
  'Kennet & Avon Canal': 'broad',
  'Leeds and Liverpool Canal': 'broad',
  'Leeds & Liverpool Canal': 'broad',
  'Rochdale Canal': 'broad',
  'Calder and Hebble Navigation': 'broad',
  'Calder & Hebble Navigation': 'broad',
  'Huddersfield Broad Canal': 'broad',
  'Aire and Calder Navigation': 'broad',
  'Aire & Calder Navigation': 'broad',
  'Sheffield and South Yorkshire Navigation': 'broad',
  'Bridgewater Canal': 'broad',
  'Gloucester and Sharpness Canal': 'broad',
  'Gloucester & Sharpness Canal': 'broad',
  'Grand Western Canal': 'broad',
  'Lancaster Canal': 'broad',
  'Ripon Canal': 'broad',
  'Selby Canal': 'broad',
  'Stainforth and Keadby Canal': 'broad',
  'New Junction Canal': 'broad',
  'Lee Navigation': 'broad',
  'River Lee Navigation': 'broad',
  'River Stort Navigation': 'broad',
  'Monmouthshire and Brecon Canal': 'broad',
  'Forth and Clyde Canal': 'broad',
  'Union Canal': 'broad',
  'Caledonian Canal': 'broad',
  'Crinan Canal': 'broad',
  'Exeter Ship Canal': 'broad',
  'Manchester Ship Canal': 'broad',
  'Weaver Navigation': 'broad',
  'River Weaver': 'broad',

  // Narrow
  'Oxford Canal': 'narrow',
  'Grand Union Canal (Leicester Line)': 'narrow', // Watford & Foxton flights
  'Coventry Canal': 'narrow',
  'Ashby Canal': 'narrow',
  'Trent and Mersey Canal': 'narrow', // majority; wide east of Burton and at the Cheshire end
  'Trent & Mersey Canal': 'narrow',
  'Staffordshire and Worcestershire Canal': 'narrow',
  'Staffordshire & Worcestershire Canal': 'narrow',
  'Shropshire Union Canal': 'narrow',
  'Llangollen Canal': 'narrow',
  'Montgomery Canal': 'narrow',
  'Macclesfield Canal': 'narrow',
  'Peak Forest Canal': 'narrow',
  'Ashton Canal': 'narrow',
  'Caldon Canal': 'narrow',
  'Birmingham Canal Navigations': 'narrow',
  'BCN Main Line': 'narrow',
  'Worcester and Birmingham Canal': 'narrow',
  'Worcester & Birmingham Canal': 'narrow',
  'Stratford-upon-Avon Canal': 'narrow',
  'Grand Union Canal (Aylesbury Arm)': 'narrow',
  'Grand Union Canal (Northampton Arm)': 'narrow',
  'Erewash Canal': 'broad', // 14ft locks despite narrow reputation
  'Chesterfield Canal': 'narrow', // narrow above Retford, wide below
  'Huddersfield Narrow Canal': 'narrow',
  'Droitwich Junction Canal': 'narrow',
  'Droitwich Barge Canal': 'broad',
  'Wey and Arun Canal': 'broad',
}

/** Default gauge when a canal isn't in the table: most UK canals are narrow. */
export const DEFAULT_CANAL_GAUGE: LockGauge = 'narrow'

export interface Classification {
  navigableClass: NavigableClass
  lockGauge: LockGauge
}

export function classifyWaterway(tags: Record<string, string>): Classification {
  const name = tags['name'] ?? ''
  const waterway = tags['waterway'] ?? ''

  if (waterway === 'river') {
    // River locks are broad with vanishingly few exceptions.
    return { navigableClass: tags['tidal'] === 'yes' ? 'tidal-river' : 'river', lockGauge: 'broad' }
  }

  const gauge = WATERWAY_GAUGES[name] ?? DEFAULT_CANAL_GAUGE
  return {
    navigableClass: gauge === 'broad' ? 'broad-canal' : 'narrow-canal',
    lockGauge: gauge,
  }
}

/** Per-lock refinement: an explicit maxwidth under ~2.5 m means narrow. */
export function lockGaugeFromTags(tags: Record<string, string>, fallback: LockGauge): LockGauge {
  const raw = tags['maxwidth'] ?? tags['lock:width'] ?? tags['width']
  if (raw) {
    const metres = Number.parseFloat(raw)
    if (Number.isFinite(metres)) return metres < 2.5 ? 'narrow' : 'broad'
  }
  return fallback
}

/**
 * Inland rivers with navigations (public-knowledge facts, keyed by OSM name).
 * Rivers not listed here and without boat=yes tags are excluded from the
 * graph and the offline-map corridor — GB has tens of thousands of km of
 * unnavigable rivers and brooks tagged waterway=river.
 */
export const NAVIGABLE_RIVERS: ReadonlySet<string> = new Set([
  'River Thames',
  'River Trent',
  'River Severn',
  'River Nene',
  'River Great Ouse',
  'River Cam',
  'River Soar',
  'River Avon', // Warwickshire and Bristol Avons — both navigable
  'River Weaver',
  'Weaver Navigation',
  'River Ouse',
  'River Aire',
  'River Calder',
  'River Don',
  'River Medway',
  'River Wey',
  'Wey Navigation',
  'River Lee',
  'River Lea',
  'Lee Navigation',
  'River Lee Navigation',
  'River Stort',
  'River Ancholme',
  'River Witham',
  'River Welland',
  'River Glen',
  'River Hull',
  'River Derwent',
  'River Ure',
  'River Foss',
  'River Idle',
  'River Yare',
  'River Bure',
  'River Waveney',
  'River Ant',
  'River Thurne',
  'River Chet',
  'River Wensum',
  'River Chelmer',
  'Chelmer & Blackwater Navigation',
  'River Frome',
  'River Fossdyke',
  'Fossdyke Navigation',
  'River Tees',
  'River Wharfe',
])
