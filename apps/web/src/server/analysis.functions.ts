import { MAX_ANALYSES, savedAnalyses } from '@misri/core/account'
import { actions } from '@misri/core/actions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { apiClient, perform } from './api-client.server'
import { userMiddleware } from './auth.functions'

/** Engine scores you saved for these games, by game link (MIS-59). */
export const getSavedAnalysesFn = createServerFn({ method: 'GET' })
  .middleware([userMiddleware])
  .validator(z.object({ urls: z.array(z.string().max(300)).max(MAX_ANALYSES) }))
  .handler(
    ({ context, data }) =>
      apiClient()?.savedAnalyses(data.urls) ??
      savedAnalyses(context.user.id, data.urls),
  )

/** Keeps one game's engine scores with your account, for your other devices. */
export const saveAnalysisFn = createServerFn({ method: 'POST' })
  .middleware([userMiddleware])
  .validator(actions.saveAnalysis.input)
  .handler(({ context, data }) => perform('saveAnalysis', context.viewer, data))
