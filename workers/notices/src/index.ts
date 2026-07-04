import { buildNoticesUrl, ETL_USER_AGENT } from '@moorhen/etl/crt/notices'
import { parseNoticesResponse, type Notice } from '@moorhen/schema'
import { alertable, diffNotices, type DigestMap } from './diff'
import { getAccessToken, sendToTopic, type ServiceAccount } from './fcm'
import { topicsForWaterways } from './topics'

/**
 * Scheduled poller (cron, every 15 minutes). Every binding is optional so the worker
 * degrades gracefully: no KV → no diffing (publish only); no R2 → no
 * publishing; no FCM secrets → no pushes. Structural binding types keep the
 * logic unit-testable without Cloudflare's runtime.
 */

interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

interface R2Like {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
}

export interface Env {
  SEEN_KV?: KVLike
  DATA_BUCKET?: R2Like
  FCM_SERVICE_ACCOUNT?: string
  FCM_PROJECT_ID?: string
  HEALTHCHECK_URL?: string
  NOTICES_WINDOW_DAYS?: string
}

const DIGESTS_KEY = 'notice-digests-v1'

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export function alertText(notice: Notice): { title: string; body: string } {
  const where = notice.waterways[0] ?? notice.region ?? 'your waterway'
  return {
    title: `${notice.type}: ${where}`,
    body: `${notice.title}${notice.reason ? ` — ${notice.reason.toLowerCase()}` : ''}${
      notice.end ? `, until ${notice.end.slice(0, 10)}` : ''
    }`,
  }
}

export async function runPoll(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  fetched: number
  parseErrors: number
  pushed: number
}> {
  const windowDays = Number(env.NOTICES_WINDOW_DAYS ?? '56')
  const start = new Date()
  const end = new Date(start.getTime() + windowDays * 86_400_000)
  const response = await fetchImpl(buildNoticesUrl({ start: isoDate(start), end: isoDate(end) }), {
    headers: { 'User-Agent': ETL_USER_AGENT, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`CRT notices API returned HTTP ${response.status}`)
  const { notices, errors } = parseNoticesResponse(await response.json())

  // Total parse failure = upstream schema break. Keep last-good data; alert
  // via the missed healthcheck rather than pushing nonsense.
  if (notices.length === 0 && errors.length > 0) {
    throw new Error(`notices parse failed entirely: ${errors[0]}`)
  }

  let pushed = 0
  if (env.SEEN_KV) {
    const previous = JSON.parse((await env.SEEN_KV.get(DIGESTS_KEY)) ?? '{}') as DigestMap
    const diff = diffNotices(previous, notices)
    const isFirstRun = Object.keys(previous).length === 0
    const toAlert = isFirstRun ? [] : alertable([...diff.added, ...diff.changed])

    if (toAlert.length > 0 && env.FCM_SERVICE_ACCOUNT && env.FCM_PROJECT_ID) {
      const account = JSON.parse(env.FCM_SERVICE_ACCOUNT) as ServiceAccount
      const token = await getAccessToken(account, undefined, fetchImpl)
      for (const notice of toAlert) {
        const text = alertText(notice)
        for (const topic of topicsForWaterways(notice.waterways)) {
          await sendToTopic(
            env.FCM_PROJECT_ID,
            token,
            { ...text, topic, data: { noticeId: notice.id, url: notice.url ?? '' } },
            fetchImpl,
          )
          pushed += 1
        }
      }
    }
    await env.SEEN_KV.put(DIGESTS_KEY, JSON.stringify(diff.digests))
  }

  if (env.DATA_BUCKET) {
    await env.DATA_BUCKET.put(
      'data/latest/notices.json',
      JSON.stringify({ fetchedAt: new Date().toISOString(), notices }),
      { httpMetadata: { contentType: 'application/json' } },
    )
  }

  if (env.HEALTHCHECK_URL) {
    await fetchImpl(env.HEALTHCHECK_URL, { method: 'GET' }).catch(() => undefined)
  }

  return { fetched: notices.length, parseErrors: errors.length, pushed }
}

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const result = await runPoll(env)
    console.log(
      `notices poll: ${result.fetched} fetched, ${result.parseErrors} parse warnings, ${result.pushed} pushes`,
    )
  },
}
