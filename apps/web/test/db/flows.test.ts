import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { eq, inArray } from 'drizzle-orm'
import { graphql } from 'graphql'
import { db } from '#/db/client.server'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  matches,
  notifications,
  user,
} from '#/db/schema'
import {
  calendarFeed,
  calendarToken,
  userOfToken,
} from '#/server/calendar.server'
import { getCompetition } from '#/server/competition-view.server'
import { schema } from '#/server/graphql.server'
import {
  createCompetition,
  joinCompetition,
  reconcileAllFixtures,
  rematch,
  tidyLateGames,
  seedCompetition,
  startCompetition,
  startScheduled,
  updateCompetitionSettings,
} from '#/server/competitions.server'
import { getPlayer, recordOf } from '#/server/player.server'
import {
  leaveCompetition,
  refuseIfOwner,
  removePlayer,
} from '#/server/membership.server'
import { remindDeadlines } from '#/server/notifications.server'
import {
  concedeMatch,
  decideMatch,
  answerReport,
  openEarlyRound,
  reportResult,
  syncResults,
} from '#/server/results.server'

// Whole flows through the real server code on a local database (pnpm test:db).
// Each test makes its own players and competition and removes them after.

const made: string[] = []
const v = (id: string) => ({ id, isAdmin: false })
const last = (id?: string | null) => id?.slice(-1)

after(async () => {
  if (made.length) {
    await db.delete(competitions).where(inArray(competitions.ownerId, made))
    await db.delete(notifications).where(inArray(notifications.userId, made))
    await db.delete(user).where(inArray(user.id, made))
  }
  process.exit(0)
})

/** Test players play on chess.com, like real players of a chess.com competition. */
async function linkChess(ids: string[]) {
  await db
    .insert(chessAccounts)
    .values(ids.map((userId) => ({ userId, username: userId.toLowerCase(), verifiedAt: new Date() })))
    .onConflictDoNothing()
}

