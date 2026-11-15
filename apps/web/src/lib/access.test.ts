import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type Action,
  authorize,
  type CompetitionRole,
  can,
  roleOf,
} from './access.ts'

const ACTIONS: Action[] = [
  'view',
  'viewDetails',
  'join',
  'manage',
  'seeInviteCode',
  'leave',
]

/** The whole matrix, written out: what each role may do in a private competition. */
const PRIVATE: Record<CompetitionRole, Action[]> = {
  guest: ['view'],
  player: ['view', 'join'],
  member: ['view', 'viewDetails', 'leave'],
  organiser: ['view', 'viewDetails', 'manage', 'seeInviteCode'],
}

for (const [role, allowed] of Object.entries(PRIVATE) as Array<
  [CompetitionRole, Action[]]
>) {
  test(`private competition: ${role} may do exactly ${allowed.join(', ')}`, () => {
    for (const action of ACTIONS) {
      assert.equal(
        can(action, { role, isAdmin: false, visibility: 'private' }),
        allowed.includes(action),
        `${role} → ${action}`,
      )
    }
  })
}

test('public competition: anyone sees the details, nothing else changes', () => {
  for (const role of Object.keys(PRIVATE) as CompetitionRole[]) {
    const ctx = { role, isAdmin: false, visibility: 'public' } as const
    assert.equal(can('viewDetails', ctx), true, role)
    assert.equal(can('manage', ctx), role === 'organiser', role)
    assert.equal(can('seeInviteCode', ctx), role === 'organiser', role)
  }
})

test('a site admin can manage any competition but is still a player for joining', () => {
  const admin = {
    role: 'player',
    isAdmin: true,
    visibility: 'private',
  } as const
  assert.equal(can('manage', admin), true)
  assert.equal(can('viewDetails', admin), true)
  assert.equal(can('seeInviteCode', admin), true)
  assert.equal(can('join', admin), true)
  const signedOut = {
    role: 'guest',
    isAdmin: false,
    visibility: 'private',
  } as const
  assert.equal(can('manage', signedOut), false)
})

test('roleOf: owner, member, other player, signed out', () => {
  const competition = { ownerId: 'o' }
  assert.equal(
    roleOf({ id: 'o', isAdmin: false }, competition, true),
    'organiser',
  )
  assert.equal(roleOf({ id: 'm', isAdmin: false }, competition, true), 'member')
  assert.equal(roleOf({ id: 'p', isAdmin: true }, competition, false), 'player')
  assert.equal(roleOf(null, competition, false), 'guest')
})

test('authorize throws the refusal and passes silently when allowed', () => {
  assert.throws(
    () =>
      authorize('manage', {
        role: 'member',
        isAdmin: false,
        visibility: 'public',
      }),
    /Only the organiser/,
  )
  assert.doesNotThrow(() =>
    authorize('manage', {
      role: 'organiser',
      isAdmin: false,
      visibility: 'public',
    }),
  )
})
