import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, ReviewRequest } from '../../types'
import { UserFacingError } from '../../lib/errors'
import type { RepositoryContext } from '../repositoryContext'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
  updateResult: { data: [{ id: 'review-1' }], error: null } as { data: Array<{ id: string }>; error: unknown },
  deleteResult: { data: [{ id: 'review-1' }], error: null } as { data: Array<{ id: string }>; error: unknown },
  insertResult: { data: { id: 'review-created' }, error: null } as { data: { id: string } | null; error: unknown },
  update: vi.fn(),
  updateEq: vi.fn(),
  delete: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  removeReviewAttachment: vi.fn(async () => undefined),
  recordActivityLog: vi.fn(async () => undefined),
}))

mocks.update.mockImplementation(() => {
  const query = {
    select: vi.fn(async () => mocks.updateResult),
    eq: vi.fn(),
  }
  mocks.updateEq.mockImplementation(() => query)
  query.eq = mocks.updateEq
  return query
})
mocks.delete.mockImplementation(() => ({
  eq: vi.fn(() => ({ select: vi.fn(async () => mocks.deleteResult) })),
}))
mocks.insert.mockImplementation(() => ({
  select: vi.fn(() => ({ single: vi.fn(async () => mocks.insertResult) })),
}))
mocks.from.mockImplementation(() => ({
  update: mocks.update,
  delete: mocks.delete,
  insert: mocks.insert,
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { from: mocks.from, rpc: mocks.rpc },
}))

vi.mock('../../lib/activityLog', () => ({ recordActivityLog: mocks.recordActivityLog }))

vi.mock('../../lib/attachments', () => ({
  isStorageAttachment: (value?: string | null) => Boolean(value?.startsWith('storage://review-attachments/')),
  validateStorageAttachmentOwnership: () => null,
  removeReviewAttachment: mocks.removeReviewAttachment,
}))

import {
  addReviewFeedback,
  deleteReviewFeedback,
  reopenReviewRequest,
  resubmitReviewRequest,
  rejectReviewRequest,
  saveReviewRequest,
  updateReviewFeedback,
  updateReviewStatus,
  withdrawReviewRequest,
} from './reviews'

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: 'Member',
  role: 'member',
}
const leader: Profile = {
  id: 'leader-1',
  email: 'leader@example.com',
  name: 'Leader',
  role: 'leader',
}

const review: ReviewRequest = {
  id: 'review-1',
  requester_id: member.id,
  title: 'Review',
  description: 'Description',
  attachment_url: 'storage://review-attachments/member-1/old.pdf',
  due_date: null,
  status: 'pending',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  profiles: null,
  review_feedback: [],
}

