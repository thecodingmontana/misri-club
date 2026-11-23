import type {
  CompetitionSummary,
  getCompetition,
} from '@misri/core/competition-view'
import type { getPlayer } from '@misri/core/player'

/**
 * A typed client for the Misri API (apps/api), for any app: the web app's
 * server, later a mobile app. One method per query; GraphQL errors throw.
 */

export type CompetitionPage = NonNullable<
  Awaited<ReturnType<typeof getCompetition>>
>
export type PlayerPage = NonNullable<Awaited<ReturnType<typeof getPlayer>>>
export type Me = { id: string; name: string; chessUsername: string | null }

export interface ApiClientOptions {
  /** e.g. https://misri-api.vercel.app */
  url: string
  /** the signed session token (or the session cookie's value) */
  token?: string | null
  /** extra headers, e.g. the web app's internal ones */
  headers?: Record<string, string>
  /** per request; the API answers in well under a second */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** What the API said went wrong (its message, as the user should see it). */
export class ApiError extends Error {}

export function createApiClient(options: ApiClientOptions) {
  const send = options.fetch ?? fetch
  const query = async <T>(
    text: string,
    variables?: Record<string, unknown>,
  ): Promise<T> => {
    const res = await send(`${options.url.replace(/\/$/, '')}/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body: JSON.stringify({ query: text, variables }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    })
    const body = (await res.json().catch(() => null)) as {
      data?: T
      errors?: Array<{ message: string }>
      error?: string
    } | null
    if (body?.errors?.length) throw new ApiError(body.errors[0].message)
    if (!res.ok || !body?.data) {
      throw new ApiError(body?.error ?? `The API answered ${res.status}.`)
    }
    return body.data
  }
  return {
    me: async () =>
      (await query<{ me: Me | null }>('{ me { id name chessUsername } }')).me,
    myCompetitions: async () =>
      (
        await query<{ myCompetitions: CompetitionSummary[] }>(
          '{ myCompetitions { slug name format status members timeControl legs allowLateEntry } }',
        )
      ).myCompetitions,
    openCompetitions: async () =>
      (
        await query<{ openCompetitions: CompetitionSummary[] }>(
          '{ openCompetitions { slug name format status members timeControl legs allowLateEntry } }',
        )
      ).openCompetitions,
    competition: async (slug: string) =>
      (
        await query<{ competition: CompetitionPage | null }>(
          'query ($slug: String!) { competition(slug: $slug) }',
          { slug },
        )
      ).competition,
    player: async (username: string) =>
      (
        await query<{ player: PlayerPage | null }>(
          'query ($username: String!) { player(username: $username) }',
          { username },
        )
      ).player,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
