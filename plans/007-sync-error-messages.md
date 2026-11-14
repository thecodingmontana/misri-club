# Plan 007: Stop public sync from showing raw internal error text

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/src/server/sync.server.ts`
> On any change, compare the excerpts below with the live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

`syncNowFn` and `autoSyncFn` (in `apps/web/src/server/league.functions.ts`) are
deliberately public — anyone can press "Sync" — and they return the whole
`SyncResult`, including an `errors` list. Three of those errors embed
`(error as Error).message` verbatim: database/driver messages (table and
constraint names, connection failures) and internal request URLs. The client
then shows them to whoever pressed Sync, in a toast (`apps/web/src/lib/queries.ts:105-106`
joins `result.errors`). After this plan, visitors see short plain messages, and
the full detail goes to the server log only.

## Current state

`apps/web/src/server/sync.server.ts` — the `errors` array is declared at line
~66 and filled at these places:

```ts
        errors.push(`${username} is not a chess.com account; skipped.`)   // ~82 — fine, keep
      ...
      errors.push(`Roster refresh failed: ${(error as Error).message}`)   // ~85 — leaks
      ...
        errors.push(                                                       // ~106 — leaks
          `Archive list failed for ${player.username}: ${(error as Error).message}`,
        )
      ...
        errors.push(                                                       // ~135 — leaks (URL + message)
          `Archive fetch failed for ${url}: ${(error as Error).message}`,
        )
```

(Exact wording may differ slightly; find them with
`grep -n "errors.push(" apps/web/src/server/sync.server.ts`.)

The codebase logs server-side problems with `console.error('[area] …', message)`
— exemplar: `apps/web/src/server/email.server.ts`
(`console.error(\`[email] "${subject}" failed:\`, (error as Error).message)`).

## Commands you will need

| Purpose   | Command (from `apps/web`) | Expected |
|-----------|---------------------------|----------|
| Find them | `grep -n "errors.push(" src/server/sync.server.ts` | 4 lines |
| Typecheck | `pnpm typecheck`          | exit 0   |
| Lint      | `pnpm check`              | exit 0   |
| Tests     | `pnpm test`               | `ℹ fail 0` |

## Scope

**In scope**: `apps/web/src/server/sync.server.ts` (the three leaking `errors.push` sites only).

**Out of scope**: `league.functions.ts` (the endpoints stay public — a
deliberate decision), the `SyncResult` shape, `lib/queries.ts` (the toast keeps
showing `errors`; they just become safe).

## Git workflow

- Branch: `advisor/007-sync-error-messages`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `fix(sync): keep internal error detail out of public sync results`.

## Steps

### Step 1: Log the detail, return a plain message

At each of the three leaking sites, replace the push with a server log plus a
short message that contains no `error.message` and no URL:

```ts
console.error('[sync] roster refresh failed:', (error as Error).message)
errors.push('Couldn’t refresh the club roster from chess.com.')
```
```ts
console.error(`[sync] archive list failed for ${player.username}:`, (error as Error).message)
errors.push(`Couldn’t read ${player.username}’s games from chess.com.`)
```
```ts
console.error(`[sync] archive fetch failed for ${url}:`, (error as Error).message)
errors.push('Couldn’t read one month of games from chess.com.')
```

Leave the "not a chess.com account" message as it is.

**Verify**: `grep -n "errors.push(.*error as Error\|errors.push(.*\${url}" src/server/sync.server.ts` → no output;
`grep -c "console.error('\[sync\]\|console.error(\`\[sync\]" src/server/sync.server.ts` → `3`.

### Step 2: Checks

**Verify**: `pnpm typecheck && pnpm check && pnpm test` → all exit 0.

## Test plan

No unit test: `sync.server.ts` imports the database client and can't be
unit-tested until plan 005 (and the extraction in plan 010) land. The grep
checks in Step 1 are the regression guard.

## Done criteria

- [ ] No `errors.push` in `sync.server.ts` contains `error as Error` or `${url}`
- [ ] Three `[sync]` `console.error` calls exist
- [ ] `pnpm typecheck`, `pnpm check`, `pnpm test` exit 0
- [ ] Only `apps/web/src/server/sync.server.ts` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- There are more than four `errors.push` sites, or another site embeds an error
  message — include it with the same pattern only if it's in `sync.server.ts`;
  otherwise stop and report.

## Maintenance notes

- New error paths in sync must follow the same rule: detail to `console.error`,
  plain text to `errors`.
- If admins need the detail in the UI later, return it only when the caller
  passes `adminMiddleware`, never from the public endpoints.
