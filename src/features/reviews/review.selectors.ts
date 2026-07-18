import type { ReviewStatusFilter } from '../../app/types'
import { compareReviewRequests } from '../../lib/priority'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../../types'

export function selectScopedReviewRequests(data: AppData, profile: Profile): ReviewRequest[] {
  return profile.role === 'leader'
    ? data.reviewRequests
    : data.reviewRequests.filter((request) => request.requester_id === profile.id)
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
  data: AppData,
  profile: Profile,
  statusFilter: ReviewStatusFilter,
): ReviewRequest[] {
  const scoped = selectScopedReviewRequests(data, profile)
  const base = statusFilter === 'all'
    ? scoped.filter((request) => request.status !== 'withdrawn')
    : scoped.filter((request) => request.status === statusFilter)

  return [...base].sort((left, right) => compareReviewRequests(left, right, profile.role === 'member'))
}