/** Players named by letter; the organiser is `owner` (default the first). */
async function competition(
  format: 'league' | 'knockout',
  names: string[],
  extra: Record<string, unknown> = {},
  owner = 0,
) {
  const tag = Math.random().toString(36).slice(2, 10)
  const ids = names.map((n) => `t${tag}${n}`)
  made.push(...ids)
  await db
    .insert(user)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@test.local` })))
  await linkChess(ids)
  const slug = `t-${tag}`
  const [row] = await db
    .insert(competitions)
    .values({
      name: `T ${tag}`,
      slug,
      nameKey: `t${tag}`,
      inviteCode: `T${tag}`.toUpperCase(),
      ownerId: ids[owner],
      format,
      visibility: 'private',
      ...extra,
    } as never)
    .returning()
  for (const [i, id] of ids.entries()) {
    await db.insert(competitionMembers).values({
      competitionId: row.id,
      userId: id,
      joinedAt: new Date(Date.now() + i),
    } as never)
  }
  const organiser = v(ids[owner])
  const rows = () =>
    db.select().from(matches).where(eq(matches.competitionId, row.id))
  const state = async () =>
    (await db.select().from(competitions).where(eq(competitions.id, row.id)))[0]
  return { ids, slug, row, organiser, rows, state }
}

test('knockout: a finalist who leaves crowns the opponent; then it is final', async () => {
  const c = await competition('knockout', ['o', 'a', 'b', 'c'])
  await startCompetition(c.slug, c.organiser)
  for (const m of await c.rows()) {
    await decideMatch(c.slug, c.organiser, m.id, { kind: 'walkover', winnerUserId: m.homeUserId as string }, null)
  }
  const final = (await c.rows()).find((m) => m.round === 2)
  assert.ok(final, 'the final was drawn')
  const leaver = [final.homeUserId, final.awayUserId].find((id) => id !== c.ids[0]) as string
  const other = leaver === final.homeUserId ? final.awayUserId : final.homeUserId
  await leaveCompetition(c.slug, v(leaver))
  const end = await c.state()
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, other)
  const someone = c.ids.find((id) => ![c.ids[0], leaver, other].includes(id)) as string
  await assert.rejects(removePlayer(c.slug, c.organiser, someone), /results are final/)
  const outsider = await getCompetition(c.slug, null)
  assert.equal(outsider?.competition.ownerId, '')
  assert.equal(outsider?.competition.championId, null)
  assert.equal(outsider?.members.length, 0)
})

test('knockout: a bye holder who leaves; the bye-only final moves straight on', async () => {
  const c = await competition('knockout', ['o', 'a', 'b'], {}, 2)
  await startCompetition(c.slug, c.organiser)
  const rows = await c.rows()
  const bye = rows.find((m) => m.byeUserId)
  const tie = rows.find((m) => m.homeUserId && m.awayUserId)
  assert.ok(bye && tie)
  assert.notEqual(bye.byeUserId, c.ids[2], 'a player, not the organiser, has the bye')
  await leaveCompetition(c.slug, v(bye.byeUserId as string))
  await decideMatch(c.slug, c.organiser, tie.id, { kind: 'walkover', winnerUserId: tie.homeUserId as string }, null)
  const end = await c.state()
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, tie.homeUserId)
})

test('league: removing the last unsettled player finishes it', async () => {
  const c = await competition('league', ['o', 'a', 'b'], { unplayedRule: 'organiser' }, 2)
  await startCompetition(c.slug, c.organiser)
  const gone = c.ids[0]
  for (const m of await c.rows()) {
    if (m.homeUserId && m.awayUserId && m.homeUserId !== gone && m.awayUserId !== gone) {
      await decideMatch(c.slug, c.organiser, m.id, { kind: 'result', result: 'white', homeWhite: true }, null)
    }
  }
  assert.equal((await c.state()).status, 'running')
  await removePlayer(c.slug, c.organiser, gone)
  assert.equal((await c.state()).status, 'finished')
})

test('seeding: organiser only, start pairs 1 v 4 and 2 v 3, fixed after start', async () => {
  const c = await competition('knockout', ['o', 'a', 'b', 'c'])
  await assert.rejects(seedCompetition(c.slug, v(c.ids[1]), c.ids))
  await assert.rejects(seedCompetition(c.slug, v(c.ids[1]), 'rating'))
  await assert.rejects(seedCompetition(c.slug, c.organiser, c.ids.slice(1)), /players changed/)
  const reversed = [...c.ids].reverse()
  await seedCompetition(c.slug, c.organiser, reversed)
  assert.deepEqual((await getCompetition(c.slug, c.organiser))?.members.map((m) => m.id), reversed)
  await startCompetition(c.slug, c.organiser)
  const pairs = (await c.rows()).sort((x, y) => x.position - y.position).map((m) => [last(m.homeUserId), last(m.awayUserId)])
  assert.deepEqual(pairs, [['c', 'o'], ['b', 'a']])
  await assert.rejects(seedCompetition(c.slug, c.organiser, reversed), /not started/)
})

test('early rounds: the organiser opens the next round, then it opens by itself', async () => {
  const c = await competition('league', ['o', 'a', 'b', 'c'], { earlyRounds: 'organiser' })
  await startCompetition(c.slug, c.organiser)
  const play = async (round: number) => {
    for (const m of (await c.rows()).filter((x) => x.round === round && x.homeUserId && x.awayUserId)) {
      await decideMatch(c.slug, c.organiser, m.id, { kind: 'result', result: 'white', homeWhite: true }, null)
    }
  }
  const before = (await c.rows()).filter((m) => m.round === 2)
  await assert.rejects(openEarlyRound(c.slug, c.organiser), /still to play/)
  await play(1)
  assert.equal((await getCompetition(c.slug, c.organiser))?.earlyRound, 2)
  assert.equal((await getCompetition(c.slug, v(c.ids[1])))?.earlyRound, null)
  await assert.rejects(openEarlyRound(c.slug, v(c.ids[1])))
  assert.equal(await openEarlyRound(c.slug, c.organiser), 2)
  const opened = (await c.rows()).filter((m) => m.round === 2)
  assert.ok(opened.every((m) => m.opensAt <= new Date()))
  assert.deepEqual(
    opened.map((m) => m.dueAt.getTime()).sort(),
    before.map((m) => m.dueAt.getTime()).sort(),
    'the deadline stays',
  )
  const told = await db.select().from(notifications).where(inArray(notifications.userId, c.ids))
  assert.equal(told.filter((n) => n.title.includes('Round 2')).length, 4)
  await db.update(competitions).set({ earlyRounds: 'auto' }).where(eq(competitions.id, c.row.id))
  await play(2)
  assert.ok((await c.rows()).filter((m) => m.round === 3).every((m) => m.opensAt <= new Date()))
  await play(3)
  assert.equal((await c.state()).status, 'finished')
})

test('time control: changeable before the start, fixed after', async () => {
  const c = await competition('league', ['o', 'a'], { timeControl: '180+2' })
  const settings = (timeControl: string) =>
    ({
      visibility: 'private',
      allowLateEntry: false,
      unplayedRule: 'organiser',
      leaveRule: 'award',
      maxPlayers: null,
      requireApproval: false,
      points: { win: 3, draw: 1, loss: 0, forfeit: -1 },
      earlyRounds: 'organiser',
      timeControl,
    }) as never
  await updateCompetitionSettings(c.slug, c.organiser, settings('rapid'))
  assert.equal((await c.state()).timeControl, 'rapid')
  await startCompetition(c.slug, c.organiser)
  await assert.rejects(updateCompetitionSettings(c.slug, c.organiser, settings('bullet')), /fixed once it starts/)
  await updateCompetitionSettings(c.slug, c.organiser, settings('rapid'))
})

test('scheduled start: due ones start; too few players tells the organiser and clears the date', async () => {
  const yesterday = new Date(Date.now() - 86_400_000)
  const ready = await competition('league', ['o', 'a'], { startsAt: yesterday })
  const lonely = await competition('league', ['o'], { startsAt: yesterday })
  const later = await competition('league', ['o', 'a'], { startsAt: new Date(Date.now() + 86_400_000) })
  assert.ok((await startScheduled()) >= 1)
  assert.equal((await ready.state()).status, 'running')
  const alone = await lonely.state()
  assert.equal(alone.status, 'open')
  assert.equal(alone.startsAt, null)
  assert.equal((await later.state()).status, 'open')
  const told = await db.select().from(notifications).where(eq(notifications.userId, lonely.ids[0]))
  const failed = told.find((n) => n.title.includes("couldn't start"))
  assert.ok(failed?.body?.includes('two players'), 'says the real reason')
})

test('tie-breaks: head-to-head first crowns the player who won the game between them', async () => {
  // o beats a, a beats b, b beats o: all on 3 points, one win each
  const c = await competition('league', ['o', 'a', 'b'], { tieBreaks: ['headToHead', 'wins', 'forfeits'] })
  await startCompetition(c.slug, c.organiser)
  const [o, a, b] = c.ids
  const beats: Record<string, string> = { [o]: a, [a]: b, [b]: o }
  for (const m of await c.rows()) {
    if (!m.homeUserId || !m.awayUserId) continue
    const homeWins = beats[m.homeUserId] === m.awayUserId
    await decideMatch(c.slug, c.organiser, m.id, { kind: 'result', result: homeWins ? 'white' : 'black', homeWhite: true }, null)
  }
  const end = await c.state()
  assert.equal(end.status, 'finished')
  const table = (await getCompetition(c.slug, c.organiser))?.standings?.map((r) => r.player.id)
  assert.equal(end.championUserId, table?.[0], 'the champion is the top of the table')
})

test('concede: a player hands the opponent the walkover and the bracket moves on', async () => {
  const c = await competition('knockout', ['o', 'a', 'b', 'c'])
  await startCompetition(c.slug, c.organiser)
  const [first, second] = (await c.rows()).sort((x, y) => x.position - y.position)
  const quitter = first.awayUserId as string
  const outsider = second.homeUserId as string
  await assert.rejects(concedeMatch(c.slug, v(outsider), first.id), /not playing/)
  await concedeMatch(c.slug, v(quitter), first.id)
  await assert.rejects(concedeMatch(c.slug, v(quitter), first.id), /already decided/)
  const conceded = (await c.rows()).find((m) => m.id === first.id)
  assert.equal(conceded?.winnerUserId, first.homeUserId)
  const told = await db.select().from(notifications).where(eq(notifications.userId, first.homeUserId as string))
  assert.ok(told.some((n) => n.title.includes('gave you a walkover')))
  await concedeMatch(c.slug, v(second.awayUserId as string), second.id)
  const final = (await c.rows()).find((m) => m.round === 2)
  assert.deepEqual([final?.homeUserId, final?.awayUserId], [first.homeUserId, second.homeUserId])
})

async function challenge(bestOf: number) {
  const tag = Math.random().toString(36).slice(2, 10)
  const [me, them] = [`t${tag}m`, `t${tag}t`]
  made.push(me, them)
  await db.insert(user).values([me, them].map((id) => ({ id, name: id, email: `${id}@test.local` })))
  await linkChess([me, them])
  const slug = await createCompetition(me, {
    name: `Duel ${tag}`,
    format: 'challenge',
    legs: 1,
    bestOf,
    matchdayDays: 3,
    visibility: 'public',
    allowLateEntry: false,
    unplayedRule: 'organiser',
    leaveRule: 'award',
    maxPlayers: null,
    requireApproval: true,
    points: { win: 3, draw: 1, loss: 0, forfeit: -1 },
  })
  const [row] = await db.select().from(competitions).where(eq(competitions.slug, slug))
  return { me, them, slug, row }
}

test('challenge: invite only for two, starts when the opponent joins, ends when out of reach', async () => {
  const c = await challenge(3)
  assert.equal(c.row.visibility, 'private')
  assert.equal(c.row.maxPlayers, 2)
  assert.equal(c.row.requireApproval, false)
  await joinCompetition(c.them, { code: c.row.inviteCode })
  const [started] = await db.select().from(competitions).where(eq(competitions.id, c.row.id))
  assert.equal(started.status, 'running')
  const games = (await db.select().from(matches).where(eq(matches.competitionId, c.row.id))).sort((x, y) => x.round - y.round)
  assert.equal(games.length, 3)
  assert.ok(games.every((g) => g.opensAt <= new Date()), 'all games open at once')
  const me = v(c.me)
  const iWin = (g: (typeof games)[number]) =>
    decideMatch(c.slug, me, g.id, { kind: 'result', result: g.homeUserId === c.me ? 'white' : 'black', homeWhite: true }, null)
  await iWin(games[0])
  assert.equal((await db.select().from(competitions).where(eq(competitions.id, c.row.id)))[0].status, 'running')
  await iWin(games[1])
  const [end] = await db.select().from(competitions).where(eq(competitions.id, c.row.id))
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, c.me)
  const third = (await db.select().from(matches).where(eq(matches.id, games[2].id)))[0]
  assert.equal(third.voided, true, 'the unneeded game is called off')
})

test('challenge: a drawn best of one ends level with no champion', async () => {
  const c = await challenge(1)
  await joinCompetition(c.them, { code: c.row.inviteCode })
  const [game] = await db.select().from(matches).where(eq(matches.competitionId, c.row.id))
  await decideMatch(c.slug, v(c.me), game.id, { kind: 'result', result: 'draw', homeWhite: true }, null)
  const [end] = await db.select().from(competitions).where(eq(competitions.id, c.row.id))
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, null)
  const told = await db.select().from(notifications).where(eq(notifications.userId, c.them))
  assert.ok(told.some((n) => n.title.includes('ended level')))
})

test('home & away knockout: aggregate, a decider when level, two-leg final', async () => {
  const c = await competition('knockout', ['o', 'a', 'b', 'c'], { legs: 2 })
  await startCompetition(c.slug, c.organiser)
  const r1 = await c.rows()
  assert.equal(r1.length, 4, 'two ties, two legs each')
  const tie = (position: number) =>
    r1.filter((m) => m.position === position).sort((x, y) => x.leg - y.leg)
  const homeWins = (id: string) =>
    decideMatch(c.slug, c.organiser, id, { kind: 'result', result: 'white', homeWhite: true }, null)
  const draw = (id: string) =>
    decideMatch(c.slug, c.organiser, id, { kind: 'result', result: 'draw', homeWhite: true }, null)
  const [t0l1, t0l2] = tie(0)
  const [t1l1, t1l2] = tie(1)
  assert.equal(t0l2.homeUserId, t0l1.awayUserId, 'leg 2 swaps home')
  // tie 0: a draw then the leg-1 home side wins away → they lead 1½–½
  await draw(t0l1.id)
  await decideMatch(c.slug, c.organiser, t0l2.id, { kind: 'result', result: 'black', homeWhite: true }, null)
  // tie 1: each wins at home → level → a decider appears
  await homeWins(t1l1.id)
  await homeWins(t1l2.id)
  const decider = (await c.rows()).find((m) => m.position === 1 && m.leg === 3)
  assert.ok(decider, 'a decider for the level tie')
  assert.equal((await c.rows()).some((m) => m.round === 2), false, 'no final yet')
  await homeWins(decider.id)
  const final = (await c.rows()).filter((m) => m.round === 2).sort((x, y) => x.leg - y.leg)
  assert.equal(final.length, 2, 'the final is home & away too')
  assert.deepEqual(
    new Set([final[0].homeUserId, final[0].awayUserId]),
    new Set([t0l1.homeUserId, decider.homeUserId]),
  )
  await homeWins(final[0].id)
  await draw(final[1].id)
  const end = await c.state()
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, final[0].homeUserId)
})

test('groups then knockout: snake draw, tables, cross-seeded bracket, champion', async () => {
  const c = await competition('knockout', ['o', 'a', 'b', 'd', 'e', 'f', 'g', 'h'], {
    format: 'groups',
    groupCount: 2,
    advancing: 2,
  })
  await startCompetition(c.slug, c.organiser)
  const drawn = await db
    .select({ userId: competitionMembers.userId, groupNo: competitionMembers.groupNo })
    .from(competitionMembers)
    .where(eq(competitionMembers.competitionId, c.row.id))
  const groupOf = new Map(drawn.map((m) => [m.userId, m.groupNo]))
  assert.equal(drawn.filter((m) => m.groupNo === 0).length, 4)
  assert.equal(groupOf.get(c.ids[0]), 0, 'seed 1 in group A')
  assert.equal(groupOf.get(c.ids[1]), 1, 'seed 2 in group B')
  const groupGames = (await c.rows()).filter((m) => m.groupNo !== null)
  assert.equal(groupGames.length, 12, 'a round robin of 4 in each group')
  for (const m of groupGames) {
    await decideMatch(c.slug, c.organiser, m.id, { kind: 'result', result: 'white', homeWhite: true }, null)
  }
  const knockout = (await c.rows()).filter((m) => m.groupNo === null)
  assert.equal(knockout.length, 2, 'two semi-finals')
  for (const tie of knockout) {
    assert.notEqual(groupOf.get(tie.homeUserId as string), groupOf.get(tie.awayUserId as string), 'group-mates kept apart')
  }
  await assert.rejects(
    decideMatch(c.slug, c.organiser, groupGames[0].id, { kind: 'reopen' }, null),
    /group stage is over/,
  )
  const view = await getCompetition(c.slug, c.organiser)
  assert.equal(view?.groupTables?.length, 2)
  await assert.rejects(
    decideMatch(c.slug, c.organiser, knockout[0].id, { kind: 'result', result: 'draw', homeWhite: true }, null),
    /needs a winner/,
  )
  for (const tie of knockout) {
    await decideMatch(c.slug, c.organiser, tie.id, { kind: 'walkover', winnerUserId: tie.homeUserId as string }, null)
  }
  const final = (await c.rows()).find((m) => m.groupNo === null && m.round > knockout[0].round)
  assert.ok(final, 'the final')
  await decideMatch(c.slug, c.organiser, final.id, { kind: 'walkover', winnerUserId: final.awayUserId as string }, null)
  const end = await c.state()
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, final.awayUserId)
})

test('league: a late joiner takes the byes still to come; the rest catch up in one round', async () => {
  const c = await competition('league', ['o', 'a', 'b'], { allowLateEntry: true, matchdayDays: 2 })
  await startCompetition(c.slug, c.organiser)
  const scheduled = Math.max(...(await c.rows()).map((m) => m.round))
  const byesBefore = (await c.rows()).filter((m) => m.byeUserId).length
  const [x, y] = ['x', 'y'].map((n) => `${c.ids[0].slice(0, -1)}${n}`)
  made.push(x, y)
  await db.insert(user).values([x, y].map((id) => ({ id, name: id, email: `${id}@test.local` })))
  await linkChess([x, y])

  // every pair of players has exactly one game, and nobody plays twice in a scheduled round
  const checkFixtures = async (players: string[]) => {
    const rows = await c.rows()
    const games = rows.filter((m) => m.homeUserId && m.awayUserId)
    for (const [i, p] of players.entries()) {
      for (const q of players.slice(i + 1)) {
        const between = games.filter((m) => [m.homeUserId, m.awayUserId].sort().join() === [p, q].sort().join())
        assert.equal(between.length, 1, `${p} and ${q} meet once`)
      }
    }
    // the catch-up round is one open window for everything that didn't fit
    for (const round of new Set(games.filter((m) => !m.late).map((m) => m.round))) {
      const seen = games.filter((m) => m.round === round && !m.late).flatMap((m) => [m.homeUserId, m.awayUserId])
      assert.equal(new Set(seen).size, seen.length, `nobody plays twice in round ${round}`)
    }
    return rows
  }

  await joinCompetition(x, { code: c.row.inviteCode })
  let rows = await checkFixtures([...c.ids, x])
  const xInScheduled = rows.filter((m) => m.round <= scheduled && (m.homeUserId === x || m.awayUserId === x))
  assert.ok(xInScheduled.length >= 2, 'x took the byes of the rounds still to come')
  assert.ok(rows.filter((m) => m.byeUserId).length <= byesBefore - 2, 'those byes became games')
  // every player with a new game hears about it; the joiner gets one summary
  const told = await db.select().from(notifications).where(inArray(notifications.userId, [...c.ids, x]))
  assert.equal(told.filter((n) => n.userId === x && /new games in/.test(n.title)).length, 1, 'x: one summary')
  for (const id of new Set(xInScheduled.flatMap((m) => [m.homeUserId, m.awayUserId]).filter((id) => id !== x))) {
    assert.ok(told.some((n) => n.userId === id && n.title.startsWith('New game vs')), `${id} told of the game vs x`)
  }

  await joinCompetition(y, { code: c.row.inviteCode })
  rows = await checkFixtures([...c.ids, x, y])
  const late = rows.filter((m) => m.late)
  assert.ok(late.length > 0, 'what fits nowhere catches up')
  assert.deepEqual([...new Set(late.map((m) => m.round))], [scheduled + 1], 'one catch-up round')
  assert.equal(new Set(late.map((m) => m.dueAt.getTime())).size, 1, 'one deadline')

  // the recheck refills a game that went missing
  const [dropped] = late
  await db.delete(matches).where(eq(matches.id, dropped.id))
  assert.ok((await reconcileAllFixtures()) >= 1)
  await checkFixtures([...c.ids, x, y])
  assert.equal(await reconcileAllFixtures(), 0, 'nothing left to add')
})

test('sync: chess.com failing never finishes a league; the late result then counts', async () => {
  const c = await competition('league', ['o', 'a'], { legs: 1, unplayedRule: 'both_forfeit' })
  await startCompetition(c.slug, c.organiser)
  const names = c.ids.map((id) => id.toLowerCase())
  await db.insert(chessAccounts).values(c.ids.map((userId, i) => ({ userId, username: names[i], verifiedAt: new Date() }))).onConflictDoNothing()
  const now = Date.now()
  // the only game: due an hour ago, played just before the deadline
  await db.update(matches).set({ opensAt: new Date(now - 3 * 86_400_000), dueAt: new Date(now - 3_600_000) }).where(eq(matches.competitionId, c.row.id))
  const [m] = await c.rows()
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('chess.com is down')
    }) as typeof fetch
    await syncResults(c.row.id, new Date(now))
    assert.equal((await c.state()).status, 'running', 'no forfeits on a failed fetch')

    const [home, away] = m.homeUserId === c.ids[0] ? names : [names[1], names[0]]
    const game = {
      url: `https://www.chess.com/game/live/${c.row.id}`,
      end_time: Math.floor((now - 3_700_000) / 1000),
      rules: 'chess',
      time_class: 'blitz',
      time_control: '180',
      white: { username: home, result: 'win' },
      black: { username: away, result: 'resigned' },
    }
    globalThis.fetch = (async () => Response.json({ games: [game] })) as typeof fetch
    await syncResults(c.row.id, new Date(now + 6 * 60_000))
  } finally {
    globalThis.fetch = realFetch
  }
  const end = await c.state()
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, m.homeUserId)
})

