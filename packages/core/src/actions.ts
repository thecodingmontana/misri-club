import { z } from 'zod'
import type { Viewer } from './access.ts'
import {
  checkChessVerification,
  markInboxRead,
  removePush,
  saveAnalysis,
  savePush,
  skipOnboarding,
  startChessVerification,
  testPush,
} from './account.ts'
import { calendarPath, resetCalendarToken } from './calendar-token.ts'
import {
  createCompetition,
  joinCompetition,
  rematch,
  requireChessAccount,
  seedCompetition,
  startCompetition,
  updateCompetitionSettings,
} from './competitions.ts'
import { TryLater, UserError } from './errors.ts'
import { FCM_PREFIX } from './fcm.ts'
import {
  answerRequest,
  deleteCompetition,
  handOverCompetition,
  leaveCompetition,
  newInviteCode,
  removePlayer,
  renameCompetition,
} from './membership.ts'
import { isPushEndpoint } from './push-endpoint.ts'
import { takeAllowance } from './rate-limit.ts'
import {
  answerReport,
  concedeMatch,
  decideMatch,
  openEarlyRound,
  reportResult,
  syncForPlayer,
} from './results.ts'
import {
  isTieBreakOrder,
  POINTS,
  type TieBreak,
  UNPLAYED_RULES,
} from './standings.ts'
import { isTimeControl } from './time-control.ts'

/**
 * Every write a signed-in player can make, once: what it accepts, how often,
 * and what it does. The web app's server functions and the API's mutations
 * both run these, so their checks can't drift apart.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/** The daily cron runs at 05:00 UTC: a start day means that morning's run. */
export function startDay(day: string) {
  const at = new Date(`${day}T05:00:00Z`)
  // 30 February would quietly become 2 March: only a day that exists
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== day) {
    throw new UserError('Pick a real date.')
  }
  const today = new Date().toISOString().slice(0, 10)
  if (day <= today) throw new UserError('Pick a day from tomorrow on.')
  return at
}

const slug = z.string().trim().min(1).max(80)
const id = z.string().min(1).max(16)
const point = z.number().int().min(-10).max(10)
const maxPlayers = z.number().int().min(2).max(256)
const timeControl = z
  .string()
  .max(20)
  .refine(isTimeControl, 'Pick a time control from the list.')
const points = z.object({
  win: point,
  draw: point,
  loss: point,
  forfeit: point,
})
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/, 'Invite codes are 8 letters and numbers.')

async function allow(kind: string, userId: string, max = 10, windowMs = HOUR) {
  if (!(await takeAllowance(`${kind}:${userId}`, 1, max, windowMs))) {
    throw new TryLater('Too many tries. Wait an hour and try again.')
  }
}

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

const define = <S extends z.ZodType, O>(
  input: S,
  run: (viewer: Viewer, data: z.output<S>) => Promise<O>,
) => ({ input, run })

// names reach tables, notifications and calendar feeds: no control characters
const competitionName = z
  .string()
  .trim()
  .min(1, 'Give it a name.')
  .max(60)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing them is the point
  .refine((name) => !/[\u0000-\u001f\u007f]/.test(name), 'Use plain text.')

