import type { AppData, Profile, ReviewEvent, ReviewRequest } from '../types'

const leaderRelevantEvents = new Set<ReviewEvent['event_type']>(['submitted', 'resubmitted'])
const memberRelevantEvents = new Set<ReviewEvent['event_type']>([
  'approved',
  'rejected',
  'reopened',
  'feedback_added',
  'feedback_updated',
  'feedback_voided',
])

export function isRelevantReviewEvent(event: ReviewEvent, request: ReviewRequest, profile: Profile): boolean {
  if (profile.role === 'leader') return leaderRelevantEvents.has(event.event_type)
  return request.requester_id === profile.id && memberRelevantEvents.has(event.event_type)
}

export function latestRelevantReviewEvent(
  request: ReviewRequest,
  profile: Profile,
  data: Pick<AppData, 'reviewEvents'>,
): ReviewEvent | null {
  return (data.reviewEvents ?? []).reduce<ReviewEvent | null>((latest, event) => {
    if (event.review_request_id !== request.id || !isRelevantReviewEvent(event, request, profile)) return latest
    return !latest || Number(event.id) > Number(latest.id) ? event : latest
  }, null)
}

/** 목록 dot, 사이드바 뱃지, 알림 센터가 같은 서버 영수증 판정을 공유한다. */
export function isReviewUnread(request: ReviewRequest, profile: Profile, data: AppData): boolean {
  const latest = latestRelevantReviewEvent(request, profile, data)
  if (!latest) return false
  const receipt = (data.reviewReadReceipts ?? []).find(
    (item) => item.user_id === profile.id && item.review_request_id === request.id,
  )
  return !receipt || Number(receipt.last_seen_event_id) < Number(latest.id)
}

export function countUnreadReviews(profile: Profile, data: AppData) {
  return data.reviewRequests.filter((request) => isReviewUnread(request, profile, data)).length
}