test('account deletion: refused while you own a competition others are in', async () => {
  const c = await competition('league', ['o', 'a'])
  const asUser = (id: string) => refuseIfOwner(id)
  await assert.rejects(asUser(c.ids[0]), /Hand over/)
  await asUser(c.ids[1])
  const solo = await competition('league', ['s'])
  await asUser(solo.ids[0])
})

test('reminders: a deadline just past 24 hours away is still reminded, once', async () => {
  const c = await competition('league', ['o', 'a'], { legs: 1 })
  await startCompetition(c.slug, c.organiser)
  const now = Date.now()
  // the daily cron ran a few seconds earlier than the round opened
  await db.update(matches).set({ dueAt: new Date(now + 86_400_000 + 4_000) }).where(eq(matches.competitionId, c.row.id))
  await remindDeadlines(new Date(now))
  const [m] = await c.rows()
  assert.ok(m.remindedAt, 'reminded')
  assert.equal(await remindDeadlines(new Date(now)), 0, 'not twice')
})

test('knockout: the next round opens when the last game ended, not at the sync', async () => {
  const c = await competition('knockout', ['o', 'a', 'b', 'c'])
  await startCompetition(c.slug, c.organiser)
  const names = c.ids.map((id) => id.toLowerCase())
  const nameOf = new Map(c.ids.map((id, i) => [id, names[i]]))
  await db.insert(chessAccounts).values(c.ids.map((userId, i) => ({ userId, username: names[i], verifiedAt: new Date() }))).onConflictDoNothing()
  const now = Date.now()
  await db.update(matches).set({ opensAt: new Date(now - 86_400_000) }).where(eq(matches.competitionId, c.row.id))
  const ties = await c.rows()
  // both semi-finals played; the later one ended two hours ago
  const lastEnd = Math.floor((now - 2 * 3_600_000) / 1000)
  const games = ties.map((m, i) => ({
    url: `https://www.chess.com/game/live/${c.row.id}${i}`,
    end_time: lastEnd - i * 3600,
    rules: 'chess',
    time_class: 'blitz',
    time_control: '180',
    white: { username: nameOf.get(m.homeUserId as string), result: 'win' },
    black: { username: nameOf.get(m.awayUserId as string), result: 'resigned' },
  }))
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => Response.json({ games })) as typeof fetch
    await syncResults(c.row.id, new Date(now))
  } finally {
    globalThis.fetch = realFetch
  }
  const final = (await c.rows()).find((m) => m.round === 2)
  assert.ok(final, 'the final was drawn')
  assert.equal(final.opensAt.getTime(), lastEnd * 1000)
})

