import { describe, expect, it } from 'vitest'
import type { ReviewEvent, ReviewRequest } from '../../types'
import {
  buildDecisionEventIndex,
  isReviewSortMode,
  reviewDecisionLabel,
  reviewDecisionTime,
  reviewRequestedAt,
  reviewStatusText,
  sortReviewRequests,
} from './reviewOrdering'

function request(overrides: Partial<ReviewRequest> & Pick<ReviewRequest, 'id'>): ReviewRequest {
  return {
    requester_id: 'member-1',
    title: overrides.id,
    description: '',
    due_date: null,
    status: 'pending',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function decisionEvent(
  id: number,
  reviewRequestId: string,
  eventType: ReviewEvent['event_type'],
  occurredAt: string,
): ReviewEvent {
  return {
    id,
    review_request_id: reviewRequestId,
    actor_id: 'leader-1',
    actor_name_snapshot: '파트장',
    event_type: eventType,
    from_status: 'pending',
    to_status: eventType === 'approved' || eventType === 'rejected' ? eventType : null,
    occurred_at: occurredAt,
    metadata: {},
    transaction_id: id,
  }
}

const ids = (requests: ReviewRequest[]) => requests.map((item) => item.id)

describe('reviewRequestedAt', () => {
  it('uses the last resubmission for later rounds and the creation time otherwise', () => {
    expect(reviewRequestedAt(request({ id: 'a', last_submitted_at: '2026-09-05T00:00:00.000Z' })))
      .toBe('2026-09-01T00:00:00.000Z')
    expect(reviewRequestedAt(request({
      id: 'b',
      review_round: 2,
      last_submitted_at: '2026-09-05T00:00:00.000Z',
    }))).toBe('2026-09-05T00:00:00.000Z')
  })
})

describe('sortReviewRequests · 최근 요청순', () => {
  it('orders by the latest request time, including resubmissions, with a stable id tie-break', () => {
    const sorted = sortReviewRequests([
      request({ id: 'older', created_at: '2026-09-01T00:00:00.000Z' }),
      request({ id: 'tie-b', created_at: '2026-09-03T00:00:00.000Z' }),
      request({ id: 'tie-a', created_at: '2026-09-03T00:00:00.000Z' }),
      request({
        id: 'resubmitted',
        created_at: '2026-08-01T00:00:00.000Z',
        review_round: 2,
        last_submitted_at: '2026-09-04T00:00:00.000Z',
      }),
    ], 'recent')

    expect(ids(sorted)).toEqual(['resubmitted', 'tie-a', 'tie-b', 'older'])
  })
})

describe('sortReviewRequests · 처리 시점순', () => {
  it('puts the latest decisions first and undecided requests after them by request time', () => {
    const sorted = sortReviewRequests([
      request({ id: 'pending-new', created_at: '2026-09-20T00:00:00.000Z' }),
      request({ id: 'approved-old', status: 'approved', closed_at: '2026-09-10T00:00:00.000Z' }),
      request({ id: 'rejected-new', status: 'rejected', closed_at: '2026-09-26T00:00:00.000Z' }),
      request({ id: 'pending-old', created_at: '2026-09-02T00:00:00.000Z' }),
      request({ id: 'withdrawn', status: 'withdrawn', withdrawn_at: '2026-09-27T00:00:00.000Z', created_at: '2026-09-03T00:00:00.000Z' }),
    ], 'decided')

    expect(ids(sorted)).toEqual(['rejected-new', 'approved-old', 'pending-new', 'withdrawn', 'pending-old'])
  })

  it('falls back to status_changed_at, then the latest approve/reject event, then keeps unknown decisions last among decided', () => {
    const events = [
      decisionEvent(1, 'from-event', 'rejected', '2026-09-01T00:00:00.000Z'),
      decisionEvent(2, 'from-event', 'approved', '2026-09-15T00:00:00.000Z'),
      decisionEvent(3, 'from-event', 'feedback_added', '2026-09-30T00:00:00.000Z'),
    ]
    const sorted = sortReviewRequests([
      request({ id: 'unknown', status: 'approved', closed_at: null }),
      request({ id: 'from-event', status: 'approved', closed_at: null }),
      request({ id: 'from-status-changed', status: 'rejected', closed_at: 'not-a-date', status_changed_at: '2026-09-20T00:00:00.000Z' }),
      request({ id: 'pending', created_at: '2026-09-29T00:00:00.000Z' }),
    ], 'decided', events)

    expect(ids(sorted)).toEqual(['from-status-changed', 'from-event', 'unknown', 'pending'])
  })

  it('treats a rejected request that was resubmitted as undecided even when an old closed_at remains', () => {
    const sorted = sortReviewRequests([
      request({
        id: 'resubmitted',
        status: 'pending',
        review_round: 2,
        rejection_count: 1,
        closed_at: '2026-09-25T00:00:00.000Z',
        last_submitted_at: '2026-09-26T00:00:00.000Z',
      }),
      request({ id: 'approved', status: 'approved', closed_at: '2026-09-01T00:00:00.000Z' }),
    ], 'decided', [decisionEvent(9, 'resubmitted', 'rejected', '2026-09-25T00:00:00.000Z')])

    expect(ids(sorted)).toEqual(['approved', 'resubmitted'])
  })

  it('breaks decision-time ties by request time, then id', () => {
    const decidedAt = '2026-09-26T01:00:00.000Z'
    const sorted = sortReviewRequests([
      request({ id: 'b', status: 'approved', closed_at: decidedAt, created_at: '2026-09-01T00:00:00.000Z' }),
      request({ id: 'c', status: 'rejected', closed_at: decidedAt, created_at: '2026-09-05T00:00:00.000Z' }),
      request({ id: 'a', status: 'approved', closed_at: decidedAt, created_at: '2026-09-01T00:00:00.000Z' }),
    ], 'decided')

    expect(ids(sorted)).toEqual(['c', 'a', 'b'])
  })
})

describe('sortReviewRequests · 기한순', () => {
  it('orders pending requests by due date, then pending without a due date, then processed requests', () => {
    const sorted = sortReviewRequests([
      request({ id: 'no-due-new', created_at: '2026-09-10T00:00:00.000Z' }),
      request({ id: 'approved-overdue', status: 'approved', due_date: '2026-08-01', closed_at: '2026-09-01T00:00:00.000Z' }),
      request({ id: 'due-late', due_date: '2026-10-01' }),
      request({ id: 'due-soon', due_date: '2026-09-28' }),
      request({ id: 'no-due-old', created_at: '2026-09-02T00:00:00.000Z' }),
    ], 'due')

    expect(ids(sorted)).toEqual(['due-soon', 'due-late', 'no-due-new', 'no-due-old', 'approved-overdue'])
  })
})

describe('decision labels', () => {
  it('formats the decision day in the business time zone', () => {
    const approved = request({ id: 'x', status: 'approved', closed_at: '2026-09-25T16:30:00.000Z' })
    expect(reviewDecisionLabel(approved)).toBe('9월 26일 승인')
    expect(reviewDecisionLabel(request({ id: 'p' }))).toBeNull()
    expect(reviewDecisionTime(approved)).toBe('2026-09-25T16:30:00.000Z')
  })

  it('uses the event index when the request row has no decision timestamp', () => {
    const rejected = request({ id: 'r', status: 'rejected' })
    const index = buildDecisionEventIndex([decisionEvent(1, 'r', 'rejected', '2026-09-24T03:00:00.000Z')])
    expect(reviewDecisionLabel(rejected, index)).toBe('9월 24일 반려')
  })

  it('calls a later pending round 재요청', () => {
    expect(reviewStatusText(request({ id: 'a' }))).toBe('대기 중')
    expect(reviewStatusText(request({ id: 'b', review_round: 2 }))).toBe('재요청')
    expect(reviewStatusText(request({ id: 'c', status: 'approved' }))).toBe('승인')
  })

  it('validates stored sort modes', () => {
    expect(isReviewSortMode('decided')).toBe(true)
    expect(isReviewSortMode('priority')).toBe(true)
    expect(isReviewSortMode('newest')).toBe(false)
  })
})
