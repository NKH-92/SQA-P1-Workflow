import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReviewRequest } from '../../types'
import { useReviewSelection } from './useReviewSelection'

const oldReview: ReviewRequest = {
  id: 'old-review',
  requester_id: 'member-1',
  title: 'Old review',
  description: 'Historical review',
  attachment_url: null,
  due_date: null,
  status: 'approved',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  profiles: { name: 'Member', email: 'member@example.com' },
  review_feedback: [],
}

describe('useReviewSelection', () => {
  it('keeps an on-demand historical selection when a capped refresh removes it', () => {
    const { result, rerender } = renderHook(
      ({ visible, scoped, initialSelectedId }: { visible: ReviewRequest[]; scoped: ReviewRequest[]; initialSelectedId?: string | null }) =>
        useReviewSelection(visible, scoped, initialSelectedId),
      { initialProps: { visible: [oldReview], scoped: [oldReview], initialSelectedId: oldReview.id } },
    )

    expect(result.current.selectedReview?.id).toBe(oldReview.id)
    rerender({ visible: [], scoped: [], initialSelectedId: oldReview.id })

    expect(result.current.selectedReview?.id).toBe(oldReview.id)
  })
})
