# Plan 011: Only send push notifications to real browser push services

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3c1824e`, 2026-11-16

## Why this matters

When a player turns on notifications, their browser hands Misri a "push
endpoint" URL and Misri stores it. Later the server POSTs encrypted messages to
that URL (`web-push`). Today the only check is "is it an https URL", so any
signed-in user can save an arbitrary https address (an internal service,
someone else's API) and make Misri's server send requests to it, repeatedly,
by triggering notifications or the "Send a test" button. That is a
server-side request forgery (SSRF) hole.

Real browsers only issue endpoints on a handful of push-service hosts, so
restricting the host to that list closes the hole without affecting any real
user.

## Current state

- `apps/web/src/server/push.functions.ts`: server functions the Account page
  calls to save/remove a device and send a test push. Validation lives here.
- `apps/web/src/server/push.server.ts`: `sendPushes()` loads stored
  subscriptions and POSTs to each `endpoint` with `webpush.sendNotification`.
- `apps/web/src/db/schema.ts`: table `push_subscriptions`
  (`id, user_id, endpoint UNIQUE, p256dh, auth, created_at`).

Excerpt, `apps/web/src/server/push.functions.ts:17-21`:

```ts
const subscription = z.object({
  endpoint: z.string().url().startsWith('https://').max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
})
```

Excerpt, start of `sendPushes` in `apps/web/src/server/push.server.ts` (~line 34):

```ts
export async function sendPushes(messages: PushMessage[]) {
  if (!ready || messages.length === 0) return 0
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      inArray(pushSubscriptions.userId, [
        ...new Set(messages.map((m) => m.userId)),
      ]),
    )
