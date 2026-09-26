import { describe, expect, it } from 'vitest'
import type { Profile, ReviewRequest } from '../../types'
import { buildReviewRequestItemModel, latestLeaderFeedback } from './reviewRequestItemModel'

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: '파트원',
  role: 'member',
  is_active: true,
}

const leader: Profile = { ...member, id: 'leader-1', email: 'leader@example.com', name: '파트장', role: 'leader' }

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
  const referenceNow = new Date('2026-07-17T09:00:00+09:00')

  it('preserves pending owner actions and a single due chip', () => {
    const model = buildReviewRequestItemModel(request(), member, referenceNow)

    expect(model.canEditOwn).toBe(true)
    expect(model.canWithdrawOwn).toBe(true)
    expect(model.canResubmitOwn).toBe(false)
    expect(model.statusLabel).toBe('대기 중')
    expect(model.progressSteps.map((step) => step.label)).toEqual(['7월 17일 요청'])
    expect(model.dueChip).toEqual(expect.objectContaining({ kind: 'tomorrow', shortLabel: '내일 마감', tone: 'urgent' }))
  })

  it('derives the historical rejected defaults and the member resubmission action', () => {
    const model = buildReviewRequestItemModel(
      request({ status: 'rejected', closed_at: '2026-07-18T01:00:00.000Z' }),
      member,
      referenceNow,
    )

    expect(model.rejectionCount).toBe(1)
    expect(model.showRejectionCount).toBe(false)
    expect(model.canEditOwn).toBe(false)
    expect(model.canWithdrawOwn).toBe(false)
    expect(model.canResubmitOwn).toBe(true)
    expect(model.dueChip).toBeNull()
    expect(model.progressSteps.map((step) => step.label)).toEqual(['7월 17일 요청', '7월 18일 반려'])
  })

  it('labels a later pending round as 재요청 and keeps the rejection count visible', () => {
    const model = buildReviewRequestItemModel(
      request({ review_round: 2, rejection_count: 1, last_submitted_at: '2026-07-19T00:00:00.000Z' }),
      member,
      referenceNow,
    )

    expect(model.reviewRound).toBe(2)
    expect(model.statusLabel).toBe('재요청')
    expect(model.showRejectionCount).toBe(true)
    expect(model.progressSteps.map((step) => step.key)).toEqual(['requested', 'resubmitted'])
  })

  it('never shows overdue for an approved request and lets only the leader decide or reopen', () => {
    const approved = request({ status: 'approved', due_date: '2026-07-01', closed_at: '2026-07-20T00:00:00.000Z' })
    const memberModel = buildReviewRequestItemModel(approved, member, referenceNow)
    const leaderModel = buildReviewRequestItemModel(approved, leader, referenceNow)

    expect(memberModel.canEditOwn).toBe(false)
    expect(memberModel.dueChip).toBeNull()
    expect(memberModel.due.kind).toBe('done')
    expect(memberModel.progressSteps[memberModel.progressSteps.length - 1]?.label).toBe('7월 20일 승인')
    expect(leaderModel.canReopen).toBe(true)
    expect(leaderModel.canDecide).toBe(false)
    expect(buildReviewRequestItemModel(request(), leader, referenceNow).canDecide).toBe(true)
  })

  it('finds the latest non-voided leader feedback as the rejection reason', () => {
    const withFeedback = request({
      review_feedback: [
        { id: 'f1', review_request_id: 'review-1', leader_id: 'leader-1', author_role: 'leader', comment: '첫 사유' },
        { id: 'f2', review_request_id: 'review-1', leader_id: 'leader-1', author_role: 'leader', comment: '무효', voided_at: '2026-07-18T00:00:00.000Z' },
        { id: 'f3', review_request_id: 'review-1', leader_id: member.id, author_role: 'member', comment: '재요청 내용' },
      ],
    })
    expect(latestLeaderFeedback(withFeedback)?.id).toBe('f1')
    expect(latestLeaderFeedback(request())).toBeNull()
  })
})
