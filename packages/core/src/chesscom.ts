/**
 * Server-only chess.com Public API client.
 *
 * Every call in here runs in Node, never the browser — which is the whole point:
 * `api.chess.com` sends no CORS headers, so browser fetches are blocked, while
 * server fetches have no such restriction.
 *
 * The Public API is read-only and unauthenticated. chess.com asks for a
 * descriptive User-Agent with contact info on every request, and for callers not
 * to hammer the endpoints — both are honoured below.
 */

const API_BASE = 'https://api.chess.com/pub'

const USER_AGENT =
  process.env.CHESSCOM_USER_AGENT ??
  'MisriClubLeague/1.0 (chess club league tracker; +https://www.chess.com/club/misri; contact: thecodingmontana@gmail.com)'

/** Max in-flight requests to chess.com. Deliberately gentle. */
const MAX_CONCURRENCY = 3

let inFlight = 0
const queue: Array<() => void> = []

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENCY) {
    await new Promise<void>((res) => queue.push(res))
  }
  inFlight++
  try {
    return await fn()
  } finally {
    inFlight--
    queue.shift()?.()
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

// One slow chess.com answer must not hold a request (and a queue slot) forever.
const TIMEOUT_MS = 10_000
const MAX_WAIT_MS = 5_000

/**
 * GET a chess.com endpoint. Returns `null` on 404 (missing player/archive) so
 * callers can treat "doesn't exist" as data rather than as an error. Retries
 * 429s and 5xx with backoff.
 */
async function apiGet<T>(path: string, retries = 3): Promise<T | null> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`

  return withSlot(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (res.status === 404 || res.status === 410) return null
      if (res.ok) return (await res.json()) as T

      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= retries) {
        throw new Error(`chess.com responded ${res.status} for ${url}`)
      }

      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(
        Math.min(
          MAX_WAIT_MS,
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 500 * 2 ** attempt,
        ),
      )
    }
  })
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we actually consume)
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  username: string
  player_id: number
  url: string
  name?: string
  avatar?: string
  country?: string
  status?: string
  /** free text the player edits; also where they paste a verification code */
  location?: string
}

interface StatsBucket {
  last?: { rating: number; date: number; rd: number }
  record?: { win: number; loss: number; draw: number }
}

interface PlayerStatsResponse {
  chess_rapid?: StatsBucket
  chess_blitz?: StatsBucket
  chess_bullet?: StatsBucket
  chess_daily?: StatsBucket
}

export interface ArchivedGame {
  url: string
  /** unix seconds */
  end_time: number
  rated?: boolean
  rules?: string
  time_class?: string
  /** e.g. "180+2" or "1/86400" */
  time_control?: string
  pgn?: string
  /** URL of the opening's page, e.g. `…/openings/Queens-Pawn-Opening-2.Bf4` */
  eco?: string
  white: { username: string; result: string; rating?: number }
  black: { username: string; result: string; rating?: number }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** `null` when chess.com 404s — i.e. the username does not exist. */
export async function fetchPlayerProfile(
  username: string,
): Promise<PlayerProfile | null> {
  return apiGet<PlayerProfile>(`/player/${encodeURIComponent(username)}`)
}

export interface PlayerRating {
  username: string
  rating: number | null
  timeClass: 'rapid' | 'blitz' | 'bullet' | 'daily' | null
}

const RATING_TTL_MS = 5 * 60_000

// shortcut: per-instance cache, so each server instance asks chess.com at most
// once per member per 5 minutes; move it to app_meta if instances multiply.
const ratingCache = new Map<
  string,
  { at: number; rating: Promise<Omit<PlayerRating, 'username'>> }
>()

/**
 * Display rating, cached: the endpoint behind it is public, and without the
 * cache every page view (or a script in a loop) became a chess.com request per
 * member, sent under our User-Agent — the same one the sync depends on.
 */
export async function fetchPlayerRating(
  username: string,
): Promise<PlayerRating> {
  const key = username.toLowerCase()
  let hit = ratingCache.get(key)
  if (!hit || Date.now() - hit.at >= RATING_TTL_MS) {
    const entry = { at: Date.now(), rating: lookupRating(username) }
    ratingCache.set(key, entry)
    // A failed lookup is not remembered; the next caller tries again.
    entry.rating.catch(() => {
      if (ratingCache.get(key) === entry) ratingCache.delete(key)
    })
    hit = entry
  }
  return { username, ...(await hit.rating) }
}

/**
 * Rapid first (the club's default cadence), then blitz, bullet and daily as
 * fallbacks so a player who only plays one format still shows one.
 */
async function lookupRating(
  username: string,
): Promise<Omit<PlayerRating, 'username'>> {
  const stats = await apiGet<PlayerStatsResponse>(
    `/player/${encodeURIComponent(username)}/stats`,
  )

  const buckets = [
    ['rapid', stats?.chess_rapid],
    ['blitz', stats?.chess_blitz],
    ['bullet', stats?.chess_bullet],
    ['daily', stats?.chess_daily],
  ] as const

  for (const [timeClass, bucket] of buckets) {
    if (bucket?.last?.rating) {
      return { rating: bucket.last.rating, timeClass }
    }
  }

  return { rating: null, timeClass: null }
}

/** Monthly archive URLs, oldest first. */
export async function fetchArchiveUrls(
  username: string,
): Promise<Array<string>> {
  const data = await apiGet<{ archives: Array<string> }>(
    `/player/${encodeURIComponent(username)}/games/archives`,
  )
  return data?.archives ?? []
}

export async function fetchArchive(url: string): Promise<Array<ArchivedGame>> {
  const data = await apiGet<{ games: Array<ArchivedGame> }>(url)
  return data?.games ?? []
}

/** One month of a player's games (`month` as YYYY/MM); empty when none. */
export function fetchMonthGames(username: string, month: string) {
  return fetchArchive(
    `/player/${encodeURIComponent(username.toLowerCase())}/games/${month}`,
  )
}
