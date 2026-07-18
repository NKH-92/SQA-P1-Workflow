import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ReviewRequest } from '../../types'
import { buildReviewRequestItemModel } from './reviewRequestItemModel'

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: '파트원',
  role: 'member',
  is_active: true,
}

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: 'review-1',
    requester_id: member.id,
    title: '검토 요청',
    description: '내용',
    due_date: '2026-07-18',
    status: 'pending',
    created_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('review request item model', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T09:00:00+09:00'))
  })

  afterEach(() => vi.useRealTimers())

  it('preserves pending owner actions and timeline states', () => {
    const model = buildReviewRequestItemModel(request(), member)

    expect(model.canEditOwn).toBe(true)
    expect(model.canWithdrawOwn).toBe(true)
    expect(model.isMemberResubmission).toBe(false)
    expect(model.statusLabel).toBe('대기중')
    expect(model.timelineSteps.map((step) => step.state)).toEqual(['current', 'waiting'])
    expect(model.dueUrgent).toBe(true)
  })

  it('derives the historical rejected defaults and member resubmission state', () => {
    const model = buildReviewRequestItemModel(request({ status: 'rejected' }), member)

    expect(model.rejectionCount).toBe(1)
    expect(model.canEditOwn).toBe(true)
    expect(model.canWithdrawOwn).toBe(false)
    expect(model.isMemberResubmission).toBe(true)
    expect(model.timelineSteps.map((step) => [step.label, step.state])).toEqual([
      ['대기중', 'complete'],
      ['반려', 'current'],
    ])
  })

  it('labels a later pending round as a re-review request', () => {
    const model = buildReviewRequestItemModel(request({ review_round: 2 }), member)

    expect(model.reviewRound).toBe(2)
    expect(model.statusLabel).toBe('재검토 요청')
  })

  it('marks both approved timeline steps complete', () => {
    const model = buildReviewRequestItemModel(request({ status: 'approved' }), member)

    expect(model.canEditOwn).toBe(false)
    expect(model.timelineSteps.map((step) => step.state)).toEqual(['complete', 'complete'])
  })
})
