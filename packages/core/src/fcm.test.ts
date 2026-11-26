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
