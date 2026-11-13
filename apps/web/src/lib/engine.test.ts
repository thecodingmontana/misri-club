import assert from 'node:assert/strict'
import { test } from 'node:test'

// A stand-in worker whose script failed to load: it never answers.
class DeadWorker extends EventTarget {
  postMessage() {}
  terminate() {}
}
Object.assign(globalThis, { Worker: DeadWorker })
const { Engine } = await import('./engine.ts')

test('an engine that failed to load rejects searches instead of hanging', async () => {
  const engine = new Engine()
  // @ts-expect-error reach the stand-in to fire its load error
  const worker: EventTarget = engine.worker
  worker.dispatchEvent(Object.assign(new Event('error'), { message: '404' }))

  await assert.rejects(engine.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1', 10), {
    message: 'The chess engine failed to load: 404',
  })
})

test('a load error during a search fails that search', async () => {
  const engine = new Engine()
  const search = engine.evaluate('8/8/8/8/8/8/8/K6k w - - 0 1', 10)
  await new Promise((resolve) => setTimeout(resolve, 0))
  // @ts-expect-error reach the stand-in to fire its load error
  ;(engine.worker as EventTarget).dispatchEvent(new Event('error'))
  await assert.rejects(search, { message: 'The chess engine failed to load.' })
})