test('challenge: a game the organiser already recorded never counts again', async () => {
  const c = await challenge(3)
  await joinCompetition(c.them, { code: c.row.inviteCode })
  const [me, them] = [c.me.toLowerCase(), c.them.toLowerCase()]
  await db.insert(chessAccounts).values([
    { userId: c.me, username: me, verifiedAt: new Date() },
    { userId: c.them, username: them, verifiedAt: new Date() },
  ]).onConflictDoNothing()
  const now = Date.now()
  await db.update(matches).set({ opensAt: new Date(now - 86_400_000) }).where(eq(matches.competitionId, c.row.id))
  const games = (await db.select().from(matches).where(eq(matches.competitionId, c.row.id))).sort((x, y) => x.round - y.round)
  // game 1 was played ten minutes ago; the organiser types it in by hand
  await decideMatch(c.slug, v(c.me), games[0].id, { kind: 'result', result: games[0].homeUserId === c.me ? 'white' : 'black', homeWhite: true }, null)
  const played = {
    url: `https://www.chess.com/game/live/${c.row.id}`,
    end_time: Math.floor((now - 600_000) / 1000),
    rules: 'chess',
    time_class: 'blitz',
    time_control: '180',
    white: { username: me, result: 'win' },
    black: { username: them, result: 'resigned' },
  }
  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => Response.json({ games: [played] })) as typeof fetch
    await syncResults(c.row.id, new Date(now + 6 * 60_000))
  } finally {
    globalThis.fetch = realFetch
  }
  const second = (await db.select().from(matches).where(eq(matches.id, games[1].id)))[0]
  assert.equal(second.result, null, 'not counted as game 2 as well')
  const [state] = await db.select().from(competitions).where(eq(competitions.id, c.row.id))
  assert.equal(state.status, "running")
})

