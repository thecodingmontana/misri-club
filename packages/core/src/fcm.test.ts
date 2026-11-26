import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fcmGone } from './fcm.ts'

const err = (code: string, message = '') => ({
  error: { message, details: [{ errorCode: code }] },
})

test('FCM: only an unregistered or unreadable token forgets the phone', () => {
  assert.equal(fcmGone(404, err('UNREGISTERED')), true)
  assert.equal(fcmGone(400, err('UNREGISTERED')), true)
  assert.equal(
    fcmGone(
      400,
      err(
        'INVALID_ARGUMENT',
        'The registration token is not a valid FCM registration token',
      ),
    ),
    true,
  )
  // a message FCM rejects is also a 400: the phone stays
  assert.equal(
    fcmGone(
      400,
      err('INVALID_ARGUMENT', 'Invalid value at message.android.ttl'),
    ),
    false,
  )
  assert.equal(fcmGone(400, null), false)
  assert.equal(fcmGone(503, err('UNAVAILABLE')), false)
})

test('FCM: a burst of pushes shares one sign-in with Google', async (t) => {
  const { generateKeyPairSync } = await import('node:crypto')
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    project_id: 'p',
    client_email: 'e@p.test',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  })
  let signIns = 0
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (String(url).includes('oauth2')) {
      signIns++
      await new Promise((r) => setTimeout(r, 5)) // slow enough to overlap
      return Response.json({ access_token: 't', expires_in: 3600 })
    }
    return new Response('{}', { status: 200 })
  })
  const { sendFcm } = await import('./fcm.ts')
  const sent = await Promise.all(
    Array.from({ length: 20 }, () =>
      sendFcm('token', { title: 'Hi', url: '/' }),
    ),
  )
  assert.ok(sent.every((r) => r === 'sent'))
  assert.equal(signIns, 1)
})
