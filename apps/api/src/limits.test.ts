import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visitorKey } from './limits.ts'

test('IPv4 is one visitor per address', () => {
  assert.equal(visitorKey('203.0.113.9'), '203.0.113.9')
  assert.equal(visitorKey('::ffff:203.0.113.9'), '::ffff:203.0.113.9')
})

test('IPv6 counts a whole /64 as one visitor, however it is written', () => {
  const key = '2001:db8:0:1::/64'
  assert.equal(visitorKey('2001:db8:0:1::1'), key)
  assert.equal(visitorKey('2001:0db8:0000:0001:ffff:1:2:3'), key)
  assert.equal(visitorKey('2001:db8:0:1:abcd::'), key)
  assert.notEqual(visitorKey('2001:db8:0:2::1'), key)
  assert.equal(visitorKey('::1'), '0:0:0:0::/64')
})