test('removal before the start: the player can’t walk back in with the link', async () => {
  const c = await competition('league', ['o', 'a', 'b'], { visibility: 'public' })
  await removePlayer(c.slug, c.organiser, c.ids[1])
  await assert.rejects(joinCompetition(c.ids[1], { slug: c.slug }), /taken out/)
  // leaving on your own before the start stays reversible
  await leaveCompetition(c.slug, v(c.ids[2]))
  await joinCompetition(c.ids[2], { slug: c.slug })
})

test('rematch: a finished challenge, again, with the opponent invited', async () => {
  const c = await challenge(1)
  await assert.rejects(rematch(c.slug, c.me), /Finish this one first/)
  await joinCompetition(c.them, { code: c.row.inviteCode })
  const [game] = await db.select().from(matches).where(eq(matches.competitionId, c.row.id))
  await decideMatch(c.slug, v(c.me), game.id, { kind: 'result', result: 'draw', homeWhite: true }, null)
  await assert.rejects(rematch(c.slug, 'nobody'), /two players/)

  const again = await rematch(c.slug, c.them)
  const [row] = await db.select().from(competitions).where(eq(competitions.slug, again))
  assert.equal(row.format, 'challenge')
  assert.equal(row.ownerId, c.them)
  assert.equal(row.status, 'open')
  assert.equal(row.name, `${c.row.name} rematch`)
  const told = await db.select().from(notifications).where(eq(notifications.userId, c.me))
  assert.ok(told.some((n) => n.title.includes('wants a rematch') && n.url === `/join/${row.inviteCode}`))

  // they join from the invite and it starts, as any challenge does
  await joinCompetition(c.me, { code: row.inviteCode })
  const [started] = await db.select().from(competitions).where(eq(competitions.id, row.id))
  assert.equal(started.status, 'running')
  // a second rematch of the first gets the next free name
  const third = await rematch(c.slug, c.me)
  const [named] = await db.select().from(competitions).where(eq(competitions.slug, third))
  assert.equal(named.name, `${c.row.name} rematch 2`)
})

