import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { db } from '@misri/db/client'
import {
  chessAccounts,
  competitionMembers,
  competitions,
  notifications,
  user,
} from '@misri/db/schema'
import { inArray } from 'drizzle-orm'
import { graphql } from 'graphql'
import { schema } from '../src/graphql.ts'

// Against a real database (pnpm test:db): the API's reads follow the app's access rules.
const tag = Math.random().toString(36).slice(2, 10)
const [o, a] = [`g${tag}o`, `g${tag}a`]
const slug = `api-${tag}`

after(async () => {
  await db.delete(user).where(inArray(user.id, [o, a]))
  process.exit(0)
})

const v = (id: string) => ({ id, isAdmin: false })
const ask = (source: string, viewer: { id: string; isAdmin: boolean } | null) =>
  graphql({ schema, source, contextValue: { viewer } })

test('the same reads and the same access rules as the app', async () => {
  await db
    .insert(user)
    .values([o, a].map((id) => ({ id, name: id, email: `${id}@test.local` })))
  await db.insert(chessAccounts).values(
    [o, a].map((userId) => ({
      userId,
      username: userId,
      verifiedAt: new Date(),
    })),
  )
  const [c] = await db
    .insert(competitions)
    .values({
      slug,
      name: `API ${tag}`,
      nameKey: `api ${tag}`,
      format: 'league',
      ownerId: o,
      inviteCode: `INV${tag.toUpperCase()}`,
      visibility: 'private',
      points: { win: 3, draw: 1, loss: 0, forfeit: 0 },
      tieBreaks: [],
    })
    .returning({ id: competitions.id })
  await db
    .insert(competitionMembers)
    .values([o, a].map((userId) => ({ competitionId: c.id, userId })))

  const mine = await ask(
    '{ me { id chessUsername } myCompetitions { slug members format legs allowLateEntry } }',
    v(a),
  )
  assert.equal(mine.errors, undefined)
  const data = mine.data as {
    me: { id: string; chessUsername: string }
    myCompetitions: Array<{ slug: string; members: number }>
  }
  assert.equal(data.me.id, a)
  assert.equal(data.me.chessUsername, a)
  assert.ok(data.myCompetitions.some((m) => m.slug === slug && m.members === 2))

  // signed out: no "me", no private lists, and a private competition shows no players
  const out = await ask(`{ me { id } competition(slug: "${slug}") }`, null)
  assert.equal((out.data as { me: null }).me, null)
  const page = (
    out.data as {
      competition: {
        members: unknown[]
        competition: { inviteCode: string | null }
      }
    }
  ).competition
  assert.equal(page.members.length, 0, 'invite-only details stay hidden')
  assert.equal(page.competition.inviteCode, null)
  const refused = await ask('{ myCompetitions { slug } }', null)
  assert.match(String(refused.errors?.[0]?.message), /Sign in first/)

  // a member sees the players; only the organiser sees the invite code
  const inside = (await ask(`{ competition(slug: "${slug}") }`, v(a))).data as {
    competition: {
      members: unknown[]
      competition: { inviteCode: string | null }
    }
  }
  assert.equal(inside.competition.members.length, 2)
  assert.equal(inside.competition.competition.inviteCode, null)
  const owner = (await ask(`{ competition(slug: "${slug}") }`, v(o))).data as {
    competition: { competition: { inviteCode: string } }
  }
  assert.equal(
    owner.competition.competition.inviteCode,
    `INV${tag.toUpperCase()}`,
  )

  const player = await ask(`{ player(username: "${o}") }`, v(a))
  assert.equal(
    (player.data as { player: { player: { name: string } } }).player.player
      .name,
    o,
  )
})

test('writes: signed in only, checked inputs, the same rules as the app', async () => {
  const rename = (name: string) =>
    `mutation { renameCompetition(input: { slug: "${slug}", name: "${name}" }) }`
  const out = await ask(rename('Signed out'), null)
  assert.match(String(out.errors?.[0]?.message), /Sign in first/)

  const bad = await ask(rename(''), v(o))
  assert.match(
    String(bad.errors?.[0]?.message),
    /Give it a name/,
    'the input check speaks',
  )

  const notOwner = await ask(rename(`By ${tag} a`), v(a))
  assert.ok(
    notOwner.errors?.length,
    'a player who is not the organiser is refused',
  )
  assert.doesNotMatch(String(notOwner.errors?.[0]?.message), /Unexpected error/)

  const done = await ask(rename(`Renamed ${tag}`), v(o))
  assert.equal(done.errors, undefined)
  assert.deepEqual(
    (done.data as { renameCompetition: unknown }).renameCompetition,
    { ok: true },
  )
  const [row] = await db
    .select({ name: competitions.name })
    .from(competitions)
    .where(inArray(competitions.slug, [slug]))
  assert.equal(row.name, `Renamed ${tag}`)
})

