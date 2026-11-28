import type { AppData, Profile, ReviewEvent, ReviewReadReceipt, ReviewRequest } from '../types'
import { compareDecimalIds } from './decimalId'
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

function latestRelevantReviewEventsByRequest(
  requests: readonly ReviewRequest[],
  profile: Profile,
  events: readonly ReviewEvent[],
): Map<string, ReviewEvent> {
  const requestsById = new Map(requests.map((request) => [request.id, request]))
  const latestByRequest = new Map<string, ReviewEvent>()

  for (const event of events) {
    const request = requestsById.get(event.review_request_id)
    if (!request || !isRelevantReviewEvent(event, request, profile)) continue
    const latest = latestByRequest.get(request.id)
    if (!latest || compareDecimalIds(event.id, latest.id) > 0) latestByRequest.set(request.id, event)
  }

  return latestByRequest
}

export function buildReviewReadReceipts(
  requests: ReviewRequest[],
  profile: Profile,
  events: ReviewEvent[],
  readAt = new Date().toISOString(),
): ReviewReadReceipt[] {
  return Array.from(latestRelevantReviewEventsByRequest(requests, profile, events), ([reviewRequestId, event]) => ({
    user_id: profile.id,
    review_request_id: reviewRequestId,
    last_seen_event_id: String(event.id),
    read_at: readAt,
  }))
}

/** 여러 요청을 표시할 때는 이벤트와 읽음 기록을 각각 한 번만 훑는다. */
export function buildReviewReadState(
  requests: readonly ReviewRequest[],
  profile: Profile,
  data: Pick<AppData, 'reviewEvents' | 'reviewReadReceipts'>,
) {
  const latestByRequest = latestRelevantReviewEventsByRequest(requests, profile, data.reviewEvents ?? [])
  const receipts = new Map<string, ReviewReadReceipt>()
  for (const receipt of data.reviewReadReceipts ?? []) {
    if (receipt.user_id === profile.id && !receipts.has(receipt.review_request_id)) {
      receipts.set(receipt.review_request_id, receipt)
    }
  }
  return new Map(Array.from(latestByRequest, ([requestId, latest]) => {
    const receipt = receipts.get(requestId)
    const unread = !receipt || compareDecimalIds(receipt.last_seen_event_id, latest.id) < 0
    return [requestId, { latest, unread }]
  }))
}

export function countUnreadReviews(profile: Profile, data: AppData) {
  let count = 0
  for (const { unread } of buildReviewReadState(data.reviewRequests, profile, data).values()) {
    if (unread) count += 1
  }
  return count
}
