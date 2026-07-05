import { describe, expect, it } from 'vitest'
import { compareReviewRequests } from '../lib/priority'
import type { ReviewRequest } from '../types'

function review(partial: Partial<ReviewRequest> & Pick<ReviewRequest, 'id' | 'status'>): ReviewRequest {
  return {
    requester_id: 'member-1',
    title: 'title',
    description: 'description',
    attachment_url: null,
    due_date: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...partial,
  }
}

describe('ReviewsPanel list ordering', () => {
  it('shows pending requests before closed ones for leaders', () => {
    const sorted = [
      review({ id: '1', status: 'approved', created_at: '2026-07-03T00:00:00.000Z' }),
      review({ id: '2', status: 'pending', created_at: '2026-07-01T00:00:00.000Z' }),
      review({ id: '3', status: 'rejected', created_at: '2026-07-02T00:00:00.000Z' }),
    ].sort((left, right) => compareReviewRequests(left, right, false))

    expect(sorted.map((item) => item.id)).toEqual(['2', '3', '1'])
  })

  it('sorts member requests by newest first', () => {
    const sorted = [
      review({ id: '1', status: 'pending', created_at: '2026-07-01T00:00:00.000Z' }),
      review({ id: '2', status: 'approved', created_at: '2026-07-03T00:00:00.000Z' }),
    ].sort((left, right) => compareReviewRequests(left, right, true))

    expect(sorted.map((item) => item.id)).toEqual(['2', '1'])
  })
})
