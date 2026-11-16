import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { eq, inArray } from 'drizzle-orm'
import { db } from '#/db/client.server'
import {
  competitionMembers,
  competitions,
  matches,
  notifications,
  user,
} from '#/db/schema'
import { getCompetition } from '#/server/competition-view.server'
import {
  seedCompetition,
  startCompetition,
  startScheduled,
  updateCompetitionSettings,
} from '#/server/competitions.server'
import { leaveCompetition, removePlayer } from '#/server/membership.server'
import {
  concedeMatch,
  decideMatch,
  openEarlyRound,
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
  assert.ok(told.some((n) => n.title.includes("couldn't start")))
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
