import { describe, expect, it } from 'vitest'
import type { OplData, OplNode } from '../src/osm/opl'

describe('pub mooring cross-reference', () => {
  it('tags pubs with distance to the nearest mooring and their own mooring tag', async () => {
    const { extractPois, buildNetworkIndex } = await import('../src/pois')
    const data: OplData = {
      nodes: new Map<number, OplNode>([
        [
          1,
          {
            id: 1,
            lon: -1.2,
            lat: 52.29,
            tags: { amenity: 'pub', name: 'The Nelson', mooring: 'customer' },
          },
        ],
        [2, { id: 2, lon: -1.4, lat: 52.29, tags: { amenity: 'pub', name: 'The Far Pub' } }],
      ]),
      ways: [],
    }
    const moorings = buildNetworkIndex([
      [
        [-1.2003, 52.2902],
        [-1.2001, 52.2904],
      ],
    ])
    const pois = extractPois(data, { moorings })
    const nelson = pois.find((p) => p.name === 'The Nelson')!
    expect(nelson.mooring).toBe('customer')
    expect(nelson.mooringM).toBeLessThan(50)
    const far = pois.find((p) => p.name === 'The Far Pub')!
    expect(far.mooringM).toBeUndefined()
  })
})
