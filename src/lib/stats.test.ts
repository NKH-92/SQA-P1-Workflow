import { describe, expect, it } from 'vitest'
import { buildReviewMonthlyStats } from './stats'
import type { ReviewRequest } from '../types'

function review(partial: Partial<ReviewRequest> & Pick<ReviewRequest, 'id' | 'status'>): ReviewRequest {
  return {
    requester_id: 'member-1',
    title: 'title',
    description: 'description',
    due_date: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    ...partial,
  }
}

describe('buildReviewMonthlyStats', () => {
  it('groups review counts and average processing days by month', () => {
    const stats = buildReviewMonthlyStats(
      [
        review({ id: '1', status: 'approved', created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-03T00:00:00.000Z' }),
        review({ id: '2', status: 'rejected', created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-04T00:00:00.000Z' }),
        review({ id: '3', status: 'pending', created_at: '2026-06-15T00:00:00.000Z' }),
      ],
      2,
    )

    expect(stats).toHaveLength(2)
    expect(stats[1].month).toBe('2026-07')
    expect(stats[1].submitted).toBe(2)
    expect(stats[1].approved).toBe(1)
    expect(stats[1].rejected).toBe(1)
    expect(stats[1].avgProcessingDays).toBe(2)
  })
})