test('calendar: a signed link opens your open match deadlines, nobody else\'s', async () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret'
  const c = await competition('league', ['o', 'a', 'b'], { legs: 1 })
  await startCompetition(c.slug, c.organiser)
  const token = calendarToken(c.ids[0])
  assert.equal(userOfToken(token), c.ids[0])
  assert.equal(userOfToken(`${token}.ics`), c.ids[0])
  assert.equal(userOfToken(`${c.ids[1]}.${token.split('.')[1]}`), null, 'a signature only fits its user')
  assert.equal(userOfToken('junk'), null)

  const feed = await calendarFeed(c.ids[0], 'https://misri.test')
  assert.ok(feed)
  const theirs = (await c.rows()).filter(
    (m) => m.homeUserId === c.ids[0] || m.awayUserId === c.ids[0],
  )
  assert.equal(feed.match(/BEGIN:VEVENT/g)?.length, theirs.length)
  assert.ok(feed.includes(`URL:https://misri.test/c/${c.slug}`))
  assert.equal(await calendarFeed('nobody', 'https://misri.test'), null)
})

test('player page: record, head-to-head, and private competitions stay private', async () => {
  assert.deepEqual(recordOf(['win', 'draw', 'loss', 'forfeit']), { wins: 1, draws: 1, losses: 2 })
  const c = await competition('league', ['o', 'a'], { legs: 1 })
  const [o, a] = c.ids
  await db.insert(chessAccounts).values(c.ids.map((userId) => ({ userId, username: userId.toLowerCase(), verifiedAt: new Date() }))).onConflictDoNothing()
  await startCompetition(c.slug, c.organiser)
  const [m] = await c.rows()
  // o wins with white
  await decideMatch(c.slug, c.organiser, m.id, { kind: 'result', result: 'white', homeWhite: m.homeUserId === o }, null)

  const seenByA = await getPlayer(o, v(a))
  assert.ok(seenByA)
  assert.deepEqual(seenByA.record, { wins: 1, draws: 0, losses: 0 })
  assert.deepEqual(seenByA.headToHead, { wins: 1, draws: 0, losses: 0 }, 'o beat a')
  assert.equal(seenByA.titles, 1, 'o won the two-player league')
  assert.equal(seenByA.recent[0].opponentId, a)

  const outsider = `${o.slice(0, -1)}z`
  made.push(outsider)
  await db.insert(user).values({ id: outsider, name: outsider, email: `${outsider}@test.local` })
  const seenByOutsider = await getPlayer(o, v(outsider))
  assert.equal(seenByOutsider?.competitions.length, 0, 'a private league is hidden')
  assert.equal(seenByOutsider?.recent.length, 0)
  await db.update(competitions).set({ visibility: 'public' }).where(eq(competitions.id, c.row.id))
  assert.equal((await getPlayer(o, v(outsider)))?.competitions.length, 1, 'a public one shows')
  assert.equal(await getPlayer('no-such-player', v(a)), null)
})

