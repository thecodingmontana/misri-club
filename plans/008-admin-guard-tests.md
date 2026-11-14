# Plan 008: Test the admin check, and fail the build if a mutation ships without auth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/src/server/auth.functions.ts apps/web/src/server/league.functions.ts apps/web/src/server/chess-account.functions.ts`
> On any change, compare the excerpts below with the live code; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

Server functions are public HTTP endpoints; the only thing stopping a stranger
from editing fixtures, walkovers, seasons or the roster is `adminMiddleware`,
which relies on the private `isAdminEmail` check (verified email, listed in
`ADMIN_EMAILS`). Nothing tests that check, and nothing notices if someone adds a
new `POST` server function and forgets `.middleware([...])`. After this plan,
the email rule has unit tests and a static test fails if any mutating server
function lacks middleware (except the two deliberately public sync functions).

## Current state

`apps/web/src/server/auth.functions.ts:8-19`:

```ts
/**
 * Club admins are the accounts whose verified email is in `ADMIN_EMAILS`
 * (comma-separated). A bridge until each competition has its own organiser.
 */
function isAdminEmail(user: { email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return false
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(user.email.toLowerCase())
}
```

It is used by `adminMiddleware` (line ~46) and by `getSessionFn` (line ~67,
`isAdmin: user ? isAdminEmail(user) : false`). `auth.functions.ts` imports the
database client, so it cannot be imported by a unit test.

Server-function files: `apps/web/src/server/*.functions.ts` —
`auth.functions.ts`, `league.functions.ts`, `chess-account.functions.ts`.
Mutations are `createServerFn({ method: 'POST' })` followed by
`.middleware([adminMiddleware])` or `.middleware([userMiddleware])`. Two POST
functions are intentionally public: `syncNowFn` and `autoSyncFn`
(`league.functions.ts`, comment: "Deliberately public").

Test conventions: `node:test` + `node:assert/strict`, file next to the code,
relative `.ts` imports. Exemplar: `apps/web/src/lib/same-origin.test.ts`.

## Commands you will need

| Purpose   | Command (from `apps/web`)                                              | Expected |
|-----------|-------------------------------------------------------------------------|----------|
| New tests | `node --test --experimental-strip-types src/lib/admin.test.ts src/server/functions-auth.test.ts` | `ℹ fail 0` |
| All tests | `pnpm test`                                                              | `ℹ fail 0` |
| Typecheck | `pnpm typecheck`                                                         | exit 0   |
| Lint      | `pnpm check`                                                             | exit 0   |

## Scope

**In scope**:
- `apps/web/src/lib/admin.ts` (create) — the pure rule
- `apps/web/src/lib/admin.test.ts` (create)
- `apps/web/src/server/functions-auth.test.ts` (create) — the static guard
- `apps/web/src/server/auth.functions.ts` — use the extracted rule

**Out of scope**: changing who counts as an admin; the middleware logic beyond
calling the extracted function; making the sync functions private.

## Git workflow

- Branch: `advisor/008-admin-guard-tests`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `test(auth): cover the admin rule and require auth on mutations`.

## Steps

### Step 1: Extract the rule as a pure function

Create `apps/web/src/lib/admin.ts`:

```ts
/**
 * Club admins are the accounts whose verified email is in `ADMIN_EMAILS`
 * (comma-separated). A bridge until each competition has its own organiser.
 */
export function isAdminEmail(
  user: { email: string; emailVerified: boolean },
  adminEmails: string | undefined,
): boolean {
  if (!user.emailVerified) return false
  const admins = (adminEmails ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(user.email.toLowerCase())
}
```

In `auth.functions.ts`, delete the private `isAdminEmail` and its comment,
import from `#/lib/admin`, and call `isAdminEmail(user, process.env.ADMIN_EMAILS)`
at both call sites.

**Verify**: `pnpm typecheck` → exit 0; `grep -c "function isAdminEmail" src/server/auth.functions.ts` → `0`.

### Step 2: Unit tests for the rule

Create `apps/web/src/lib/admin.test.ts` covering:
- listed + verified → `true`
- listed but `emailVerified: false` → `false`
- case and whitespace: list `' Owner@Example.com , b@x.io '`, email `owner@example.com` → `true`
- not listed → `false`
- empty or `undefined` list → `false`

**Verify**: `node --test --experimental-strip-types src/lib/admin.test.ts` → `ℹ pass 5` (or one test with 5 asserts), `ℹ fail 0`.

### Step 3: Static guard over every server-function file

Create `apps/web/src/server/functions-auth.test.ts` that reads each
`src/server/*.functions.ts` file as text (`node:fs`, path relative to
`import.meta.dirname`), finds every `export const <name> = createServerFn({ method: 'POST' })`
and checks that the chain before the next `export const` contains `.middleware(`.
Fail with the function name when it doesn't, unless the name is in
`const PUBLIC = new Set(['syncNowFn', 'autoSyncFn'])`.

**Verify**: the test passes on the current code; then temporarily delete
`.middleware([adminMiddleware])` from `setWalkoverFn` in `league.functions.ts`,
re-run and confirm it fails naming `setWalkoverFn`; restore the line
(`git diff src/server/league.functions.ts` → empty).

## Test plan

Steps 2 and 3. Model both files on `src/lib/same-origin.test.ts`.

## Done criteria

- [ ] `src/lib/admin.ts`, `src/lib/admin.test.ts`, `src/server/functions-auth.test.ts` exist
- [ ] `auth.functions.ts` no longer defines `isAdminEmail` and calls the lib version twice
- [ ] `pnpm test` → `ℹ fail 0` including the new tests
- [ ] `pnpm typecheck` and `pnpm check` exit 0
- [ ] `git diff --stat` shows only the four in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The static test fails on the unmodified code for a function other than the
  two allowlisted ones — that is a real missing-auth bug; report it, do not add
  it to the allowlist.
- A server function is written in a shape the text scan can't parse (e.g. built
  from a helper) — report it rather than loosening the scan.

## Maintenance notes

- Adding a new deliberately public mutation means adding it to `PUBLIC` in the
  test — that review moment is the point of the guard.
- When competitions get their own organisers, `isAdminEmail` will be replaced by
  a per-competition check; keep it pure and tested the same way.
