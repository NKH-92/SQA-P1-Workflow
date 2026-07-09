import type { Profile, ProjectAssignment, ReviewRequest } from '../types'

// 이 모듈은 Supabase RLS 정책의 클라이언트 측 거울이다. UI가 직접 호출하지 않는
// 함수(canCreateProject, canViewProfile, canCreateReviewFor, canViewReviewRequest,
// canViewProjectAssignment)도 RLS 규칙을 실행 가능한 문서로 고정하기 위해 유지하며,
// permissions.test.ts가 그 의미를 검증한다. RLS 정책을 바꾸면 여기도 함께 바꾼다.

export function isLeader(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'leader'
}

export function canManageTeamData(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isLeader(profile)
}

export function canCreateProject(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return isLeader(profile)
}

export function canAssignProjectTo(profile: Pick<Profile, 'role' | 'is_active'> | null | undefined): boolean {
  return profile?.role === 'member' && profile.is_active !== false
}

export function canReceiveAssignment(profile: Pick<Profile, 'role' | 'is_active'> | null | undefined): boolean {
  return canAssignProjectTo(profile)
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
