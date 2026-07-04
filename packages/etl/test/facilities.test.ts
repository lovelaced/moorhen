import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFacilitiesPage } from '@moorhen/schema'
import { buildFacilityPageUrl, fetchAllFacilities } from '../src/crt/facilities.js'

const fixtureRaw = readFileSync(
  new URL('./fixtures/crt-facilities-page.json', import.meta.url),
  'utf8',
)
const fixture = JSON.parse(fixtureRaw) as { features: unknown[] }

describe('parseFacilitiesPage against the live-captured fixture', () => {
  const page = parseFacilitiesPage(fixture)

  it('parses all features without errors and sees the paging flag', () => {
    expect(page.errors).toEqual([])
    expect(page.facilities).toHaveLength(4)
    expect(page.exceededTransferLimit).toBe(true)
  })

  it('normalizes Yes/No flags into typed services', () => {
    const leeds = page.facilities.find((f) => f.id === 'AL-002-027')!
    expect(leeds.name).toBe('Leeds Sanitary Station')
    expect(leeds.services.toilet).toBe(true)
    expect(leeds.services.shower).toBe(true)
    expect(leeds.services.elsan).toBe(true)
    expect(leeds.services.water).toBe(false)
    expect(leeds.services.refuse).toBe(false)
    expect(leeds.point[0]).toBeCloseTo(-1.529, 3)
  })

  it('skips features without geometry instead of failing', () => {
    const mutated = structuredClone(fixture)
    ;(mutated.features[0] as { geometry: unknown }).geometry = null
    const parsed = parseFacilitiesPage(mutated)
    expect(parsed.errors).toEqual([])
    expect(parsed.facilities).toHaveLength(3)
  })
})

describe('fetchAllFacilities paging', () => {
  it('builds the documented query URL', () => {
    expect(buildFacilityPageUrl('Water_Point_View_Public', 0, 1000)).toBe(
      'https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/Water_Point_View_Public/FeatureServer/0/query' +
        '?where=1%3D1&outFields=*&f=geojson&resultOffset=0&resultRecordCount=1000',
    )
  })

  it('follows exceededTransferLimit across pages and stops at the last one', async () => {
    const lastPage = {
      type: 'FeatureCollection',
      properties: { exceededTransferLimit: false },
      features: fixture.features.slice(0, 2),
    }
    const requested: string[] = []
    const stub: typeof fetch = async (input) => {
      requested.push(String(input))
      const body = requested.length === 1 ? fixtureRaw : JSON.stringify(lastPage)
      return new Response(body, { status: 200 })
    }
    const result = await fetchAllFacilities('Customer_Service_Facilities_View_Public', stub, 4)
    expect(result.pages).toBe(2)
    expect(result.facilities).toHaveLength(6)
    expect(requested[0]).toContain('resultOffset=0')
    expect(requested[1]).toContain('resultOffset=4')
  })

  it('aborts if the API misreports paging forever', async () => {
    const stub: typeof fetch = async () => new Response(fixtureRaw, { status: 200 })
    await expect(
      fetchAllFacilities('Customer_Service_Facilities_View_Public', stub, 4, 3),
    ).rejects.toThrow(/exceeded 3 pages/)
  })

  it('throws on HTTP errors', async () => {
    const stub: typeof fetch = async () => new Response('nope', { status: 503 })
    await expect(fetchAllFacilities('Elsan_View_Public', stub)).rejects.toThrow(/HTTP 503/)
  })
})
