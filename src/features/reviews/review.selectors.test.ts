import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'
import type { ReviewRequest } from '../../types'
import { selectVisibleReviewRequests } from './review.selectors'

describe('review.selectors', () => {
  it('does not mutate the source reviewRequests array when sorting', () => {
    const data = createPreviewData()
    const originalOrder = data.reviewRequests.map((request) => request.id)
    selectVisibleReviewRequests(data, previewLeader, 'all')
    expect(data.reviewRequests.map((request) => request.id)).toEqual(originalOrder)
  })

  it('filters by status without mutating source data', () => {
    const data = createPreviewData()
    const pendingOnly = selectVisibleReviewRequests(data, previewLeader, 'pending')
    expect(pendingOnly.every((request) => request.status === 'pending')).toBe(true)
  })

  it('sorts leader view with pending before terminal states', () => {
    const requests: ReviewRequest[] = [
      {
        id: 'r-approved',
        requester_id: 'member-01',
        title: 'done',
        description: '',
        due_date: null,
        status: 'approved',
        created_at: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'r-pending',
        requester_id: 'member-01',
        title: 'open',
        description: '',
        due_date: '2026-07-10',
        status: 'pending',
        created_at: '2026-07-02T00:00:00.000Z',
      },
    ]
    const data = { ...createPreviewData(), reviewRequests: requests }
    const visible = selectVisibleReviewRequests(data, previewLeader, 'all')
    expect(visible[0].id).toBe('r-pending')
  })
})
