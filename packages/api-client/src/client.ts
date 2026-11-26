import type {
  chessAccount,
  competitionNameCheck,
  competitionNameIdeas,
  inbox,
  matchGame,
  myGames,
  savedAnalyses,
} from '@misri/core/account'
import type { ActionInput, ActionName, ActionResult } from '@misri/core/actions'
import type {
  CompetitionSummary,
  getCompetition,
  getInvite,
} from '@misri/core/competition-view'
import { TRY_LATER } from '@misri/core/errors'
import type { getPlayer } from '@misri/core/player'

/**
 * A typed client for the Misri API (apps/api), for any app: the web app's
 * server, later a mobile app. One method per query; GraphQL errors throw.
 */

export type CompetitionPage = NonNullable<
  Awaited<ReturnType<typeof getCompetition>>
>
export type PlayerPage = NonNullable<Awaited<ReturnType<typeof getPlayer>>>
type Result<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>
export type InboxItem = Result<typeof inbox>[number]

export type Me = {
  id: string
  name: string
  chessUsername: string | null
  onboarded: boolean
}

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
export class ApiError extends Error {
  /** true: the API refused this request for good (a message for the player) */
  refused: boolean
  constructor(message: string, refused = false) {
    super(message)
    this.refused = refused
  }
}

// GraphQL Yoga's text for a masked (internal) error
const MASKED = 'Unexpected error.'

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
      // the token and internal secret go to this address only, never a redirect
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    })
    const body = (await res.json().catch(() => null)) as {
      data?: T
      errors?: Array<{ message: string; extensions?: { code?: string } }>
      error?: string
    } | null
    if (body?.errors?.length) {
      const { message, extensions } = body.errors[0]
      // a limit for now ("Too many tries") is not a refusal for good
      const later = extensions?.code === TRY_LATER
      throw new ApiError(message, res.ok && message !== MASKED && !later)
    }
    if (!res.ok || !body?.data) {
      throw new ApiError(body?.error ?? `The API answered ${res.status}.`)
    }
    return body.data
  }
  return {
    me: async () =>
      (
        await query<{ me: Me | null }>(
          '{ me { id name chessUsername onboarded } }',
        )
      ).me,
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
    chessAccount: async () =>
      (
        await query<{ chessAccount: Result<typeof chessAccount> }>(
          '{ chessAccount }',
        )
      ).chessAccount,
    // JSON carries dates as text: back to Dates, as the app reads them
    inbox: async (): Promise<InboxItem[]> =>
      (
        await query<{
          inbox: Array<
            Omit<InboxItem, 'readAt' | 'createdAt'> & {
              readAt: string | null
              createdAt: string
            }
          >
        }>('{ inbox }')
      ).inbox.map((n) => ({
        ...n,
        readAt: n.readAt ? new Date(n.readAt) : null,
        createdAt: new Date(n.createdAt),
      })),
    /** Your private calendar feed's path on the website. */
    calendarPath: async () =>
      (await query<{ calendarPath: string }>('{ calendarPath }')).calendarPath,
    unreadCount: async () =>
      (await query<{ unreadCount: number }>('{ unreadCount }')).unreadCount,
    invite: async (code: string) =>
      (
        await query<{ invite: Result<typeof getInvite> }>(
          'query ($code: String!) { invite(code: $code) }',
          { code },
        )
      ).invite,
    competitionNameCheck: async (name: string) =>
      (
        await query<{
          competitionNameCheck: Result<typeof competitionNameCheck>
        }>('query ($name: String!) { competitionNameCheck(name: $name) }', {
          name,
        })
      ).competitionNameCheck,
    competitionNameIdeas: async () =>
      (
        await query<{
          competitionNameIdeas: Result<typeof competitionNameIdeas>
        }>('{ competitionNameIdeas }')
      ).competitionNameIdeas,
    myGames: async () =>
      (await query<{ myGames: Result<typeof myGames> }>('{ myGames }')).myGames,
    matchGame: async (url: string) =>
      (
        await query<{ matchGame: Result<typeof matchGame> }>(
          'query ($url: String!) { matchGame(url: $url) }',
          { url },
        )
      ).matchGame,
    savedAnalyses: async (urls: string[]) =>
      (
        await query<{ savedAnalyses: Result<typeof savedAnalyses> }>(
          'query ($urls: [String!]!) { savedAnalyses(urls: $urls) }',
          { urls },
        )
      ).savedAnalyses,
    /** One write, as the signed-in player: `act('joinCompetition', { code })`. */
    act: async <N extends ActionName>(
      name: N,
      input: ActionInput<N>,
    ): Promise<ActionResult<N>> =>
      (
        await query<Record<N, ActionResult<N>>>(
          `mutation ($input: JSON) { ${name}(input: $input) }`,
          { input },
        )
      )[name],
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
