import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rememberNext, safePath, takeNext } from './auth-client.ts'

test('a sign-in redirect stays on this site', () => {
  assert.equal(safePath('/fixtures'), '/fixtures')
  assert.equal(safePath('/players/a?tab=1'), '/players/a?tab=1')

  for (const evil of [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'evil.com',
    undefined,
    42,
  ]) {
    assert.equal(safePath(evil), undefined, String(evil))
  }
})

function memoryStore(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => {
      data.delete(k)
    },
    setItem: (k, v) => {
      data.set(k, v)
    },
  }
}

test('a remembered invite comes back once, then is gone', () => {
  const store = memoryStore()
  rememberNext('/join/ABCD1234', store)
  assert.equal(takeNext(store), '/join/ABCD1234')
  assert.equal(takeNext(store), undefined)
})

test('a remembered destination expires after half an hour', () => {
  const store = memoryStore()
  rememberNext('/join/ABCD1234', store)
  assert.equal(takeNext(store, Date.now() + 31 * 60 * 1000), undefined)
})

test('other sites and the home page are never remembered', () => {
  const store = memoryStore()
  rememberNext('https://evil.example/x', store)
  rememberNext('//evil.example', store)
  rememberNext('/', store)
  assert.equal(takeNext(store), undefined)
})
