import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { isTimeControl } from '#/lib/time-control'
import { userMiddleware } from './auth.functions'
import {
  getCompetition,
  getInvite,
  listMyCompetitions,
  listOpenCompetitions,
} from './competition-view.server'
import {
  checkCompetitionName,
  createCompetition,
  currentViewer,
  joinCompetition,
  rematch,
  requireChessAccount,
  seedCompetition,
  startCompetition,
  suggestCompetitionNames,
  updateCompetitionSettings,
  viewerId,
} from './competitions.server'
import {
  answerRequest,
  deleteCompetition,
  handOverCompetition,
  leaveCompetition,
  newInviteCode,
  removePlayer,
  renameCompetition,
} from './membership.server'
import { getPlayer } from './player.server'
import { takeAllowance } from './rate-limit.server'
import {
  answerReport,
  concedeMatch,
  decideMatch,
  openEarlyRound,
  reportResult,
  syncForPlayer,
} from './results.server'
import {
  isTieBreakOrder,
  POINTS,
  type TieBreak,
  UNPLAYED_RULES,
} from './standings'

/** The daily cron runs at 05:00 UTC: a start day means that morning's run. */
function startDay(day: string) {
  const at = new Date(`${day}T05:00:00Z`)
  if (Number.isNaN(at.getTime())) throw new Error('Pick a real date.')
  const today = new Date().toISOString().slice(0, 10)
  if (day <= today) throw new Error('Pick a day from tomorrow on.')
  return at
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const slug = z.string().trim().min(1).max(80)
const point = z.number().int().min(-10).max(10)
const maxPlayers = z.number().int().min(2).max(256)
const timeControl = z
  .string()
  .max(20)
  .refine(isTimeControl, 'Pick a time control from the list.')
const scoring = {
  unplayedRule: z.enum(UNPLAYED_RULES).default('organiser'),
  leaveRule: z.enum(['award', 'void', 'keep']).default('award'),
  maxPlayers: maxPlayers.nullable().default(null),
  requireApproval: z.boolean().default(false),
  points: z
    .object({ win: point, draw: point, loss: point, forfeit: point })
    .default(POINTS),
}
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/, 'Invite codes are 8 letters and numbers.')

async function allow(kind: string, userId: string) {
  if (!(await takeAllowance(`${kind}:${userId}`, 1, 10, HOUR))) {
    throw new Error('Too many tries. Wait an hour and try again.')
  }
}

export const createCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      name: z.string().trim().min(1, 'Give it a name.').max(60),
      format: z.enum(['league', 'knockout', 'challenge', 'groups']),
      groupCount: z
        .union([z.literal(2), z.literal(4), z.literal(8)])
        .default(2),
      advancing: z.union([z.literal(1), z.literal(2)]).default(2),
      legs: z.union([z.literal(1), z.literal(2)]).default(1),
      bestOf: z
        .union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)])
        .default(1),
      matchdayDays: z.number().int().min(1).max(14).default(2),
      visibility: z.enum(['public', 'private']).default('private'),
      allowLateEntry: z.boolean().default(false),
      timeControl: timeControl.default('any'),
      ...scoring,
    }),
  )
  .handler(async ({ context, data }) => {
    await requireChessAccount(context.user.id)
    await allow('competition-create', context.user.id)
    return { slug: await createCompetition(context.user.id, data) }
  })

async function allowNameLookup(userId: string) {
  if (!(await takeAllowance(`competition-name:${userId}`, 1, 60, MINUTE))) {
    throw new Error('Too many tries. Wait a minute and try again.')
  }
}

/** Is this name free? When not, three free ones close to it. */
export const checkCompetitionNameFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ name: z.string().trim().min(3).max(60) }))
  .handler(async ({ context, data }) => {
    await allowNameLookup(context.user.id)
    return checkCompetitionName(data.name)
  })

/** Three free chess-themed names. */
export const suggestCompetitionNamesFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => {
    await allowNameLookup(context.user.id)
    return suggestCompetitionNames()
  })

/** Join by invite code, or by slug when the competition is public. */
export const joinCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.union([z.object({ code }), z.object({ slug })]))
  .handler(async ({ context, data }) => {
    await requireChessAccount(context.user.id)
    await allow('competition-join', context.user.id)
    return joinCompetition(context.user.id, data)
  })

export const getMyCompetitionsFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(({ context }) => listMyCompetitions(context.user.id))

/** Public competitions you could join now (leaving out ones you're in). */
export const getOpenCompetitionsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    return listOpenCompetitions(await viewerId())
  },
)

export const getCompetitionFn = createServerFn({ method: 'GET' })
  .validator(z.object({ slug }))
  .handler(async ({ data }) => {
    return getCompetition(data.slug, await currentViewer())
  })

/** What an invite link points at; null for an unknown code. */
export const getInviteFn = createServerFn({ method: 'GET' })
  .validator(z.object({ code: z.string().trim().toUpperCase().max(16) }))
  .handler(async ({ data }) => getInvite(data.code, await viewerId()))

export const startCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug }))
  .handler(async ({ context, data }) => {
    await startCompetition(data.slug, context.viewer)
    return { ok: true }
  })

/** A finished challenge, again: same settings, the opponent is invited. */
export const rematchFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug }))
  .handler(async ({ context, data }) => {
    await requireChessAccount(context.user.id)
    await allow('competition-create', context.user.id)
    return { slug: await rematch(data.slug, context.user.id) }
  })

