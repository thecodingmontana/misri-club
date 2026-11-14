# Plan 003: Stop one slow chess.com call from stalling every chess.com request

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/src/server/chesscom.server.ts apps/web/src/server/chesscom.test.ts`
> On any change, compare the excerpt below with the live code; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

All chess.com traffic (game sync, chess.com account verification, live
ratings) goes through one helper, `apiGet`, which allows only 3 requests at a
time per server instance. Its `fetch` has **no timeout**, and on a 429/5xx it
sleeps for whatever `Retry-After` chess.com sends, **with no upper bound, while
still holding its slot**. One hung socket or one `Retry-After: 3600` freezes all
chess.com features on that instance until Vercel kills the function, and the
sync claim expires meanwhile so other instances start overlapping syncs.
After this plan every request gives up after 10 s, and a retry never waits more
than 5 s.

## Current state

`apps/web/src/server/chesscom.server.ts` — the whole relevant block (lines ~21–75):

```ts
/** Max in-flight requests to chess.com. Deliberately gentle. */
const MAX_CONCURRENCY = 3

let inFlight = 0
const queue: Array<() => void> = []

async function withSlot<T>(fn: () => Promise<T>): Promise<T> { ... }

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

async function apiGet<T>(path: string, retries = 3): Promise<T | null> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`

  return withSlot(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      })

      if (res.status === 404 || res.status === 410) return null
      if (res.ok) return (await res.json()) as T

      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= retries) {
        throw new Error(`chess.com responded ${res.status} for ${url}`)
      }

      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** attempt,
      )
    }
  })
}
```

Callers already `try/catch` errors from these functions (sync collects them
into an `errors` list; ratings fall back to `null`). So turning a hang into a
thrown error is safe.

Test conventions: `node:test` + `node:assert/strict`, test files next to the
code. Exemplar: `apps/web/src/server/chesscom.test.ts`, which stubs
`globalThis.fetch` and imports `./chesscom.server.ts` (relative path with `.ts`).

## Commands you will need

| Purpose   | Command (from `apps/web`)                                                   | Expected |
|-----------|-----------------------------------------------------------------------------|----------|
| One test  | `node --test --experimental-strip-types src/server/chesscom.test.ts`        | `ℹ fail 0` |
| All tests | `pnpm test`                                                                  | `ℹ fail 0` |
| Typecheck | `pnpm typecheck`                                                             | exit 0   |
| Lint      | `pnpm check`                                                                 | exit 0   |

## Scope

**In scope**: `apps/web/src/server/chesscom.server.ts` (only `apiGet` and new
constants next to it), `apps/web/src/server/chesscom.test.ts`.

**Out of scope**: `MAX_CONCURRENCY` value, the rating cache, callers in
`sync.server.ts` / `league.server.ts` / `chess-account.functions.ts`, the
User-Agent string.

## Git workflow

- Branch: `advisor/003-chesscom-timeouts`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `fix(sync): time out chess.com requests and cap retry waits`.

## Steps

### Step 1: Add the two limits

Above `apiGet`, add:

```ts
/** A chess.com request that hasn't answered in this long is treated as failed. */
const REQUEST_TIMEOUT_MS = 10_000
/** Never sit on a slot longer than this between retries, whatever Retry-After says. */
const MAX_RETRY_WAIT_MS = 5_000
```

### Step 2: Use them in `apiGet`

- Pass `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)` to `fetch`.
- Cap the sleep: `Math.min(<current computed wait>, MAX_RETRY_WAIT_MS)`.
- Treat a timeout like a retryable failure: wrap the `fetch` in `try/catch`;
  if the error's `name` is `'TimeoutError'` and `attempt < retries`, `continue`
  the loop after the capped backoff (`500 * 2 ** attempt`, capped); otherwise
  throw `new Error(\`chess.com timed out for ${url}\`)`.

Keep everything else (404/410 → `null`, error messages) unchanged.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tests

Add to `apps/web/src/server/chesscom.test.ts` (same style as the existing test;
use exported functions such as `fetchPlayerProfile`):

1. **A 429 with a huge Retry-After does not wait long**: stub `fetch` to return
   `new Response('', { status: 429, headers: { 'retry-after': '3600' } })` once,
   then `Response.json({ username: 'a' })`; measure elapsed time around
   `fetchPlayerProfile('a')` and assert it is `< 6000` ms and the result is returned.
2. **A hung request fails instead of hanging**: stub `fetch` to return a promise
   that rejects with `Object.assign(new Error('t'), { name: 'TimeoutError' })`
   every time; assert `fetchPlayerProfile('b')` rejects with a message containing
   `timed out`. (Simulating the abort by rejecting avoids a real 10 s wait.)

**Verify**: `node --test --experimental-strip-types src/server/chesscom.test.ts` → `ℹ fail 0`, with 2 more tests than before.

## Test plan

See Step 3. Model after the existing test in the same file. Restore nothing
special — each test reassigns `globalThis.fetch`.

## Done criteria

- [ ] `grep -c "AbortSignal.timeout(REQUEST_TIMEOUT_MS)" apps/web/src/server/chesscom.server.ts` → `1`
- [ ] `grep -c "MAX_RETRY_WAIT_MS" apps/web/src/server/chesscom.server.ts` → at least `2`
- [ ] `pnpm test` → `ℹ fail 0`, two new tests in `chesscom.test.ts`
- [ ] `pnpm typecheck` and `pnpm check` exit 0
- [ ] Only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Test 1 still takes ≥ 6 s after your change — the cap isn't applied; recheck, and if it persists, stop.
- The rating cache test (already in the file) starts failing — stop and report; do not change the cache.
- You find yourself editing a caller to handle the new error — stop; callers already catch.

## Maintenance notes

- The sleep still happens while the slot is held; with the 5 s cap that's
  acceptable. If chess.com starts rate limiting heavily, release the slot before
  sleeping (wrap only the `fetch` in `withSlot`) — deferred, not needed now.
- If sync grows past ~30 members, revisit `MAX_CONCURRENCY` and the timeout together.