test('reported results: the opponent confirms (it counts) or disputes (the organiser hears)', async () => {
  const c = await competition('league', ['o', 'a', 'b'], { legs: 1 }, 0)
  const [o, a, b] = c.ids
  await startCompetition(c.slug, c.organiser)
  const rows = await c.rows()
  const ab = rows.find((m) => [m.homeUserId, m.awayUserId].sort().join() === [a, b].sort().join())
  assert.ok(ab)
  await db.update(matches).set({ opensAt: new Date(Date.now() - 60_000) }).where(eq(matches.id, ab.id))

  await assert.rejects(reportResult(c.slug, v(o), ab.id, 'win', true), /two players/)
  // a says they beat b with white
  await reportResult(c.slug, v(a), ab.id, 'win', true)
  await assert.rejects(answerReport(c.slug, v(a), ab.id, true), /Only the opponent/)
  const toldB = await db.select().from(notifications).where(eq(notifications.userId, b))
  assert.ok(toldB.some((n) => n.title.includes('reported your result')))

  // b disputes: report cleared, the organiser (not in this match) hears
  await answerReport(c.slug, v(b), ab.id, false)
  let [row] = await db.select().from(matches).where(eq(matches.id, ab.id))
  assert.equal(row.report, null)
  assert.equal(row.result, null)
  const toldO = await db.select().from(notifications).where(eq(notifications.userId, o))
  assert.ok(toldO.some((n) => n.title.includes('disagree')))

  // reported again, and this time confirmed: a won with white
  await reportResult(c.slug, v(a), ab.id, 'win', true)
  await answerReport(c.slug, v(b), ab.id, true)
  ;[row] = await db.select().from(matches).where(eq(matches.id, ab.id))
  assert.equal(row.report, null)
  assert.equal(row.result, 'white')
  assert.equal(row.whiteUserId, a)
  await assert.rejects(reportResult(c.slug, v(b), ab.id, 'win', true), /already decided/)
})

test('graphql: the same reads and the same access rules as the app', async () => {
  const c = await competition('league', ['o', 'a'])
  const [o, a] = c.ids
  await db.insert(chessAccounts).values(c.ids.map((userId) => ({ userId, username: userId.toLowerCase(), verifiedAt: new Date() }))).onConflictDoNothing()
  const ask = (source: string, viewer: { id: string; isAdmin: boolean } | null) =>
    graphql({ schema, source, contextValue: { viewer } })

  const mine = await ask('{ me { id chessUsername } myCompetitions { slug members format } }', v(a))
  assert.equal(mine.errors, undefined)
  const data = mine.data as { me: { id: string; chessUsername: string }; myCompetitions: Array<{ slug: string; members: number }> }
  assert.equal(data.me.id, a)
  assert.equal(data.me.chessUsername, a.toLowerCase())
  assert.ok(data.myCompetitions.some((m) => m.slug === c.slug && m.members === 2))

  // signed out: no "me", no private lists, and a private competition shows no players
  const out = await ask(`{ me { id } competition(slug: "${c.slug}") }`, null)
  assert.equal((out.data as { me: null }).me, null)
  const page = (out.data as { competition: { members: unknown[] } }).competition
  assert.equal(page.members.length, 0, 'invite-only details stay hidden')
  const refused = await ask('{ myCompetitions { slug } }', null)
  assert.match(String(refused.errors?.[0]?.message), /Sign in first/)

  const player = await ask(`{ player(username: "${o.toLowerCase()}") }`, v(a))
  assert.equal((player.data as { player: { player: { name: string } } }).player.player.name, o.toLowerCase())
  // read-only: there is no mutation type at all
  assert.ok((await ask('mutation { x }', v(a))).errors)
})

