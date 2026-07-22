import { describe, expect, it } from 'vitest'
import type { AppData, Profile, ReviewEvent, ReviewRequest } from '../types'
import {
  buildReviewReadReceipts,
  countUnreadReviews,
  isReviewUnread,
  latestRelevantReviewEventIdsByRequest,
} from './readState'

const leader: Profile = { id: 'leader', email: 'leader@example.com', name: '파트장', role: 'leader' }
const member: Profile = { id: 'member', email: 'member@example.com', name: '파트원', role: 'member' }
const request: ReviewRequest = {
  id: 'review', requester_id: member.id, title: '검토', description: '설명', due_date: null,
  status: 'pending', created_at: '2026-07-18T00:00:00.000Z', review_feedback: [],
}
const submitted: ReviewEvent = {
  id: 10, review_request_id: request.id, actor_id: member.id, actor_name_snapshot: member.name,
  event_type: 'submitted', from_status: null, to_status: 'pending', occurred_at: request.created_at!,
  metadata: {}, transaction_id: 1,
}
const feedback: ReviewEvent = {
  ...submitted, id: 11, actor_id: leader.id, actor_name_snapshot: leader.name,
  event_type: 'feedback_added', from_status: null, to_status: null, transaction_id: 2,
}
const voidedFeedback: ReviewEvent = {
  ...feedback,
  id: 12,
  event_type: 'feedback_voided',
  transaction_id: 3,
}

function data(events: ReviewEvent[], lastSeen?: number): AppData {
  return {
    announcements: [], changeApplications: [], changeActionItems: [], productChangeTasks: [],
    changeProductScope: [], changeAssigneeOptions: [], profiles: [leader, member], allowedUsers: [], products: [],
    dutyMajorCategories: [], duties: [], productAssignments: [], dutyAssignments: [], reviewRequests: [request],
    reviewEvents: events, reviewReadReceipts: lastSeen == null ? [] : [{
      user_id: leader.id, review_request_id: request.id, last_seen_event_id: lastSeen,
      read_at: '2026-07-18T00:01:00.000Z',
    }], auditEvents: [], projects: [], projectAssignments: [], profileNotes: [], activityLogs: [],
  }
}

describe('server-backed review read state', () => {
  it('compares the latest relevant event id with the receipt', () => {
    expect(isReviewUnread(request, leader, data([submitted]))).toBe(true)
    expect(isReviewUnread(request, leader, data([submitted], 10))).toBe(false)
  })

  it('does not count events that are irrelevant to the current role', () => {
    expect(isReviewUnread(request, leader, data([feedback]))).toBe(false)
    expect(isReviewUnread(request, member, data([submitted]))).toBe(false)
  })

  it('uses the same request-level predicate for the navigation badge', () => {
    expect(countUnreadReviews(leader, data([submitted]))).toBe(1)
  })

  it('uses feedback_voided as the latest relevant member event for every receipt projection', () => {
    expect(isReviewUnread(request, member, data([feedback, voidedFeedback]))).toBe(true)
    expect(latestRelevantReviewEventIdsByRequest([request], member, [feedback, voidedFeedback]))
      .toEqual(new Map([[request.id, '12']]))
    expect(buildReviewReadReceipts([request], member, [feedback, voidedFeedback], '2026-07-18T00:02:00.000Z'))
      .toEqual([{
        user_id: member.id,
        review_request_id: request.id,
        last_seen_event_id: '12',
        read_at: '2026-07-18T00:02:00.000Z',
      }])
  })
})
