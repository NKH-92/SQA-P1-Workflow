import { describe, expect, it } from 'vitest'
import {
  canCreateReviewFor,
  canManageTeamData,
  canViewProfile,
  canViewProjectAssignment,
  canViewReviewRequest,
} from './permissions'
import type { Profile } from '../types'

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader' }
const memberA: Profile = { id: 'member-a', email: 'a@example.com', name: 'A', role: 'member' }
const memberB: Profile = { id: 'member-b', email: 'b@example.com', name: 'B', role: 'member' }

describe('role visibility rules mirrored by RLS', () => {
  it('allows leaders to manage team data', () => {
    expect(canManageTeamData(leader)).toBe(true)
    expect(canManageTeamData(memberA)).toBe(false)
  })

  it('keeps member profile visibility scoped to self', () => {
    expect(canViewProfile(memberA, memberA)).toBe(true)
    expect(canViewProfile(memberA, memberB)).toBe(false)
    expect(canViewProfile(leader, memberB)).toBe(true)
  })

  it('keeps review requests scoped to requester unless leader', () => {
    expect(canCreateReviewFor(memberA, memberA.id)).toBe(true)
    expect(canCreateReviewFor(memberA, memberB.id)).toBe(false)
    expect(canViewReviewRequest(memberA, { requester_id: memberA.id })).toBe(true)
    expect(canViewReviewRequest(memberA, { requester_id: memberB.id })).toBe(false)
    expect(canViewReviewRequest(leader, { requester_id: memberB.id })).toBe(true)
  })

  it('keeps project assignments scoped to assignee unless leader', () => {
    expect(canViewProjectAssignment(memberA, { user_id: memberA.id })).toBe(true)
    expect(canViewProjectAssignment(memberA, { user_id: memberB.id })).toBe(false)
    expect(canViewProjectAssignment(leader, { user_id: memberB.id })).toBe(true)
  })
})
