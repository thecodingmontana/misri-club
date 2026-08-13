/**
 * Known membership of the Misri club.
 *
 * chess.com only serves `/pub/club/{id}/members` for **public** clubs, and Misri
 * is private — the endpoint answers 403. Everything else we need (profiles,
 * ratings, game archives) is public per-player and works fine, so the only
 * missing piece is the member list itself. This file supplies it.
 *
 * `joinedAt` is the date the player joined the *club*, and it matters: a game
 * only counts once both players were members, so getting this wrong would drag
 * in games played before the league existed.
 *
 * Keeping the list here rather than as one-off database rows means the roster
 * survives a database reset and repopulates on the next sync. It is additive —
 * syncing adds and reactivates the people listed, but never deactivates anyone
 * missing from it, so a stale file can't silently wipe the roster. Use the
 * Roster panel to mark someone inactive when they leave.
 */

export interface KnownMember {
  username: string
  joinedAt: string
}

export const KNOWN_MEMBERS: Array<KnownMember> = [
  { username: 'allanitomwesh', joinedAt: '2026-06-25' },
  { username: 'edu_237', joinedAt: '2026-06-26' },
  { username: 'hi_chris', joinedAt: '2026-06-25' },
  { username: 'kenchu_kilichu', joinedAt: '2026-06-25' },
  { username: 'ntarangwiii', joinedAt: '2026-06-26' },
  { username: 'ryan8m', joinedAt: '2026-06-25' },
  { username: 'seangowe', joinedAt: '2026-08-13' },
  { username: 'tafesh_22', joinedAt: '2026-06-25' },
]
