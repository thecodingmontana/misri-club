import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'misri-test',
  client_email: 'push@misri-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
})
const { sendFcm, fcmReady } = await import('./fcm.ts')

test('sends a signed-in FCM message, and reports a gone install', async () => {
  const calls: Array<{ url: string; body: string }> = []
  let answer = 200
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) })
    if (url.includes('oauth2')) {
      return new Response(
        JSON.stringify({ access_token: 't', expires_in: 3600 }),
      )
    }
    return new Response('{}', { status: answer })
  }) as typeof fetch

  assert.equal(fcmReady(), true)
  const message = { title: 'Round 3 is open', url: '/c/rapid', tag: 'r3' }
  assert.equal(await sendFcm('device-token', message), 'sent')
  assert.match(calls[0].body, /grant_type=urn/)
  assert.equal(
    calls[1].url,
    'https://fcm.googleapis.com/v1/projects/misri-test/messages:send',
  )
  const sent = JSON.parse(calls[1].body).message
  assert.equal(sent.token, 'device-token')
  assert.equal(sent.data.url, '/c/rapid')
  answer = 404
  assert.equal(await sendFcm('old-token', message), 'gone')
  // the access token is reused while valid
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1)
})
