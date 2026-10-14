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

export const CLUB_ID = process.env.CHESSCOM_CLUB_ID ?? 'misri'

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
      })

      if (res.status === 404 || res.status === 410) return null
      if (res.ok) return (await res.json()) as T

      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= retries) {
        throw new Error(`chess.com responded ${res.status} for ${url}`)
      }

      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** attempt,
      )
    }
  })
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we actually consume)
// ---------------------------------------------------------------------------

interface ClubMember {
  username: string
  /** unix seconds — when they joined the club */
  joined: number
}

interface ClubMembersResponse {
  weekly?: Array<ClubMember>
  monthly?: Array<ClubMember>
  all_time?: Array<ClubMember>
}

interface ClubResponse {
  name?: string
  club_id?: number
  members_count?: number
  visibility?: string
  admin?: Array<string>
  icon?: string
  /** unix seconds */
  created?: number
}

export interface PlayerProfile {
  username: string
  player_id: number
  url: string
  name?: string
  avatar?: string
  country?: string
  status?: string
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
  pgn?: string
  /** URL of the opening's page, e.g. `…/openings/Queens-Pawn-Opening-2.Bf4` */
  eco?: string
  white: { username: string; result: string; rating?: number }
  black: { username: string; result: string; rating?: number }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ClubMemberSummary {
  username: string
  joinedAt: Date
}

export interface ClubInfo {
  id: string
  name: string
  clubId: number
  membersCount: number
  /** chess.com reports "public" or "private" */
  visibility: string
  admins: Array<string>
  icon: string | null
  createdAt: Date | null
}

export async function fetchClub(clubId = CLUB_ID): Promise<ClubInfo | null> {
  const data = await apiGet<ClubResponse>(`/club/${clubId}`)
  if (!data) return null

  return {
    id: clubId,
    name: data.name ?? clubId,
    clubId: data.club_id ?? 0,
    membersCount: data.members_count ?? 0,
    visibility: data.visibility ?? 'unknown',
    admins: (data.admin ?? []).map((url) =>
      (url.split('/').pop() ?? '').toLowerCase(),
    ),
    icon: data.icon ?? null,
    createdAt: data.created ? new Date(data.created * 1000) : null,
  }
}

export interface ClubMembersResult {
  /**
   * chess.com serves `/club/{id}/members` only for public clubs; a private club
   * answers 403 (behind a 404 status). `visible: false` means "we are not
   * allowed to see the list", which is very different from "the club is empty".
   */
  visible: boolean
  members: Array<ClubMemberSummary>
}

/**
 * Club members, merged across the weekly/monthly/all_time buckets chess.com
 * returns and deduped by username. When a username appears in several buckets
 * we keep the earliest join timestamp.
 */
export async function fetchClubMembers(
  clubId = CLUB_ID,
): Promise<ClubMembersResult> {
  const data = await apiGet<ClubMembersResponse>(`/club/${clubId}/members`)
  if (!data) return { visible: false, members: [] }

  const merged = new Map<string, ClubMemberSummary>()

  for (const member of [
    ...(data.all_time ?? []),
    ...(data.monthly ?? []),
    ...(data.weekly ?? []),
  ]) {
    if (!member?.username) continue
    const username = member.username.toLowerCase()
    const joinedAt = new Date((member.joined ?? 0) * 1000)
    const existing = merged.get(username)
    if (!existing || joinedAt < existing.joinedAt) {
      merged.set(username, { username, joinedAt })
    }
  }

  return {
    visible: true,
    members: [...merged.values()].sort((a, b) =>
      a.username.localeCompare(b.username),
    ),
  }
}

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

/**
 * Display rating: rapid first (the club's default cadence), then blitz, bullet
 * and daily as fallbacks so a player who only plays one format still shows one.
 */
export async function fetchPlayerRating(
  username: string,
): Promise<PlayerRating> {
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
      return { username, rating: bucket.last.rating, timeClass }
    }
  }

  return { username, rating: null, timeClass: null }
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

/** The chess.com club page for a given club id. */
export const clubUrl = (clubId = CLUB_ID) =>
  `https://www.chess.com/club/${clubId}`
