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

describe('notable trees (easter-egg layer)', () => {
  it('keeps veteran/landmark trees with species and denotation, ignores plain trees', async () => {
    const { extractPois } = await import('../src/pois')
    const data: OplData = {
      nodes: new Map<number, OplNode>([
        [
          1,
          {
            id: 1,
            lon: -1.2,
            lat: 52.29,
            tags: {
              natural: 'tree',
              denotation: 'natural_monument',
              species: 'Quercus robur',
              'species:en': 'Pedunculate oak',
              name: 'Braunston Oak',
            },
          },
        ],
        [2, { id: 2, lon: -1.21, lat: 52.29, tags: { natural: 'tree', denotation: 'landmark' } }],
        [3, { id: 3, lon: -1.22, lat: 52.29, tags: { natural: 'tree' } }],
        [4, { id: 4, lon: -1.23, lat: 52.29, tags: { denotation: 'natural_monument' } }],
      ]),
      ways: [],
    }
    const pois = extractPois(data)
    const trees = pois.filter((p) => p.category === 'notable-tree')
    expect(trees).toHaveLength(2)
    const oak = trees.find((p) => p.name === 'Braunston Oak')!
    expect(oak.species).toBe('Pedunculate oak')
    expect(oak.denotation).toBe('natural_monument')
    const landmark = trees.find((p) => p.id === 2)!
    expect(landmark.denotation).toBe('landmark')
    expect(landmark.species).toBeUndefined()
  })
})
