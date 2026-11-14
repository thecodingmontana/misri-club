import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { userMiddleware } from './auth.functions'
import {
  checkCompetitionName,
  createCompetition,
  currentViewer,
  getCompetition,
  getInvite,
  joinCompetition,
  listMyCompetitions,
  listOpenCompetitions,
  requireChessAccount,
  startCompetition,
  suggestCompetitionNames,
  updateCompetitionSettings,
  viewerId,
} from './competitions.server'
import { takeAllowance } from './rate-limit.server'
import { POINTS, UNPLAYED_RULES } from './standings'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const slug = z.string().trim().min(1).max(80)
const point = z.number().int().min(-10).max(10)
const scoring = {
  unplayedRule: z.enum(UNPLAYED_RULES).default('organiser'),
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
      format: z.enum(['league', 'knockout']),
      legs: z.union([z.literal(1), z.literal(2)]).default(1),
      matchdayDays: z.number().int().min(1).max(14).default(2),
      visibility: z.enum(['public', 'private']).default('private'),
      allowLateEntry: z.boolean().default(false),
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
    return { slug: await joinCompetition(context.user.id, data) }
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
  .handler(({ data }) => getInvite(data.code))

export const startCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(z.object({ slug }))
  .handler(async ({ context, data }) => {
    await startCompetition(data.slug, context.viewer)
    return { ok: true }
  })

export const updateCompetitionSettingsFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(
    z.object({
      slug,
      visibility: z.enum(['public', 'private']),
      allowLateEntry: z.boolean(),
      unplayedRule: z.enum(UNPLAYED_RULES),
      points: scoring.points.unwrap(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { slug, ...settings } = data
    await updateCompetitionSettings(slug, context.viewer, settings)
    return { ok: true }
  })
