/**
 * Who may do what with a competition: one table, asked by every server
 * function and mirrored by the UI, so a hidden button and a refused request
 * always agree.
 *
 * Roles inside a competition: guest (signed out), player (signed in, not in
 * it), member, organiser (its creator). A site admin (`ADMIN_EMAILS`) also gets
 * the organiser's powers on every competition, to moderate.
 */

export type CompetitionRole = 'guest' | 'player' | 'member' | 'organiser'

export type Action =
  /** name, format, status, player count */
  | 'view'
  /** players, fixtures, table */
  | 'viewDetails'
  | 'join'
  /** settings, start, results decisions, hand over, delete */
  | 'manage'
  /** the organiser hands over first, so a competition always has one */
  | 'leave'
  | 'seeInviteCode'

const GRANTS: Record<CompetitionRole, ReadonlyArray<Action>> = {
  guest: ['view'],
  player: ['view', 'join'],
  member: ['view', 'viewDetails', 'leave'],
  organiser: ['view', 'viewDetails', 'manage', 'seeInviteCode'],
}

const ADMIN_GRANTS: ReadonlyArray<Action> = [
  'view',
  'viewDetails',
  'manage',
  'seeInviteCode',
]

export interface Viewer {
  id: string
  isAdmin: boolean
}

export interface AccessContext {
  role: CompetitionRole
  isAdmin: boolean
  visibility: 'public' | 'private'
}

export function roleOf(
  viewer: Viewer | null,
  competition: { ownerId: string },
  isMember: boolean,
): CompetitionRole {
  if (!viewer) return 'guest'
  if (viewer.id === competition.ownerId) return 'organiser'
  return isMember ? 'member' : 'player'
}

export function can(action: Action, ctx: AccessContext): boolean {
  // A public competition's details are open to anyone with the link.
  if (action === 'viewDetails' && ctx.visibility === 'public') return true
  return (
    GRANTS[ctx.role].includes(action) ||
    (ctx.isAdmin && ADMIN_GRANTS.includes(action))
  )
}

const REFUSAL: Record<Action, string> = {
  view: 'Not found.',
  viewDetails: 'This competition is invite only.',
  join: "You can't join this one.",
  manage: 'Only the organiser can do that.',
  seeInviteCode: 'Only the organiser can see the invite code.',
  leave: 'Hand it over to another player before you leave.',
}

/** Throws the player-facing refusal unless `ctx` may do `action`. */
export function authorize(action: Action, ctx: AccessContext): void {
  if (!can(action, ctx)) throw new Error(REFUSAL[action])
}
