import { db } from '@misri/db/client'
import { pushSubscriptions } from '@misri/db/schema'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import webpush from 'web-push'
import { isPushEndpoint } from './push-endpoint.ts'

// Web push to the browsers and phones people turned on in Account → Notifications.
// The service worker (public/sw.js) shows each message and opens its link when tapped.

const publicKey = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
// No keys (local setups, tests): pushes are skipped.
const ready = Boolean(publicKey && privateKey)

/** Push services want a contact: the sender address, or the site itself. */
function contact() {
  const address = process.env.EMAIL_FROM?.match(/[^\s<>]+@[^\s<>]+/)?.[0]
  return address ? `mailto:${address}` : 'https://misri-chess-club.vercel.app'
}

if (ready) webpush.setVapidDetails(contact(), publicKey ?? '', privateKey ?? '')

export const pushPublicKey = () => (ready ? (publicKey ?? null) : null)

export interface PushMessage {
  userId: string
  title: string
  body?: string
  url: string
  /** a repeat with the same tag replaces the earlier notification instead of stacking */
  tag?: string
}

/** Sends each message to every device of its person; forgets devices the browser dropped. */
export async function sendPushes(messages: PushMessage[]) {
  if (!ready || messages.length === 0) return 0
  const all = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        inArray(pushSubscriptions.userId, [
          ...new Set(messages.map((m) => m.userId)),
        ]),
        // only devices still signed in; a device saved before sign-ins were
        // recorded is picked up again on its next visit
        isNotNull(pushSubscriptions.sessionId),
      ),
    )
  // rows saved before the allowlist are forgotten, never contacted
  const subs = all.filter((s) => isPushEndpoint(s.endpoint))
  const bad = all.filter((s) => !isPushEndpoint(s.endpoint)).map((s) => s.id)
  if (bad.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, bad))
      .catch((error) =>
        console.error(
          '[push] forgetting bad endpoints failed',
          (error as Error).message,
        ),
      )
  }
  let sent = 0
  await Promise.allSettled(
    messages.flatMap(({ userId, ...message }) =>
      subs
        .filter((s) => s.userId === userId)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth },
              },
              JSON.stringify(message),
              { TTL: 86_400 },
            )
            sent++
          } catch (error) {
            const { statusCode } = error as { statusCode?: number }
            console.error(
              `[push] ${new URL(s.endpoint).host} answered ${statusCode ?? (error as Error).message}`,
            )
            // 404/410: unsubscribed or reinstalled; the endpoint is gone for good
            if (statusCode === 404 || statusCode === 410) {
              await db
                .delete(pushSubscriptions)
                .where(eq(pushSubscriptions.id, s.id))
            }
          }
        }),
    ),
  )
  return sent
}
