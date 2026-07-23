import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewRequest } from '../../types'
import { useReviewSelection } from './useReviewSelection'

const oldReview: ReviewRequest = {
  id: 'old-review',
  requester_id: 'member-1',
  title: 'Old review',
  description: 'Historical review',
  due_date: null,
  status: 'approved',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  profiles: { name: 'Member', email: 'member@example.com' },
  review_feedback: [],
}

describe('useReviewSelection', () => {
  it('applies a deep-link selection once under Strict Mode', () => {
    const linkedReview = { ...oldReview, id: 'linked-review', title: 'Linked review' }
    const onApplied = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children)
    const { result } = renderHook(
      () => useReviewSelection([oldReview, linkedReview], linkedReview.id, onApplied),
      { wrapper },
    )

    expect(result.current.selectedReview?.id).toBe(linkedReview.id)
    expect(result.current.selectedReviewId).toBe(linkedReview.id)
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  it('never keeps a detail selection outside the visible collection', () => {
    const nextReview = { ...oldReview, id: 'next-review', title: 'Next review' }
    const { result, rerender } = renderHook(
      ({ visible, initialSelectedId }: { visible: ReviewRequest[]; initialSelectedId?: string | null }) =>
        useReviewSelection(visible, initialSelectedId),
      { initialProps: { visible: [oldReview], initialSelectedId: oldReview.id } },
    )

    expect(result.current.selectedReview?.id).toBe(oldReview.id)
    rerender({ visible: [nextReview], initialSelectedId: oldReview.id })
    expect(result.current.selectedReview?.id).toBe(nextReview.id)
    expect(result.current.selectedReviewId).toBe(nextReview.id)
  })

  it('clears the detail and selection when the visible collection is empty', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: ReviewRequest[] }) => useReviewSelection(visible),
      { initialProps: { visible: [oldReview] } },
    )

    act(() => result.current.setSelectedReviewId(oldReview.id))
    rerender({ visible: [] })
    expect(result.current.selectedReview).toBeNull()
    expect(result.current.selectedReviewId).toBeNull()
  })
})
