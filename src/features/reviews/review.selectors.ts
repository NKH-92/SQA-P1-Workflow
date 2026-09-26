import type { ReviewStatusFilter } from '../../app/types'
import { compareReviewRequests } from '../../lib/priority'
import { isLeaderDefaultReviewRequest, matchesReviewSearch } from '../../lib/reviewHistory'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../../types'
import { canViewTeamData } from '../../domain/permissions'
import { sortReviewRequests, type ReviewSortMode } from './reviewOrdering'

export type ReviewFeatureData = Pick<AppData, 'reviewRequests'> & Partial<Pick<AppData, 'reviewEvents'>>

export function selectScopedReviewRequests(data: ReviewFeatureData, profile: Profile): ReviewRequest[] {
  return canViewTeamData(profile)
    ? data.reviewRequests
    : data.reviewRequests.filter((request) => request.requester_id === profile.id)
}

export function selectDefaultReviewRequests(
  data: ReviewFeatureData,
  profile: Profile,
  now = new Date(),
): ReviewRequest[] {
  const scoped = selectScopedReviewRequests(data, profile)
  return canViewTeamData(profile)
    ? scoped.filter((request) => isLeaderDefaultReviewRequest(request, now))
    : scoped
}

export function selectReviewStatusCounts(requests: ReviewRequest[]) {
  return requests.reduce(
    (counts, request) => ({
      ...counts,
      [request.status]: counts[request.status] + 1,
    }),
    { pending: 0, approved: 0, rejected: 0, withdrawn: 0 } satisfies Record<ReviewStatus, number>,
  )
}

/**
 * 목록에 보일 검토요청. 파트장 화면은 sortMode(최근 요청순·처리 시점순·기한순)를 따르고,
 * sortMode가 없으면 예전 우선순위(대기 중 → 기한) 순서를 쓴다. 파트원 화면은 최근 요청순이다.
 */
export function selectVisibleReviewRequests(
  data: ReviewFeatureData,
  profile: Profile,
  statusFilter: ReviewStatusFilter,
  searchQuery = '',
  now = new Date(),
  sortMode: ReviewSortMode | null = null,
): ReviewRequest[] {
  const scoped = selectDefaultReviewRequests(data, profile, now)
  const base = statusFilter === 'all'
    ? canViewTeamData(profile) ? scoped : scoped.filter((request) => request.status !== 'withdrawn')
    : scoped.filter((request) => request.status === statusFilter)

  const matched = base.filter((request) => matchesReviewSearch(request, searchQuery))
  if (sortMode && canViewTeamData(profile)) {
    return sortReviewRequests(matched, sortMode, data.reviewEvents ?? [])
  }
  return matched.sort((left, right) => compareReviewRequests(left, right, profile.role === 'member'))
}

/**
 * 결정(승인·반려) 뒤에 이어서 볼 요청: 지금 순서에서 결정한 요청 다음에 오는 대기 중 요청,
 * 없으면 앞쪽의 대기 중 요청. 남은 대기 중 요청이 없으면 null.
 */
export function selectNextPendingReviewId(order: ReadonlyArray<ReviewRequest>, decidedId: string): string | null {
  const index = order.findIndex((request) => request.id === decidedId)
  const after = index >= 0 ? order.slice(index + 1) : order
  const before = index >= 0 ? order.slice(0, index) : []
  const next = [...after, ...before].find((request) => request.id !== decidedId && request.status === 'pending')
  return next?.id ?? null
}
