import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FACILITY_TYPE_ID,
  NAVIGATION_BLOCKING_TYPE_IDS,
  parseNoticesResponse,
} from '@moorhen/schema'
import { ETL_USER_AGENT, buildNoticesUrl, fetchNotices } from '../src/crt/notices.js'

const fixtureRaw = readFileSync(
  new URL('./fixtures/notices-2026-07-04.json', import.meta.url),
  'utf8',
)
const fixture = JSON.parse(fixtureRaw) as unknown

describe('buildNoticesUrl', () => {
  it('produces the exact five-parameter signature the API requires', () => {
    expect(buildNoticesUrl({ start: '2026-07-04', end: '2026-07-18' })).toBe(
      'https://canalrivertrust.org.uk/api/stoppage/notices' +
        '?consult=false&geometry=point&start=2026-07-04&end=2026-07-18' +
        '&fields=title,region,waterways,path,typeId,reasonId,programmeId,start,end,state,image',
    )
  })

  it('rejects non-ISO dates', () => {
    expect(() => buildNoticesUrl({ start: '04/07/2026', end: '2026-07-18' })).toThrow(/YYYY-MM-DD/)
    expect(() => buildNoticesUrl({ start: '2026-07-04', end: '18-07-2026' })).toThrow(/YYYY-MM-DD/)
  })
})

describe('parseNoticesResponse against the live-captured fixture', () => {
  const result = parseNoticesResponse(fixture)

  it('parses every feature without errors', () => {
    expect(result.errors).toEqual([])
    expect(result.notices).toHaveLength(296)
  })

  it('normalizes the first notice correctly', () => {
    const first = result.notices[0]!
    expect(first.id).toBe('019f233b-d0a4-737e-8d12-50098c18d212')
    expect(first.title).toBe('Princes Dock Bridge to Brunswick Dock')
    expect(first.waterways).toEqual(['Liverpool Link', 'Brunswick Doc'])
    expect(first.url).toBe(
      'https://canalrivertrust.org.uk/notices/019f233b-d0a4-737e-8d12-50098c18d212',
    )
    expect(first.type).toBe('Advice')
    expect(first.reason).toBe('Event')
    expect(first.points).toHaveLength(2)
    expect(first.points[0]).toEqual([-3.0006, 53.4114])
    expect(first.isNavigationBlocking).toBe(false)
    expect(first.isFacilityNotice).toBe(false)
  })

  it('classifies navigation-blocking and facility notices (counts from live capture)', () => {
    const blocking = result.notices.filter((n) => n.isNavigationBlocking)
    const facility = result.notices.filter((n) => n.isFacilityNotice)
    expect(blocking).toHaveLength(87) // typeIds 1:32 + 2:52 + 9:2 + 11:1
    expect(facility).toHaveLength(24)
    for (const n of blocking) expect(NAVIGATION_BLOCKING_TYPE_IDS.has(n.typeId)).toBe(true)
    for (const n of facility) expect(n.typeId).toBe(FACILITY_TYPE_ID)
  })

  it('extracts the largest photo with an absolute URL from the srcset image object', () => {
    const withImages = result.notices.filter((n) => n.image !== null)
    expect(withImages.length).toBeGreaterThan(0)
    const obstruction = withImages.find((n) => n.image!.alt === 'Photo of the obstruction.')
    expect(obstruction).toBeDefined()
    expect(obstruction!.image!.url).toMatch(/^https:\/\/canalrivertrust\.org\.uk\/media\/image\//)
    expect(obstruction!.image!.url).toContain('1900') // largest srcset candidate
  })

  it('sees the full range of states, not just Published', () => {
    const states = new Set(result.notices.map((n) => n.state))
    expect(states).toEqual(new Set(['Published', 'Completed', 'Cancelled']))
  })

  it('labels unknown typeIds instead of rejecting them (schema-drift tolerance)', () => {
    const mutated = structuredClone(fixture) as {
      features: Array<{ properties: { typeId: number } }>
    }
    mutated.features[0]!.properties.typeId = 99
    const parsed = parseNoticesResponse(mutated)
    expect(parsed.errors).toEqual([])
    expect(parsed.notices[0]!.type).toBe('Unknown type 99')
  })

  it('reports malformed features individually without dropping the batch', () => {
    const mutated = structuredClone(fixture) as { features: unknown[] }
    mutated.features[3] = { type: 'Feature', properties: { title: 'missing id and typeId' } }
    const parsed = parseNoticesResponse(mutated)
    expect(parsed.notices).toHaveLength(295)
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0]).toMatch(/feature\[3\]/)
  })

  it('rejects a non-FeatureCollection response outright', () => {
    const parsed = parseNoticesResponse({ error: 'maintenance' })
    expect(parsed.notices).toEqual([])
    expect(parsed.errors).toHaveLength(1)
  })
})

describe('fetchNotices', () => {
  it('sends the descriptive User-Agent and parses the body', async () => {
    let capturedUrl: string | undefined
    let capturedUA: string | undefined
    const stub: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedUA = new Headers(init?.headers).get('user-agent') ?? undefined
      return new Response(fixtureRaw, { status: 200 })
    }
    const result = await fetchNotices({ start: '2026-07-04', end: '2026-07-18' }, stub)
    expect(result.notices).toHaveLength(296)
    expect(capturedUrl).toContain('consult=false')
    expect(capturedUA).toBe(ETL_USER_AGENT)
  })

  it('throws on HTTP errors so callers keep their last-good cache', async () => {
    const stub: typeof fetch = async () => new Response('server error', { status: 500 })
    await expect(fetchNotices({ start: '2026-07-04', end: '2026-07-18' }, stub)).rejects.toThrow(
      /HTTP 500/,
    )
  })
})
