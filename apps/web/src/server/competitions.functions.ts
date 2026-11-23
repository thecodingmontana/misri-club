import { competitionNameCheck, competitionNameIdeas } from '@misri/core/account'
import { actions } from '@misri/core/actions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { apiClient, perform } from './api-client.server'
import { userMiddleware } from './auth.functions'
import {
  getCompetition,
  getInvite,
  listMyCompetitions,
  listOpenCompetitions,
} from './competition-view.server'
import { currentViewer, viewerId } from './competitions.server'
import { getPlayer } from './player.server'

// Writes are the shared actions (packages/core/src/actions.ts): the same
// checks and limits here and in the API, which runs them when it's set up.

const slug = z.string().trim().min(1).max(80)

export const createCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.createCompetition.input)
  .handler(({ context, data }) =>
    perform('createCompetition', context.viewer, data),
  )

/** Is this name free? When not, three free ones close to it. */
export const checkCompetitionNameFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ name: z.string().trim().min(3).max(60) }))
  .handler(
    ({ context, data }) =>
      apiClient()?.competitionNameCheck(data.name) ??
      competitionNameCheck(context.user.id, data.name),
  )

/** Three free chess-themed names. */
export const suggestCompetitionNamesFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(
    ({ context }) =>
      apiClient()?.competitionNameIdeas() ??
      competitionNameIdeas(context.user.id),
  )

/** Join by invite code, or by slug when the competition is public. */
export const joinCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.joinCompetition.input)
  .handler(({ context, data }) =>
    perform('joinCompetition', context.viewer, data),
  )

export const getMyCompetitionsFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .handler(
    ({ context }) =>
      apiClient()?.myCompetitions() ?? listMyCompetitions(context.user.id),
  )

/** Public competitions you could join now (leaving out ones you're in). */
export const getOpenCompetitionsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    return (
      apiClient()?.openCompetitions() ?? listOpenCompetitions(await viewerId())
    )
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
  .handler(
    async ({ data }) =>
      apiClient()?.invite(data.code) ?? getInvite(data.code, await viewerId()),
  )

export const startCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.startCompetition.input)
  .handler(({ context, data }) =>
    perform('startCompetition', context.viewer, data),
  )

/** A finished challenge, again: same settings, the opponent is invited. */
export const rematchFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.rematch.input)
  .handler(({ context, data }) => perform('rematch', context.viewer, data))

/** The organiser orders a knockout's players before the start. */
export const seedCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.seedCompetition.input)
  .handler(({ context, data }) =>
    perform('seedCompetition', context.viewer, data),
  )

/** A player gives their opponent the walkover for one of their matches. */
export const concedeMatchFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.concedeMatch.input)
  .handler(({ context, data }) => perform('concedeMatch', context.viewer, data))

/** The organiser opens the next league round now: everyone has played. */
export const openEarlyRoundFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.openEarlyRound.input)
  .handler(({ context, data }) =>
    perform('openEarlyRound', context.viewer, data),
  )

export const updateCompetitionSettingsFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.updateCompetitionSettings.input)
  .handler(({ context, data }) =>
    perform('updateCompetitionSettings', context.viewer, data),
  )

export const leaveCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.leaveCompetition.input)
  .handler(({ context, data }) =>
    perform('leaveCompetition', context.viewer, data),
  )

export const handOverCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.handOverCompetition.input)
  .handler(({ context, data }) =>
    perform('handOverCompetition', context.viewer, data),
  )

export const deleteCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.deleteCompetition.input)
  .handler(({ context, data }) =>
    perform('deleteCompetition', context.viewer, data),
  )

/** The organiser settles one match (result, walkover, call off, more time, reopen). */
export const decideMatchFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.decideMatch.input)
  .handler(({ context, data }) => perform('decideMatch', context.viewer, data))

export const removePlayerFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.removePlayer.input)
  .handler(({ context, data }) => perform('removePlayer', context.viewer, data))

export const renameCompetitionFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.renameCompetition.input)
  .handler(({ context, data }) =>
    perform('renameCompetition', context.viewer, data),
  )

export const newInviteCodeFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.newInviteCode.input)
  .handler(({ context, data }) =>
    perform('newInviteCode', context.viewer, data),
  )

export const answerRequestFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.answerRequest.input)
  .handler(({ context, data }) =>
    perform('answerRequest', context.viewer, data),
  )

/** Background refresh from any page: new chess.com results for my competitions. */
export const syncMineFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .handler(({ context }) => perform('syncMine', context.viewer, {}))

/** A player's page, by chess.com username; signed-in players only. */
export const getPlayerFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ username: z.string().trim().min(1).max(40) }))
  .handler(
    ({ context, data }) =>
      apiClient()?.player(data.username) ??
      getPlayer(data.username, context.viewer),
  )

/** A player reports how their game went; the opponent confirms it. */
export const reportResultFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.reportResult.input)
  .handler(({ context, data }) => perform('reportResult', context.viewer, data))

/** The opponent confirms (it counts) or disputes (the organiser settles) a report. */
export const answerReportFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.answerReport.input)
  .handler(({ context, data }) => perform('answerReport', context.viewer, data))
