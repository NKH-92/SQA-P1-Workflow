import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { toStorageAttachmentUrl } from '../../lib/attachments'
import { rejectReviewRequest, saveReviewRequest, withdrawReviewRequest } from './reviews'
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
