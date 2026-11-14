# Plan 006: Stop looking up the session on every page change and link hover

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/src/routes/__root.tsx apps/web/src/server/auth.server.ts`
> On any change, compare the excerpts below with the live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

The root route's loader calls `getSessionFn()` and has no `staleTime`, and the
router preloads every link on hover with `defaultPreloadStaleTime: 0`. So every
page change *and every link hover* runs a server function that does 2–3
sequential database round trips (Better Auth reads the session and user, then a
`chess_accounts` lookup). Better Auth's session cookie cache is off, so every
`getSession` hits Postgres. On a pool of 6 connections per instance, this is
most of the database load a visitor creates. After this plan, the root session
is reused for 60 s inside the app, and Better Auth verifies sessions from a
signed cookie for up to 5 minutes instead of querying Postgres each time.

## Current state

`apps/web/src/routes/__root.tsx` (root route options, around lines 60–72):

```ts
  loader: async ({ context }) => {
    // Avatars are looked up by username on every screen; warm them once.
    void context.queryClient.prefetchQuery(rosterAvatarsQuery)
    return { auth: await getSessionFn() }
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
```

`apps/web/src/router.tsx`:

```ts
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
```

`apps/web/src/server/auth.server.ts` (around line 128) — the `betterAuth({...})`
config starts like this and has **no `session` key**:

```ts
export const auth = betterAuth({
  appName: SITE_NAME,
  secret: requireEnv('BETTER_AUTH_SECRET'),
  baseURL: production ? requireEnv('BETTER_AUTH_URL') : process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  advanced: { ... },
  rateLimit: { ... },
```

Every flow that changes who is signed in already calls `router.invalidate()`
(passkey sign-in in `components/auth.tsx`, two-step in
`routes/auth.two-factor.tsx`, sign-out and account deletion in
`routes/_authed.account.tsx`, onboarding finish in `routes/_authed.onboarding.tsx`),
and email-link / Google sign-in do a full page load. `invalidate()` ignores
`staleTime`, so those flows still refresh the session immediately.

## Commands you will need

| Purpose   | Command (from `apps/web`) | Expected |
|-----------|---------------------------|----------|
| Typecheck | `pnpm typecheck`          | exit 0   |
| Lint      | `pnpm check`              | exit 0   |
| Tests     | `pnpm test`               | `ℹ fail 0` |
| Dev       | `pnpm dev` (needs a local DB, see README) | serves on :3005 |

## Scope

**In scope**: `apps/web/src/routes/__root.tsx` (root route options only),
`apps/web/src/server/auth.server.ts` (add a `session` key only).

**Out of scope**: `router.tsx` global preload settings (other routes rely on
fresh preloads), `_authed.tsx` (it has its own 5-minute reuse), `getSessionFn`'s
body.

## Git workflow

- Branch: `advisor/006-session-caching`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `perf(auth): reuse the session instead of querying it on every navigation`.

## Steps

### Step 1: Reuse the root session for 60 s inside the app

In the root route options in `__root.tsx`, next to `loader`, add:

```ts
  // The session rarely changes during a visit; sign-in/out flows call
  // router.invalidate(), which ignores these.
  staleTime: 60_000,
  preloadStaleTime: 60_000,
```

**Verify**: `pnpm typecheck` → exit 0 (both are valid route options in
TanStack Router; a type error means the option name is wrong — STOP).

### Step 2: Turn on Better Auth's signed cookie cache

In `auth.server.ts`, add to the `betterAuth({...})` object:

```ts
  // Verify sessions from a signed cookie for 5 minutes instead of querying
  // Postgres on every request. Trade-off: a session revoked elsewhere (sign out
  // of other devices, account deletion) keeps working up to 5 minutes there.
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
```

**Verify**: `pnpm typecheck && pnpm check && pnpm test` → all exit 0.

### Step 3: Smoke test sign-in still updates the UI

With a local database (README "Local database") and `pnpm dev` running, sign in
with an email link (without a Resend key the link prints in the terminal), then
sign out from `/account`.

**Verify**: after signing in, the top bar shows your first name immediately;
after signing out, it shows the sign-in icon immediately (no 60 s delay).

## Test plan

No unit tests — this is configuration. Step 3 is the behavioural check. If a
reviewer wants a number: in the browser devtools Network tab, hover five links
on the home page; before this change each hover produced a `_serverFn` request
for the session, after it they should not (within 60 s).

## Done criteria

- [ ] `grep -c "staleTime: 60_000" apps/web/src/routes/__root.tsx` → `1`
- [ ] `grep -c "cookieCache" apps/web/src/server/auth.server.ts` → `1`
- [ ] `pnpm typecheck`, `pnpm check`, `pnpm test` exit 0
- [ ] Step 3 smoke test passes
- [ ] Only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 3 shows a stale name or sign-in state after signing in or out — the
  invalidation assumption is wrong; revert Step 1 and report.
- `session.cookieCache` is not accepted by the installed Better Auth version (type error) — stop and report the version.

## Maintenance notes

- Any new flow that changes the signed-in user must call `router.invalidate()`
  (or reload), or it will show stale state for up to 60 s.
- If admins need instant revocation (e.g. a "ban user" feature), lower
  `cookieCache.maxAge` or disable it for that path.
- `getSessionFn` still does one `chess_accounts` query per real reload; moving
  `chessUsername` into a Better Auth `user.additionalFields` column would remove
  it — deferred, not needed yet.
