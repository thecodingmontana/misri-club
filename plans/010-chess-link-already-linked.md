# Plan 010: Refuse a second chess.com link cleanly instead of a misleading error

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/src/server/chess-account.functions.ts`
> On any change, compare the excerpts below with the live code; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (DB test needs plans/005-test-harness.md)
- **Category**: bug
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

A player proves they own a chess.com account by putting a code in their
chess.com profile; the server then stores the link in `chess_accounts`, which
allows **one account per user** (`user_id` unique) and **one user per username**
(`username` unique). `startChessVerificationFn` only checks whether the
*username* is taken. A user who is already linked can start verifying a second
username; at the check step the insert hits the `user_id` unique key,
`onConflictDoNothing` inserts nothing, their code is deleted, and they're told
"That chess.com account was just linked to someone else" — false. The UI
normally hides the start form from linked users, but the endpoint still allows
it. After this plan, `start` refuses when the caller is already linked, with an
accurate message.

## Current state

`apps/web/src/server/chess-account.functions.ts`, inside `startChessVerificationFn`
(around lines 72–87), after the rate-limit check:

```ts
    const [owned] = await db
      .select({ userId: chessAccounts.userId })
      .from(chessAccounts)
      .where(eq(chessAccounts.username, username))
      .limit(1)
    if (owned) {
      throw new Error(
        owned.userId === context.user.id
          ? 'That account is already linked to you.'
          : 'That chess.com account is already linked to someone else.',
      )
    }
```

And in `checkChessVerificationFn` (around lines 127–141):

```ts
    const linked = await db
      .insert(chessAccounts)
      .values({ userId: context.user.id, username: pending.username, verifiedAt: new Date() })
      .onConflictDoNothing()
      .returning({ username: chessAccounts.username })
    await db.delete(verification).where(eq(verification.identifier, pendingKey(context.user.id)))
    if (linked.length === 0) {
      throw new Error('That chess.com account was just linked to someone else.')
    }
```

Imports already available in the file: `and`, `eq`, `gt` from `drizzle-orm`, `db`, `chessAccounts`.

## Commands you will need

| Purpose   | Command (from `apps/web`) | Expected |
|-----------|---------------------------|----------|
| Typecheck | `pnpm typecheck`          | exit 0   |
| Lint      | `pnpm check`              | exit 0   |
| Unit      | `pnpm test`               | `ℹ fail 0` |

## Scope

**In scope**: `apps/web/src/server/chess-account.functions.ts`.

**Out of scope**: the schema (both unique keys are correct), the UI component
`components/chess-account.tsx`, unlinking (not a feature yet).

## Git workflow

- Branch: `advisor/010-chess-link-already-linked`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `fix(auth): refuse a second chess.com link with an accurate message`.

## Steps

### Step 1: Check the caller's own link first

In `startChessVerificationFn`, before the `owned` lookup, add:

```ts
    const [mine] = await db
      .select({ username: chessAccounts.username })
      .from(chessAccounts)
      .where(eq(chessAccounts.userId, context.user.id))
      .limit(1)
    if (mine) {
      throw new Error(`You're already linked to ${mine.username} on chess.com.`)
    }
```

### Step 2: Make the check step's conflict accurate

In `checkChessVerificationFn`, change `.onConflictDoNothing()` to
`.onConflictDoNothing({ target: chessAccounts.username })`, so only a username
clash is treated as "someone else got it first". A `user_id` clash (should be
impossible after Step 1) will now throw a database error instead of a false message.

**Verify**: `pnpm typecheck && pnpm check && pnpm test` → all exit 0.

## Test plan

With plan 005 in place, add `apps/web/src/server/chess-account.db.test.ts` only
if the server function can be invoked without the TanStack runtime; if not,
skip automated tests for this plan and record "verified by review" — the change
is two small guards. (Calling `createServerFn` handlers directly needs the
Start runtime, which the test harness does not provide.)

## Done criteria

- [ ] `grep -c "already linked to \${mine.username}" apps/web/src/server/chess-account.functions.ts` → `1`
- [ ] `grep -c "onConflictDoNothing({ target: chessAccounts.username })" apps/web/src/server/chess-account.functions.ts` → `1`
- [ ] `pnpm typecheck`, `pnpm check`, `pnpm test` exit 0
- [ ] Only the in-scope file changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The UI or another caller relies on starting a second verification (e.g. a
  "change account" feature exists by now) — stop and report; this plan would block it.

## Maintenance notes

- If "change my chess.com account" becomes a feature, it needs an explicit
  unlink step (delete the row, with fresh sign-in) before `start` is allowed again.
