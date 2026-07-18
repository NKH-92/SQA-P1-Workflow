import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { UserFacingError } from '../../lib/errors'
import {
  voidReviewFeedback,
  addReviewFeedback,
  rejectReviewRequest,
  reopenReviewRequest,
  resubmitReviewRequest,
  saveReviewRequest,
  updateReviewFeedback,
  updateReviewStatus,
  withdrawReviewRequest,
} from './reviews'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'

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
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data: seeded,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

    await withdrawReviewRequest(ctx, reviewId, '더 이상 검토가 필요하지 않음')
    expect(next.reviewRequests.find((item) => item.id === reviewId)?.status).toBe('withdrawn')
    expect(next.reviewRequests.find((item) => item.id === reviewId)?.withdrawal_reason).toBe('더 이상 검토가 필요하지 않음')
  })
})

describe('rejectReviewRequest (demo)', () => {
  it('marks a review as rejected with feedback in local data', async () => {
    const data = createPreviewData()
    const reviewId = data.reviewRequests[0]?.id
    expect(reviewId).toBeTruthy()

    let next = data
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewLeader,
      data,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

    await rejectReviewRequest(ctx, reviewId!, '반려 사유')
    const updated = next.reviewRequests.find((item) => item.id === reviewId)
    expect(updated?.status).toBe('rejected')
    expect(updated?.review_feedback?.some((item) => item.comment === '반려 사유')).toBe(true)
  })
})

describe('saveReviewRequest (demo)', () => {
  it('rejects editing a review that disappeared from the local snapshot', async () => {
    const data = createPreviewData()
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data,
      setData: () => undefined,
    })

    await expect(
      saveReviewRequest(ctx, {
        editingReviewId: 'missing-review',
        payload: { title: 'stale', description: '', due_date: null },
      }),
    ).rejects.toBeInstanceOf(UserFacingError)
  })

  it('creates a request without an attachment contract', async () => {
    const data = createPreviewData()
    let next = data
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

    await saveReviewRequest(ctx, {
      editingReviewId: null,
      payload: { title: '검토 테스트', description: 'demo', due_date: null },
    })
    expect(next.reviewRequests).toHaveLength(data.reviewRequests.length + 1)
  })
})

describe('leader-only review mutations (demo)', () => {
  it('rejects direct member calls to status, feedback, and reopen paths', async () => {
    const data = createPreviewData()
    const requestId = data.reviewRequests[0]?.id
    expect(requestId).toBeTruthy()
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data,
      setData: () => undefined,
    })

    await expect(rejectReviewRequest(ctx, requestId!, 'reason')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(updateReviewStatus(ctx, requestId!, 'approved')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(reopenReviewRequest(ctx, requestId!)).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(updateReviewFeedback(ctx, 'missing-feedback', 'updated')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
    await expect(voidReviewFeedback(ctx, 'missing-feedback', '잘못 작성함')).rejects.toThrow('활성 파트장 권한이 필요합니다.')
  })
})

describe('withdrawReviewRequest (demo) missing-record guard', () => {
  it('rejects a request that disappeared from the local snapshot', async () => {
    const data = createPreviewData()
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data,
      setData: () => undefined,
    })

    await expect(withdrawReviewRequest(ctx, 'missing-review', '회수 사유')).rejects.toBeInstanceOf(UserFacingError)
  })
})

describe('updateReviewStatus (demo)', () => {
  it('updates review status in local data', async () => {
    const data = createPreviewData()
    const reviewId = data.reviewRequests[0]?.id
    expect(reviewId).toBeTruthy()

    let next = data
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewLeader,
      data,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

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
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewLeader,
      data: next,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

    await reopenReviewRequest(ctx, source.id)
    await updateReviewFeedback(ctx, 'feedback-reopen', 'corrected')
    await voidReviewFeedback(ctx, 'feedback-reopen', '잘못 작성한 피드백')

    const updated = next.reviewRequests.find((item) => item.id === source.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.review_feedback?.[0]).toEqual(expect.objectContaining({ void_reason: '잘못 작성한 피드백' }))
    expect(next.activityLogs.some((log) => log.action === 'reopened')).toBe(true)
  })
})

describe('resubmitReviewRequest (demo)', () => {
  it('reuses the rejected request id and appends an immutable member history entry', async () => {
    const data = createPreviewData()
    const source = data.reviewRequests[0]!
    const rejected = {
      ...source,
      status: 'rejected' as const,
      review_round: 1,
      rejection_count: 1,
      review_feedback: [],
    }
    let next = { ...data, reviewRequests: [rejected, ...data.reviewRequests.slice(1)] }
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data: next,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

    await resubmitReviewRequest(ctx, source.id, '수정 내용을 반영했습니다.')

    const updated = next.reviewRequests.find((item) => item.id === source.id)
    expect(next.reviewRequests).toHaveLength(data.reviewRequests.length)
    expect(updated?.status).toBe('pending')
    expect(updated?.review_round).toBe(2)
    expect(updated?.rejection_count).toBe(1)
    expect(updated?.last_submitted_at).toBeTruthy()
    expect(updated?.review_feedback).toEqual([
      expect.objectContaining({
        leader_id: previewMember.id,
        author_role: 'member',
        comment: '수정 내용을 반영했습니다.',
      }),
    ])
    expect(next.activityLogs.some((log) => log.action === 'resubmitted')).toBe(true)
  })

  it('allows the requester to edit rejected content before resubmitting', async () => {
    const data = createPreviewData()
    const source = { ...data.reviewRequests[0]!, status: 'rejected' as const }
    let next = { ...data, reviewRequests: [source, ...data.reviewRequests.slice(1)] }
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewMember,
      data: next,
      setData: (updater) => {
        next = typeof updater === 'function' ? updater(next) : updater
      },
    })

    await saveReviewRequest(ctx, {
      editingReviewId: source.id,
      payload: {
        title: '반려 내용 수정',
        description: source.description,
        due_date: source.due_date,
      },
    })

    expect(next.reviewRequests.find((item) => item.id === source.id)?.title).toBe('반려 내용 수정')
  })
})

describe('local review ownership parity', () => {
  it('does not let another member edit or withdraw a pending request', async () => {
    const data = createPreviewData()
    const request = data.reviewRequests[0]!
    const otherMember = { ...previewMember, id: 'other-member', email: 'other@example.com' }
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: otherMember,
      data,
      setData: () => undefined,
    })

    await expect(
      saveReviewRequest(ctx, {
        editingReviewId: request.id,
        payload: { title: 'changed', description: request.description, due_date: null },
      }),
    ).rejects.toThrow('본인의 요청만 수정할 수 있습니다.')
    await expect(withdrawReviewRequest(ctx, request.id, '회수 사유')).rejects.toThrow('본인의 요청만 회수할 수 있습니다.')
  })

  it('rejects feedback for a missing request instead of logging a false success', async () => {
    const data = createPreviewData()
    const ctx: RepositoryContext = createRepositoryContextFromDeps('local', {      profile: previewLeader,
      data,
      setData: () => undefined,
    })

    await expect(addReviewFeedback(ctx, 'missing-review', 'comment')).rejects.toBeInstanceOf(UserFacingError)
  })
})
