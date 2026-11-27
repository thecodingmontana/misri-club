import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readable } from './readable.ts'

test('a request that never got out reads as being offline', () => {
  const offline = "You're offline. Connect to the internet and try again."
  assert.equal(
    readable(
      'fetch failed: java.net.UnknownHostException: Unable to resolve host "lichess.org"',
    ),
    offline,
  )
  assert.equal(readable('Network request failed'), offline)
  assert.equal(
    readable("It's full."),
    "It's full.",
    "the server's own words stay",
  )
})