/** The organiser orders a knockout's players before the start. */
export const seedCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      // the player ids top seed first, or "rating" to sort by chess.com rating
      order: z.union([
        z.array(z.string().min(1).max(16)).max(256),
        z.literal('rating'),
      ]),
    }),
  )
  .handler(async ({ context, data }) => {
    // rating seeding asks chess.com about every player
    if (
      data.order === 'rating' &&
      !(await takeAllowance(`seed-rating:${context.user.id}`, 1, 10, HOUR))
    ) {
      throw new Error('Too many tries. Wait an hour and try again.')
    }
    await seedCompetition(data.slug, context.viewer, data.order)
    return { ok: true }
  })

/** A player gives their opponent the walkover for one of their matches. */
export const concedeMatchFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug, matchId: z.string().min(1).max(16) }))
  .handler(async ({ context, data }) => {
    if (!(await takeAllowance(`concede:${context.user.id}`, 1, 20, HOUR))) {
      throw new Error('Too many tries. Wait an hour and try again.')
    }
    await concedeMatch(data.slug, context.viewer, data.matchId)
    return { ok: true }
  })

/** The organiser opens the next league round now: everyone has played. */
export const openEarlyRoundFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug }))
  .handler(async ({ context, data }) => {
    return { round: await openEarlyRound(data.slug, context.viewer) }
  })

export const updateCompetitionSettingsFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      visibility: z.enum(['public', 'private']),
      allowLateEntry: z.boolean(),
      unplayedRule: z.enum(UNPLAYED_RULES),
      leaveRule: z.enum(['award', 'void', 'keep']),
      maxPlayers: maxPlayers.nullable(),
      requireApproval: z.boolean(),
      points: scoring.points.unwrap(),
      earlyRounds: z.enum(['wait', 'auto', 'organiser']),
      timeControl,
      tieBreaks: z
        .array(z.string())
        .refine(isTieBreakOrder, 'Order all three tie-breaks.'),
      // a day, YYYY-MM-DD; null clears it
      startsOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { slug, startsOn, ...rest } = data
    const startsAt = startsOn ? startDay(startsOn) : null
    const settings = {
      ...rest,
      tieBreaks: rest.tieBreaks as TieBreak[],
      startsAt,
    }
    await updateCompetitionSettings(slug, context.viewer, settings)
    return { ok: true }
  })

export const leaveCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug }))
  .handler(async ({ context, data }) => {
    await leaveCompetition(data.slug, context.viewer)
    return { ok: true }
  })

export const handOverCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug, toUserId: z.string().min(1).max(16) }))
  .handler(async ({ context, data }) => {
    await handOverCompetition(data.slug, context.viewer, data.toUserId)
    return { ok: true }
  })

export const deleteCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug, confirmName: z.string().max(80) }))
  .handler(async ({ context, data }) => {
    await deleteCompetition(data.slug, context.viewer, data.confirmName)
    return { ok: true }
  })

const decision = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('result'),
    result: z.enum(['white', 'black', 'draw']),
    homeWhite: z.boolean(),
  }),
  z.object({ kind: z.literal('walkover'), winnerUserId: z.string().max(16) }),
  z.object({ kind: z.literal('void') }),
  z.object({
    kind: z.literal('extend'),
    days: z.number().int().min(1).max(14),
  }),
  z.object({ kind: z.literal('reopen') }),
])

/** The organiser settles one match (result, walkover, call off, more time, reopen). */
export const decideMatchFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      matchId: z.string().min(1).max(16),
      decision,
      note: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await decideMatch(
      data.slug,
      context.viewer,
      data.matchId,
      data.decision,
      data.note || null,
    )
    return { ok: true }
  })

export const removePlayerFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug, userId: z.string().min(1).max(16) }))
  .handler(async ({ context, data }) => {
    await removePlayer(data.slug, context.viewer, data.userId)
    return { ok: true }
  })

export const renameCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      name: z.string().trim().min(1, 'Give it a name.').max(60),
    }),
  )
  .handler(async ({ context, data }) => {
    await renameCompetition(data.slug, context.viewer, data.name)
    return { ok: true }
  })

export const newInviteCodeFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug }))
  .handler(async ({ context, data }) => ({
    inviteCode: await newInviteCode(data.slug, context.viewer),
  }))

export const answerRequestFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({ slug, userId: z.string().min(1).max(16), approve: z.boolean() }),
  )
  .handler(async ({ context, data }) => {
    await answerRequest(data.slug, context.viewer, data.userId, data.approve)
    return { ok: true }
  })

/** Background refresh from any page: new chess.com results for my competitions. */
export const syncMineFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(async ({ context }) => ({
    changed: await syncForPlayer(context.user.id),
  }))

/** A player's page, by chess.com username; signed-in players only. */
export const getPlayerFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ username: z.string().trim().min(1).max(40) }))
  .handler(({ context, data }) => getPlayer(data.username, context.viewer))

/** A player reports how their game went; the opponent confirms it. */
export const reportResultFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      matchId: z.string().min(1).max(16),
      outcome: z.enum(['win', 'draw', 'loss']),
      white: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await allow('result-report', context.user.id)
    await reportResult(
      data.slug,
      context.viewer,
      data.matchId,
      data.outcome,
      data.white,
    )
    return { ok: true }
  })

/** The opponent confirms (it counts) or disputes (the organiser settles) a report. */
export const answerReportFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      matchId: z.string().min(1).max(16),
      accept: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    await answerReport(data.slug, context.viewer, data.matchId, data.accept)
    return { ok: true }
  })
