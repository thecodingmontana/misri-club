import { createSign } from 'node:crypto'

/**
 * Android app notifications through Firebase Cloud Messaging (HTTP v1). The
 * service account JSON (Firebase → Project settings → Service accounts) is in
 * FIREBASE_SERVICE_ACCOUNT; without it, app pushes are skipped.
 */

type Account = { project_id: string; client_email: string; private_key: string }

function account(): Account | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Account
    return parsed.project_id && parsed.client_email && parsed.private_key
      ? parsed
      : null
  } catch {
    return null
  }
}

export const fcmReady = () => account() !== null

let cached: { token: string; until: number } | null = null

/** A Google OAuth token for FCM, from a JWT signed with the service account. */
async function accessToken(sa: Account) {
  if (cached && cached.until > Date.now()) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(sa.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`Google sign-in for FCM answered ${res.status}`)
  const body = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  cached = {
    token: body.access_token,
    until: Date.now() + (body.expires_in - 120) * 1000,
  }
  return cached.token
}

export type FcmMessage = {
  title: string
  body?: string
  url: string
  tag?: string
}

/** Sends to one app install; 'gone' when FCM no longer knows the token. */
export async function sendFcm(
  token: string,
  message: FcmMessage,
): Promise<'sent' | 'gone' | 'failed'> {
  const sa = account()
  if (!sa) return 'failed'
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await accessToken(sa)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body ?? '' },
          data: { url: message.url },
          android: {
            priority: 'high',
            ttl: '86400s',
            notification: { channel_id: 'default', tag: message.tag },
          },
        },
      }),
    },
  )
  if (res.ok) return 'sent'
  // UNREGISTERED (404) or an invalid token (400): the install is gone
  if (res.status === 404 || res.status === 400) return 'gone'
  console.error(`[push] FCM answered ${res.status}`)
  return 'failed'
}

/** The app's devices are stored with the browsers', marked by this prefix. */
export const FCM_PREFIX = 'fcm:'