test("the player's own things: account, inbox, onboarding, invite, names", async () => {
  const out = await ask('{ chessAccount unreadCount }', null)
  assert.match(String(out.errors?.[0]?.message), /Sign in first/)
  const preview = await ask(`{ invite(code: "inv${tag}") }`, null)
  assert.equal(
    (preview.data as { invite: { slug: string } }).invite.slug,
    slug,
    'an invite shows signed out',
  )

  await db
    .insert(notifications)
    .values({ userId: a, title: `Hello ${tag}`, url: '/' })
  const mine = await ask('{ chessAccount inbox unreadCount }', v(a))
  assert.equal(mine.errors, undefined)
  const data = mine.data as {
    chessAccount: { status: string; username: string }
    inbox: Array<{ title: string }>
    unreadCount: number
  }
  assert.equal(data.chessAccount.status, 'verified')
  assert.equal(data.chessAccount.username, a)
  assert.equal(data.inbox[0].title, `Hello ${tag}`)
  assert.equal(data.unreadCount, 1)

  assert.equal(
    (await ask('mutation { markInboxRead }', v(a))).errors,
    undefined,
  )
  assert.equal(
    ((await ask('{ unreadCount }', v(a))).data as { unreadCount: number })
      .unreadCount,
    0,
  )

  assert.equal(
    (await ask('mutation { skipOnboarding }', v(a))).errors,
    undefined,
  )
  const [row] = await db
    .select({ onboardedAt: user.onboardedAt })
    .from(user)
    .where(inArray(user.id, [a]))
  assert.ok(row.onboardedAt, 'onboarding marked done')

  const taken = (
    await ask(`{ competitionNameCheck(name: "Renamed ${tag}") }`, v(a))
  ).data as { competitionNameCheck: { available: boolean } }
  assert.equal(taken.competitionNameCheck.available, false)
  const ideas = (await ask('{ competitionNameIdeas }', v(a))).data as {
    competitionNameIdeas: string[]
  }
  assert.equal(ideas.competitionNameIdeas.length, 3)
})

test('saved analysis: kept per player, checked on the way in', async () => {
  const url = `https://www.chess.com/game/live/${tag}`
  const save = (scores: string, who: string) =>
    ask(
      `mutation { saveAnalysis(input: { url: "${url}", scores: ${scores} }) }`,
      v(who),
    )
  const first = await save('[{ cp: 30, best: "e2e4" }, { mate: -3 }]', a)
  assert.equal(first.errors, undefined)

  const read = (who: string) =>
    ask(
      `{ savedAnalyses(urls: ["${url}", "https://www.chess.com/game/live/none"]) }`,
      v(who),
    )
  const mine = (await read(a)).data as {
    savedAnalyses: Record<string, unknown>
  }
  assert.deepEqual(mine.savedAnalyses, {
    [url]: [{ cp: 30, best: 'e2e4' }, { mate: -3 }],
  })
  const theirs = (await read(o)).data as {
    savedAnalyses: Record<string, unknown>
  }
  assert.deepEqual(theirs.savedAnalyses, {}, "another player doesn't see yours")

  // saving again replaces, never duplicates
  assert.equal((await save('[{ cp: 10 }]', a)).errors, undefined)
  const again = (await read(a)).data as {
    savedAnalyses: Record<string, unknown>
  }
  assert.deepEqual(again.savedAnalyses[url], [{ cp: 10 }])

  const bad = await save('[{ eval: "lots" }]', a)
  assert.ok(bad.errors?.length, 'a score that is not a score is refused')
  assert.doesNotMatch(String(bad.errors?.[0]?.message), /Unexpected error/)
  const out = await ask(`{ savedAnalyses(urls: ["${url}"]) }`, null)
  assert.match(String(out.errors?.[0]?.message), /Sign in first/)
})
