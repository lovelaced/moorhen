import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseNoticesResponse } from '@moorhen/schema'
import { alertable, diffNotices, noticeDigest } from './diff'
import { getAccessToken } from './fcm'
import { alertText, runPoll, type Env } from './index'
import { topicsForWaterways, waterwayTopic } from './topics'

const fixtureRaw = readFileSync(
  new URL('../../../packages/etl/test/fixtures/notices-2026-07-04.json', import.meta.url),
  'utf8',
)
const { notices } = parseNoticesResponse(JSON.parse(fixtureRaw))

describe('noticeDigest / diffNotices', () => {
  it('is stable for identical notices and changes when material fields change', () => {
    const notice = notices[0]!
    expect(noticeDigest(notice)).toBe(noticeDigest({ ...notice }))
    expect(noticeDigest({ ...notice, end: '2026-09-01T00:00:00+00:00' })).not.toBe(
      noticeDigest(notice),
    )
    expect(noticeDigest({ ...notice, state: 'Cancelled' })).not.toBe(noticeDigest(notice))
    // image URL churn must NOT trigger re-alerts
    expect(noticeDigest({ ...notice, image: { url: 'https://x/y.webp', alt: null } })).toBe(
      noticeDigest(notice),
    )
  })

  it('classifies added, changed, and removed', () => {
    const first = diffNotices({}, notices)
    expect(first.added).toHaveLength(296)
    expect(first.changed).toHaveLength(0)

    const mutated = notices.map((n, i) =>
      i === 0 ? { ...n, end: '2026-12-25T00:00:00+00:00' } : n,
    )
    const second = diffNotices(first.digests, mutated.slice(0, 200))
    expect(second.changed).toHaveLength(1)
    expect(second.changed[0]!.id).toBe(notices[0]!.id)
    expect(second.added).toHaveLength(0)
    expect(second.removedIds).toHaveLength(96)
  })

  it('alerts only on Published navigation-blocking notices', () => {
    const alerts = alertable(notices)
    expect(alerts.length).toBeGreaterThan(0)
    for (const n of alerts) {
      expect(n.isNavigationBlocking).toBe(true)
      expect(n.state).toBe('Published')
    }
    expect(alerts.length).toBeLessThan(87) // 87 nav-blocking incl. Completed/Cancelled
  })
})

describe('waterwayTopic', () => {
  it('slugs waterway names into valid FCM topics', () => {
    expect(waterwayTopic('Grand Union Canal')).toBe('ww-grand-union-canal')
    expect(waterwayTopic('Grand Union Canal (Leicester Line)')).toBe(
      'ww-grand-union-canal-leicester-line',
    )
    expect(waterwayTopic('Kennet & Avon Canal')).toBe('ww-kennet-and-avon-canal')
    expect(waterwayTopic("Regent's Canal")).toBe('ww-regent-s-canal')
    expect(waterwayTopic('')).toBe('ww-unknown')
  })

  it('dedupes topics across a notice’s waterways', () => {
    expect(topicsForWaterways(['Oxford Canal', 'Oxford Canal', 'River Thames'])).toEqual([
      'ww-oxford-canal',
      'ww-river-thames',
    ])
  })
})

describe('alertText', () => {
  it('reads like a sentence a boater needs', () => {
    const closure = notices.find((n) => n.typeId === 1 && n.end)!
    const text = alertText(closure)
    expect(text.title).toContain('Navigation Closure')
    expect(text.body).toContain(closure.title)
  })
})

describe('getAccessToken', () => {
  it('signs a verifiable RS256 JWT and exchanges it', async () => {
    const keys = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    )
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString(
      'base64',
    )
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n`

    let assertion = ''
    const stub: typeof fetch = async (_url, init) => {
      assertion = new URLSearchParams(String(init?.body)).get('assertion') ?? ''
      return new Response(JSON.stringify({ access_token: 'token-123' }), { status: 200 })
    }
    const token = await getAccessToken(
      { client_email: 'svc@example.iam.gserviceaccount.com', private_key: pem },
      1_750_000_000,
      stub,
    )
    expect(token).toBe('token-123')

    const [header, payload, signature] = assertion.split('.') as [string, string, string]
    const fromB64url = (s: string) =>
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      fromB64url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    )
    expect(valid).toBe(true)
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload)))
    expect(claims.iss).toBe('svc@example.iam.gserviceaccount.com')
    expect(claims.scope).toContain('firebase.messaging')
  })
})

describe('runPoll end-to-end (stubbed bindings)', () => {
  function makeKv(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    return {
      store,
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => void store.set(key, value),
    }
  }

  function makeBucket() {
    const objects = new Map<string, string>()
    return {
      objects,
      put: async (key: string, value: string) => void objects.set(key, value),
    }
  }

  const crtFetch: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('canalrivertrust.org.uk')) return new Response(fixtureRaw, { status: 200 })
    throw new Error(`unexpected fetch: ${url}`)
  }

  it('first run: seeds digests, publishes, never pushes', async () => {
    const kv = makeKv()
    const bucket = makeBucket()
    const env: Env = { SEEN_KV: kv, DATA_BUCKET: bucket }
    const result = await runPoll(env, crtFetch)
    expect(result.fetched).toBe(296)
    expect(result.pushed).toBe(0)
    expect(Object.keys(JSON.parse(kv.store.get('notice-digests-v1')!))).toHaveLength(296)
    expect(bucket.objects.has('data/latest/notices.json')).toBe(true)
  })

  it('subsequent run with a new closure pushes to its waterway topics', async () => {
    const kv = makeKv()
    await runPoll({ SEEN_KV: kv }, crtFetch) // seed

    // remove one Published navigation closure from the "previous" digests so
    // the next poll sees it as new
    const digests = JSON.parse(kv.store.get('notice-digests-v1')!) as Record<string, string>
    const closure = notices.find((n) => n.typeId === 1 && n.state === 'Published')!
    delete digests[closure.id]
    kv.store.set('notice-digests-v1', JSON.stringify(digests))

    const keys = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign'],
    )
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString(
      'base64',
    )

    const sends: string[] = []
    const stub: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('canalrivertrust.org.uk')) return new Response(fixtureRaw, { status: 200 })
      if (url.includes('oauth2.googleapis.com'))
        return new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
      if (url.includes('fcm.googleapis.com')) {
        const body = JSON.parse(String(init?.body)) as { message: { topic: string } }
        sends.push(body.message.topic)
        return new Response('{}', { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }

    const result = await runPoll(
      {
        SEEN_KV: kv,
        FCM_PROJECT_ID: 'moorhen-test',
        FCM_SERVICE_ACCOUNT: JSON.stringify({
          client_email: 'svc@example.iam.gserviceaccount.com',
          private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n`,
        }),
      },
      stub,
    )
    expect(result.pushed).toBeGreaterThan(0)
    expect(sends.length).toBe(result.pushed)
    for (const topic of sends) expect(topic).toMatch(/^ww-[a-z0-9-]+$/)
  })

  it('throws (keeping last-good) when the upstream schema breaks entirely', async () => {
    const broken: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'maintenance' }), { status: 200 })
    await expect(runPoll({}, broken)).rejects.toThrow(/parse failed entirely/)
  })
})