export const actions = {
  createCompetition: define(
    z.object({
      name: competitionName,
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
      resultSource: z.enum(['chesscom', 'manual']).default('chesscom'),
      unplayedRule: z.enum(UNPLAYED_RULES).default('organiser'),
      leaveRule: z.enum(['award', 'void', 'keep']).default('award'),
      maxPlayers: maxPlayers.nullable().default(null),
      requireApproval: z.boolean().default(false),
      points: points.default(POINTS),
    }),
    async (viewer, data) => {
      // results come from chess.com only there; a tracked competition needs no account
      if (data.resultSource === 'chesscom') await requireChessAccount(viewer.id)
      await allow('competition-create', viewer.id)
      return { slug: await createCompetition(viewer.id, data) }
    },
  ),

  /** Join by invite code, or by slug when the competition is public. */
  joinCompetition: define(
    z.union([z.object({ code }), z.object({ slug })]),
    async (viewer, data) => {
      await allow('competition-join', viewer.id)
      return joinCompetition(viewer.id, data)
    },
  ),

  startCompetition: define(z.object({ slug }), async (viewer, data) => {
    await startCompetition(data.slug, viewer)
    return { ok: true }
  }),

  /** A finished challenge, again: same settings, the opponent is invited. */
  rematch: define(z.object({ slug }), async (viewer, data) => {
    await allow('competition-create', viewer.id)
    return { slug: await rematch(data.slug, viewer.id) }
  }),

  /** The organiser orders a knockout's players before the start. */
  seedCompetition: define(
    z.object({
      slug,
      // the player ids top seed first, or "rating" to sort by chess.com rating
      order: z.union([z.array(id).max(256), z.literal('rating')]),
    }),
    async (viewer, data) => {
      // rating seeding asks chess.com about every player
      if (data.order === 'rating') await allow('seed-rating', viewer.id)
      await seedCompetition(data.slug, viewer, data.order)
      return { ok: true }
    },
  ),

  /** A player gives their opponent the walkover for one of their matches. */
  concedeMatch: define(
    z.object({ slug, matchId: id }),
    async (viewer, data) => {
      await allow('concede', viewer.id, 20)
      await concedeMatch(data.slug, viewer, data.matchId)
      return { ok: true }
    },
  ),

  /** The organiser opens the next league round now: everyone has played. */
  openEarlyRound: define(z.object({ slug }), async (viewer, data) => ({
    round: await openEarlyRound(data.slug, viewer),
  })),

  updateCompetitionSettings: define(
    z.object({
      slug,
      visibility: z.enum(['public', 'private']),
      allowLateEntry: z.boolean(),
      unplayedRule: z.enum(UNPLAYED_RULES),
      leaveRule: z.enum(['award', 'void', 'keep']),
      maxPlayers: maxPlayers.nullable(),
      requireApproval: z.boolean(),
      points,
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
    async (viewer, data) => {
      const { slug, startsOn, ...rest } = data
      await updateCompetitionSettings(slug, viewer, {
        ...rest,
        tieBreaks: rest.tieBreaks as TieBreak[],
        startsAt: startsOn ? startDay(startsOn) : null,
      })
      return { ok: true }
    },
  ),

  leaveCompetition: define(z.object({ slug }), async (viewer, data) => {
    await leaveCompetition(data.slug, viewer)
    return { ok: true }
  }),

  handOverCompetition: define(
    z.object({ slug, toUserId: id }),
    async (viewer, data) => {
      await handOverCompetition(data.slug, viewer, data.toUserId)
      return { ok: true }
    },
  ),

  deleteCompetition: define(
    z.object({ slug, confirmName: z.string().max(80) }),
    async (viewer, data) => {
      await deleteCompetition(data.slug, viewer, data.confirmName)
      return { ok: true }
    },
  ),

  /** The organiser settles one match (result, walkover, call off, more time, reopen). */
  decideMatch: define(
    z.object({
      slug,
      matchId: id,
      decision,
      note: z.string().trim().max(200).optional(),
    }),
    async (viewer, data) => {
      await decideMatch(
        data.slug,
        viewer,
        data.matchId,
        data.decision,
        data.note || null,
      )
      return { ok: true }
    },
  ),

  removePlayer: define(z.object({ slug, userId: id }), async (viewer, data) => {
    await removePlayer(data.slug, viewer, data.userId)
    return { ok: true }
  }),

  renameCompetition: define(
    z.object({
      slug,
      name: competitionName,
    }),
    async (viewer, data) => {
      await renameCompetition(data.slug, viewer, data.name)
      return { ok: true }
    },
  ),

  newInviteCode: define(z.object({ slug }), async (viewer, data) => ({
    inviteCode: await newInviteCode(data.slug, viewer),
  })),

  answerRequest: define(
    z.object({ slug, userId: id, approve: z.boolean() }),
    async (viewer, data) => {
      await answerRequest(data.slug, viewer, data.userId, data.approve)
      return { ok: true }
    },
  ),

  /** Background refresh from any page: new chess.com results for my competitions. */
  syncMine: define(z.object({}).default({}), async (viewer) => ({
    changed: await syncForPlayer(viewer.id),
  })),

  /** A player reports how their game went; the opponent confirms it. */
  reportResult: define(
    z.object({
      slug,
      matchId: id,
      outcome: z.enum(['win', 'draw', 'loss']),
      white: z.boolean(),
    }),
    async (viewer, data) => {
      await allow('result-report', viewer.id)
      await reportResult(
        data.slug,
        viewer,
        data.matchId,
        data.outcome,
        data.white,
      )
      return { ok: true }
    },
  ),

  /** The opponent confirms (it counts) or disputes (the organiser settles) a report. */
  answerReport: define(
    z.object({
      slug,
      matchId: id,
      accept: z.boolean(),
      // the report the opponent saw: a changed report must be seen again
      seen: z.object({
        result: z.enum(['white', 'black', 'draw']),
        homeWhite: z.boolean(),
      }),
    }),
    async (viewer, data) => {
      await answerReport(
        data.slug,
        viewer,
        data.matchId,
        data.accept,
        data.seen,
      )
      return { ok: true }
    },
  ),

  // --- the player's own account ---

  /** Step 1: name your chess.com account and get a code to put in your profile. */
  startChessVerification: define(
    z.object({ username: z.string().max(40) }),
    (viewer, data) => startChessVerification(viewer.id, data.username),
  ),

  /** Step 2: we read your public profile and, if the code is there, link it. */
  checkChessVerification: define(z.object({}).default({}), (viewer) =>
    checkChessVerification(viewer.id),
  ),

  /** Onboarding without chess.com: they can link it later from their account. */
  skipOnboarding: define(z.object({}).default({}), (viewer) =>
    skipOnboarding(viewer.id),
  ),

  /** Opening the inbox reads everything in it. */
  /** A new private calendar link; calendars on the old one stop updating. */
  resetCalendarLink: define(z.object({}).default({}), async (viewer) => ({
    path: calendarPath(await resetCalendarToken(viewer.id)),
  })),

  markInboxRead: define(z.object({}).default({}), (viewer) =>
    markInboxRead(viewer.id),
  ),

  /** Remembers this device for push notifications. */
  savePush: define(
    z.object({
      endpoint: z
        .string()
        .max(1000)
        .refine(isPushEndpoint, 'That is not a browser push address.'),
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(100),
    }),
    (viewer, data) => savePush(viewer.id, data, viewer.sessionId),
  ),

  /** Remembers this Android app install for notifications (its FCM token). */
  saveAppPush: define(
    z.object({
      token: z
        .string()
        .min(20)
        .max(400)
        .regex(/^[\w:.-]+$/),
    }),
    (viewer, data) =>
      savePush(
        viewer.id,
        { endpoint: `${FCM_PREFIX}${data.token}`, p256dh: 'fcm', auth: 'fcm' },
        viewer.sessionId,
      ),
  ),

  removePush: define(
    z.object({ endpoint: z.string().max(1000) }),
    (viewer, data) => removePush(viewer.id, data.endpoint),
  ),

  /** Keeps one game's engine analysis with the account, for the player's other devices. */
  saveAnalysis: define(
    z.object({
      url: z.string().url().max(300),
      // one score per position; even a 300-move game stays under 700
      scores: z
        .array(
          z.union([
            z.object({
              cp: z.number().int().min(-100_000).max(100_000),
              best: z.string().max(8).optional(),
            }),
            z.object({
              mate: z.number().int().min(-500).max(500),
              best: z.string().max(8).optional(),
            }),
          ]),
        )
        .min(1)
        .max(700),
    }),
    (viewer, data) => saveAnalysis(viewer.id, data.url, data.scores),
  ),

  /** A test notification to every device of the player. */
  testPush: define(z.object({}).default({}), (viewer) => testPush(viewer.id)),
}

export type Actions = typeof actions
export type ActionName = keyof Actions
export type ActionInput<N extends ActionName> = z.input<Actions[N]['input']>
export type ActionResult<N extends ActionName> = Awaited<
  ReturnType<Actions[N]['run']>
>

/** Validates then runs one action; a bad input throws its first message. */
export async function runAction<N extends ActionName>(
  name: N,
  viewer: Viewer,
  input: unknown,
): Promise<ActionResult<N>> {
  const action = actions[name]
  const parsed = action.input.safeParse(input ?? {})
  if (!parsed.success) {
    throw new UserError(parsed.error.issues[0]?.message ?? 'Check your input.')
  }
  return (action.run as (v: Viewer, d: unknown) => Promise<ActionResult<N>>)(
    viewer,
    parsed.data,
  )
}