```

Conventions to match:
- Pure logic goes in `apps/web/src/lib/*.ts` with a sibling `*.test.ts` using
  `node:test` + `node:assert/strict` and **relative `.ts` imports**
  (e.g. `import { isPushEndpoint } from './push-endpoint.ts'`). Exemplar:
  `apps/web/src/lib/access.test.ts`.
- Server code imports app modules via the `#/` alias (`#/lib/...`).
- Biome enforces style; comments explain *why* in one line.
- Conventional Commits (commitlint enforces), scope `notifications`.
  No co-author trailers.

## Commands you will need

Run from `apps/web` unless noted. If a script name differs, read
`apps/web/package.json` and use the equivalent; don't invent scripts.

| Purpose   | Command | Expected |
|-----------|---------|----------|
| Tests     | `pnpm test` | all pass |
| One file  | `node --test --experimental-strip-types src/lib/push-endpoint.test.ts` | all pass |
| Typecheck | `pnpm exec tsc --noEmit` | exit 0 |
| Lint      | `npx biome check src` | exit 0 |

## Scope

In scope:
- `apps/web/src/lib/push-endpoint.ts` (create)
- `apps/web/src/lib/push-endpoint.test.ts` (create)
- `apps/web/src/server/push.functions.ts` (validation only)
- `apps/web/src/server/push.server.ts` (skip + forget disallowed rows)

Out of scope, do not touch:
- `apps/web/public/sw.js`, `apps/web/src/components/push-device.tsx`
  (browsers already produce valid endpoints).
- Schema / migrations.
- `notifications.server.ts` and other senders.

## Git workflow
- Branch: `advisor/011-push-endpoint-allowlist`
- One commit: `fix(notifications): only send pushes to browser push services`
- Do NOT push or open a PR unless the operator said so.

## Steps

### Step 1: The allowlist check (pure function)

Create `apps/web/src/lib/push-endpoint.ts` exporting
`isPushEndpoint(url: string): boolean`. Return `true` only if ALL hold:

- `new URL(url)` parses (try/catch; failure → `false`);
- `protocol === 'https:'`;
- `username === ''`, `password === ''`, `port === ''`;
- the lower-cased hostname equals one of these, **or ends with `.` + one**:
  - `fcm.googleapis.com` (Chrome / Chromium)
  - `android.googleapis.com` (legacy Chrome endpoints)
  - `push.services.mozilla.com` (Firefox; e.g. `updates.push.services.mozilla.com`)
  - `push.apple.com` (Safari / iOS; e.g. `web.push.apple.com`)
  - `notify.windows.com` (Edge on Windows; e.g. `wns2-par02p.notify.windows.com`)

Keep the list in one exported `const PUSH_HOSTS` with a one-line comment:
browsers only issue endpoints on these hosts. Match with
`host === allowed || host.endsWith('.' + allowed)`, never `includes`.

### Step 2: Test it

Create `apps/web/src/lib/push-endpoint.test.ts` (pattern:
`src/lib/access.test.ts`). One `test(...)` each:

1. Accepts `https://fcm.googleapis.com/fcm/send/abc`.
2. Accepts `https://updates.push.services.mozilla.com/wpush/v2/abc`.
3. Accepts `https://web.push.apple.com/abc` and
   `https://wns2-par02p.notify.windows.com/w/?token=abc`.
4. Rejects `http://fcm.googleapis.com/fcm/send/abc`.
5. Rejects `https://example.com/push`, `https://169.254.169.254/latest`,
   `https://localhost/x`.
6. Rejects look-alikes `https://fcm.googleapis.com.evil.com/x` and
   `https://evilfcm.googleapis.com/x`.
7. Rejects `https://user:pass@fcm.googleapis.com/x` and
   `https://fcm.googleapis.com:8443/x`.
8. Rejects `''` and `'not a url'`.

Verify: one-file command → 8+ passing.

### Step 3: Enforce on save

In `push.functions.ts`, import `{ isPushEndpoint } from '#/lib/push-endpoint'`
and change the `endpoint` field to:

```ts
endpoint: z
  .string()
  .max(1000)
  .refine(isPushEndpoint, 'That is not a browser push address.'),
```

Leave `p256dh`, `auth`, and the `removePushFn` schema alone (removing by
endpoint only deletes the caller's own rows).

Verify: typecheck → exit 0.

### Step 4: Never contact a disallowed host (rows saved before the fix)

In `sendPushes` (`push.server.ts`), right after loading `subs`:

- Split into allowed (`isPushEndpoint(s.endpoint)`) and the rest.
- If any are disallowed, delete them by id in one query
  (`db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids))`),
  in a try/catch that logs `console.error('[push] forgetting bad endpoints failed', …)`
  and carries on.
- Iterate only the allowed rows in the existing send loop.
- One-line comment: rows saved before the allowlist are forgotten, never contacted.

Verify: typecheck and biome → exit 0.

### Step 5: Full verification

`pnpm test`, `pnpm exec tsc --noEmit`, `npx biome check src` all pass.

## Test plan
- New: `src/lib/push-endpoint.test.ts` (Step 2).
- `sendPushes` imports the DB client, so it isn't unit-testable today (see
  plan 005). The change is a filter around the tested function; review by reading.

## Done criteria
- [ ] `pnpm test` exits 0 and runs the push-endpoint tests
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `npx biome check src` exits 0
- [ ] `grep -n "startsWith('https://')" src/server/push.functions.ts` → nothing
- [ ] `grep -n isPushEndpoint src/server/push.functions.ts src/server/push.server.ts` → one hit per file
- [ ] `git diff --stat` shows only Scope files

## STOP and report back if
- A real browser produces an endpoint on a host not in the list (record the
  host; never widen to a wildcard).
- `push.functions.ts` / `push.server.ts` no longer match the excerpts (drift
  since `3c1824e`).
- Typecheck or Biome errors appear outside Scope.

## Maintenance note
- A new browser push service → add its exact host suffix plus a test case;
  never fall back to "any https".
- Any future server-side fetch of a user-supplied URL should use an allowlist
  like this one, not a bare `https://` check.
