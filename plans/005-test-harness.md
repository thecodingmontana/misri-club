# Plan 005: Make server code testable (module resolution + a local database test lane)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/package.json apps/web/src/server/rate-limit.server.ts apps/web/src/db/client.server.ts`
> On any change, compare the excerpts below with the live code; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

Today no test can touch the database or the authorization paths. Two blockers:
(1) the app imports its own modules as `#/lib/…` without a file extension, which
Vite resolves but Node's test runner does not — `import('#/lib/format')` fails
with `ERR_MODULE_NOT_FOUND`, so any module with a runtime `#/` import (every
server module) can't be loaded by `node --test`; (2) there is no database for
tests — developers run an untracked Docker container on port 5434. This plan
adds a tiny resolve hook, a compose file for the database, a `test:db` script,
and one real database test, so later plans can test sync, linking and auth.

## Current state

- `apps/web/package.json`:
  ```json
  "imports": { "#/*": "./src/*" },
  "scripts": {
    "test": "node --test --experimental-strip-types 'src/**/*.test.ts'",
    "db:migrate": "drizzle-kit migrate",
  }
  ```
  Node is 24.21 (root `engines: 24.x`).
- Proof of blocker (1), run from `apps/web`:
  `node --experimental-strip-types -e "import('#/lib/format').then(()=>console.log('ok')).catch(e=>console.log(e.code))"`
  prints `ERR_MODULE_NOT_FOUND`; the same with `#/lib/format.ts` works.
- `apps/web/src/db/client.server.ts:12-14` throws on import when `DATABASE_URL`
  is missing, and turns SSL off for localhost URLs:
  ```ts
  const url = process.env.DATABASE_URL ?? ''
  if (!url) throw new Error('DATABASE_URL must point at the PostgreSQL database')
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
  ```
  It keeps a postgres connection pool open (cached on `globalThis`), which keeps
  a test process alive — tests need `--test-force-exit`.
- `apps/web/src/server/rate-limit.server.ts` — `takeAllowance(key, adding, max, windowMs): Promise<boolean>`,
  one atomic upsert into the `rate_limit` table. A good first database test:
  pure logic, no external services.
- Drizzle migrations live in `apps/web/src/db/migrations` (0000–0003);
  `drizzle.config.ts` uses `DIRECT_DATABASE_URL ?? DATABASE_URL`.
- Existing unit tests (`src/**/*.test.ts`) must stay fast and database-free.
  Exemplar style: `apps/web/src/lib/same-origin.test.ts` (`node:test`,
  `node:assert/strict`, imports with relative `.ts` paths).
- Note: Node's type stripping does not handle `.tsx`. Database tests must only
  import modules whose import graph is `.ts` (true for `rate-limit.server.ts`,
  `league.server.ts`, `sync.server.ts`; NOT for `auth.server.ts`, which imports
  an email `.tsx` template).

## Commands you will need

| Purpose       | Command                                                                    | Expected |
|---------------|----------------------------------------------------------------------------|----------|
| Start DB      | `docker compose up -d db` (repo root)                                      | container healthy |
| Make test DB  | `docker compose exec db createdb -U postgres misri_test` (ignore "already exists") | exit 0 |
| Migrate it    | `cd apps/web && DATABASE_URL=postgres://postgres:misri@localhost:5434/misri_test pnpm db:migrate` | `migrations applied successfully` |
| DB tests      | `cd apps/web && DATABASE_URL=postgres://postgres:misri@localhost:5434/misri_test pnpm test:db` | `ℹ fail 0` |
| Unit tests    | `pnpm test` (repo root)                                                    | `ℹ fail 0`, unchanged count |
| Typecheck/lint| `pnpm typecheck && pnpm check`                                             | exit 0 |

## Scope

**In scope** (create or modify only these):
- `compose.yaml` (create, repo root)
- `apps/web/src/test/register.ts` (create)
- `apps/web/src/server/rate-limit.db.test.ts` (create)
- `apps/web/package.json` — add one `test:db` script
- `README.md` — a "Local database" paragraph

