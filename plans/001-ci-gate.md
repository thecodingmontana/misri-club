# Plan 001: Block broken code from reaching production (CI + a checked Vercel build)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- package.json apps/web/package.json .github`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

Every push to `main` deploys to production on Vercel, and nothing runs the
tests, the TypeScript typecheck or the linter first. Vite does not typecheck
when it builds, so a type error ships silently. Worse, the production build
runs database migrations *before* building, so a broken commit can change the
production schema and then fail. After this plan, a GitHub Actions workflow
checks every push and pull request, and the Vercel production build refuses to
deploy if the typecheck or tests fail.

## Current state

- Repo: pnpm monorepo. The only app is `apps/web` (TanStack Start + React 19).
  There is **no `.github/` directory** — no workflows exist.
- `package.json` (root) — pass-through scripts:
  ```json
  "packageManager": "pnpm@12.11.2",
  "engines": { "node": "24.x" },
  "scripts": {
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck",
    "check": "pnpm -r --if-present check",
    "prepare": "simple-git-hooks"
  }
  ```
- `apps/web/package.json` scripts (line 12 is the Vercel build):
  ```json
  "vercel-build": "if [ \"$VERCEL_ENV\" = production ]; then drizzle-kit migrate; fi && vite build",
  "typecheck": "tsc --noEmit",
  "test": "node --test --experimental-strip-types 'src/**/*.test.ts'",
  ```
  `check` runs `biome check` (Biome is the linter/formatter).
- The unit tests need no database and no env vars (they are pure functions;
  64 tests, ~4 s). `pnpm install` runs the root `prepare` script
  (`simple-git-hooks`), which only writes `.git/hooks/commit-msg` — harmless in CI.
- Vercel builds only `main` (`apps/web/vercel.json` has
  `"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != main ]"`). Leave that alone.

## Commands you will need

| Purpose   | Command (from repo root)            | Expected on success |
|-----------|-------------------------------------|---------------------|
| Install   | `pnpm install --frozen-lockfile`    | exit 0              |
| Typecheck | `pnpm typecheck`                    | exit 0, no errors   |
| Tests     | `pnpm test`                         | `ℹ fail 0`          |
| Lint      | `pnpm check`                        | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/ci.yml` (create)
- `apps/web/package.json` — only the `vercel-build` script line

**Out of scope** (do NOT touch):
- `apps/web/vercel.json` — the branch filter and security headers are deliberate.
- Any app source under `apps/web/src`.
- Database-backed tests — they come in plan 005; do not add a Postgres service here.
- The migration ordering inside `vercel-build` — plan 004 owns that. Only add the checks described in Step 2.

## Git workflow

- Branch: `advisor/001-ci-gate`
- Conventional Commits are enforced by a commit-msg hook (commitlint). Example
  from `git log`: `fix(deps): build every push to main, skip other branches`.
  Use e.g. `ci: check typecheck, lint and tests on every push`.
- Never add a `Co-Authored-By` trailer — the hook rejects it.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the GitHub Actions workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4   # reads the version from "packageManager"
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm check
      - run: pnpm test
```

**Verify**: `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8').includes('pnpm test') || process.exit(1)"` → exit 0.
Then run the same four commands locally from the repo root:
`pnpm install --frozen-lockfile && pnpm typecheck && pnpm check && pnpm test` → all exit 0, tests end with `ℹ fail 0`.

### Step 2: Make the Vercel production build check before it migrates

In `apps/web/package.json`, change only the `vercel-build` value to run the
typecheck and tests first:

```json
"vercel-build": "tsc --noEmit && node --test --experimental-strip-types 'src/**/*.test.ts' && if [ \"$VERCEL_ENV\" = production ]; then drizzle-kit migrate; fi && vite build",
```

**Verify**: from `apps/web`, run
`VERCEL_ENV=preview DATABASE_URL=postgres://x@localhost:5432/x BETTER_AUTH_SECRET=x pnpm run vercel-build`
→ typecheck passes, tests print `ℹ fail 0`, then the Vite build prints `✓ built`
(with `VERCEL_ENV=preview` the migration is skipped, so no database is needed).

## Test plan

No new unit tests. The workflow *is* the test: Step 1 runs it locally.
Optional extra proof: introduce a deliberate type error in a scratch copy,
confirm `pnpm typecheck` exits non-zero, then discard it.

## Done criteria

- [ ] `.github/workflows/ci.yml` exists and contains `pnpm typecheck`, `pnpm check`, `pnpm test`
- [ ] `pnpm install --frozen-lockfile && pnpm typecheck && pnpm check && pnpm test` exits 0
- [ ] `grep -c "tsc --noEmit &&" apps/web/package.json` → `1`
- [ ] `git status` shows only `.github/workflows/ci.yml` and `apps/web/package.json` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `pnpm test` or `pnpm typecheck` fails on the unmodified repo — report the failure instead of fixing app code.
- The `vercel-build` line no longer matches the excerpt above (plan 004 may have changed it) — merge the two intents carefully or stop and report.
- `pnpm/action-setup` cannot read the version from `packageManager` (error in CI log) — add `with: { version: 12.11.2 }` once; if it still fails, stop.

## Maintenance notes

- When plan 005 adds database tests (`test:db`), add a Postgres service and a
  `pnpm --filter @misri/web test:db` step to this workflow.
- Branch protection on `main` (require the CI check) is a GitHub setting the
  owner must turn on; it is not in the repo.
- The `vercel-build` checks duplicate CI on purpose: Vercel deploys even if CI
  is red, so the build must fail closed on its own.