function remoteContext(profile: Profile = member): RepositoryContext {
  const data: AppData = {
    announcements: [],
    profiles: [member],
    allowedUsers: [],
    products: [],
    duties: [],
    dutyMajorCategories: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [review],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
  return { isRemote: true, profile, data, setData: vi.fn() }
}

describe('review mutation contracts (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null })
    mocks.updateResult = { data: [{ id: review.id }], error: null }
    mocks.deleteResult = { data: [{ id: review.id }], error: null }
    mocks.insertResult = { data: { id: 'review-created' }, error: null }
    mocks.update.mockClear()
    mocks.updateEq.mockClear()
    mocks.delete.mockClear()
    mocks.insert.mockClear()
    mocks.from.mockClear()
    mocks.removeReviewAttachment.mockClear()
    mocks.recordActivityLog.mockClear()
  })

  it('maps review status, rejection, and feedback RPC names and parameters', async () => {
    const ctx = remoteContext(leader)
    await updateReviewStatus(ctx, review.id, 'approved')
    await rejectReviewRequest(ctx, review.id, 'needs changes')
    mocks.rpc.mockResolvedValueOnce({ data: 'feedback-1', error: null })
    await addReviewFeedback(ctx, review.id, 'comment')

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'update_review_request_status', {
      p_review_request_id: review.id,
      p_status: 'approved',
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'reject_review_request', {
      p_review_request_id: review.id,
      p_comment: 'needs changes',
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, 'add_review_feedback', {
      p_review_request_id: review.id,
      p_comment: 'comment',
    })
  })

  it('maps leader reopen to the guarded RPC without a client-side audit duplicate', async () => {
    const closed = { ...review, status: 'rejected' as const }
    const ctx = remoteContext(leader)
    ctx.data.reviewRequests = [closed]

    await reopenReviewRequest(ctx, closed.id)

    expect(mocks.rpc).toHaveBeenCalledWith('reopen_review_request', {
      p_review_request_id: closed.id,
    })
    expect(mocks.recordActivityLog).not.toHaveBeenCalled()
  })

  it('maps member resubmission to the atomic same-request RPC', async () => {
    const rejected = {
      ...review,
      status: 'rejected' as const,
      review_round: 1,
      rejection_count: 1,
    }
    const ctx = remoteContext(member)
    ctx.data.reviewRequests = [rejected]

    await resubmitReviewRequest(ctx, rejected.id, '  changes applied  ')

    expect(mocks.rpc).toHaveBeenCalledWith('resubmit_review_request', {
      p_review_request_id: rejected.id,
      p_comment: 'changes applied',
    })
    expect(mocks.recordActivityLog).not.toHaveBeenCalled()
  })

  it('updates and deletes feedback through direct comment-only rows', async () => {
    const withFeedback = {
      ...review,
      review_feedback: [{
        id: 'feedback-1',
        review_request_id: review.id,
        leader_id: 'leader-1',
        comment: 'old',
        created_at: '2026-07-01T00:00:00.000Z',
        profiles: { name: 'Leader' },
      }],
    }
    const ctx = remoteContext(leader)
    ctx.data.reviewRequests = [withFeedback]

    await updateReviewFeedback(ctx, 'feedback-1', 'new')
    await deleteReviewFeedback(ctx, 'feedback-1')

    expect(mocks.update).toHaveBeenCalledWith({ comment: 'new' })
    expect(mocks.delete).toHaveBeenCalled()
    expect(mocks.recordActivityLog).toHaveBeenCalledTimes(2)
  })

  it('creates a pending review with the authenticated requester id', async () => {
    const result = await saveReviewRequest(remoteContext(), {
      editingReviewId: null,
      payload: { title: 'New', description: 'Body', attachment_url: null, due_date: null },
    })

    expect(mocks.from).toHaveBeenCalledWith('review_requests')
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      requester_id: member.id,
      status: 'pending',
      title: 'New',
    }))
    expect(result).toEqual({ reviewId: 'review-created', isUpdate: false })
  })

  it('does not delete the previous attachment when a stale edit affects zero rows', async () => {
    mocks.updateResult = { data: [], error: null }

    await expect(saveReviewRequest(remoteContext(), {
      editingReviewId: review.id,
      payload: {
        title: review.title,
        description: review.description,
        attachment_url: 'storage://review-attachments/member-1/new.pdf',
        due_date: null,
      },
    })).rejects.toBeInstanceOf(UserFacingError)

    expect(mocks.removeReviewAttachment).not.toHaveBeenCalled()
    expect(mocks.recordActivityLog).not.toHaveBeenCalled()
  })

  it('removes a replaced attachment only after the review update succeeds', async () => {
    await saveReviewRequest(remoteContext(), {
      editingReviewId: review.id,
      payload: {
        title: review.title,
        description: review.description,
        attachment_url: 'storage://review-attachments/member-1/new.pdf',
        due_date: null,
      },
    })

    expect(mocks.removeReviewAttachment).toHaveBeenCalledWith(review.attachment_url)
    expect(mocks.update).toHaveBeenCalledBefore(mocks.removeReviewAttachment)
    expect(mocks.updateEq).toHaveBeenCalledWith('updated_at', review.updated_at)
  })

  it('does not remove an attachment or log success when withdraw affects zero rows', async () => {
    mocks.deleteResult = { data: [], error: null }

    await expect(withdrawReviewRequest(remoteContext(), review.id)).rejects.toBeInstanceOf(UserFacingError)
    expect(mocks.removeReviewAttachment).not.toHaveBeenCalled()
    expect(mocks.recordActivityLog).not.toHaveBeenCalled()
  })
})
