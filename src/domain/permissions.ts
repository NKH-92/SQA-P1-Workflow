import type { Profile, ProjectAssignment, ReviewRequest } from '../types'

export function isLeader(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'leader'
}

export function canManageTeamData(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isLeader(profile)
}

export function canViewProfile(current: Profile, target: Pick<Profile, 'id'>): boolean {
  return current.role === 'leader' || current.id === target.id
}

export function canCreateReviewFor(current: Profile, requesterId: string): boolean {
  return current.id === requesterId
}

export function canViewReviewRequest(current: Profile, request: Pick<ReviewRequest, 'requester_id'>): boolean {
  return current.role === 'leader' || current.id === request.requester_id
}

export function canViewProjectAssignment(
  current: Profile,
  assignment: Pick<ProjectAssignment, 'user_id'>,
): boolean {
  return current.role === 'leader' || current.id === assignment.user_id
}
