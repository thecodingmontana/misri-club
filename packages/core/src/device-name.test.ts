import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deviceName } from './device-name.ts'

test('common browsers and systems read as plain words', () => {
  assert.equal(
    deviceName(
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    ),
    'Chrome on Android',
  )
  assert.equal(
    deviceName(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ),
    'Safari on iPhone',
  )
  assert.equal(
    deviceName(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
    ),
    'Edge on Windows',
  )
  assert.equal(
    deviceName(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0',
    ),
    'Firefox on Mac',
  )
})

test('missing or odd user agents still read sensibly', () => {
  assert.equal(deviceName(null), 'Unknown device')
  assert.equal(deviceName('curl/8.0'), 'A browser')
})

test('the Android app reads as the app', () => {
  assert.equal(deviceName('okhttp/4.12.0'), 'Misri app on Android')
})
