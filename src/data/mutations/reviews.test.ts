import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { toStorageAttachmentUrl } from '../../lib/attachments'
import { UserFacingError } from '../../lib/errors'
import {
  deleteReviewFeedback,
  addReviewFeedback,
  rejectReviewRequest,
  reopenReviewRequest,
  saveReviewRequest,
  updateReviewFeedback,
  updateReviewStatus,
  withdrawReviewRequest,
} from './reviews'
import type { RepositoryContext } from '../repositoryContext'

describe('withdrawReviewRequest (demo)', () => {
  it('removes a pending review from local data', async () => {
    const data = createPreviewData()
    const reviewId = 'demo-withdraw-test'
    const seeded = {
      ...data,
      reviewRequests: [
        {
          id: reviewId,
          requester_id: previewMember.id,
          title: '회수 테스트',
          description: 'demo',
          attachment_url: null,
          due_date: null,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          profiles: { name: previewMember.name, email: previewMember.email },
          review_feedback: [],
        },
        ...data.reviewRequests,
      ],
    }

    let next = seeded
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewMember,
      data: seeded,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    }

    await withdrawReviewRequest(ctx, reviewId)
    expect(next.reviewRequests.some((item) => item.id === reviewId)).toBe(false)
  })
})

describe('rejectReviewRequest (demo)', () => {
  it('marks a review as rejected with feedback in local data', async () => {
    const data = createPreviewData()
    const reviewId = data.reviewRequests[0]?.id
    expect(reviewId).toBeTruthy()

    let next = data
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewLeader,
      data,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    }

    await rejectReviewRequest(ctx, reviewId!, '반려 사유')
    const updated = next.reviewRequests.find((item) => item.id === reviewId)
    expect(updated?.status).toBe('rejected')
    expect(updated?.review_feedback?.some((item) => item.comment === '반려 사유')).toBe(true)
  })
})

describe('saveReviewRequest (demo)', () => {
  it('rejects editing a review that disappeared from the local snapshot', async () => {
    const data = createPreviewData()
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewMember,
      data,
      setData: () => undefined,
    }

    await expect(
      saveReviewRequest(ctx, {
        editingReviewId: 'missing-review',
        payload: { title: 'stale', description: '', attachment_url: null, due_date: null },
      }),
    ).rejects.toBeInstanceOf(UserFacingError)
  })

  it('rejects storage attachments that do not belong to the requester', async () => {
    const data = createPreviewData()
    let next = data
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewMember,
      data,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    }

    await expect(
      saveReviewRequest(ctx, {
        editingReviewId: null,
        payload: {
          title: '첨부 테스트',
          description: 'demo',
          attachment_url: toStorageAttachmentUrl('other-user/file.pdf'),
          due_date: null,
        },
      }),
    ).rejects.toThrow('본인이 업로드한 파일만 첨부할 수 있습니다.')

    expect(next.reviewRequests).toHaveLength(data.reviewRequests.length)
  })
})

describe('leader-only review mutations (demo)', () => {
  it('rejects direct member calls to status, feedback, and reopen paths', async () => {
    const data = createPreviewData()
    const requestId = data.reviewRequests[0]?.id
    expect(requestId).toBeTruthy()
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewMember,
      data,
      setData: () => undefined,
    }

    await expect(rejectReviewRequest(ctx, requestId!, 'reason')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(updateReviewStatus(ctx, requestId!, 'approved')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(reopenReviewRequest(ctx, requestId!)).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(updateReviewFeedback(ctx, 'missing-feedback', 'updated')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(deleteReviewFeedback(ctx, 'missing-feedback')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
  })
})

describe('withdrawReviewRequest (demo) missing-record guard', () => {
  it('rejects a request that disappeared from the local snapshot', async () => {
    const data = createPreviewData()
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewMember,
      data,
      setData: () => undefined,
    }

    await expect(withdrawReviewRequest(ctx, 'missing-review')).rejects.toBeInstanceOf(UserFacingError)
  })
})

describe('updateReviewStatus (demo)', () => {
  it('updates review status in local data', async () => {
    const data = createPreviewData()
    const reviewId = data.reviewRequests[0]?.id
    expect(reviewId).toBeTruthy()

    let next = data
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewLeader,
      data,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    }

    await updateReviewStatus(ctx, reviewId!, 'approved')
    const updated = next.reviewRequests.find((item) => item.id === reviewId)
    expect(updated?.status).toBe('approved')
    expect(
      next.activityLogs.some(
        (log) => log.entity_id === reviewId && log.action === 'status_changed' && log.metadata?.status === 'approved',
      ),
    ).toBe(true)
  })
})

describe('reopenReviewRequest and feedback correction (demo)', () => {
  it('reopens a closed request and retains its feedback history', async () => {
    const data = createPreviewData()
    const source = data.reviewRequests[0]!
    const closed = {
      ...source,
      status: 'rejected' as const,
      review_feedback: [{
        id: 'feedback-reopen',
        review_request_id: source.id,
        leader_id: previewLeader.id,
        comment: 'old comment',
        created_at: new Date().toISOString(),
        profiles: { name: previewLeader.name },
      }],
    }
    let next = { ...data, reviewRequests: [closed, ...data.reviewRequests.slice(1)] }
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewLeader,
      data: next,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    }

    await reopenReviewRequest(ctx, source.id)
    await updateReviewFeedback(ctx, 'feedback-reopen', 'corrected')
    await deleteReviewFeedback(ctx, 'feedback-reopen')

    const updated = next.reviewRequests.find((item) => item.id === source.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.review_feedback).toEqual([])
    expect(next.activityLogs.some((log) => log.action === 'reopened')).toBe(true)
  })
})

describe('local review ownership parity', () => {
  it('does not let another member edit or withdraw a pending request', async () => {
    const data = createPreviewData()
    const request = data.reviewRequests[0]!
    const otherMember = { ...previewMember, id: 'other-member', email: 'other@example.com' }
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: otherMember,
      data,
      setData: () => undefined,
    }

    await expect(
      saveReviewRequest(ctx, {
        editingReviewId: request.id,
        payload: { title: 'changed', description: request.description, attachment_url: null, due_date: null },
      }),
    ).rejects.toThrow('본인의 요청만 수정할 수 있습니다.')
    await expect(withdrawReviewRequest(ctx, request.id)).rejects.toThrow('본인의 요청만 회수할 수 있습니다.')
  })

  it('rejects feedback for a missing request instead of logging a false success', async () => {
    const data = createPreviewData()
    const ctx: RepositoryContext = {
      isRemote: false,
      profile: previewLeader,
      data,
      setData: () => undefined,
    }

    await expect(addReviewFeedback(ctx, 'missing-review', 'comment')).rejects.toBeInstanceOf(UserFacingError)
  })
})
