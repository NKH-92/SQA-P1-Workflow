import { describe, expect, it } from 'vitest'
import type { ReviewEvent, ReviewRequest } from '../../types'
import { ReviewStatisticsV2RangeError, buildReviewStatisticsV2 } from './reviewStatisticsV2'

function request(
  id: string,
  requesterId: string,
  createdAt: string,
  status: ReviewRequest['status'] = 'pending',
): ReviewRequest {
  return {
    id,
    requester_id: requesterId,
    title: id,
    description: '',
    due_date: null,
    status,
    created_at: createdAt,
  }
}

let nextEventId = 1
function event(
  reviewRequestId: string,
  eventType: ReviewEvent['event_type'],
  occurredAt: string,
  toStatus: ReviewEvent['from_status'] = null,
): ReviewEvent {
  return {
    id: nextEventId++,
    review_request_id: reviewRequestId,
    actor_id: null,
    actor_name_snapshot: 'actor',
    event_type: eventType,
    from_status: null,
    to_status: toStatus,
    occurred_at: occurredAt,
    metadata: {},
    transaction_id: 1,
  }
}

describe('buildReviewStatisticsV2 (local parity with get_review_statistics_v2 SQL)', () => {
  it('counts each event type only within the KST business-day range, matching the DB day boundary', () => {
    const requests = [request('r1', 'member-a', '2026-06-30T23:00:00.000Z', 'pending')]
    const events = [
      // 2026-06-30T23:00:00Z == 2026-07-01T08:00 KST -> inside July KST range.
      event('r1', 'submitted', '2026-06-30T23:00:00.000Z', 'pending'),
      // 2026-06-30T14:00:00Z == 2026-06-30T23:00 KST -> still June KST, must be excluded from a July range.
      event('r1', 'resubmitted', '2026-06-30T14:00:00.000Z', 'pending'),
    ]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: events },
      { from: '2026-07-01', to: '2026-07-31' },
    )

    expect(result.new_requests).toBe(1)
    expect(result.resubmissions).toBe(0)
    expect(result.schema_version).toBe(2)
    expect(result.timezone).toBe('Asia/Seoul')
  })

  it('applies the requester filter uniformly to every count', () => {
    const requests = [
      request('r1', 'member-a', '2026-07-01T00:00:00.000Z', 'pending'),
      request('r2', 'member-b', '2026-07-01T00:00:00.000Z', 'pending'),
    ]
    const events = [
      event('r1', 'submitted', '2026-07-02T00:00:00.000Z', 'pending'),
      event('r2', 'submitted', '2026-07-02T00:00:00.000Z', 'pending'),
    ]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: events },
      { from: '2026-07-01', to: '2026-07-31', requesterId: 'member-a' },
    )

    expect(result.new_requests).toBe(1)
    expect(result.pending_count).toBe(1)
    expect(result.requester_id).toBe('member-a')
  })

  it('applies the selected request-created range to the current pending scope', () => {
    const requests = [
      request('old-pending', 'member-a', '2020-01-01T00:00:00.000Z', 'pending'),
      request('closed', 'member-a', '2026-07-01T00:00:00.000Z', 'approved'),
    ]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: [] },
      { from: '2026-07-01', to: '2026-07-31' },
    )

    expect(result.pending_count).toBe(0)
  })

  it('returns the union of current-state and period-event requesters so requester rows can satisfy every KPI invariant', () => {
    const requests = [
      request('old-with-event', 'member-a', '2020-01-01T00:00:00.000Z', 'approved'),
      request('current-pending', 'member-b', '2026-07-02T00:00:00.000Z', 'pending'),
    ]
    const events = [
      event('old-with-event', 'approved', '2026-07-03T00:00:00.000Z', 'approved'),
    ]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: events },
      { from: '2026-07-01', to: '2026-07-31' },
    )

    expect(result.requester_breakdown).toEqual([
      expect.objectContaining({ requester_id: 'member-a', approvals: 1, pending_count: 0 }),
      expect.objectContaining({ requester_id: 'member-b', approvals: 0, pending_count: 1 }),
    ])
    expect(result.requester_breakdown.reduce((sum, row) => sum + row.approvals, 0)).toBe(result.approvals)
    expect(result.requester_breakdown.reduce((sum, row) => sum + row.pending_count, 0)).toBe(result.pending_count)
  })

  it('separates month-end backlog from current pending and reconstructs status per month from the event ledger', () => {
    const requests = [request('r1', 'member-a', '2026-05-15T00:00:00.000Z', 'rejected')]
    const events = [
      event('r1', 'submitted', '2026-05-15T00:00:00.000Z', 'pending'),
      event('r1', 'rejected', '2026-06-10T00:00:00.000Z', 'rejected'),
      // A feedback_voided event with no to_status timestamped after the rejection must
      // never be mistaken for "the request went back to pending" (regression guard).
      event('r1', 'feedback_voided', '2026-06-15T00:00:00.000Z', null),
      event('r1', 'resubmitted', '2026-07-05T00:00:00.000Z', 'pending'),
    ]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: events },
      { from: '2026-05-01', to: '2026-07-31' },
    )

    expect(result.month_end_backlog).toEqual([
      { month: '2026-05', business_date: '2026-05-31', backlog_count: 1 },
      { month: '2026-06', business_date: '2026-06-30', backlog_count: 0 },
      { month: '2026-07', business_date: '2026-07-31', backlog_count: 1 },
    ])
    // "현재 대기" (pending_count) reflects the live status, separate from the backlog series.
    expect(result.pending_count).toBe(0)
  })

  it('excludes a request from month-end backlog before it was even created', () => {
    const requests = [request('future', 'member-a', '2026-08-01T00:00:00.000Z', 'pending')]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: [] },
      { from: '2026-07-01', to: '2026-07-31' },
    )

    expect(result.month_end_backlog).toEqual([
      { month: '2026-07', business_date: '2026-07-31', backlog_count: 0 },
    ])
  })

  it('applies the current-status filter to event counts, pending, and backlog alike', () => {
    const requests = [
      request('pending-req', 'member-a', '2026-07-01T00:00:00.000Z', 'pending'),
      request('approved-req', 'member-a', '2026-07-01T00:00:00.000Z', 'approved'),
    ]
    const events = [
      event('pending-req', 'submitted', '2026-07-02T00:00:00.000Z', 'pending'),
      event('approved-req', 'submitted', '2026-07-02T00:00:00.000Z', 'pending'),
      event('approved-req', 'approved', '2026-07-03T00:00:00.000Z', 'approved'),
    ]

    const result = buildReviewStatisticsV2(
      { reviewRequests: requests, reviewEvents: events },
      { from: '2026-07-01', to: '2026-07-31', status: 'approved' },
    )

    expect(result.new_requests).toBe(1)
    expect(result.approvals).toBe(1)
    expect(result.pending_count).toBe(0)
  })

  it('rejects an inverted or over-long range the same way the RPC does', () => {
    expect(() =>
      buildReviewStatisticsV2({ reviewRequests: [], reviewEvents: [] }, { from: '2026-07-31', to: '2026-07-01' }),
    ).toThrow(ReviewStatisticsV2RangeError)
    expect(() =>
      buildReviewStatisticsV2({ reviewRequests: [], reviewEvents: [] }, { from: '2020-01-01', to: '2026-07-01' }),
    ).toThrow(ReviewStatisticsV2RangeError)
    expect(() =>
      buildReviewStatisticsV2({ reviewRequests: [], reviewEvents: [] }, { from: 'not-a-date', to: '2026-07-01' }),
    ).toThrow(ReviewStatisticsV2RangeError)
  })

  it('never includes raw event rows in the envelope', () => {
    const result = buildReviewStatisticsV2(
      { reviewRequests: [], reviewEvents: [] },
      { from: '2026-07-01', to: '2026-07-31' },
    )
    expect(result).not.toHaveProperty('events')
    expect(Object.keys(result).sort()).toEqual(
      [
        'approvals',
        'from',
        'generated_at',
        'month_end_backlog',
        'monthly_breakdown',
        'new_requests',
        'pending_count',
        'rejections',
        'requester_id',
        'requester_breakdown',
        'resubmissions',
        'schema_version',
        'status',
        'timezone',
        'to',
      ].sort(),
    )
  })
})
