import type { ReviewStatusFilter } from '../../app/types'
import { compareReviewRequests } from '../../lib/priority'
import { isLeaderDefaultReviewRequest, matchesReviewSearch } from '../../lib/reviewHistory'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../../types'

export type ReviewFeatureData = Pick<AppData, 'reviewRequests'>

export function selectScopedReviewRequests(data: ReviewFeatureData, profile: Profile): ReviewRequest[] {
  return profile.role === 'leader'
    ? data.reviewRequests
    : data.reviewRequests.filter((request) => request.requester_id === profile.id)
}

export function selectDefaultReviewRequests(
  data: ReviewFeatureData,
  profile: Profile,
  now = new Date(),
): ReviewRequest[] {
  const scoped = selectScopedReviewRequests(data, profile)
  return profile.role === 'leader'
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

export function selectVisibleReviewRequests(
  data: ReviewFeatureData,
  profile: Profile,
  statusFilter: ReviewStatusFilter,
  searchQuery = '',
  now = new Date(),
): ReviewRequest[] {
  const scoped = selectDefaultReviewRequests(data, profile, now)
  const base = statusFilter === 'all'
    ? profile.role === 'leader' ? scoped : scoped.filter((request) => request.status !== 'withdrawn')
    : scoped.filter((request) => request.status === statusFilter)

  return base
    .filter((request) => matchesReviewSearch(request, searchQuery))
    .sort((left, right) => compareReviewRequests(left, right, profile.role === 'member'))
}
