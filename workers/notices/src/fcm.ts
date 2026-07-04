/**
 * Minimal FCM HTTP v1 client using WebCrypto (works in Cloudflare Workers
 * and Node 22+). Auth is a service-account JWT exchanged for an OAuth token;
 * fan-out is one send per waterway topic — no device-token database at all.
 */

export interface ServiceAccount {
  client_email: string
  private_key: string
}

const b64url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const encodeJson = (value: unknown): string =>
  b64url(new TextEncoder().encode(JSON.stringify(value)))

function pemToPkcs8(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Signs a service-account JWT and exchanges it for an OAuth access token. */
export async function getAccessToken(
  account: ServiceAccount,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }
  const unsigned = `${encodeJson(header)}.${encodeJson(claims)}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
  const jwt = `${unsigned}.${b64url(new Uint8Array(signature))}`

  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!response.ok) throw new Error(`OAuth token exchange failed: HTTP ${response.status}`)
  const json = (await response.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('OAuth token exchange returned no access_token')
  return json.access_token
}

export interface TopicNotification {
  topic: string
  title: string
  body: string
  /** Deep-link payload for the app (notice id etc.). */
  data?: Record<string, string>
}

export async function sendToTopic(
  projectId: string,
  accessToken: string,
  notification: TopicNotification,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          topic: notification.topic,
          notification: { title: notification.title, body: notification.body },
          data: notification.data ?? {},
        },
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`FCM send to ${notification.topic} failed: HTTP ${response.status}`)
  }
}
