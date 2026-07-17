import { beforeEach, describe, expect, it } from 'vitest'
import type { AppData, Profile, ReviewRequest } from '../types'
import { buildNotifications } from './notifications'
import { isReviewUnread } from './readState'

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: '파트원',
  role: 'member',
}

const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: '파트장',
  role: 'leader',
}

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: 'review-1',
    requester_id: member.id,
    title: '재검토 대상',
    description: '설명',
    attachment_url: null,
    due_date: null,
    status: 'pending',
    review_round: 2,
    rejection_count: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-15T01:00:00.000Z',
    last_submitted_at: '2026-07-15T01:00:00.000Z',
    profiles: { name: member.name, email: member.email },
    review_feedback: [],
    ...overrides,
  }
}

function appData(reviewRequests: ReviewRequest[]): AppData {
  return {
    announcements: [],
    profiles: [member, leader],
    allowedUsers: [],
    products: [],
    duties: [],
    dutyMajorCategories: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests,
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
}

beforeEach(() => localStorage.clear())

describe('review resubmission read state', () => {
  it('marks a same-row resubmission unread for the leader using last_submitted_at', () => {
    expect(isReviewUnread(request(), leader, true, '2026-07-10T00:00:00.000Z')).toBe(true)
  })

  it('does not mark the member own resubmission feedback unread', () => {
    const resubmitted = request({
      review_feedback: [{
        id: 'member-feedback',
        review_request_id: 'review-1',
        leader_id: member.id,
        author_role: 'member',
        comment: '수정했습니다.',
        created_at: '2026-07-15T01:00:00.000Z',
      }],
    })

    expect(isReviewUnread(resubmitted, member, false, '2026-07-10T00:00:00.000Z')).toBe(false)
  })

  it('builds a leader notification that explicitly identifies a re-review request', () => {
    localStorage.setItem(
      `readState:${leader.id}`,
      JSON.stringify({ reviewsSeenAt: '2026-07-10T00:00:00.000Z' }),
    )

    const notifications = buildNotifications(
      leader,
      appData([request()]),
      true,
      Date.parse('2026-07-15T01:05:00.000Z'),
    )

    expect(notifications[0]).toEqual(expect.objectContaining({
      title: '파트원님이 “재검토 대상” 재검토를 요청했습니다.',
      unread: true,
      at: Date.parse('2026-07-15T01:00:00.000Z'),
    }))
  })
})