test('tracked here: no chess.com needed, no chess.com calls, players report and it finishes', async () => {
  const tag = Math.random().toString(36).slice(2, 10)
  const [o, a] = [`m${tag}o`, `m${tag}a`]
  made.push(o, a)
  await db.insert(user).values([o, a].map((id) => ({ id, name: `Player ${id}`, email: `${id}@test.local` })))
  const slug = await createCompetition(o, {
    name: `Club ${tag}`,
    format: 'league',
    resultSource: 'manual',
    timeControl: '180',
    legs: 1,
    matchdayDays: 3,
    visibility: 'private',
    allowLateEntry: false,
    unplayedRule: 'organiser',
    leaveRule: 'award',
    maxPlayers: null,
    requireApproval: false,
    points: { win: 3, draw: 1, loss: 0, forfeit: -1 },
  })
  const [row] = await db.select().from(competitions).where(eq(competitions.slug, slug))
  assert.equal(row.resultSource, 'manual')
  assert.equal(row.timeControl, 'any', 'no time control to filter chess.com games by')
  await joinCompetition(a, { code: row.inviteCode })
  await startCompetition(slug, v(o))
  const [m] = await db.select().from(matches).where(eq(matches.competitionId, row.id))
  await db.update(matches).set({ opensAt: new Date(Date.now() - 60_000) }).where(eq(matches.id, m.id))

  const realFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('chess.com must not be called')
    }) as typeof fetch
    assert.equal(await syncResults(row.id, new Date(Date.now() + 6 * 60_000)), 0)
    await reportResult(slug, v(a), m.id, 'win', false)
    await answerReport(slug, v(o), m.id, true)
  } finally {
    globalThis.fetch = realFetch
  }
  const [end] = await db.select().from(competitions).where(eq(competitions.id, row.id))
  assert.equal(end.status, 'finished')
  assert.equal(end.championUserId, a)
  // their player page works without a chess.com name
  assert.equal((await getPlayer(a, v(o)))?.record.wins, 1)

  // but a chess.com competition still needs a linked account
  const c = await competition('league', ['x', 'y'])
  await assert.rejects(joinCompetition(a, { code: c.row.inviteCode }), /Link your chess.com account/)
})

test('tidy-up: catch-up games from before the redraw move into the byes, automatically', async () => {
  const c = await competition('league', ['o', 'a', 'b'], { allowLateEntry: true, matchdayDays: 3, legs: 1 })
  const [o, a, b] = c.ids
  await startCompetition(c.slug, c.organiser)
  const scheduled = Math.max(...(await c.rows()).map((m) => m.round))
  const lastDue = new Date(Math.max(...(await c.rows()).map((m) => m.dueAt.getTime())))

  // x joined the old way: all three games in one catch-up round
  const x = `${o.slice(0, -1)}x`
  made.push(x)
  await db.insert(user).values({ id: x, name: x, email: `${x}@test.local` })
  await linkChess([x])
  await db.insert(competitionMembers).values({ competitionId: c.row.id, userId: x })
  const startedAt = new Date(Date.now() - 3_600_000)
  await db.insert(matches).values(
    [o, a, b].map((opponent) => ({
      competitionId: c.row.id,
      round: scheduled + 1,
      homeUserId: x,
      awayUserId: opponent,
      opensAt: startedAt,
      dueAt: lastDue,
      late: true,
    })),
  )
  // one of them already has a result waiting to be confirmed: it stays put
  const xo = (await c.rows()).find((m) => m.late && m.awayUserId === o)
  assert.ok(xo)
  await db.update(matches).set({ report: { byUserId: x, result: 'white', homeWhite: true } }).where(eq(matches.id, xo.id))

  assert.equal(await tidyLateGames(c.row.id), 2)
  const rows = await c.rows()
  const stillLate = rows.filter((m) => m.late)
  assert.deepEqual(stillLate.map((m) => m.id), [xo.id], 'only the reported game is left to catch up')
  const moved = rows.filter((m) => !m.late && (m.homeUserId === x || m.awayUserId === x))
  assert.equal(moved.length, 2)
  for (const m of moved) {
    assert.ok(m.round <= scheduled, 'into a scheduled round')
    assert.ok(m.opensAt <= startedAt, 'keeps its earlier start, so a game already played still counts')
    const sameRound = rows.filter((r) => r.round === m.round && r.homeUserId && r.awayUserId)
    const players = sameRound.flatMap((r) => [r.homeUserId, r.awayUserId])
    assert.equal(new Set(players).size, players.length, 'nobody plays twice in that round')
  }
  const told = await db.select().from(notifications).where(eq(notifications.userId, x))
  assert.equal(told.filter((n) => n.title.includes('moved to round')).length, 2)
  assert.equal(await tidyLateGames(c.row.id), 0, 'nothing more to move')
})
