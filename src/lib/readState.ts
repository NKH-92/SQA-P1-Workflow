import type { AppData, Profile, ReviewEvent, ReviewReadReceipt, ReviewRequest } from '../types'
import { compareDecimalIds, maxDecimalId } from './decimalId'
import { canViewTeamData } from '../domain/permissions'

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
  if (canViewTeamData(profile)) return leaderRelevantEvents.has(event.event_type)
  return request.requester_id === profile.id && memberRelevantEvents.has(event.event_type)
}

export function latestRelevantReviewEvent(
  request: ReviewRequest,
  profile: Profile,
  data: Pick<AppData, 'reviewEvents'>,
): ReviewEvent | null {
  return (data.reviewEvents ?? []).reduce<ReviewEvent | null>((latest, event) => {
    if (event.review_request_id !== request.id || !isRelevantReviewEvent(event, request, profile)) return latest
    return !latest || compareDecimalIds(event.id, latest.id) > 0 ? event : latest
  }, null)
}

export function latestRelevantReviewEventIdsByRequest(
  requests: ReviewRequest[],
  profile: Profile,
  events: ReviewEvent[],
): Map<string, string> {
  const requestsById = new Map(requests.map((request) => [request.id, request]))
  const latestByRequest = new Map<string, string>()

  for (const event of events) {
    const request = requestsById.get(event.review_request_id)
    if (!request || !isRelevantReviewEvent(event, request, profile)) continue
    latestByRequest.set(
      request.id,
      maxDecimalId(latestByRequest.get(request.id) ?? null, event.id),
    )
  }

  return latestByRequest
}

export function buildReviewReadReceipts(
  requests: ReviewRequest[],
  profile: Profile,
  events: ReviewEvent[],
  readAt = new Date().toISOString(),
): ReviewReadReceipt[] {
  return [...latestRelevantReviewEventIdsByRequest(requests, profile, events)].map(
    ([reviewRequestId, lastSeenEventId]) => ({
      user_id: profile.id,
      review_request_id: reviewRequestId,
      last_seen_event_id: lastSeenEventId,
      read_at: readAt,
    }),
  )
}

/** 목록 dot, 사이드바 뱃지, 알림 센터가 같은 서버 영수증 판정을 공유한다. */
export function isReviewUnread(request: ReviewRequest, profile: Profile, data: AppData): boolean {
  const latest = latestRelevantReviewEvent(request, profile, data)
  if (!latest) return false
  const receipt = (data.reviewReadReceipts ?? []).find(
    (item) => item.user_id === profile.id && item.review_request_id === request.id,
  )
  return !receipt || compareDecimalIds(receipt.last_seen_event_id, latest.id) < 0
}

export function countUnreadReviews(profile: Profile, data: AppData) {
  return data.reviewRequests.filter((request) => isReviewUnread(request, profile, data)).length
}
