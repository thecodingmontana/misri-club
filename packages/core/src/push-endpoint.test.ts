import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPushEndpoint } from './push-endpoint.ts'

test('accepts real browser push services', () => {
  for (const url of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ]) {
    assert.equal(isPushEndpoint(url), true, url)
  }
})

test('rejects plain http', () => {
  assert.equal(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false)
})

test('rejects other hosts, internal addresses and look-alikes', () => {
  for (const url of [
    'https://example.com/push',
    'https://169.254.169.254/latest',
    'https://localhost/x',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilfcm.googleapis.com/x',
  ]) {
    assert.equal(isPushEndpoint(url), false, url)
  }
})

test('rejects credentials and ports', () => {
  assert.equal(isPushEndpoint('https://user:pass@fcm.googleapis.com/x'), false)
  assert.equal(isPushEndpoint('https://fcm.googleapis.com:8443/x'), false)
})

test('rejects garbage', () => {
  assert.equal(isPushEndpoint(''), false)
  assert.equal(isPushEndpoint('not a url'), false)
})
