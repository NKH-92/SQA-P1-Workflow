import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, ReviewRequest } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import {
  addReviewFeedback,
  rejectReviewRequest,
  reopenReviewRequest,
  resubmitReviewRequest,
  saveReviewRequest,
  updateReviewFeedback,
  updateReviewStatus,
  voidReviewFeedback,
  withdrawReviewRequest,
} from './reviews'

const member: Profile = { id: 'member-1', email: 'member@example.com', name: 'Member', role: 'member' }
const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: 'Leader', role: 'leader' }
const updatedAt = '2026-07-01T00:00:00.000Z'
const review: ReviewRequest = {
  id: 'review-1', requester_id: member.id, title: 'Review', description: 'Description', due_date: null,
  status: 'pending', created_at: updatedAt, updated_at: updatedAt, profiles: null, review_feedback: [],
}

function remoteContext(profile: Profile = member): RepositoryContext {
  const data: AppData = {
    announcements: [], changeApplications: [], changeActionItems: [], productChangeTasks: [],
    changeProductScope: [], changeAssigneeOptions: [], profiles: [member, leader], allowedUsers: [], products: [],
    duties: [], dutyMajorCategories: [], productAssignments: [], dutyAssignments: [], reviewRequests: [review],
    reviewEvents: [], reviewReadReceipts: [], auditEvents: [], projects: [], projectAssignments: [],
    profileNotes: [], activityLogs: [],
  }
  return createRepositoryContextFromDeps('remote', {profile, data, setData: vi.fn() })
}

describe('review mutation contracts (remote)', () => {
  beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null }))

  it('uses OCC RPCs for approval and rejection', async () => {
    const ctx = remoteContext(leader)
    await updateReviewStatus(ctx, review.id, 'approved')
    await rejectReviewRequest(ctx, review.id, 'needs changes')
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'approve_review_request', {
      p_review_request_id: review.id, p_expected_updated_at: updatedAt,
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'reject_review_request', {
      p_review_request_id: review.id, p_expected_updated_at: updatedAt, p_comment: 'needs changes',
    })
  })

  it('maps reopen and same-request resubmission with expected versions', async () => {
    const closed = { ...review, status: 'rejected' as const }
    const leaderCtx = remoteContext(leader)
    leaderCtx.data.reviewRequests = [closed]
    await reopenReviewRequest(leaderCtx, closed.id)
    const memberCtx = remoteContext(member)
    memberCtx.data.reviewRequests = [closed]
    await resubmitReviewRequest(memberCtx, closed.id, '  changes applied  ')
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'reopen_review_request', {
      p_review_request_id: closed.id, p_expected_updated_at: updatedAt,
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'resubmit_review_request', {
      p_review_request_id: closed.id, p_expected_updated_at: updatedAt, p_comment: 'changes applied',
    })
  })

  it('updates and voids feedback without deleting history', async () => {
    const withFeedback = { ...review, review_feedback: [{
      id: 'feedback-1', review_request_id: review.id, leader_id: leader.id, author_role: 'leader' as const,
      comment: 'old', created_at: updatedAt, updated_at: updatedAt, profiles: { name: leader.name },
    }] }
    const ctx = remoteContext(leader)
    ctx.data.reviewRequests = [withFeedback]
    await updateReviewFeedback(ctx, 'feedback-1', 'new')
    await voidReviewFeedback(ctx, 'feedback-1', 'incorrect guidance')
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'update_review_feedback', {
      p_feedback_id: 'feedback-1', p_expected_updated_at: updatedAt, p_comment: 'new',
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'void_review_feedback', {
      p_feedback_id: 'feedback-1', p_expected_updated_at: updatedAt, p_reason: 'incorrect guidance',
    })
  })

  it('creates and edits reviews through attachment-free RPC contracts', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'review-created', error: null })
    const created = await saveReviewRequest(remoteContext(), {
      editingReviewId: null, payload: { title: 'New', description: 'Body', due_date: null },
    })
    await saveReviewRequest(remoteContext(), {
      editingReviewId: review.id, payload: { title: 'Edited', description: 'Body', due_date: null },
    })
    expect(created).toEqual({ reviewId: 'review-created', isUpdate: false })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'create_review_request', {
      p_title: 'New', p_description: 'Body', p_due_date: null,
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'update_review_request', {
      p_review_request_id: review.id, p_expected_updated_at: updatedAt,
      p_title: 'Edited', p_description: 'Body', p_due_date: null,
    })
  })

  it('soft-withdraws with OCC and a required reason', async () => {
    await withdrawReviewRequest(remoteContext(), review.id, 'request no longer needed')
    expect(mocks.rpc).toHaveBeenCalledWith('withdraw_review_request', {
      p_review_request_id: review.id, p_expected_updated_at: updatedAt, p_reason: 'request no longer needed',
    })
  })

  it('keeps feedback creation on the server-owned RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'feedback-1', error: null })
    await addReviewFeedback(remoteContext(leader), review.id, 'comment')
    expect(mocks.rpc).toHaveBeenCalledWith('add_review_feedback', {
      p_review_request_id: review.id, p_comment: 'comment',
    })
  })
})
