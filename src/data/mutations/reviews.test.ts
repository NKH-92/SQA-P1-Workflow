import { describe, expect, it } from 'vitest'
import { createPreviewData, previewMember } from '../../demoData'
import { withdrawReviewRequest } from './reviews'
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
