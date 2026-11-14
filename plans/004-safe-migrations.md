# Plan 004: Make production migrations fail safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/drizzle.config.ts apps/web/package.json README.md`
> On any change, compare the excerpts below with the live code; mismatch = STOP
> (except the `vercel-build` line, which plan 001 is expected to have changed — see Step 2).

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (if plan 001 landed first, Step 2 shows the merged line)
- **Category**: migration
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

Production migrations run inside the Vercel build. Two things can go wrong
today. (1) If `DIRECT_DATABASE_URL` is missing, `drizzle.config.ts` silently
falls back to `DATABASE_URL` — Supabase's *transaction* pooler — which the file's
own comment says breaks DDL and drizzle-kit's advisory locking. (2) Migrations
run *before* `vite build`, so a build that fails after migrating leaves the live
site on old code with a newer schema. After this plan, production migrations
refuse to run without the session-pooler URL, and they only run once the build
has succeeded.

## Current state

`apps/web/drizzle.config.ts` (whole file):

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    // Migrations go through the session-mode pooler (port 5432), not the
    // transaction pooler the app uses: DDL and drizzle-kit's advisory locking
    // need session state that pgBouncer's transaction mode discards.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  casing: 'snake_case',
})
```

`apps/web/package.json` scripts, line 12 at the time of planning:

```json
"vercel-build": "if [ \"$VERCEL_ENV\" = production ]; then drizzle-kit migrate; fi && vite build",
```

Vercel sets `VERCEL_ENV=production` for production builds. `DIRECT_DATABASE_URL`
is already configured on the production environment in Vercel (confirmed by
listing env names), so the new guard will not break the current deploy.
Locally, developers use only `DATABASE_URL` (a local Postgres) — local runs must
keep working.

All existing migrations (`apps/web/src/db/migrations/0000`–`0003`) are additive;
nothing destructive is pending.

## Commands you will need

| Purpose        | Command (from `apps/web`)                                                                 | Expected |
|----------------|-------------------------------------------------------------------------------------------|----------|
| Guard fires    | `VERCEL_ENV=production DATABASE_URL=postgres://x@localhost:1/x pnpm exec drizzle-kit check` | non-zero exit, message mentions `DIRECT_DATABASE_URL` |
| Guard silent locally | `DATABASE_URL=postgres://x@localhost:1/x pnpm exec drizzle-kit check`            | no `DIRECT_DATABASE_URL` error (may still exit 0 — `check` only validates migration files) |
| Typecheck      | `pnpm typecheck`                                                                          | exit 0   |
| Lint           | `pnpm check`                                                                              | exit 0   |

## Scope

**In scope**: `apps/web/drizzle.config.ts`, the `vercel-build` line in
`apps/web/package.json`, one short paragraph in `README.md`.

**Out of scope**: migration SQL files, `src/db/client.server.ts`, the schema,
Vercel project settings.

## Git workflow

- Branch: `advisor/004-safe-migrations`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `fix(db): refuse production migrations without the session pooler`.

## Steps

### Step 1: Guard the production URL

Rewrite the `dbCredentials` section of `apps/web/drizzle.config.ts` so that,
when `process.env.VERCEL_ENV === 'production'` and `DIRECT_DATABASE_URL` is not
set, it throws:

```ts
const production = process.env.VERCEL_ENV === 'production'
if (production && !process.env.DIRECT_DATABASE_URL) {
  throw new Error(
    'DIRECT_DATABASE_URL must be set for production migrations: the session pooler (port 5432), not the transaction pooler.',
  )
}
```

…and keep `url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? ''`
for every other case (local development). Keep the existing comment.

**Verify**: the two "Guard" commands in the table behave as described.

### Step 2: Build first, migrate after

Change `vercel-build` so `vite build` runs before the migration. If the line is
still the original, the result is:

```json
"vercel-build": "vite build && if [ \"$VERCEL_ENV\" = production ]; then drizzle-kit migrate; fi",
```

If plan 001 already added checks (`tsc --noEmit && node --test … &&` at the
start), keep them first:

```json
"vercel-build": "tsc --noEmit && node --test --experimental-strip-types 'src/**/*.test.ts' && vite build && if [ \"$VERCEL_ENV\" = production ]; then drizzle-kit migrate; fi",
```

**Verify**: `node -e "const s=require('./package.json').scripts['vercel-build'];process.exit(s.indexOf('vite build')<s.indexOf('drizzle-kit migrate')?0:1)"` (from `apps/web`) → exit 0.

### Step 3: Write down the migration rule

In `README.md`, under the `pnpm db:migrate` bullet of the "Scripts" section, add:

> Production migrates after a successful build, before the new deployment goes
> live, so the old deployment briefly runs on the new schema. Keep migrations
> additive (add columns/tables; backfill; drop only in a later deploy once no
> code reads the old shape).

**Verify**: `grep -c "Keep migrations" README.md` → `1`.

## Test plan

No unit tests (configuration only). The guard is verified by the commands in
Step 1; the ordering by the script check in Step 2.

## Done criteria

- [ ] Guard command with `VERCEL_ENV=production` and no `DIRECT_DATABASE_URL` exits non-zero mentioning `DIRECT_DATABASE_URL`
- [ ] Step 2's ordering check exits 0
- [ ] `pnpm typecheck` and `pnpm check` exit 0
- [ ] Only the three in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `drizzle-kit` does not evaluate `drizzle.config.ts` for `check` (the guard never fires) — try `pnpm exec drizzle-kit migrate` with an unreachable `DATABASE_URL` instead; if the guard still doesn't fire, stop and report.
- The `vercel-build` line differs from both shapes shown in Step 2 — stop and report.

## Maintenance notes

- If the database ever moves off Supabase poolers, revisit both URLs and this guard.
- A destructive migration (rename/drop/NOT NULL without default) still needs the
  two-deploy expand/contract approach described in Step 3; this plan does not
  make destructive migrations safe by itself.
