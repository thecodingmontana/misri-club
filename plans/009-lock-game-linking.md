# Plan 009: Make game-to-fixture linking safe when two runs overlap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b549bd1..HEAD -- apps/web/src/server/league.server.ts`
> On any change, compare the excerpt below with the live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-test-harness.md (for the database test)
- **Category**: bug
- **Planned at**: commit `b549bd1`, 2026-11-15

## Why this matters

`linkGamesToFixtures` attaches newly synced games to the fixture they belong
to. It reads which fixtures are taken, then updates games one by one, with no
lock. Two runs can overlap: a sync that outlives its 60 s claim plus another
instance's sync, or a sync while an admin redraws fixtures (`generateFixtures`
also calls it). If two different games between the same pair fit one fixture,
both runs pick different games for it and the second update violates the
unique index `games_fixture_idx`. The error aborts the whole sync *after* games
are inserted but *before* standings are rebuilt, so the table goes stale and the
public sync returns a 500. After this plan, linking runs inside a transaction
holding a per-season advisory lock, exactly like `recomputeStandings` already does.

## Current state

`apps/web/src/server/league.server.ts` — the whole function (around lines 452–496):

```ts
export async function linkGamesToFixtures(seasonId: number): Promise<number> {
  const openFixtures = await db.select().from(fixtures).where(and(
    eq(fixtures.seasonId, seasonId),
    isNotNull(fixtures.homePlayerId),
    isNotNull(fixtures.awayPlayerId),
  )).orderBy(asc(fixtures.matchday), asc(fixtures.leg))

  const linkedRows = await db.select({ fixtureId: games.fixtureId }).from(games)
    .where(and(eq(games.seasonId, seasonId), isNotNull(games.fixtureId)))
  const taken = new Set(linkedRows.map((row) => row.fixtureId as number))

  const unlinked = await db.select().from(games)
    .where(and(eq(games.seasonId, seasonId), isNull(games.fixtureId)))
    .orderBy(asc(games.endedAt))

  let linked = 0
  for (const game of unlinked) {
    const match = openFixtures.find((f) => !taken.has(f.id) && fitsFixture(game, f))
    if (!match) continue
    await db.update(games).set({ fixtureId: match.id }).where(eq(games.id, game.id))
    taken.add(match.id)
    linked++
  }
  return linked
}
```

`apps/web/src/db/schema.ts:136`: `uniqueIndex('games_fixture_idx').on(t.fixtureId)`.

The pattern to copy — `recomputeStandings` in the same file takes a
transaction-scoped advisory lock (safe on Supabase's transaction pooler):

```ts
  await db.transaction(async (tx) => {
    if (wait) {
      await tx.execute(sql`select pg_advisory_xact_lock(${seasonId})`)
    } else { ... }
    ... all reads and writes use tx ...
  })
```

Important: `recomputeStandings` already locks on the plain `seasonId` key. Use a
**different key space** for linking so the two don't block each other, e.g. the
two-argument form `pg_advisory_xact_lock(2, ${seasonId})` (class 2 = linking).

## Commands you will need

| Purpose   | Command (from `apps/web`) | Expected |
|-----------|---------------------------|----------|
| Typecheck | `pnpm typecheck`          | exit 0   |
| Lint      | `pnpm check`              | exit 0   |
| Unit      | `pnpm test`               | `ℹ fail 0` |
| DB test   | see plan 005 (`DATABASE_URL=…/misri_test pnpm test:db`) | `ℹ fail 0` |

## Scope

**In scope**: `linkGamesToFixtures` in `apps/web/src/server/league.server.ts`;
`apps/web/src/server/link-games.db.test.ts` (create).

**Out of scope**: `recomputeStandings`, `fitsFixture`, the sync claim timings,
the schema/index.

## Git workflow

- Branch: `advisor/009-lock-game-linking`
- Conventional Commits via commitlint, no `Co-Authored-By`. Example:
  `fix(sync): serialise game linking per season`.

## Steps

### Step 1: Wrap the body in a locked transaction

Rewrite `linkGamesToFixtures` so the whole body runs in
`db.transaction(async (tx) => { … })`, first statement
`await tx.execute(sql\`select pg_advisory_xact_lock(2, ${seasonId})\`)`, and
every `db.` inside becomes `tx.`. Return the count from the transaction. Keep
the logic otherwise identical. Add a one-line comment saying why (overlapping
syncs/redraws would pick different games for one fixture and break the unique index).

**Verify**: `pnpm typecheck && pnpm check && pnpm test` → all exit 0.

### Step 2: Database test (requires plan 005)

Create `apps/web/src/server/link-games.db.test.ts` (guard with the same
`skip` pattern as plan 005's `rate-limit.db.test.ts`). Seed: two players, one
season, one fixture between them with a window covering now, and **two** games
between them inside the window with `fixtureId` null. Call
`linkGamesToFixtures(seasonId)` twice concurrently with `Promise.all`. Assert:
neither call throws, exactly one game has `fixture_id` set to the fixture, and
the two return values sum to 1. Clean up with
`TRUNCATE games, fixtures, seasons, players RESTART IDENTITY CASCADE` in a
`beforeEach`.

**Verify**: `DATABASE_URL=postgres://postgres:misri@localhost:5434/misri_test pnpm test:db` → `ℹ fail 0`.
Optional proof: revert Step 1 temporarily — the concurrent test should fail
with a unique-violation (`games_fixture_idx`) at least some of the time.

## Test plan

Step 2. If plan 005 has not landed, do Step 1 only and mark the plan
"DONE (no DB test — plan 005 pending)" in the index.

## Done criteria

- [ ] `grep -c "pg_advisory_xact_lock(2," apps/web/src/server/league.server.ts` → `1`
- [ ] `pnpm typecheck`, `pnpm check`, `pnpm test` exit 0
- [ ] DB test passes (if plan 005 is in place)
- [ ] Only the in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `linkGamesToFixtures` is called from inside another `db.transaction` somewhere
  (`grep -rn "linkGamesToFixtures" apps/web/src`) — nested transactions need a
  different approach; stop and report.
- The concurrent DB test deadlocks or times out — stop and report.

## Maintenance notes

- `generateFixtures` deletes fixtures and then calls this; with the lock, a
  concurrent sync waits for the redraw's linking rather than racing it.
- When competitions arrive, the lock key must include the competition, not
  only the season.
