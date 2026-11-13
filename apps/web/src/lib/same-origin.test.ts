import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crossSite } from './same-origin.ts'

const at = (headers: Record<string, string>) =>
  new Request('https://misri.example/_serverFn/x', { method: 'POST', headers })

test('requests from this site, typed-in navigations and non-browsers pass', () => {
  assert.equal(crossSite(at({ 'sec-fetch-site': 'same-origin' })), false)
  assert.equal(crossSite(at({ 'sec-fetch-site': 'none' })), false)
  assert.equal(crossSite(at({ origin: 'https://misri.example' })), false)
  assert.equal(crossSite(at({})), false) // curl, webhooks, the mobile app
})

test('another site posting with our cookie is refused', () => {
  assert.equal(crossSite(at({ 'sec-fetch-site': 'cross-site' })), true)
  assert.equal(crossSite(at({ 'sec-fetch-site': 'same-site' })), true)
  assert.equal(crossSite(at({ origin: 'https://evil.example' })), true)
  // an old browser that sends Origin but not Sec-Fetch-Site
  assert.equal(crossSite(at({ origin: 'null' })), true)
})