**Out of scope**: changing `#/` imports across the codebase; `client.server.ts`;
CI wiring (note it for plan 001's maintenance); any app logic.

## Git workflow

- Branch: `advisor/005-test-harness`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `test: run server modules and a local database under node --test`.

## Steps

### Step 1: Compose file for the local database

Create `compose.yaml` at the repo root, matching the container developers
already use (Postgres 18 on host port 5434, password `misri`, database `misri`):

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_PASSWORD: misri
      POSTGRES_DB: misri
    ports:
      - "127.0.0.1:5434:5432"
    volumes:
      - misri-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 2s
      retries: 15
volumes:
  misri-db:
```

**Verify**: `docker compose config -q` → exit 0. (If a container named
`misri-postgres` already holds port 5434, stop it first: `docker stop misri-postgres`.)

### Step 2: The resolve hook

Create `apps/web/src/test/register.ts`:

```ts
import { registerHooks } from 'node:module'

// Vite resolves `#/lib/x` to `src/lib/x.ts`; Node's test runner needs the
// extension, so retry `#/` imports with `.ts` when the bare one isn't found.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('#/') && !specifier.endsWith('.ts')) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw error
    }
  },
})
```

**Verify** (from `apps/web`):
`node --experimental-strip-types --import ./src/test/register.ts -e "import('#/lib/format').then(()=>console.log('ok'))"` → prints `ok`.

### Step 3: `test:db` script

In `apps/web/package.json` scripts add:

```json
"test:db": "node --test --test-force-exit --experimental-strip-types --import ./src/test/register.ts 'src/**/*.db.test.ts'",
```

Do not change the existing `test` script (its glob `*.test.ts` would also match
`*.db.test.ts` — see Step 4 for how that is handled).

### Step 4: First database test

Create `apps/web/src/server/rate-limit.db.test.ts`. Because the unit `test`
glob also matches this file, the file must skip itself when no database is
configured:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

const skip = !process.env.DATABASE_URL && 'needs DATABASE_URL (pnpm test:db)'

test('takeAllowance allows max calls per window, then refuses', { skip }, async () => {
  const { takeAllowance } = await import('./rate-limit.server.ts')
  const key = `test:${crypto.randomUUID()}`
  for (let i = 0; i < 3; i++) assert.equal(await takeAllowance(key, 1, 3, 60_000), true)
  assert.equal(await takeAllowance(key, 1, 3, 60_000), false)
})

test('takeAllowance starts a fresh window once the old one is over', { skip }, async () => {
  const { takeAllowance } = await import('./rate-limit.server.ts')
  const key = `test:${crypto.randomUUID()}`
  assert.equal(await takeAllowance(key, 1, 1, 50), true)
  assert.equal(await takeAllowance(key, 1, 1, 50), false)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(await takeAllowance(key, 1, 1, 50), true)
})

test('two first calls at the same moment cannot both exceed the limit', { skip }, async () => {
  const { takeAllowance } = await import('./rate-limit.server.ts')
  const key = `test:${crypto.randomUUID()}`
  const results = await Promise.all([1, 2, 3].map(() => takeAllowance(key, 1, 2, 60_000)))
  assert.equal(results.filter(Boolean).length, 2)
})
```

(Dynamic `import()` inside each test means the unit run never loads the
database client.)

**Verify**: run the "Make test DB", "Migrate it" and "DB tests" commands from
the table → `ℹ pass 3`, `ℹ fail 0`. Then `pnpm test` from the repo root → same
pass count as before plus 3 `skipped`, `ℹ fail 0`.

### Step 5: Document it

Add to `README.md` under "Setup":

> **Local database**: `docker compose up -d db` starts Postgres on port 5434.
> Put `DATABASE_URL=postgres://postgres:misri@localhost:5434/misri` in
> `apps/web/.env.local`. Database tests use a separate `misri_test` database —
> see `pnpm --filter @misri/web test:db`.

**Verify**: `grep -c "docker compose up -d db" README.md` → `1`.

## Test plan

Step 4 is the test plan: three database tests for `takeAllowance` (window
limit, window reset, concurrent first calls). They also prove the harness works
for later plans.

## Done criteria

- [ ] `docker compose config -q` exits 0
- [ ] `test:db` passes 3 tests against `misri_test`
- [ ] `pnpm test` → `ℹ fail 0`, the 3 database tests reported as skipped
- [ ] `pnpm typecheck` and `pnpm check` exit 0
- [ ] Only the five in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `registerHooks` is not exported by `node:module` on the installed Node (it needs Node ≥ 22.15) — stop and report the Node version.
- The concurrent test fails intermittently (more than 2 allowed) — that's a real bug in `takeAllowance`; stop and report with the output instead of changing the test.
- `pnpm typecheck` complains about `src/test/register.ts` types — report the error; do not disable type checking.

## Maintenance notes

- Later database tests: name them `*.db.test.ts`, guard with the same `skip`,
  import the module under test dynamically, and use unique keys or
  `TRUNCATE … RESTART IDENTITY CASCADE` in a `beforeEach` for table state.
- Stub chess.com with `globalThis.fetch = …`, as `src/server/chesscom.test.ts` does.
- CI (plan 001) can later add a `postgres` service and run `test:db`.
