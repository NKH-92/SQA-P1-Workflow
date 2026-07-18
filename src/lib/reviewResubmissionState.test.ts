import { describe, expect, it } from 'vitest'
import type { AppData, Profile, ReviewEvent, ReviewRequest } from '../types'
import { buildNotifications } from './notifications'
import { isReviewUnread } from './readState'

const member: Profile = { id: 'member-1', email: 'member@example.com', name: '파트원', role: 'member' }
const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: '파트장', role: 'leader' }
const request: ReviewRequest = {
  id: 'review-1', requester_id: member.id, title: '재검토 대상', description: '설명', due_date: null,
  status: 'pending', review_round: 2, rejection_count: 1, created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-15T01:00:00.000Z', last_submitted_at: '2026-07-15T01:00:00.000Z',
  profiles: { name: member.name, email: member.email }, review_feedback: [],
}
const resubmitted: ReviewEvent = {
  id: 2, review_request_id: request.id, actor_id: member.id, actor_name_snapshot: member.name,
  event_type: 'resubmitted', from_status: 'rejected', to_status: 'pending',
  occurred_at: '2026-07-15T01:00:00.000Z', metadata: { estimated: false }, transaction_id: 2,
}

function appData(receiptEventId?: number): AppData {
  return {
    announcements: [], changeApplications: [], changeActionItems: [], productChangeTasks: [],
    changeProductScope: [], changeAssigneeOptions: [], profiles: [member, leader], allowedUsers: [], products: [],
    duties: [], dutyMajorCategories: [], productAssignments: [], dutyAssignments: [], reviewRequests: [request],
    reviewEvents: [resubmitted], reviewReadReceipts: receiptEventId == null ? [] : [{
      user_id: leader.id, review_request_id: request.id, last_seen_event_id: receiptEventId,
      read_at: '2026-07-15T01:01:00.000Z',
    }], auditEvents: [], projects: [], projectAssignments: [], profileNotes: [], activityLogs: [],
  }
}

describe('review resubmission read state', () => {
  it('marks an unseen same-row resubmission unread for the leader', () => {
    expect(isReviewUnread(request, leader, appData())).toBe(true)
    expect(isReviewUnread(request, leader, appData(2))).toBe(false)
  })

  it('does not mark a member own resubmission unread', () => {
    expect(isReviewUnread(request, member, appData())).toBe(false)
  })

  it('builds a leader notification from the immutable resubmission event', () => {
    const notifications = buildNotifications(leader, appData(), true, Date.parse('2026-07-15T01:05:00.000Z'))
    expect(notifications[0]).toEqual(expect.objectContaining({
      title: '파트원님이 “재검토 대상” 재검토를 요청했습니다.', unread: true,
      at: Date.parse('2026-07-15T01:00:00.000Z'),
    }))
  })
})
