import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'
import type { ReviewRequest } from '../../types'
import { selectDefaultReviewRequests, selectVisibleReviewRequests } from './review.selectors'

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
    const visible = selectVisibleReviewRequests(data, previewLeader, 'all', '', new Date('2026-07-03T00:00:00.000Z'))
    expect(visible[0].id).toBe('r-pending')
  })

  it('keeps old pending work but moves old terminal work out of the leader default collection', () => {
    const requests: ReviewRequest[] = [
      {
        id: 'old-pending', requester_id: 'member-01', title: 'pending', description: 'body',
        due_date: null, status: 'pending', created_at: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'old-approved', requester_id: 'member-01', title: 'approved', description: 'body',
        due_date: null, status: 'approved', closed_at: '2026-07-20T00:00:00.000Z',
      },
      {
        id: 'recent-rejected', requester_id: 'member-01', title: 'rejected', description: 'body',
        due_date: null, status: 'rejected', closed_at: '2026-07-27T00:00:00.000Z',
      },
    ]
    const data = { ...createPreviewData(), reviewRequests: requests }
    const visible = selectDefaultReviewRequests(data, previewLeader, new Date('2026-08-01T03:00:00.000Z'))

    expect(visible.map((request) => request.id)).toEqual(['old-pending', 'recent-rejected'])
  })

  it('filters the default leader collection by title, body, and requester', () => {
    const data = createPreviewData()
    const target = data.reviewRequests[0]!
    const now = new Date(target.closed_at ?? target.created_at ?? '2026-07-01T00:00:00.000Z')
    const byRequester = selectVisibleReviewRequests(data, previewLeader, 'all', target.profiles?.name ?? '', now)
    const byBody = selectVisibleReviewRequests(data, previewLeader, 'all', target.description.slice(0, 3), now)

    expect(byRequester.some((request) => request.id === target.id)).toBe(true)
    expect(byBody.some((request) => request.id === target.id)).toBe(true)
  })
})
