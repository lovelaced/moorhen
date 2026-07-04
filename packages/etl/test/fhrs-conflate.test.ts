import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEstablishmentsResponse } from '@moorhen/schema'
import { conflatePoints } from '../src/conflate.js'
import { buildEstablishmentsUrl, fetchEstablishmentsNear } from '../src/fsa/fhrs.js'

const fixtureRaw = readFileSync(new URL('./fixtures/fhrs-braunston.json', import.meta.url), 'utf8')
const fixture = JSON.parse(fixtureRaw) as unknown

describe('FHRS parsing against the live-captured Braunston fixture', () => {
  const result = parseEstablishmentsResponse(fixture)

  it('parses all establishments without errors', () => {
    expect(result.errors).toEqual([])
    expect(result.establishments).toHaveLength(5)
  })

  it('parses string geocodes into numeric points and ratings into scores', () => {
    const aloysius = result.establishments.find((e) => e.id === 1728062)!
    expect(aloysius.name).toBe('Arts Aboard Aloysius')
    expect(aloysius.businessType).toBe('Mobile caterer')
    expect(aloysius.rating.score).toBe(5)
    expect(aloysius.point).not.toBeNull()
    expect(aloysius.point![0]).toBeCloseTo(-1.2110593, 5)
    expect(aloysius.point![1]).toBeCloseTo(52.2878009, 5)
  })

  it('keeps non-numeric scheme values (Scotland FHIS, exempt) as null scores', () => {
    const parsed = parseEstablishmentsResponse({
      establishments: [
        { FHRSID: 1, BusinessName: 'Scottish Chippy', RatingValue: 'Pass', geocode: null },
      ],
    })
    expect(parsed.establishments[0]!.rating.score).toBeNull()
    expect(parsed.establishments[0]!.rating.value).toBe('Pass')
    expect(parsed.establishments[0]!.point).toBeNull()
  })
})

describe('fetchEstablishmentsNear', () => {
  it('builds the query URL', () => {
    expect(
      buildEstablishmentsUrl({ latitude: 52.288, longitude: -1.209, maxDistanceMiles: 2 }),
    ).toBe(
      'https://api.ratings.food.gov.uk/Establishments?latitude=52.288&longitude=-1.209&maxDistanceLimit=2&pageSize=200',
    )
  })

  it('sends the required x-api-version header', async () => {
    let version: string | null = null
    const stub: typeof fetch = async (_input, init) => {
      version = new Headers(init?.headers).get('x-api-version')
      return new Response(fixtureRaw, { status: 200 })
    }
    const result = await fetchEstablishmentsNear(
      { latitude: 52.288, longitude: -1.209, maxDistanceMiles: 2 },
      stub,
    )
    expect(version).toBe('2')
    expect(result.establishments).toHaveLength(5)
  })
})

describe('conflatePoints', () => {
  // Synthetic: a CRT water point and its OSM twin ~22 m apart, plus strays.
  const crt = [
    { id: 'crt-1', point: [-1.209, 52.288] as [number, number] },
    { id: 'crt-2', point: [-1.25, 52.3] as [number, number] },
  ]
  const osm = [
    { id: 'osm-a', point: [-1.209, 52.2882] as [number, number] }, // ~22 m north of crt-1
    { id: 'osm-b', point: [-1.4, 52.4] as [number, number] }, // far away
  ]

  it('matches nearby pairs and keeps the rest unmatched', () => {
    const result = conflatePoints(crt, osm, { maxDistanceM: 75 })
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0]!.primary.id).toBe('crt-1')
    expect(result.matched[0]!.secondary.id).toBe('osm-a')
    expect(result.matched[0]!.distanceM).toBeGreaterThan(15)
    expect(result.matched[0]!.distanceM).toBeLessThan(30)
    expect(result.unmatchedPrimary.map((p) => p.id)).toEqual(['crt-2'])
    expect(result.unmatchedSecondary.map((s) => s.id)).toEqual(['osm-b'])
  })

  it('never double-assigns a record (greedy nearest first)', () => {
    const twoCrt = [
      { id: 'c1', point: [-1.209, 52.288] as [number, number] },
      { id: 'c2', point: [-1.209, 52.2881] as [number, number] },
    ]
    const oneOsm = [{ id: 'o1', point: [-1.209, 52.28805] as [number, number] }]
    const result = conflatePoints(twoCrt, oneOsm, { maxDistanceM: 75 })
    expect(result.matched).toHaveLength(1)
    expect(result.unmatchedPrimary).toHaveLength(1)
  })

  it('respects the compatibility predicate', () => {
    const result = conflatePoints(crt, osm, {
      maxDistanceM: 75,
      compatible: () => false,
    })
    expect(result.matched).toHaveLength(0)
  })
})
